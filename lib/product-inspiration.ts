import { generateInspirationSet } from "./inspiration-generation";
import type { LockedFact } from "./ai/types";
import type { InspirationTopic } from "./inspiration";

export type ProductForInspiration={id:string;name:string;facts:LockedFact[];productSummary:string;subjectiveClaims?:string[];contentAngles?:string[]};

// 首页固定四张卡片：风景 → 历史 → 人文 → 产品卖点。卖点固定第四张，不跟随模型返回顺序。
const ORDER=["culture","history","resources","selling_point"] as const;

export async function buildProductInspirations(product:ProductForInspiration,previousTitles:string[],refreshNo:number,deepseekApiKey:string){
  const generated=await generateInspirationSet({productId:product.id,productName:product.name,facts:product.facts,productSummary:product.productSummary,subjectiveClaims:product.subjectiveClaims||[],contentAngles:product.contentAngles||[],previousTitles,refreshNo},deepseekApiKey);
  const byAngle=new Map(generated.topics.map(topic=>[topic.angle_type,topic]));
  return ORDER.map((angle,index):InspirationTopic=>{
    const topic=byAngle.get(angle);
    if(!topic)throw new Error("产品灵感类别生成不完整，请重试");
    const sellingPoint=angle==="selling_point";
    return{
      id:`${product.id}-${refreshNo}-${angle}-${index}-${Date.now()}`,
      productId:product.id,
      angleType:angle,
      city:topic.city,
      country:topic.country,
      flag:topic.flag,
      title:topic.title,
      reason:topic.reason,
      audience:topic.audience,
      contentType:topic.content_type,
      productRelated:true,
      // 卖点是从这个产品的已确认资料归纳的，没有外部来源；其余三条是稳定的目的地知识。
      verification:sellingPoint?"verified":"evergreen",
      sellingPoints:sellingPoint?topic.selling_points.slice(0,3):undefined,
    };
  });
}
