import type { SearchProvider } from "./provider";import { TavilyProvider } from "./tavily";import { BochaProvider } from "./bocha";import { FailoverSearchProvider } from "./failover";import { config as runtimeConfig } from "../bindings";
/**
 * 按 SEARCH_PROVIDER_ORDER 顺序组装并做故障转移（首个返回结果的 Provider 生效）。
 * 只有配置了 key 的 Provider 才会进入列表——顺序里出现没配 key 的名字不会报错，但起不到备份作用。
 * 用户密钥只支持博查与 Tavily，顺序仍由公开运行配置控制。
 */
export function getSearchProvider(keys?:{bocha?:string;tavily?:string}):SearchProvider|null{const c=runtimeConfig(),providers:SearchProvider[]=[];for(const name of (c.SEARCH_PROVIDER_ORDER||"bocha,tavily").split(",").map(x=>x.trim())){if(name==="tavily"&&keys?.tavily)providers.push(new TavilyProvider({apiKey:keys.tavily,baseUrl:c.TAVILY_BASE_URL||"https://api.tavily.com",proxyUrl:c.SEARCH_PROXY_URL}));if(name==="bocha"&&keys?.bocha)providers.push(new BochaProvider({apiKey:keys.bocha,baseUrl:c.BOCHA_BASE_URL||"https://api.bocha.cn"}))}return providers.length?new FailoverSearchProvider(providers):null}
