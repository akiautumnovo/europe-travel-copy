import { db } from "./bindings";
import { normalizeFacts,parseJson } from "./content";
import { getSearchProvider } from "./search";
import { buildProductInspirations } from "./product-inspiration";
import type { InspirationTopic } from "./inspiration";
import type { SearchSource } from "./search/types";

type Daily={date:string;productId:string;reason:string;topics:InspirationTopic[];refreshCount:number;algorithmVersion:number};

export async function productInspiration(userId:string,productId:string,refresh=false){
  const [product,profile]=await Promise.all([
    db().prepare("SELECT id,name,facts,ai_analysis FROM products WHERE id=? AND user_id=?").bind(productId,userId).first<{id:string;name:string;facts:string;ai_analysis:string}>(),
    db().prepare("SELECT settings FROM profiles WHERE id=?").bind(userId).first<{settings:string}>(),
  ]);
  if(!product)throw new Error("产品不存在");
  const facts=normalizeFacts(product.facts),analysis=parseJson<{product_summary?:string}>(product.ai_analysis,{});
  const settings=parseJson<Record<string,unknown>>(profile?.settings||"{}",{});
  const cache=parseJson<Record<string,Daily>>(JSON.stringify(settings.dailyInspirationByProduct||{}),{});
  const today=new Date().toISOString().slice(0,10),previous=cache[productId];
  if(!refresh&&previous?.date===today&&previous.topics?.length===4&&previous.algorithmVersion===4)return{...previous,lockedFactCount:facts.length,searchConfigured:Boolean(getSearchProvider())};
  const refreshCount=refresh?(previous?.refreshCount||0)+1:0;
  const provider=getSearchProvider();let sources:SearchSource[]=[];
  if(provider)try{const result=await provider.search(`${product.name} ${today.slice(0,4)} 旅游 近期 官方 信息`,{maxResults:8,depth:"advanced"});sources=result.sources.filter(source=>source.tier<=3&&/travel|touris|visa|rail|train|flight|museum|visitor|festival|event|旅游|签证|铁路|航班|博物馆|活动/i.test(`${source.title} ${source.content}`)).slice(0,3)}catch{/* 近期角度自动降级为稳定科普 */}
  const topics=await buildProductInspirations({id:product.id,name:product.name,facts,productSummary:analysis.product_summary||""},sources,previous?.topics?.map(topic=>topic.title)||[],refreshCount);
  const daily:Daily={date:today,productId,reason:sources.length?`围绕“${product.name}”整理了人文、历史、旅游资源和近期信息四个角度。`:`围绕“${product.name}”整理了三类目的地知识与一条稳定实用科普。`,topics,refreshCount,algorithmVersion:4};
  cache[productId]=daily;settings.dailyInspirationByProduct=cache;
  await db().prepare("UPDATE profiles SET settings=?,updated_at=? WHERE id=?").bind(JSON.stringify(settings),new Date().toISOString(),userId).run();
  return{...daily,lockedFactCount:facts.length,searchConfigured:Boolean(provider)};
}
