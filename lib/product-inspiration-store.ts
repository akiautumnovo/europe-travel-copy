import { db } from "./bindings";
import { normalizeFacts,parseJson } from "./content";
import { buildProductInspirations } from "./product-inspiration";
import type { InspirationTopic } from "./inspiration";
import { getUserApiKeys } from "./user-api-keys";

type Daily={date:string;productId:string;reason:string;topics:InspirationTopic[];refreshCount:number;algorithmVersion:number};
// 第 5 版：第四张卡片由「近期信息」改为「产品卖点」，旧缓存（第 4 版）必须重算。
const VERSION=5;

type ProductAnalysis={product_summary?:string;subjective_claims?:unknown;possible_content_angles?:unknown};
const strings=(value:unknown):string[]=>Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"&&Boolean(item.trim())).slice(0,6):[];

export async function productInspiration(userId:string,productId:string,refresh=false){
  const [product,profile]=await Promise.all([
    db().prepare("SELECT id,name,facts,ai_analysis FROM products WHERE id=? AND user_id=?").bind(productId,userId).first<{id:string;name:string;facts:string;ai_analysis:string}>(),
    db().prepare("SELECT settings FROM profiles WHERE id=?").bind(userId).first<{settings:string}>(),
  ]);
  if(!product)throw new Error("产品不存在");
  const facts=normalizeFacts(product.facts),analysis=parseJson<ProductAnalysis>(product.ai_analysis,{});
  const settings=parseJson<Record<string,unknown>>(profile?.settings||"{}",{});
  const apiKeys=await getUserApiKeys(userId);
  const cache=parseJson<Record<string,Daily>>(JSON.stringify(settings.dailyInspirationByProduct||{}),{});
  const today=new Date().toISOString().slice(0,10),previous=cache[productId];
  if(!refresh&&previous?.date===today&&previous.topics?.length===4&&previous.algorithmVersion===VERSION)return{...previous,lockedFactCount:facts.length};
  const refreshCount=refresh?(previous?.refreshCount||0)+1:0;
  // 卖点由产品资料归纳，不再需要联网检索；三条知识角度是稳定常识。
  const topics=await buildProductInspirations({
    id:product.id,
    name:product.name,
    facts,
    productSummary:analysis.product_summary||"",
    subjectiveClaims:strings(analysis.subjective_claims),
    contentAngles:strings(analysis.possible_content_angles),
  },previous?.topics?.map(topic=>topic.title)||[],refreshCount,apiKeys.deepseek||"");
  const daily:Daily={date:today,productId,reason:`围绕“${product.name}”整理了人文、历史、旅游资源三个角度，外加一条从产品资料里提炼的卖点。`,topics,refreshCount,algorithmVersion:VERSION};
  cache[productId]=daily;
  // 只原子更新产品灵感字段。产品灵感与国家知识灵感可能并发完成，整体覆写 settings 会让后完成的请求抹掉另一份缓存。
  await db().prepare("UPDATE profiles SET settings=json_set(COALESCE(NULLIF(settings,''),'{}'),'$.dailyInspirationByProduct',json(?)),updated_at=? WHERE id=?").bind(JSON.stringify(cache),new Date().toISOString(),userId).run();
  return{...daily,lockedFactCount:facts.length};
}
