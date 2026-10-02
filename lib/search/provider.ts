import type { SearchResult,VerifiedClaim,VerificationLevel } from "./types";
export interface SearchProvider{search(query:string,options?:{maxResults?:number;depth?:"basic"|"advanced"}):Promise<SearchResult>;verifyClaim(claim:string,level:VerificationLevel):Promise<VerifiedClaim>}

