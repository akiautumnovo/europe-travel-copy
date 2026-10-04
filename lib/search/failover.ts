import type { SearchProvider } from "./provider";import type { SearchResult,VerificationLevel,VerifiedClaim } from "./types";
export class FailoverSearchProvider implements SearchProvider{
 constructor(private providers:SearchProvider[]){}
 async search(query:string,options?:{maxResults?:number;depth?:"basic"|"advanced"}){
  // 只要有任一 provider 真的应答过，就说明“联网是通的”：此时返回空结果，
  // 让上层区分“搜到 0 条”和“联网不可用”，避免误报。
  let answered:SearchResult|undefined;
  for(const provider of this.providers)try{const result=await provider.search(query,options);if(result.sources.length)return result;answered??=result}catch{}
  if(answered)return answered;
  throw new Error("当前无法联网核验，这条事实暂时不会写入文案")
 }
 async verifyClaim(claim:string,level:VerificationLevel){
  let answered:VerifiedClaim|undefined;
  for(const provider of this.providers)try{const result=await provider.verifyClaim(claim,level);if(result.sources.length)return result;answered??=result}catch{}
  if(answered)return answered;
  throw new Error("当前无法联网核验，这条事实暂时不会写入文案")
 }
}
