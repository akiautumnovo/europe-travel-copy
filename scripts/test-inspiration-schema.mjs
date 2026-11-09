import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({ entryPoints: ["lib/ai/types.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { inspirationDraftSchema } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));

const topic = (over = {}) => ({ title: "冰岛为什么几乎没有森林", city: "雷克雅未克", country: "冰岛", flag: "🇮🇸", reason: "地貌与气候的反差很容易引发好奇", audience: "对自然地理感兴趣的旅行者", content_type: "科普", angle_type: "resources", source_index: 0, ...over });
const draft = (city) => ({ topics: ["culture", "history", "resources", "current"].map((angle_type, i) => topic({ angle_type, city: typeof city === "function" ? city(i) : city, title: `第 ${i + 1} 个中文标题` })) });

// 1. 空 city 退回国家名（本次修复的核心场景）
for (const empty of ["", "   ", null, undefined]) {
  const parsed = inspirationDraftSchema.parse(draft(empty));
  assert.equal(parsed.topics[0].city, "冰岛", `city=${JSON.stringify(empty)} 应退回国家名`);
  assert.equal(parsed.topics[3].city, "冰岛");
}
// 2. city 字段缺失
{
  const raw = draft("");
  for (const item of raw.topics) delete item.city;
  assert.equal(inspirationDraftSchema.parse(raw).topics[0].city, "冰岛");
}
// 3. 正常 city 保留并去空白
assert.equal(inspirationDraftSchema.parse(draft("  马德里 ")).topics[0].city, "马德里");
// 4. 连国家名也空时兜底为「全国」
{
  const raw = draft("");
  for (const item of raw.topics) item.country = " ";
  assert.equal(inspirationDraftSchema.parse(raw).topics[0].city, "全国");
}
// 5. 其他校验不放松：数量、标题中文、角度枚举仍然严格
for (const [label, raw] of [
  ["只有 3 个选题", { topics: draft("").topics.slice(0, 3) }],
  ["标题中文不足 4 字", draft("").topics.length && { topics: draft("").topics.map(t => ({ ...t, title: "abc" })) }],
  ["角度枚举非法", { topics: draft("").topics.map(t => ({ ...t, angle_type: "unknown" })) }],
]) {
  assert.throws(() => inspirationDraftSchema.parse(raw), undefined, `${label} 应当仍然校验失败`);
}
// 6. 缺少 flag 仍应失败（本次只放宽 city）
assert.throws(() => inspirationDraftSchema.parse({ topics: draft("").topics.map(t => ({ ...t, flag: "" })) }));

console.log("Inspiration schema regression checks passed.");
