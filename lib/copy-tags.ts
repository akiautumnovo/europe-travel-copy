import type { Draft } from "./ai/types";
import { config } from "./bindings";
import { EUROPE_COUNTRIES, findEuropeCountry, type EuropeCountry } from "./europe-countries";
import type { InspirationAngle } from "./inspiration";

/**
 * 朋友圈文案末尾的话题标签。
 *
 * 标签全部由可核对的信息拼出来（品牌配置、欧洲、国家、区域、选题类别），不让模型自由发挥，
 * 避免出现「#极光季」而产品其实是夏季这种编排出来的标签。标签作为一个独立 block 存进文案，
 * 用户可以像改正文一样直接改（想补 #极光季 自己加）。
 */

// 只收无争议的常见中文旅游分区；俄罗斯、土耳其、塞浦路斯等跨洲或归属有争议的国家不加区域标签。
const REGIONS: readonly { label: string; codes: readonly string[] }[] = [
  { label: "#北欧", codes: ["DK", "FI", "IS", "NO", "SE"] },
  { label: "#西欧", codes: ["BE", "FR", "IE", "LU", "NL", "GB", "MC"] },
  { label: "#中欧", codes: ["AT", "CH", "CZ", "DE", "HU", "LI", "PL", "SK", "SI"] },
  { label: "#南欧", codes: ["AD", "ES", "GR", "IT", "MT", "PT", "SM", "VA"] },
  { label: "#东南欧", codes: ["AL", "BA", "BG", "HR", "ME", "MK", "RO", "RS"] },
  { label: "#东欧", codes: ["BY", "EE", "LT", "LV", "MD", "UA"] },
];

const MAX_TAGS = 8;

const ANGLE_TAGS: Record<InspirationAngle | "custom", string> = {
  resources: "#风景",
  history: "#历史",
  culture: "#人文",
  current: "#旅行资讯",
  selling_point: "#特色体验",
  custom: "#旅行",
};

/** 卖点类别的标签跟着 content_type 走，比笼统的「#特色体验」更贴内容。 */
function sellingPointTag(contentType?: string): string {
  if (!contentType) return ANGLE_TAGS.selling_point;
  if (contentType.includes("住宿") || contentType.includes("酒店")) return "#特色住宿";
  if (contentType.includes("稀缺") || contentType.includes("限定")) return "#稀缺体验";
  if (contentType.includes("交通") || contentType.includes("航班")) return "#特色交通";
  return ANGLE_TAGS.selling_point;
}

/** 整块只由话题标签组成（`#欧洲 #芬兰`），用于把它和正文区分开。 */
export function isTagBlock(block: { text?: string }): boolean {
  return /^#[^\s#]+(?:\s+#[^\s#]+)*$/.test((block.text || "").trim());
}

export type CopyTagInput = {
  /** 知识模式传当前国家代码；产品模式靠产品名与锁定事实里出现的国家名识别。 */
  countryCode?: string;
  productName?: string;
  facts?: { field: string; value: string }[];
  angleType?: InspirationAngle | "custom";
  contentType?: string;
};

export function buildCopyTags(input: CopyTagInput): string[] {
  const tags: string[] = [];
  const push = (tag: string) => {
    const clean = tag.trim().startsWith("#") ? tag.trim() : `#${tag.trim()}`;
    if (clean.length > 1 && !tags.includes(clean)) tags.push(clean);
  };
  const configured = (value?: string) => (value || "").split(/[,，、\s]+/).filter(Boolean);

  // 1. 品牌标签在前，运营标签收尾——都走配置（config/app.env），代码里不写死品牌名。
  for (const item of configured(config().COPY_BRAND_TAGS)) push(item);

  // 2. 欧洲 + 区域 + 国家（产品名与事实里按出现顺序取最多三个国家）
  push("#欧洲");
  const direct = input.countryCode ? findEuropeCountry(input.countryCode) : undefined;
  const countries: EuropeCountry[] = direct
    ? [direct]
    : (() => {
        const text = [input.productName || "", ...(input.facts || []).map((fact) => `${fact.field} ${fact.value}`)].join(" ");
        return EUROPE_COUNTRIES.map((country) => ({ country, at: text.indexOf(country.name) }))
          .filter((hit) => hit.at >= 0)
          .sort((a, b) => a.at - b.at)
          .slice(0, 3)
          .map((hit) => hit.country);
      })();
  const region = REGIONS.find((item) => countries.some((country) => item.codes.includes(country.code)));
  if (region) push(region.label);
  for (const country of countries) push(country.name);

  // 3. 选题类别
  const angle = input.angleType || "custom";
  push(angle === "selling_point" ? sellingPointTag(input.contentType) : ANGLE_TAGS[angle]);

  // 4. 运营标签收尾
  for (const item of configured(config().COPY_EXTRA_TAGS)) push(item);

  return tags.slice(0, MAX_TAGS);
}

/** 把标签块放到文案末尾；已有标签块先移除，避免重复追加。 */
export function appendTagBlock(draft: Draft, tags: string[]): Draft {
  const blocks = draft.blocks.filter((block) => !isTagBlock(block));
  if (!tags.length) return { blocks };
  return { blocks: [...blocks, { id: `tags-${crypto.randomUUID()}`, text: tags.join(" "), category: "marketing" }] };
}
