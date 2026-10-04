import { bucket, db, json, requireApiUser } from "../_shared";
import { PRODUCT_FILE_MAX_BYTES, PRODUCT_FILE_MAX_MB } from "../../../lib/files/upload-limits";
import { resolveFolderId } from "./folders/store";

type AssetRow = {
  id: string;
  assetType: string;
  storagePath: string | null;
  externalUrl: string | null;
  sourceName: string;
  author: string | null;
  sourceUrl: string | null;
  licenseStatus: string;
  riskLevel: string;
  metadata: string;
  folderId: string | null;
  createdAt: string;
};

/**
 * 哪些内容的配图用到了这些素材。
 * 故事板的选择结果存在 contents.topic_meta.assetSelection.items[].assetId 里，
 * 删除素材前需要提示用户，否则那条内容的配图会静默缺一张。
 */
async function loadUsage(userId: string): Promise<Map<string, string[]>> {
  const rows = await db()
    .prepare("SELECT topic_title as topicTitle,topic_meta as topicMeta FROM contents WHERE user_id=?")
    .bind(userId)
    .all<{ topicTitle: string; topicMeta: string }>();
  const usage = new Map<string, string[]>();
  for (const row of rows.results) {
    let meta: { assetSelection?: { items?: Array<{ assetId?: unknown }> } };
    try {
      meta = JSON.parse(row.topicMeta || "{}") as typeof meta;
    } catch {
      continue;
    }
    const items = Array.isArray(meta.assetSelection?.items) ? meta.assetSelection.items : [];
    for (const item of items) {
      if (typeof item?.assetId !== "string") continue;
      const titles = usage.get(item.assetId) ?? [];
      if (!titles.includes(row.topicTitle)) titles.push(row.topicTitle);
      usage.set(item.assetId, titles);
    }
  }
  return usage;
}

export async function GET(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;

  const [rows, usage] = await Promise.all([
    db()
      .prepare(
        "SELECT id,asset_type as assetType,storage_path as storagePath,external_url as externalUrl,source_name as sourceName,author,source_url as sourceUrl,license_status as licenseStatus,risk_level as riskLevel,metadata,folder_id as folderId,created_at as createdAt FROM assets WHERE user_id=? ORDER BY created_at DESC",
      )
      .bind(user.userId)
      .all<AssetRow>(),
    loadUsage(user.userId),
  ]);

  return json(
    rows.results.map((row) => {
      let metadata: Record<string, unknown> = {};
      try {
        metadata = JSON.parse(row.metadata || "{}") as Record<string, unknown>;
      } catch {
        metadata = {};
      }
      return {
        ...row,
        folderId: row.folderId ?? null,
        metadata,
        imageUrl: row.storagePath ? `/api/assets/${row.id}/file` : row.externalUrl,
        usedBy: usage.get(row.id) ?? [],
      };
    }),
  );
}

export async function POST(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "上传内容无法读取，请重新选择文件" }, { status: 400 });
  }
  const file = form.get("file");
  const kind = form.get("kind") === "source" ? "source-file" : "user-asset";
  if (!(file instanceof File) || file.size === 0) return json({ error: "请选择文件" }, { status: 400 });
  const maxBytes = kind === "source-file" ? PRODUCT_FILE_MAX_BYTES : 15 * 1024 * 1024;
  const maxMb = kind === "source-file" ? PRODUCT_FILE_MAX_MB : 15;
  if (file.size > maxBytes) return json({ error: `文件不能超过 ${maxMb}MB` }, { status: 400 });

  const folderId = await resolveFolderId(user.userId, form.get("folderId"));
  let storedPath: string | null = null;
  try {
    const id = crypto.randomUUID();
    const safe = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, "-");
    const path = `${user.userId}/${kind}/${id}-${safe}`;
    storedPath = path;
    await bucket().put(path, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    const now = new Date().toISOString();
    await db()
      .prepare(
        "INSERT INTO assets (id,user_id,asset_type,storage_path,source_name,license_status,risk_level,tags,metadata,folder_id,created_at) VALUES (?,?,?,?,?,'owned','green','[]',?,?,?)",
      )
      .bind(
        id,
        user.userId,
        kind === "source-file" ? "source_file" : "user_upload",
        path,
        file.name,
        JSON.stringify({ size: file.size, type: file.type }),
        folderId,
        now,
      )
      .run();
    return json(
      {
        id,
        assetType: kind === "source-file" ? "source_file" : "user_upload",
        storagePath: path,
        sourceName: file.name,
        folderId,
        metadata: { size: file.size, type: file.type },
        createdAt: now,
      },
      { status: 201 },
    );
  } catch (error) {
    // 文件落盘后数据库写入失败时清理文件，避免产生界面无法管理的孤儿对象。
    if (storedPath) {
      try { await bucket().delete(storedPath); } catch (cleanupError) {
        console.error("[assets] 回滚上传文件失败", storedPath, cleanupError);
      }
    }
    console.error("[assets] 保存失败", error);
    return json({ code: "ASSET_SAVE_FAILED", error: "文件保存失败，请重试。" }, { status: 502 });
  }
}
