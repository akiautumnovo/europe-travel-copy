import type { SearchProvider } from "./provider";import type { VerificationLevel } from "./types";
export class FailoverSearchProvider implements SearchProvider{
 constructor(private providers:SearchProvider[]){}
 async search(query:string,options?:{maxResults?:number;depth?:"basic"|"advanced"}){
  for(const provider of this.providers)try{const result=await provider.search(query,options);if(result.sources.length)return result}catch{}
  throw new Error("当前无法联网核验，这条事实暂时不会写入文案")
 }
 async verifyClaim(claim:string,level:VerificationLevel){
  for(const provider of this.providers)try{const result=await provider.verifyClaim(claim,level);if(result.sources.length)return result}catch{}
  throw new Error("当前无法联网核验，这条事实暂时不会写入文案")
 }
}
