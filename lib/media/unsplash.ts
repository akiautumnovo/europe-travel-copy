import type { MediaProvider } from "./provider";
import type { MediaSearchResult } from "./types";

type Config={apiKey:string;baseUrl:string};
const UTM_SOURCE="travel_copy_assistant";
export function unsplashTrackedUrl(raw:string){const url=new URL(raw);url.searchParams.set("utm_source",UTM_SOURCE);url.searchParams.set("utm_medium","referral");return url.toString()}

export class UnsplashProvider implements MediaProvider{
 readonly name="unsplash" as const;
 private config:Config;
 constructor(config:Config){this.config=config}
 async searchPhotos(query:string,options?:{perPage?:number;orientation?:"landscape"|"portrait"|"square"}):Promise<MediaSearchResult>{
  const url=new URL(`${this.config.baseUrl.replace(/\/$/,"")}/search/photos`);
  url.searchParams.set("query",query.slice(0,100));url.searchParams.set("page","1");url.searchParams.set("per_page",String(Math.min(options?.perPage||30,30)));url.searchParams.set("content_filter","high");
  if(options?.orientation)url.searchParams.set("orientation",options.orientation==="square"?"squarish":options.orientation);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15_000);
  try{
   const response=await fetch(url,{headers:{Authorization:`Client-ID ${this.config.apiKey}`,"Accept-Version":"v1"},signal:controller.signal});
   if(!response.ok)throw new Error(response.status===403||response.status===429?"Unsplash 使用额度暂时已用完":`Unsplash 暂时不可用（${response.status}）`);
   const data=await response.json() as {results?:Array<{id:string;width:number;height:number;alt_description?:string|null;description?:string|null;urls:{small:string;regular:string};links:{html:string;download_location:string};user:{name:string;links:{html:string}}}>};
   return{cached:false,remaining:Number(response.headers.get("X-Ratelimit-Remaining")||"")||undefined,photos:(data.results||[]).map(photo=>({provider:"unsplash",providerId:photo.id,width:photo.width,height:photo.height,alt:photo.alt_description||photo.description||query,photographer:photo.user.name,photographerUrl:unsplashTrackedUrl(photo.user.links.html),sourceUrl:unsplashTrackedUrl(photo.links.html),thumbnailUrl:photo.urls.small,displayUrl:photo.urls.regular,downloadLocation:photo.links.download_location,retrievedAt:new Date().toISOString()}))};
  }finally{clearTimeout(timer)}
 }
}
