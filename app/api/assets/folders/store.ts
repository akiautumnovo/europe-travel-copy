import { db } from "../../_shared";
import type { AssetFolder } from "../../../../lib/asset-folders";

/**
 * 文件夹相关的共用查询。
 * 放在 route.ts 同级但不叫 route.ts，所以不会被当成路由。
 */

export async function loadFolders(userId: string): Promise<AssetFolder[]> {
  const rows = await db()
    .prepare("SELECT id,name,parent_id as parentId FROM asset_folders WHERE user_id=? ORDER BY name")
    .bind(userId)
    .all<{ id: string; name: string; parentId: string | null }>();
  return rows.results.map((row) => ({ id: row.id, name: row.name, parentId: row.parentId ?? null }));
}

/** 校验上级文件夹合法（存在且属于该用户）；空值表示顶层。 */
export function resolveParentId(folders: AssetFolder[], raw: unknown): { ok: true; parentId: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") return { ok: true, parentId: null };
  if (typeof raw !== "string") return { ok: false, error: "上级文件夹参数不合法" };
  if (!folders.some((folder) => folder.id === raw)) return { ok: false, error: "上级文件夹不存在" };
  return { ok: true, parentId: raw };
}

/** 同一层是否已有同名文件夹（改名/移动时用于排除自身）。 */
export function hasSiblingName(folders: AssetFolder[], parentId: string | null, name: string, excludeId?: string): boolean {
  return folders.some(
    (folder) => folder.id !== excludeId && (folder.parentId ?? null) === parentId && folder.name === name,
  );
}

/** 统计某批文件夹下有多少素材。 */
export async function countAssetsInFolders(userId: string, folderIds: string[]): Promise<number> {
  if (!folderIds.length) return 0;
  const placeholders = folderIds.map(() => "?").join(",");
  const row = await db()
    .prepare(`SELECT COUNT(*) as total FROM assets WHERE user_id=? AND folder_id IN (${placeholders})`)
    .bind(userId, ...folderIds)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

/**
 * 上传时确定目标文件夹。
 * 无效或不属于该用户的 id 一律当作「未分类」处理，
 * 避免因为一个可选参数不合法就让整次上传失败。
 */
export async function resolveFolderId(userId: string, raw: unknown): Promise<string | null> {
  if (typeof raw !== "string" || !raw) return null;
  const row = await db()
    .prepare("SELECT id FROM asset_folders WHERE id=? AND user_id=?")
    .bind(raw, userId)
    .first<{ id: string }>();
  return row?.id ?? null;
}
