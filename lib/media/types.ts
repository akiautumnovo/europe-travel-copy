export type MediaProviderName="pixabay"|"pexels";
export type MediaPhoto={provider:MediaProviderName;providerId:string;width:number;height:number;alt:string;photographer:string;photographerUrl:string;sourceUrl:string;thumbnailUrl:string;displayUrl:string;retrievedAt:string};
export type MediaSearchResult={photos:MediaPhoto[];remaining?:number;resetAt?:string;cached:boolean};

/** 署名与回链只由图片真实来源决定，避免把 Pexels 的图署成 Pixabay。 */
export const mediaProviderCredit:Record<MediaProviderName,{label:string;homepage:string}>={
  pixabay:{label:"Pixabay",homepage:"https://pixabay.com"},
  pexels:{label:"Pexels",homepage:"https://www.pexels.com"},
};
