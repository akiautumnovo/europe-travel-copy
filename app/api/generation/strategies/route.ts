import { getAIProvider } from "../../../../lib/ai";
import { blocksToText, normalizeFacts } from "../../../../lib/content";
import type { GenerationContext } from "../../../../lib/ai/types";
import { labels } from "../../../../lib/style";
import { db, json, requireApiUser } from "../../_shared";

class FactCheckError extends Error{}
// 千分位逗号只是书写习惯：把 "5,999" 归一到 "5999"，否则与事实里的 "5999" 比对会误报。
const digits=(value:string):string[]=>(value.match(/\d+(?:[.,]\d+)?/g)||[]).map(number=>number.replace(/,/g,""));
function unsupportedSensitiveClaims(text:string,facts:GenerationContext["facts"]){
 // 事实的 field 由 AI 生成、命名并不固定（“单房差”“房费”“报价”…），按关键词匹配字段会把已锁定的事实误判成无据。
 // 星级声称按“星级本身”比对：事实写四星，文案就不能写五星；其余含数字的声称只要有任一事实的数值覆盖该数字即算有据。
 const rules=[
  {label:"价格",pattern:/(?:¥|￥|€|\$)\s?\d[\d,.]*|\d[\d,.]*\s?(?:元|欧元|人民币)/gi},
  {label:"日期",pattern:/\d{4}[年/-]\d{1,2}(?:[月/-]\d{1,2}日?)?|\d{1,2}月\d{1,2}日/gi},
  {label:"行程天数",pattern:/(?:全程|整个行程|行程(?:共|总计|合计)?|共计|总共|为期)\s*\d+\s?(?:天|日)(?:\s*\d+\s?晚)?/gi},
  {label:"酒店等级",pattern:/(?:[四五六]|[4-6])星(?:级)?酒店/gi},
  {label:"剩余名额",pattern:/(?:仅剩|剩余|余)\s*\d+\s?(?:席|位|个名额)/gi},
  {label:"航班",pattern:/\b[A-Z]{2}\s?\d{3,4}\b/g},
 ];
 const starLevel=(value:string)=>{const match=value.match(/([四五六]|[4-6])\s*星/);return match?match[1].replace("4","四").replace("5","五").replace("6","六"):null};
 const covered=(claim:string)=>{
  const level=starLevel(claim);
  if(level)return facts.some(f=>starLevel(f.value)===level);
  const claimDigits=digits(claim);
  if(claimDigits.length)return facts.some(f=>claimDigits.every(n=>digits(f.value).includes(n)));
  return facts.some(f=>f.value.replace(/级/g,"").includes(claim.replace(/级/g,"").trim()));
 };
 return [...new Set(rules.flatMap(rule=>(text.match(rule.pattern)||[]).filter(claim=>!covered(claim)).map(claim=>`${rule.label}“${claim}”没有对应的已确认事实`)))];
}

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
    const ai=getAIProvider(),strategies=await ai.generateTopicStrategies(context);
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
      const criticalIssues=unsupportedSensitiveClaims(blocksToText(current.blocks),facts);
      if(criticalIssues.length)throw new FactCheckError(`事实检查未通过：${criticalIssues.join("；")}`);
      // AI 核验明确判定不安全时必须阻断。不能只把问题作为提示展示后又把 fact_safe 强制改成 true，
      // 否则正则没有覆盖到的地点、政策、交通等虚构事实仍会进入可采用的候选稿。
      if(!verification.fact_safe)throw new FactCheckError(`事实检查未通过：${verification.fact_issues.join("；")||"文案包含无法由已确认资料支持的事实"}`);
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
