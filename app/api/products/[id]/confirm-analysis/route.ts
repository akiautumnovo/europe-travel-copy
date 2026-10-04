import { analysisResultSchema, inputTypeSchema } from "../../../../../lib/ai/types";
import { db, json, requireApiUser } from "../../../_shared";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  const { id } = await params;
  const body = await request.json() as { type?: unknown; rawText?: unknown; analysis?: unknown };
  const type = inputTypeSchema.parse(body.type);
  const analysis = analysisResultSchema.parse(body.analysis);
  const rawText = typeof body.rawText === "string" ? body.rawText : "";
  const exists = await db().prepare("SELECT id FROM products WHERE id=? AND user_id=?").bind(id, user.userId).first();
  if (!exists) return json({ error: "产品不存在" }, { status: 404 });
  const locked = type === "reference" ? [] : analysis.hard_facts.filter(f => f.status === "confirmed" || f.status === "locked").map(f => ({ ...f, status: "locked" }));
  const savedAnalysis = { ...analysis, hard_facts: analysis.hard_facts.map(f => locked.find(x => x.field === f.field && x.value === f.value) || f) };
  await db().prepare("UPDATE products SET source_type=?,raw_content=?,facts=?,ai_analysis=?,updated_at=? WHERE id=? AND user_id=?")
    .bind(type, rawText, JSON.stringify(locked), JSON.stringify(savedAnalysis), new Date().toISOString(), id, user.userId).run();
  return json({ ok: true, lockedFacts: locked });
}
