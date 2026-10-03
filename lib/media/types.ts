export type MediaPhoto={provider?:"pixabay"|"pexels";providerId:string;width:number;height:number;alt:string;photographer:string;photographerUrl:string;sourceUrl:string;thumbnailUrl:string;displayUrl:string;retrievedAt:string};
export type MediaSearchResult={photos:MediaPhoto[];remaining?:number;resetAt?:string;cached:boolean};
