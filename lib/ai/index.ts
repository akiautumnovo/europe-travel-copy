import { env } from "cloudflare:workers";
import type { AIProvider } from "./provider";
import { DeepSeekProvider } from "./deepseek";

export function getAIProvider(): AIProvider {
  const config = env as unknown as Record<string, string | undefined>;
  const provider = config.AI_PROVIDER || "deepseek";
  if (provider !== "deepseek") throw new Error(`不支持的 AI Provider：${provider}`);
  if (!config.DEEPSEEK_API_KEY) throw new Error("DeepSeek 尚未配置，请先安全录入 API 密钥");
  return new DeepSeekProvider({
    apiKey: config.DEEPSEEK_API_KEY,
    baseUrl: config.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: config.DEEPSEEK_FAST_MODEL || "deepseek-chat",
  });
}

