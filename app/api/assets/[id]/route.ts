import { z } from "zod";
import { bucket, db, json, requireApiUser } from "../../_shared";

const patchSchema = z.object({
  riskLevel: z.enum(["green", "yellow", "red"]).optional(),
  // undefined = 不改；null 或空串 = 移回「未分类」
  folderId: z.string().nullish(),
  note: z.string().max(500).optional(),
});

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
  const input = parsed.data;

  const row = await db()
    .prepare("SELECT metadata,risk_level as riskLevel,folder_id as folderId FROM assets WHERE id=? AND user_id=?")
    .bind(id, user.userId)
    .first<{ metadata: string; riskLevel: string; folderId: string | null }>();
  if (!row) return json({ error: "素材不存在" }, { status: 404 });

  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadata || "{}") as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  if (input.note !== undefined) metadata.note = input.note;

  const riskLevel = input.riskLevel ?? row.riskLevel;
  let folderId = row.folderId ?? null;
  if (input.folderId !== undefined) {
    if (input.folderId === null || input.folderId === "") {
      folderId = null;
    } else {
      const target = await db()
        .prepare("SELECT id FROM asset_folders WHERE id=? AND user_id=?")
        .bind(input.folderId, user.userId)
        .first<{ id: string }>();
      if (!target) return json({ error: "目标文件夹不存在" }, { status: 400 });
      folderId = input.folderId;
    }
  }

  await db()
    .prepare("UPDATE assets SET risk_level=?,metadata=?,folder_id=? WHERE id=? AND user_id=?")
    .bind(riskLevel, JSON.stringify(metadata), folderId, id, user.userId)
    .run();
  return json({ ok: true, riskLevel, folderId });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  const { id } = await params;

  const row = await db()
    .prepare("SELECT storage_path as storagePath FROM assets WHERE id=? AND user_id=?")
    .bind(id, user.userId)
    .first<{ storagePath: string | null }>();
  if (!row) return json({ error: "素材不存在或已删除" }, { status: 404 });

  if (row.storagePath) {
    try {
      await bucket().delete(row.storagePath);
    } catch (error) {
      // 文件删不掉也要继续删记录，否则界面里永远清不掉这条素材
      console.error("[assets] 删除存储文件失败", row.storagePath, error);
    }
  }
  await db().prepare("DELETE FROM assets WHERE id=? AND user_id=?").bind(id, user.userId).run();
  return json({ ok: true });
}
