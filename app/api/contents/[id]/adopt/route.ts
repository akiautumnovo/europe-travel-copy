import { z } from "zod";
import { getAIProvider } from "../../../../../lib/ai";
import { config as runtimeConfig } from "../../../../../lib/bindings";
import { draftSchema } from "../../../../../lib/ai/types";
import { blocksToText, isVersionConflict } from "../../../../../lib/content";
import { mergeEvidence, parsePreferences } from "../../../../../lib/style";
import { prepareAdoptedCropAssets } from "../../../../../lib/assets/materialize";
import { db, json, requireApiUser } from "../../../_shared";

const schema = z.object({
  versionNo: z.number().int().positive(),
  blocks: draftSchema.shape.blocks,
  lockedBlockIds: z.array(z.string()),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  const { id } = await params;

  try {
    const input = schema.parse(await request.json());
    const content = await db()
      .prepare("SELECT status,topic_meta FROM contents WHERE id=? AND user_id=?")
      .bind(id, user.userId)
      .first<{ status: string; topic_meta: string }>();
    if (!content) return json({ error: "内容不存在" }, { status: 404 });

    const latest = await db()
      .prepare("SELECT version_no as versionNo,is_adopted as isAdopted FROM content_versions WHERE content_id=? AND user_id=? ORDER BY version_no DESC LIMIT 1")
      .bind(id, user.userId)
      .first<{ versionNo: number; isAdopted: number }>();
    if (!latest || latest.versionNo !== input.versionNo) {
      return json({ error: "此内容已有新版本" }, { status: 409 });
    }
    // 重试或重复点击采用时返回已有结果，不再插入一份完全相同的最终版本。
    if (Boolean(latest.isAdopted)) {
      const prepared=await prepareAdoptedCropAssets(id,user.userId);
      return json({ versionNo: latest.versionNo, status: "adopted", styleLearned: false, unchanged: true,cropAssets:prepared.assets,assetWarnings:prepared.warnings });
    }

    const versionNo = input.versionNo + 1;
    const now = new Date().toISOString();
    await db().batch([
      db().prepare("INSERT INTO content_versions (id,content_id,user_id,version_no,strategy_type,text_content,blocks,locked_block_ids,change_type,change_instruction,is_adopted,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)")
        .bind(crypto.randomUUID(), id, user.userId, versionNo, "selected", blocksToText(input.blocks), JSON.stringify(input.blocks), JSON.stringify(input.lockedBlockIds), "adopted", "已采用", now),
      db().prepare("UPDATE contents SET status='adopted',updated_at=? WHERE id=? AND user_id=?").bind(now, id, user.userId),
    ]);

    let learned = false;
    if (content.status !== "adopted") {
      try {
        let meta: Record<string, unknown> = {};
        try { meta = JSON.parse(content.topic_meta || "{}"); } catch {}
        const selected = Number(meta.selectedInitialVersion);
        // 选择记录缺失时宁可跳过学习，也不能随意拿第 3 稿作为用户选择的基线。
        const initial = Number.isInteger(selected) && selected > 0
          ? await db().prepare("SELECT blocks FROM content_versions WHERE content_id=? AND user_id=? AND version_no=?")
            .bind(id, user.userId, selected).first<{ blocks: string }>()
          : null;
        if (initial) {
          const signals = await getAIProvider().summarizeStyleChange({ blocks: JSON.parse(initial.blocks) }, { blocks: input.blocks });
          let dna = await db().prepare("SELECT stable_preferences,candidate_preferences,evidence_summary FROM style_dna WHERE user_id=?")
            .bind(user.userId).first<{ stable_preferences: string; candidate_preferences: string; evidence_summary: string }>();
          if (!dna) {
            await db().prepare("INSERT INTO style_dna (id,user_id,stable_preferences,candidate_preferences,negative_preferences,evidence_summary,updated_at) VALUES (?,?, '[]','[]','[]','{}',?)")
              .bind(crypto.randomUUID(), user.userId, now).run();
            dna = { stable_preferences: "[]", candidate_preferences: "[]", evidence_summary: "{}" };
          }
          const threshold = Number(runtimeConfig().STYLE_STABLE_THRESHOLD || ".8");
          const merged = mergeEvidence(parsePreferences(dna.stable_preferences), parsePreferences(dna.candidate_preferences), signals.signals, "adopted", threshold);
          await db().prepare("UPDATE style_dna SET stable_preferences=?,candidate_preferences=?,evidence_summary=?,updated_at=? WHERE user_id=?")
            .bind(JSON.stringify(merged.stable), JSON.stringify(merged.candidates), JSON.stringify({ lastContentId: id, lastSummary: signals.summary, lastLearnedAt: now }), now, user.userId).run();
          learned = true;
        }
      } catch {
        learned = false;
      }
    }
    const prepared=await prepareAdoptedCropAssets(id,user.userId);
    return json({ versionNo, status: "adopted", styleLearned: learned,cropAssets:prepared.assets,assetWarnings:prepared.warnings });
  } catch (error) {
    if (isVersionConflict(error)) return json({ error: "此内容已有新版本，请刷新后重试" }, { status: 409 });
    return json({ error: error instanceof Error ? error.message : "采用失败" }, { status: 422 });
  }
}
