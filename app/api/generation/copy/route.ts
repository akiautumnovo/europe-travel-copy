import { z } from "zod";
import { getAIProvider } from "../../../../lib/ai";
import { blocksToText,normalizeFacts,parseJson } from "../../../../lib/content";
import { copyQualityIssues,normalizeVisualSymbols,productFactDraft,reviewWarnings } from "../../../../lib/copy-quality";
import type { GenerationContext } from "../../../../lib/ai/types";
import type { InspirationTopic } from "../../../../lib/inspiration";
import { labels } from "../../../../lib/style";
import { db,json,requireApiUser } from "../../_shared";

const schema=z.object({productId:z.string().min(1),inspirationId:z.string().min(1).optional(),customTopic:z.string().trim().min(4).max(160).optional()}).refine(value=>Boolean(value.inspirationId||value.customTopic),"请选择灵感角度或输入自定义主题");
class FactCheckError extends Error{}
const digits=(value:string):string[]=>(value.match(/\d+(?:[.,]\d+)?/g)||[]).map(number=>number.replace(/,/g,""));
// 事实的 field 由 AI 生成、命名并不固定（“单房差”“房费”“报价”…），按关键词匹配字段会把已锁定的事实误判成无据。
// 星级声称按“星级本身”比对：事实写四星，文案就不能写五星；其余含数字的声称只要有任一事实的数值覆盖该数字即算有据。
function unsupportedSensitiveClaims(text:string,facts:GenerationContext["facts"]){const rules=[{label:"价格",pattern:/(?:¥|￥|€|\$)\s?\d[\d,.]*|\d[\d,.]*\s?(?:元|欧元|人民币)/gi},{label:"日期",pattern:/\d{4}[年/-]\d{1,2}(?:[月/-]\d{1,2}日?)?|\d{1,2}月\d{1,2}日/gi},{label:"行程天数",pattern:/(?:全程|整个行程|行程(?:共|总计|合计)?|共计|总共|为期)\s*\d+\s?(?:天|日)(?:\s*\d+\s?晚)?/gi},{label:"酒店等级",pattern:/(?:[四五六]|[4-6])星(?:级)?酒店/gi},{label:"剩余名额",pattern:/(?:仅剩|剩余|余)\s*\d+\s?(?:席|位|个名额)/gi},{label:"航班",pattern:/\b[A-Z]{2}\s?\d{3,4}\b/g}];const starLevel=(value:string)=>{const match=value.match(/([四五六]|[4-6])\s*星/);return match?match[1].replace("4","四").replace("5","五").replace("6","六"):null};const covered=(claim:string)=>{const level=starLevel(claim);if(level)return facts.some(fact=>starLevel(fact.value)===level);const claimDigits=digits(claim);if(claimDigits.length)return facts.some(fact=>claimDigits.every(number=>digits(fact.value).includes(number)));return facts.some(fact=>fact.value.replace(/级/g,"").includes(claim.replace(/级/g,"").trim()))};return[...new Set(rules.flatMap(rule=>(text.match(rule.pattern)||[]).filter(claim=>!covered(claim)).map(claim=>`${rule.label}“${claim}”没有对应的锁定事实`)))]}
function quotedClaims(issues:string[]){return[...new Set(issues.flatMap(issue=>[...issue.matchAll(/[“「『]([^”」』]{4,})[”」』]/g)].map(match=>match[1].trim())).filter(Boolean))]}

export async function POST(request:Request){
 const user=await requireApiUser(request);if(user instanceof Response)return user;
 try{
  const input=schema.parse(await request.json());
  const [product,profile]=await Promise.all([db().prepare("SELECT id,name,facts,ai_analysis FROM products WHERE id=? AND user_id=?").bind(input.productId,user.userId).first<{id:string;name:string;facts:string;ai_analysis:string}>(),db().prepare("SELECT settings FROM profiles WHERE id=?").bind(user.userId).first<{settings:string}>()]);
  if(!product)return json({error:"产品不存在"},{status:404});
  const facts=normalizeFacts(product.facts);if(!facts.length)return json({code:"FACTS_REQUIRED",error:"这个产品还没有锁定事实，请先上传资料并确认事实"},{status:409});
  const settings=parseJson<Record<string,unknown>>(profile?.settings||"{}",{}),cache=parseJson<Record<string,{topics?:InspirationTopic[]}>>(JSON.stringify(settings.dailyInspirationByProduct||{}),{});
  const inspiration=input.inspirationId?cache[input.productId]?.topics?.find(topic=>topic.id===input.inspirationId):undefined;
  if(input.inspirationId&&!inspiration)return json({error:"这条灵感已过期，请返回今日灵感重新选择"},{status:409});
  const topic=input.customTopic||inspiration!.title,sources=(inspiration?.sources||[]).map(source=>({title:source.title,content:source.content,institution:source.institution,url:source.url}));
  if(inspiration?.angleType==="current"&&inspiration.verification==="verified"&&!sources.length)return json({error:"近期信息缺少可靠来源，请刷新灵感后再试"},{status:422});
  const style=await db().prepare("SELECT stable_preferences FROM style_dna WHERE user_id=?").bind(user.userId).first<{stable_preferences:string}>();
  const context:GenerationContext={topic,facts,salesIntensity:1,stylePreferences:labels(style?.stable_preferences),angleType:inspiration?.angleType||"custom",sources};
  const ai=getAIProvider(),strategy={type:"advisor" as const,title:"产品知识分享",approach:"前半段知识内容，后半段自然连接产品方案",opening:topic};
  let draft=normalizeVisualSymbols(await ai.generateCopy(context,strategy)),verification=await ai.verifyCopy(context,productFactDraft(draft)),factIssues=verification.fact_safe?[]:(verification.fact_issues.length?verification.fact_issues:["产品方案段存在与锁定资料不一致的内容"]);
  let issues=copyQualityIssues(draft),sensitive=unsupportedSensitiveClaims(blocksToText(productFactDraft(draft).blocks),facts);
  const unsupported=quotedClaims(factIssues);
  if(issues.length||sensitive.length||factIssues.length){draft=normalizeVisualSymbols(await ai.reviseCopy({...context,blocks:draft.blocks,lockedBlockIds:[],instruction:`这是唯一一次质量修复。全文控制在400-470个非空白字符（建议300-500字，绝不要超过500字）；恰好保留7个Emoji或视觉符号；前三段只写知识内容，第四段以后再自然连接2-5条产品事实，最后一句必须完整。只修正产品方案段中与锁定产品资料不一致的内容；前三段知识内容不参与产品事实核验，不要为了通过核验而删除。删除产品方案段中没有锁定事实支持的精确数字、价格、日期、天数、酒店、航班和名额。修正以下问题：${[...issues,...sensitive,...factIssues].join("；")}`}));issues=copyQualityIssues(draft);sensitive=unsupportedSensitiveClaims(blocksToText(productFactDraft(draft).blocks),facts);const finalProductText=blocksToText(productFactDraft(draft).blocks),remaining=unsupported.filter(claim=>finalProductText.includes(claim));if(remaining.length)throw new FactCheckError(`事实检查未通过：产品段仍包含未获支持的信息“${remaining.join("”、“")}”`);verification=await ai.verifyCopy(context,productFactDraft(draft));factIssues=verification.fact_safe?[]:(verification.fact_issues.length?verification.fact_issues:["产品方案段存在与锁定资料不一致的内容"])}
  if(sensitive.length)throw new FactCheckError(`事实检查未通过：${sensitive.join("；")}`);
  if(issues.length)return json({code:"COPY_QUALITY_FAILED",error:`文案完整性检查未通过：${issues.join("；")}`},{status:422});
  if(factIssues.length)throw new FactCheckError(`事实检查未通过：${factIssues.join("；")}`);
  verification={...verification,fact_safe:true,fact_issues:reviewWarnings(draft)};
  const id=crypto.randomUUID(),now=new Date().toISOString(),topicMeta={inspiration:inspiration||{angleType:"custom",title:topic,sources:[]}};
  const productSnapshot={id:product.id,name:product.name,facts,analysis:parseJson(product.ai_analysis,{})};
  await db().prepare("INSERT INTO contents (id,user_id,product_id,topic_title,topic_meta,source_input,sales_intensity,status,product_snapshot,fingerprint,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.userId,product.id,topic,JSON.stringify(topicMeta),topic,1,"draft",JSON.stringify(productSnapshot),JSON.stringify({countries:inspiration?[inspiration.country]:[],theme:topic,product:product.id,contentTypes:[inspiration?.angleType||"custom"]}),now,now).run();
  await db().prepare("INSERT INTO content_versions (id,content_id,user_id,version_no,strategy_type,text_content,blocks,locked_block_ids,change_type,change_instruction,is_adopted,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,?)").bind(crypto.randomUUID(),id,user.userId,1,"single",blocksToText(draft.blocks),JSON.stringify(draft.blocks),"[]","initial",inspiration?.angleType||"custom",now).run();
  return json({contentId:id,topic,versionNo:1,draft,verification},{status:201});
 }catch(error){if(error instanceof FactCheckError)return json({code:"FACT_CHECK_FAILED",error:error.message},{status:422});return json({code:"AI_GENERATION_FAILED",error:error instanceof Error?error.message:"文案生成失败，请重试"},{status:422})}
}
