import { z } from "zod";
import { db, json, requireApiUser } from "../../../_shared";
import {
  MAX_FOLDER_DEPTH,
  folderDepth,
  folderSubtreeIds,
  normalizeFolderName,
  subtreeHeight,
} from "../../../../../lib/asset-folders";
import { countAssetsInFolders, hasSiblingName, loadFolders, resolveParentId } from "../store";

const patchSchema = z.object({ name: z.string().optional(), parentId: z.string().nullish() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求内容无法读取" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return json({ error: "参数不合法" }, { status: 400 });

  const folders = await loadFolders(user.userId);
  const folder = folders.find((item) => item.id === id);
  if (!folder) return json({ error: "文件夹不存在" }, { status: 404 });

  const name = parsed.data.name === undefined ? folder.name : normalizeFolderName(parsed.data.name);
  if (!name) return json({ error: "请输入文件夹名称" }, { status: 400 });

  // parentId 未传 = 只改名；传 null = 移到顶层；传 id = 移到该文件夹下
  let parentId = folder.parentId ?? null;
  if (parsed.data.parentId !== undefined) {
    const target = resolveParentId(folders, parsed.data.parentId);
    if (!target.ok) return json({ error: target.error }, { status: 400 });
    if (target.parentId === id) return json({ error: "不能把文件夹移动到它自己里面" }, { status: 400 });
    if (target.parentId && folderSubtreeIds(folders, id).includes(target.parentId)) {
      return json({ error: "不能把文件夹移动到它自己的子文件夹里" }, { status: 400 });
    }
    if (target.parentId) {
      const depth = folderDepth(folders, target.parentId) + subtreeHeight(folders, id);
      if (depth > MAX_FOLDER_DEPTH) {
        return json({ error: `移动后会超过 ${MAX_FOLDER_DEPTH} 层，请先减少嵌套层级` }, { status: 400 });
      }
    }
    parentId = target.parentId;
  }

  if (hasSiblingName(folders, parentId, name, id)) {
    return json({ error: "目标位置已经有同名文件夹" }, { status: 409 });
  }

  await db()
    .prepare("UPDATE asset_folders SET name=?,parent_id=?,updated_at=? WHERE id=? AND user_id=?")
    .bind(name, parentId, new Date().toISOString(), id, user.userId)
    .run();
  return json({ id, name, parentId });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  const { id } = await params;

  const folders = await loadFolders(user.userId);
  if (!folders.some((item) => item.id === id)) return json({ error: "文件夹不存在" }, { status: 404 });

  const subtreeIds = folderSubtreeIds(folders, id);
  const assetCount = await countAssetsInFolders(user.userId, subtreeIds);
  const childCount = subtreeIds.length - 1;
  const recursive = new URL(request.url).searchParams.get("recursive") === "1";

  // 非空文件夹要先确认：确认后删掉整棵子树，里面的图片回到「未分类」而不是一起删掉
  if (!recursive && (assetCount > 0 || childCount > 0)) {
    const parts = [assetCount ? `${assetCount} 张图片` : "", childCount ? `${childCount} 个子文件夹` : ""].filter(Boolean);
    return json(
      {
        code: "FOLDER_NOT_EMPTY",
        error: `这个文件夹里还有 ${parts.join("和")}。继续的话子文件夹会一起删掉，图片会移到「未分类」保留。`,
        assetCount,
        folderCount: childCount,
      },
      { status: 409 },
    );
  }

  const placeholders = subtreeIds.map(() => "?").join(",");
  await db().batch([
    db()
      .prepare(`UPDATE assets SET folder_id=NULL WHERE user_id=? AND folder_id IN (${placeholders})`)
      .bind(user.userId, ...subtreeIds),
    db()
      .prepare(`DELETE FROM asset_folders WHERE user_id=? AND id IN (${placeholders})`)
      .bind(user.userId, ...subtreeIds),
  ]);

  return json({ ok: true, deletedFolders: subtreeIds.length, movedAssets: assetCount });
}
