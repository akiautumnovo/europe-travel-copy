import type { MediaSearchResult } from "./types";
export interface MediaProvider{searchPhotos(query:string,options?:{perPage?:number;orientation?:"landscape"|"portrait"|"square"}):Promise<MediaSearchResult>}
