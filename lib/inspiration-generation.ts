import { getAIProvider } from "./ai";
import type { InspirationDraft, InspirationGenerationInput } from "./ai/types";

const distinctCountries = (topics: InspirationDraft["topics"]) =>
  new Set(topics.map((topic) => topic.country)).size === topics.length;

const repeatedCountries = (topics: InspirationDraft["topics"]) => {
  const counts = new Map<string, number>();
  for (const topic of topics) counts.set(topic.country, (counts.get(topic.country) || 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([country]) => country);
};

/**
 * 生成四个选题，并保证它们落在四个**不同国家**的具体城市。
 *
 * prompt 只是约束，模型偶尔仍会让两条落在同一国家（尤其在有主推产品或搜索素材时），
 * 因此这里显式校验并带着重复信息重试一次；重试仍不合格则保留首次结果，
 * 不因为这点瑕疵让整个灵感页失败。
 */
export async function generateInspirationSet(input: InspirationGenerationInput): Promise<InspirationDraft> {
  const ai = getAIProvider();
  const first = await ai.generateInspirations(input);
  if (distinctCountries(first.topics)) return first;

  const repeated = repeatedCountries(first.topics);
  try {
    const retry = await ai.generateInspirations({
      ...input,
      retryHint: `上一组里“${repeated.join("、")}”出现了不止一次。本次四个选题必须分属四个互不相同的国家，且每条都要落到该国的具体城市。`,
    });
    if (distinctCountries(retry.topics)) return retry;
  } catch {
    // 重试失败就沿用首次结果，不阻断灵感页
  }
  return first;
}
