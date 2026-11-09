import { getAIProvider } from "./ai";
import type { InspirationGenerationInput, ProductInspirationDraft } from "./ai/types";

type ProductAngle = ProductInspirationDraft["topics"][number]["angle_type"];

// 产品灵感固定四条：三条目的地内容角度 + 一条产品卖点。卖点固定落在第四张卡片上。
const PRODUCT_ANGLES: readonly ProductAngle[] = ["culture", "history", "resources", "selling_point"];
const ANGLE_LABELS: Record<ProductAngle, string> = { culture: "人文风貌", history: "历史文化", resources: "旅游资源", selling_point: "产品卖点" };

const complete = (topics: ProductInspirationDraft["topics"]) => PRODUCT_ANGLES.every((angle) => topics.filter((topic) => topic.angle_type === angle).length === 1);

/** 生成「三条知识角度 + 一条产品卖点」；模型漏类或重复时带着明确缺项重试一次。 */
export async function generateInspirationSet(input: InspirationGenerationInput, deepseekApiKey: string): Promise<ProductInspirationDraft> {
  const ai = getAIProvider(deepseekApiKey);
  const first = await ai.generateInspirations(input);
  if (complete(first.topics)) return first;
  const missing = PRODUCT_ANGLES.filter((angle) => !first.topics.some((topic) => topic.angle_type === angle));
  const duplicated = PRODUCT_ANGLES.filter((angle) => first.topics.filter((topic) => topic.angle_type === angle).length > 1);
  const detail = [
    missing.length ? `缺少：${missing.map((angle) => ANGLE_LABELS[angle]).join("、")}` : "",
    duplicated.length ? `重复：${duplicated.map((angle) => ANGLE_LABELS[angle]).join("、")}` : "",
  ].filter(Boolean).join("；");
  const retry = await ai.generateInspirations({ ...input, retryHint: `上一组类别不完整。必须各生成且只生成一条 culture（人文风貌）、history（历史文化）、resources（旅游资源）、selling_point（产品卖点）；${detail}。` });
  if (!complete(retry.topics)) throw new Error("产品灵感类别生成不完整，请重试");
  return retry;
}
