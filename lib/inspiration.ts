import type { SearchSource } from "./search/types";

export type InspirationAngle="culture"|"history"|"resources"|"current";

export type InspirationTopic={
 id:string;
 productId:string;
 angleType:InspirationAngle;
 city?:string;
 country:string;
 flag:string;
 title:string;
 reason:string;
 audience:string;
 contentType:string;
 productRelated:true;
 verification:"verified"|"pending"|"evergreen";
 factId?:string;
 sources?:SearchSource[];
};
