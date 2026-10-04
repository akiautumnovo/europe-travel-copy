import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { dirname, join, normalize, sep } from "node:path";
import { objectsDir } from "../paths";

/**
 * 一个与 Cloudflare R2 子集兼容的本地文件存储。
 *
 * 业务代码只用到两件事：`bucket().put(key, body, { httpMetadata })` 和
 * `bucket().get(key)` 后取 `object.body` / `object.writeHttpMetadata(headers)`。
 * 正式版跑在 Node 上，没有 R2 绑定，所以把同样的接口实现到本地磁盘。
 *
 * 想换回 Cloudflare R2：把 app/api/_shared.ts 里的 bucket() 指回 env.BUCKET 即可。
 */

type StoredMetadata = { contentType?: string; size?: number; uploadedAt?: string };

const META_DIR = "_meta";

/**
 * 存储键必须逐段转义后再落盘。
 *
 * 原因：用户键本身就长这样 —— `email:akiautumnovo@gmail.com`。
 * 在 R2 里它只是个字符串，`:` 和 `@` 完全合法；但落到文件系统上，
 * `:` 是 Windows 的非法字符，直接导致 mkdir ENOENT。
 * encodeURIComponent 会把 `:`→`%3A`、`@`→`%40`，且结果在 Windows/macOS/Linux 上都安全。
 */
function encodeSegment(segment: string): string {
  const encoded = encodeURIComponent(segment) || "_";
  // Windows 保留设备名（CON/PRN/NUL/COM1…）以及结尾的点、空格都不能作为文件名
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  const guarded = reserved.test(encoded) ? `_${encoded}` : encoded;
  return /[. ]$/.test(guarded) ? `${guarded}_` : guarded;
}

function encodeKey(key: string): string {
  return key.split("/").map(encodeSegment).join("/");
}

function decodeKey(relative: string): string {
  return relative
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

/** 把存储键映射到磁盘路径，并挡住越权跳出数据目录的键。 */
function resolveKey(key: string): { relative: string; filePath: string } {
  const cleaned = normalize(key).replace(/^([/\\])+/, "");
  if (cleaned.startsWith("..") || cleaned.includes(`..${sep}`)) throw new Error("非法的存储键");
  const relative = encodeKey(cleaned);
  return { relative, filePath: join(objectsDir(), relative) };
}

/** 元数据放在独立的 _meta 目录，避免和真实键（例如以 .json 结尾的文件）撞名。 */
function metaPath(relative: string): string {
  return join(objectsDir(), META_DIR, `${relative}.json`);
}

function readMetadata(relative: string): StoredMetadata {
  try {
    return JSON.parse(readFileSync(metaPath(relative), "utf8")) as StoredMetadata;
  } catch {
    return {};
  }
}

async function toBuffer(value: unknown): Promise<Buffer> {
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  // Blob / ReadableStream / Response
  const response = value instanceof Response ? value : new Response(value as BodyInit);
  return Buffer.from(await response.arrayBuffer());
}

class LocalObject {
  constructor(private readonly filePath: string, private readonly metadata: StoredMetadata) {}

  get body(): ReadableStream {
    return Readable.toWeb(createReadStream(this.filePath)) as unknown as ReadableStream;
  }

  get httpMetadata(): StoredMetadata {
    return { ...this.metadata };
  }

  get size(): number {
    return this.metadata.size ?? statSync(this.filePath).size;
  }

  /** 与 R2 的同名方法一致：把 content-type 等元数据写进响应头。 */
  writeHttpMetadata(headers: Headers): void {
    headers.set("content-type", this.metadata.contentType || "application/octet-stream");
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const buffer = readFileSync(this.filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  }
}

const store = {
  async put(
    key: string,
    value: unknown,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<{ key: string; size: number }> {
    const { relative, filePath } = resolveKey(key);
    mkdirSync(dirname(filePath), { recursive: true });
    const buffer = await toBuffer(value);
    // 先写临时文件再改名，避免半个文件被读到
    const tempPath = `${filePath}.tmp-${Date.now()}`;
    writeFileSync(tempPath, buffer);
    renameSync(tempPath, filePath);
    const metadata: StoredMetadata = {
      contentType: options?.httpMetadata?.contentType,
      size: buffer.byteLength,
      uploadedAt: new Date().toISOString(),
    };
    const sidecar = metaPath(relative);
    mkdirSync(dirname(sidecar), { recursive: true });
    writeFileSync(sidecar, JSON.stringify(metadata));
    return { key, size: buffer.byteLength };
  },

  async get(key: string): Promise<LocalObject | null> {
    const { relative, filePath } = resolveKey(key);
    if (!existsSync(filePath)) return null;
    return new LocalObject(filePath, readMetadata(relative));
  },

  async head(key: string): Promise<(LocalObject & { key: string }) | null> {
    const { relative, filePath } = resolveKey(key);
    if (!existsSync(filePath)) return null;
    return Object.assign(new LocalObject(filePath, readMetadata(relative)), { key });
  },

  async delete(key: string): Promise<void> {
    const { relative, filePath } = resolveKey(key);
    rmSync(filePath, { force: true });
    rmSync(metaPath(relative), { force: true });
  },

  async list(options?: { prefix?: string }): Promise<{ objects: { key: string; size: number }[]; truncated: boolean }> {
    const root = objectsDir();
    if (!existsSync(root)) return { objects: [], truncated: false };
    const objects: { key: string; size: number }[] = [];
    const walk = (dir: string, relative: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!relative && entry.name === META_DIR) continue;
        const next = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(join(dir, entry.name), next);
        else objects.push({ key: decodeKey(next), size: statSync(join(dir, entry.name)).size });
      }
    };
    walk(root, "");
    const prefix = options?.prefix;
    return { objects: prefix ? objects.filter((o) => o.key.startsWith(prefix)) : objects, truncated: false };
  },
};

export function localStorageBucket(): typeof store {
  return store;
}
