import { sqliteDatabase } from "./db/sqlite";
import { localStorageBucket } from "./storage/local";

/**
 * 运行时配置与绑定的唯一入口。
 *
 * 之前这里（以及 lib/ai、lib/search、lib/media）直接 `import { env } from "cloudflare:workers"`，
 * 那是 Cloudflare Worker 专有的虚拟模块，Node 下根本无法解析。
 * 正式版部署在 Node 上，所以统一收敛到这里：
 *   - 配置（API Key、白名单等）→ process.env，由 scripts/load-env.mjs 在启动时载入
 *   - DB     → lib/db/sqlite.ts（D1 子集兼容）
 *   - BUCKET → lib/storage/local.ts（R2 子集兼容）
 *
 * 以后若要改回 Cloudflare Worker：只需要在这个文件里把 config() 换成 env、
 * 把 db()/bucket() 指回 env.DB / env.BUCKET，业务代码无需改动。
 */

export type RuntimeConfig = Record<string, string | undefined>;

/** 部署环境里的绑定对象（本地实现，非 Cloudflare 绑定）。 */
let overrides: { DB?: unknown; BUCKET?: unknown } | null = null;

export function setBindings(next: { DB?: unknown; BUCKET?: unknown } | null): void {
  overrides = next;
}

/** 读取运行时配置。每次调用都读 process.env，避免在模块顶层求值。 */
export function config(): RuntimeConfig {
  return process.env as RuntimeConfig;
}

export function db() {
  if (overrides?.DB) return overrides.DB as ReturnType<typeof sqliteDatabase>;
  try {
    return sqliteDatabase();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`数据服务暂时不可用：${reason}`);
  }
}

export function bucket() {
  if (overrides?.BUCKET) return overrides.BUCKET as ReturnType<typeof localStorageBucket>;
  return localStorageBucket();
}
