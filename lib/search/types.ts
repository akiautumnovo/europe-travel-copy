export type SearchSource={title:string;url:string;content:string;publishedAt?:string;institution:string;tier:1|2|3|4|5};
export type SearchResult={query:string;answer?:string;sources:SearchSource[]};
export type VerificationLevel="quick"|"deep";
export type VerificationStatus="verified"|"conflicting"|"insufficient";
export type VerifiedClaim={claim:string;level:VerificationLevel;status:VerificationStatus;sources:SearchSource[];verifiedAt:string;expiresAt:string};

