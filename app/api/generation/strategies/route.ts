import { getUserApiKeys } from "@/lib/user-api-keys";
import { getAIProvider } from "../../../../lib/ai";
import { blocksToText, normalizeFacts } from "../../../../lib/content";
import { commonSenseFactIssues } from "../../../../lib/copy-quality";
import type { GenerationContext } from "../../../../lib/ai/types";
import { labels } from "../../../../lib/style";
import { db, json, requireApiUser } from "../../_shared";

// 策略调整：系统只拦「常识类」问题。价格、日期、天数、住宿、航班、名额等数据类内容不再由系统判定对错，
// 改由生成页展示「已锁定产品事实」，用户自行比对判断（见 lib/copy-quality.ts 的 commonSenseFactIssues）。
class FactCheckError extends Error{}

export async function POST(request:Request){
  const user=await requireApiUser(request);
  if(user instanceof Response)return user;
  try{
    const body=await request.json() as {productId?:string;topic?:string;salesIntensity?:number};
    const intensity=[0,1,2].includes(body.salesIntensity??1)?body.salesIntensity as 0|1|2:1;
    let topic=(body.topic||"").trim(),facts:ReturnType<typeof normalizeFacts>=[],productSnapshot:unknown={};
    if(body.productId){const product=await db().prepare("SELECT id,name,facts,ai_analysis FROM products WHERE id=? AND user_id=?").bind(body.productId,user.userId).first<{id:string;name:string;facts:string;ai_analysis:string}>();if(!product)return json({error:"产品不存在"},{status:404});facts=normalizeFacts(product.facts);productSnapshot={id:product.id,name:product.name,facts};topic=topic||product.name;}
    if(!topic)return json({error:"请选择产品或输入主题"},{status:400});
    const style=await db().prepare("SELECT stable_preferences FROM style_dna WHERE user_id=?").bind(user.userId).first<{stable_preferences:string}>();
    const context:GenerationContext={topic,facts,salesIntensity:intensity,stylePreferences:labels(style?.stable_preferences)};
    const ai=getAIProvider((await getUserApiKeys(user.userId)).deepseek),strategies=await ai.generateTopicStrategies(context);
    // 三个方向彼此独立：一个方向没通过事实检查，不应该让另外两个一起失败。
    const settled=await Promise.allSettled(strategies.map(async strategy=>{
      const draft=await ai.generateCopy(context,strategy);
      let current=draft,verification=await ai.verifyCopy(context,draft);
      // 自动去 AI 腔：verify 发现自然度问题就自动润色一轮，润色失败或引入新事实则回退原稿。
      if(verification.naturalness_issues.length){
        try{
          const polished=await ai.reviseCopy({...context,blocks:draft.blocks,lockedBlockIds:[],instruction:`去掉AI腔，事实保持不变：${verification.naturalness_issues.join("；")}`});
          const recheck=await ai.verifyCopy(context,polished,draft);
          if(recheck.fact_safe){current=polished;verification={...recheck,fact_issues:recheck.fact_issues};}
        }catch{/* 润色是增益步骤，任何失败都静默回退原稿 */}
      }
      // 只拦常识类问题；数据类内容（价格、日期、天数、住宿、航班、名额等）不再由系统判定，交给用户对照锁定事实自行核对。
      const commonIssues=verification.fact_safe?[]:commonSenseFactIssues(verification.fact_issues);
      if(commonIssues.length)throw new FactCheckError(`常识检查未通过：${commonIssues.join("；")}`);
      return{strategy,draft:current,verification};
    }));
    const candidates=settled.flatMap(result=>result.status==="fulfilled"?[result.value]:[]);
    const skipped=settled.flatMap(result=>result.status==="rejected"?[result.reason instanceof Error?result.reason.message:"该方向生成失败"]:[]);
    if(!candidates.length){const first=settled.find(result=>result.status==="rejected") as PromiseRejectedResult|undefined,reason=first?.reason;throw reason instanceof FactCheckError?reason:new Error(skipped[0]||"三个方向都没有生成成功，请重试");}
    const id=crypto.randomUUID(),now=new Date().toISOString();
    const fingerprint={countries:[...new Set((topic.match(/瑞士|法国|意大利|西班牙|奥地利|德国/g)||[]))],theme:topic,product:body.productId||null,contentTypes:strategies.map(s=>s.type)};
    await db().prepare("INSERT INTO contents (id,user_id,product_id,topic_title,topic_meta,source_input,sales_intensity,status,product_snapshot,fingerprint,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.userId,body.productId||null,topic,JSON.stringify({strategies}),topic,intensity,"draft",JSON.stringify(productSnapshot),JSON.stringify(fingerprint),now,now).run();
    await db().batch(candidates.map((candidate,index)=>db().prepare("INSERT INTO content_versions (id,content_id,user_id,version_no,strategy_type,text_content,blocks,locked_block_ids,change_type,change_instruction,is_adopted,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,?)").bind(crypto.randomUUID(),id,user.userId,index+1,candidate.strategy.type,blocksToText(candidate.draft.blocks),JSON.stringify(candidate.draft.blocks),"[]","initial",candidate.strategy.approach,now)));
    // latestVersionNo 必须是真实入库的版本数，否则前端拿到的 versionNo 会和数据库对不上导致 409。
    return json({contentId:id,topic,salesIntensity:intensity,latestVersionNo:candidates.length,skipped,candidates:candidates.map((c,index)=>({...c,versionNo:index+1}))},{status:201});
  }catch(error){
    if(error instanceof FactCheckError)return json({code:"FACT_CHECK_FAILED",error:error.message},{status:422});
    return json({code:"AI_GENERATION_FAILED",error:error instanceof Error&&error.message?error.message:"文案生成暂时失败，请重试。你当前已确认的产品资料不会丢失。"},{status:422});
  }
}
