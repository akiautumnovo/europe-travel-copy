import { z } from "zod";
import { db, json, requireApiUser } from "../../_shared";
import { MAX_FOLDER_DEPTH, folderDepth, normalizeFolderName } from "../../../../lib/asset-folders";
import { hasSiblingName, loadFolders, resolveParentId } from "./store";

const createSchema = z.object({ name: z.string(), parentId: z.string().nullish() });

export async function GET(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  return json(await loadFolders(user.userId));
}

export async function POST(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求内容无法读取" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: "参数不合法" }, { status: 400 });

  const name = normalizeFolderName(parsed.data.name);
  if (!name) return json({ error: "请输入文件夹名称" }, { status: 400 });

  const folders = await loadFolders(user.userId);
  const parent = resolveParentId(folders, parsed.data.parentId);
  if (!parent.ok) return json({ error: parent.error }, { status: 400 });

  if (parent.parentId) {
    const depth = folderDepth(folders, parent.parentId) + 1;
    if (depth > MAX_FOLDER_DEPTH) {
      return json({ error: `文件夹最多 ${MAX_FOLDER_DEPTH} 层，这一层不能再建子文件夹了` }, { status: 400 });
    }
  }
  if (hasSiblingName(folders, parent.parentId, name)) {
    return json({ error: "同一层已经有同名文件夹" }, { status: 409 });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db()
    .prepare("INSERT INTO asset_folders (id,user_id,name,parent_id,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .bind(id, user.userId, name, parent.parentId, now, now)
    .run();
  return json({ id, name, parentId: parent.parentId }, { status: 201 });
}
