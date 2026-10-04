/**
 * 素材文件夹的纯逻辑：层级、面包屑、子树统计。
 * 前后端共用——服务端用来校验层级和计算删除影响，前端用来渲染导航。
 */

export type AssetFolder = { id: string; name: string; parentId: string | null };

/** 最大层级，避免无限嵌套把界面撑爆。 */
export const MAX_FOLDER_DEPTH = 6;
export const MAX_FOLDER_NAME = 40;

/** 名称统一处理：去首尾空格、把连续空白压成一个、限制长度。 */
export function normalizeFolderName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_FOLDER_NAME);
}

/** 某个文件夹的层级：顶层为 1；找不到返回 0。 */
export function folderDepth(folders: AssetFolder[], id: string): number {
  let depth = 0;
  let cursor: string | null = id;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor)) return 0; // 数据出现环，视为非法
    seen.add(cursor);
    const folder = folders.find((item) => item.id === cursor);
    if (!folder) return depth;
    depth += 1;
    cursor = folder.parentId;
  }
  return depth;
}

/** 从根到该文件夹的完整路径（含自身）；id 为空返回空数组。 */
export function folderPath(folders: AssetFolder[], id: string | null): AssetFolder[] {
  if (!id) return [];
  const path: AssetFolder[] = [];
  const seen = new Set<string>();
  let cursor: string | null = id;
  while (cursor) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const folder = folders.find((item) => item.id === cursor);
    if (!folder) break;
    path.unshift(folder);
    cursor = folder.parentId;
  }
  return path;
}

export function folderChildren(folders: AssetFolder[], parentId: string | null): AssetFolder[] {
  return folders
    .filter((folder) => (folder.parentId ?? null) === (parentId ?? null))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

/** 自身 + 所有子孙的 id。 */
export function folderSubtreeIds(folders: AssetFolder[], id: string): string[] {
  const ids = [id];
  for (let index = 0; index < ids.length; index += 1) {
    for (const folder of folders) {
      if (folder.parentId === ids[index] && !ids.includes(folder.id)) ids.push(folder.id);
    }
  }
  return ids;
}

/** 该文件夹自身层级 + 其子树最深层级，用于判断移动后是否超深。 */
export function subtreeHeight(folders: AssetFolder[], id: string): number {
  let height = 1;
  for (const childId of folderSubtreeIds(folders, id)) {
    if (childId === id) continue;
    const relative = folderDepth(folders, childId) - folderDepth(folders, id);
    if (relative + 1 > height) height = relative + 1;
  }
  return height;
}

/** 直接子文件夹数与直属素材数（用于文件夹卡片上的角标）。 */
export function directStats(
  folders: AssetFolder[],
  assetFolderIds: string[],
  id: string,
): { folders: number; assets: number } {
  return {
    folders: folders.filter((folder) => folder.parentId === id).length,
    assets: assetFolderIds.filter((folderId) => folderId === id).length,
  };
}

/** 删除影响范围：会一并删掉多少个子文件夹、多少张图片会被移到未分类。 */
export function subtreeStats(
  folders: AssetFolder[],
  assetFolderIds: string[],
  id: string,
): { folders: number; assets: number } {
  const ids = new Set(folderSubtreeIds(folders, id));
  return {
    folders: ids.size - 1,
    assets: assetFolderIds.filter((folderId) => folderId && ids.has(folderId)).length,
  };
}
