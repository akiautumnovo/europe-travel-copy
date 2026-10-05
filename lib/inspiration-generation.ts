import { getAIProvider } from "./ai";
import type { InspirationDraft, InspirationGenerationInput } from "./ai/types";

const REQUIRED = ["culture", "history", "resources", "current"] as const;
const complete = (topics: InspirationDraft["topics"]) => REQUIRED.every((angle) => topics.some((topic) => topic.angle_type === angle));

/** 生成固定四类产品选题；模型漏类或重复时带着明确缺项重试一次。 */
export async function generateInspirationSet(input: InspirationGenerationInput): Promise<InspirationDraft> {
  const ai = getAIProvider();
  const first = await ai.generateInspirations(input);
  if (complete(first.topics)) return first;
  const missing = REQUIRED.filter((angle) => !first.topics.some((topic) => topic.angle_type === angle));
  const retry = await ai.generateInspirations({...input,retryHint:`上一组类别不完整。必须各生成且只生成一条 culture、history、resources、current；缺少：${missing.join("、")}。`});
  if (!complete(retry.topics)) throw new Error("产品灵感类别生成不完整，请重试");
  return retry;
}
