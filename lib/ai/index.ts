import type { AIProvider } from "./provider";
import { DeepSeekProvider } from "./deepseek";
import { config as runtimeConfig } from "../bindings";

export function getAIProvider(apiKey?: string): AIProvider {
  const config = runtimeConfig();
  const provider = config.AI_PROVIDER || "deepseek";
  if (provider !== "deepseek") throw new Error(`不支持的 AI Provider：${provider}`);
  if (!apiKey) throw new Error("请先在账号设置中配置 DeepSeek API 密钥");
  return new DeepSeekProvider({
    apiKey,
    baseUrl: config.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: config.DEEPSEEK_FAST_MODEL || "deepseek-chat",
  });
}

