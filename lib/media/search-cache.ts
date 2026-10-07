import { db } from "../bindings";

const TTL_MS = 24 * 60 * 60 * 1000;
const inFlight = new Map<string, Promise<Record<string, unknown>>>();

type CacheRow = { payload: string; expires_at: string };

export function mediaSearchCacheKey(provider: string, query: string, orientation?: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
  return `v4:${provider}:${orientation || "all"}:${normalizedQuery}`;
}

async function readRow(cacheKey: string, includeExpired = false) {
  const sql = includeExpired
    ? "SELECT payload,expires_at FROM media_search_cache WHERE cache_key=? LIMIT 1"
    : "SELECT payload,expires_at FROM media_search_cache WHERE cache_key=? AND expires_at>? LIMIT 1";
  return db().prepare(sql).bind(...(includeExpired ? [cacheKey] : [cacheKey, new Date().toISOString()])).first<CacheRow>();
}

function parsePayload(row: CacheRow | null) {
  if (!row) return null;
  try { return JSON.parse(row.payload) as Record<string, unknown>; } catch { return null; }
}

export async function readMediaSearchCache(cacheKey: string) {
  return parsePayload(await readRow(cacheKey));
}

export async function readStaleMediaSearchCache(cacheKey: string) {
  return parsePayload(await readRow(cacheKey, true));
}

export async function writeMediaSearchCache(cacheKey: string, payload: Record<string, unknown>) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);
  await db().prepare("INSERT INTO media_search_cache (cache_key,payload,created_at,expires_at) VALUES (?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,created_at=excluded.created_at,expires_at=excluded.expires_at")
    .bind(cacheKey, JSON.stringify(payload), now.toISOString(), expiresAt.toISOString()).run();
  // 顺手清理超过 7 天的失效数据，避免表无限增长；失败不影响搜索结果。
  void db().prepare("DELETE FROM media_search_cache WHERE expires_at<?").bind(new Date(now.getTime() - 7 * TTL_MS).toISOString()).run().catch(() => undefined);
}

/** 同一 Node 进程内合并并发的相同搜索，避免首次缓存写入前被连续点击穿透。 */
export async function singleFlightMediaSearch(cacheKey: string, load: () => Promise<Record<string, unknown>>) {
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;
  const pending = load().finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, pending);
  return pending;
}

