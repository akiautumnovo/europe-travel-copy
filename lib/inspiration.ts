import type { SearchSource } from "./search/types";

export type InspirationAngle="culture"|"history"|"resources"|"current";

export type InspirationTopic={
 id:string;
 productId:string|null;
 mode?:"product"|"knowledge";
 countryCode?:string;
 countryNameEn?:string;
 angleType:InspirationAngle;
 city?:string;
 country:string;
 flag:string;
 title:string;
 reason:string;
 audience:string;
 contentType:string;
 productRelated:boolean;
 verification:"verified"|"pending"|"evergreen";
 factId?:string;
 sources?:SearchSource[];
};
