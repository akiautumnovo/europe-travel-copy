import type { SearchProvider } from "./provider";
import { sourceTier } from "./tier";
import type { SearchResult,SearchSource,VerificationLevel,VerifiedClaim } from "./types";
import { cacheHours } from "./freshness";

type Config={apiKey:string;baseUrl:string};
// 注意：端点是 ydc-index.io（api.ydc-index.io 会返回 403），鉴权用 X-API-Key 而不是 Authorization。
export class YouProvider implements SearchProvider{
 constructor(private config:Config){}
 async search(query:string,options?:{maxResults?:number}):Promise<SearchResult>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15_000);
  try{
   const response=await fetch(`${this.config.baseUrl.replace(/\/$/,"")}/v1/search`,{
    method:"POST",
    headers:{"content-type":"application/json","X-API-Key":this.config.apiKey},
    body:JSON.stringify({query,count:Math.min(options?.maxResults||5,100)}),
    signal:controller.signal,
   });
   if(!response.ok)throw new Error(`You.com 搜索不可用（${response.status}）`);
   const data=await response.json() as {results?:{web?:Array<{url?:string;title?:string;description?:string;snippets?:string[];page_age?:string}>;news?:Array<{url?:string;title?:string;description?:string;snippets?:string[];page_age?:string}>}};
   // web 与 news 合并：news 段只在识别到新闻意图时出现。
   const sources=[...(data.results?.web||[]),...(data.results?.news||[])]
    .filter(item=>item.url)
    .map((item):SearchSource=>({
     title:item.title||"未命名页面",
     url:item.url!,
     content:item.snippets?.join(" ")||item.description||"",
     publishedAt:item.page_age,
     institution:new URL(item.url!).hostname,
     tier:sourceTier(item.url!),
    }))
    .sort((left,right)=>left.tier-right.tier);
   return{query,sources};
  }finally{clearTimeout(timer)}
 }
 async verifyClaim(claim:string,level:VerificationLevel):Promise<VerifiedClaim>{
  const result=await this.search(claim,{maxResults:level==="deep"?6:3}),reliable=result.sources.filter(source=>source.tier<=3),now=new Date();
  return{claim,level,status:reliable.length>=(level==="deep"?2:1)?"verified":"insufficient",sources:result.sources,verifiedAt:now.toISOString(),expiresAt:new Date(now.getTime()+cacheHours(claim)*3600_000).toISOString()};
 }
}
