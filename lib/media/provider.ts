import type { MediaProviderName, MediaSearchResult } from "./types";
export interface MediaProvider{readonly name:MediaProviderName;searchPhotos(query:string,options?:{perPage?:number;orientation?:"landscape"|"portrait"|"square"}):Promise<MediaSearchResult>}
