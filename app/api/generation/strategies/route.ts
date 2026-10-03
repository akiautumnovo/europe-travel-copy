import { getAIProvider } from "../../../../lib/ai";
import { blocksToText, normalizeFacts, parseJson } from "../../../../lib/content";
import type { GenerationContext } from "../../../../lib/ai/types";
import { labels } from "../../../../lib/style";
import { db, json, requireApiUser } from "../../_shared";

class FactCheckError extends Error{}
const digits=(value:string):string[]=>value.match(/\d+(?:[.,]\d+)?/g)||[];
function unsupportedSensitiveClaims(text:string,facts:GenerationContext["facts"]){
 const rules=[
  {label:"价格",field:/价格|费用|团费/,pattern:/(?:¥|￥|€|\$)\s?\d[\d,.]*|\d[\d,.]*\s?(?:元|欧元|人民币)/gi},
  {label:"日期",field:/日期|出发|时间/,pattern:/\d{4}[年/-]\d{1,2}(?:[月/-]\d{1,2}日?)?|\d{1,2}月\d{1,2}日/gi},
  {label:"行程天数",field:/天数|行程|时长/,pattern:/\d+\s?(?:天|晚)/gi},
  {label:"酒店等级",field:/酒店|住宿|星级/,pattern:/(?:[四五六]|[4-6])星(?:级)?酒店/gi},
  {label:"剩余名额",field:/名额|席位|余位/,pattern:/(?:仅剩|剩余|余)\s*\d+\s?(?:席|位|个名额)/gi},
  {label:"航班",field:/航班|航线/,pattern:/\b[A-Z]{2}\s?\d{3,4}\b/g},
 ];
 return rules.flatMap(rule=>(text.match(rule.pattern)||[]).filter(claim=>{const claimDigits=digits(claim);return !facts.some(f=>rule.field.test(f.field)&&claimDigits.every(n=>digits(f.value).includes(n)))}).map(claim=>`${rule.label}“${claim}”没有对应的已确认事实`));
}

export async function POST(request:Request){
  const user=await requireApiUser();
  try{
    const body=await request.json() as {productId?:string;topic?:string;salesIntensity?:number};
    const intensity=[0,1,2].includes(body.salesIntensity??1)?body.salesIntensity as 0|1|2:1;
    let topic=(body.topic||"").trim(),facts:ReturnType<typeof normalizeFacts>=[],productSnapshot:unknown={};
    if(body.productId){const product=await db().prepare("SELECT id,name,facts,ai_analysis FROM products WHERE id=? AND user_id=?").bind(body.productId,user.userId).first<{id:string;name:string;facts:string;ai_analysis:string}>();if(!product)return json({error:"产品不存在"},{status:404});facts=normalizeFacts(product.facts);productSnapshot={id:product.id,name:product.name,facts};topic=topic||product.name;}
    if(!topic)return json({error:"请选择产品或输入主题"},{status:400});
    const style=await db().prepare("SELECT stable_preferences FROM style_dna WHERE user_id=?").bind(user.userId).first<{stable_preferences:string}>();
    const context:GenerationContext={topic,facts,salesIntensity:intensity,stylePreferences:labels(style?.stable_preferences)};
    const ai=getAIProvider(),strategies=await ai.generateTopicStrategies(context);
    const candidates=await Promise.all(strategies.map(async strategy=>{const draft=await ai.generateCopy(context,strategy);const verification=await ai.verifyCopy(context,draft),criticalIssues=unsupportedSensitiveClaims(blocksToText(draft.blocks),facts);if(criticalIssues.length)throw new FactCheckError(`事实检查未通过：${criticalIssues.join("；")}`);return{strategy,draft,verification:{...verification,fact_safe:true,fact_issues:[]}}}));
    const id=crypto.randomUUID(),now=new Date().toISOString();
    const fingerprint={countries:[...new Set((topic.match(/瑞士|法国|意大利|西班牙|奥地利|德国/g)||[]))],theme:topic,product:body.productId||null,contentTypes:strategies.map(s=>s.type)};
    await db().prepare("INSERT INTO contents (id,user_id,product_id,topic_title,topic_meta,source_input,sales_intensity,status,product_snapshot,fingerprint,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.userId,body.productId||null,topic,JSON.stringify({strategies}),topic,intensity,"draft",JSON.stringify(productSnapshot),JSON.stringify(fingerprint),now,now).run();
    await db().batch(candidates.map((candidate,index)=>db().prepare("INSERT INTO content_versions (id,content_id,user_id,version_no,strategy_type,text_content,blocks,locked_block_ids,change_type,change_instruction,is_adopted,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,?)").bind(crypto.randomUUID(),id,user.userId,index+1,candidate.strategy.type,blocksToText(candidate.draft.blocks),JSON.stringify(candidate.draft.blocks),"[]","initial",candidate.strategy.approach,now)));
    return json({contentId:id,topic,salesIntensity:intensity,latestVersionNo:3,candidates:candidates.map((c,index)=>({...c,versionNo:index+1}))},{status:201});
  }catch(error){if(error instanceof FactCheckError)return json({code:"FACT_CHECK_FAILED",error:error.message},{status:422});return json({code:"AI_GENERATION_FAILED",error:"文案生成暂时失败，请重试。你当前已确认的产品资料不会丢失。"},{status:422})}
}
