import { env } from "cloudflare:workers";import type { SearchProvider } from "./provider";import { TavilyProvider } from "./tavily";
export function getSearchProvider():SearchProvider|null{const config=env as unknown as Record<string,string|undefined>;if(!config.TAVILY_API_KEY)return null;if((config.SEARCH_PROVIDER||"tavily")!=="tavily")throw new Error("不支持的搜索 Provider");return new TavilyProvider({apiKey:config.TAVILY_API_KEY,baseUrl:config.TAVILY_BASE_URL||"https://api.tavily.com",proxyUrl:config.SEARCH_PROXY_URL})}

