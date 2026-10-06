import { generateInspirationSet } from "./inspiration-generation";
import type { LockedFact } from "./ai/types";
import type { InspirationTopic } from "./inspiration";
import type { SearchSource } from "./search/types";

export type ProductForInspiration={id:string;name:string;facts:LockedFact[];productSummary:string};

export async function buildProductInspirations(product:ProductForInspiration,sources:SearchSource[],previousTitles:string[],refreshNo:number,deepseekApiKey:string){
  const generated=await generateInspirationSet({productId:product.id,productName:product.name,facts:product.facts,productSummary:product.productSummary,sourceSummaries:sources.map(source=>({title:source.title,content:source.content.slice(0,900),institution:source.institution})),previousTitles,refreshNo},deepseekApiKey);
  return generated.topics.map((topic,index):InspirationTopic=>{
    const source=topic.source_index===null?undefined:sources[topic.source_index];
    const currentWithoutSource=topic.angle_type==="current"&&!source;
    return{id:`${product.id}-${refreshNo}-${topic.angle_type}-${index}-${Date.now()}`,productId:product.id,angleType:topic.angle_type,city:topic.city,country:topic.country,flag:topic.flag,title:topic.title,reason:topic.reason,audience:topic.audience,contentType:currentWithoutSource?"实用科普":topic.content_type,productRelated:true,verification:source?"verified":"evergreen",sources:source?[source]:undefined};
  });
}
