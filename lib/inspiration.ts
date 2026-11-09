import type { SearchSource } from "./search/types";

export type InspirationAngle="culture"|"history"|"resources"|"current"|"selling_point";

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
 /** 卖点角度的可感知支撑点（房型、面积、晚数、体验名等），只在 selling_point 一条上有值。 */
 sellingPoints?:string[];
 sources?:SearchSource[];
};
