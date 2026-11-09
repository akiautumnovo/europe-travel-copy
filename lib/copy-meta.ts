import type { Draft, DraftBlock, LockedFact } from "./ai/types";
import { isTagBlock } from "./copy-tags";

/**
 * 文案末尾的报价信息块（产品 / 价格 / 班期 / 早鸟优惠）。
 *
 * 这些行全部从锁定事实里按字段名取原文，不做改写、不补全：找不到对应事实就不输出那一行，
 * 避免把价格、日期写成模型编的版本。整个块存成一个 block，用户可以直接手改。
 *
 * 格式：
 *   ✈️ 产品：芬兰＋冰岛11日8晚
 *   💰 价格：56800元/人
 *   📅 班期：1月25日｜2月15日
 *
 *   🎁 早鸟优惠
 *   提前120天，立减1200元/人
 */

const META_HEAD = /^✈️?\s*产品[:：]/u;
const PRICE_FIELD = /价格|售价|报价|团费|成人价|单人价/;
const PRICE_EXCLUDE = /儿童|单房差|补差|差价|小费|保险|签证|押金|税费|包含|不含|说明/;
const PRICE_EXACT = /^(价格|团费|售价|报价|成人价|单人价|人均价格|价格标准)$/;
const DATE_FIELD = /班期|出发|团期|排期|档期/;
const DATE_EXCLUDE = /报名|截止|回程|返回|城市|机场|港口|口岸|集合|地点/;
const DATE_EXACT = /^(班期|出发日期|团期|排期|档期|出发班期)$/;
const EARLY_FIELD = /早鸟|立减|优惠/;
const EARLY_EXCLUDE = /儿童|押金|税费/;

const clean = (value: string) => value.replace(/\s+/g, " ").replace(/^[：:，,；;、\s]+|[；;，,、\s]+$/g, "").trim();
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}…` : value);

function pick(facts: LockedFact[], include: RegExp, exclude: RegExp, exact?: RegExp): LockedFact | undefined {
  const candidates = facts.filter((fact) => include.test(fact.field) && !exclude.test(fact.field));
  return (exact ? candidates.find((fact) => exact.test(fact.field.trim())) : undefined) ?? candidates[0];
}

/** 信息块首行是「✈️ 产品：」，据此识别；用户手改掉 emoji 也能认出来。 */
export function isMetaBlock(block: { id?: string; text?: string }): boolean {
  const text = (block.text || "").trim();
  if (!text) return false;
  if (block.id?.startsWith("meta-")) return true;
  return META_HEAD.test(text.split("\n")[0] || "");
}

/**
 * 报价块的四行排版固定存在，资料里没有的那一项就留空，由用户自己填。
 * 不能因为缺价格或班期就不输出——排版本身就是给用户补内容的骨架。
 */
export function buildCopyMeta(productName: string, facts: LockedFact[]): string {
  const name = clean(productName);

  const price = pick(facts, PRICE_FIELD, PRICE_EXCLUDE, PRICE_EXACT);

  const dateFacts = facts.filter((fact) => DATE_FIELD.test(fact.field) && !DATE_EXCLUDE.test(fact.field));
  const preferred = dateFacts.find((fact) => DATE_EXACT.test(fact.field.trim()));
  const ordered = preferred ? [preferred, ...dateFacts.filter((fact) => fact !== preferred)] : dateFacts;
  const dates = [...new Set(ordered.map((fact) => clean(fact.value)).filter(Boolean))].slice(0, 3);

  const early = facts
    .filter((fact) => EARLY_FIELD.test(fact.field) && !EARLY_EXCLUDE.test(fact.field))
    .flatMap((fact) => clean(fact.value).split(/[；;\n]+/))
    .map((line) => clip(clean(line), 26))
    .filter(Boolean)
    .slice(0, 4);

  const lines = [
    `✈️ 产品：${name ? clip(name, 34) : ""}`,
    `💰 价格：${price ? clip(clean(price.value), 34) : ""}`,
    `📅 班期：${dates.length ? clip(dates.join("｜"), 52) : ""}`,
    "",
    "🎁 早鸟优惠",
    ...early,
  ];
  return lines.join("\n");
}

/** 把报价信息块放到文案末尾（标签之前）；已有信息块先移除，避免重复。 */
export function appendMetaBlock(draft: Draft, text: string): Draft {
  const blocks = draft.blocks.filter((block) => !isMetaBlock(block));
  return { blocks: [...blocks, { id: `meta-${crypto.randomUUID()}`, text, category: "marketing" }] };
}

/**
 * 修稿后把「报价信息块 + 话题标签」还原到末尾，顺序固定为 正文 → 信息块 → 标签。
 * 两块默认都用 previous 原文：previous 就是用户当前编辑后的内容，手改会保留，
 * 而 AI 改写全文时既不会把标签并进正文，也不会往留空的价格行里补内容。
 * 只有明确在编辑该段时才接受 AI 结果。
 */
export function restoreTrailingBlocks(previous: DraftBlock[], next: DraftBlock[], instruction: string, targetBlockId?: string): DraftBlock[] {
  const prevMeta = previous.find(isMetaBlock);
  const prevTag = previous.find(isTagBlock);
  const nextMeta = next.find(isMetaBlock);
  const nextTag = next.find(isTagBlock);
  const body = next.filter((block) => !isMetaBlock(block) && !isTagBlock(block));
  const editingTag = Boolean(targetBlockId && prevTag?.id === targetBlockId);
  const editingMeta = Boolean(targetBlockId && prevMeta?.id === targetBlockId);
  const wantsTags = /标签|hashtag|tag/i.test(instruction);
  const tag = editingTag ? nextTag : (wantsTags ? nextTag : prevTag) ?? undefined;
  const meta = editingMeta ? (nextMeta ?? prevMeta) : (prevMeta ?? nextMeta);
  return [...body, ...(meta ? [meta] : []), ...(tag ? [tag] : [])];
}
