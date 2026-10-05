import { z } from "zod";
import { getAIProvider } from "../../../../lib/ai";
import { blocksToText,normalizeFacts,parseJson } from "../../../../lib/content";
import { copyQualityIssues } from "../../../../lib/copy-quality";
import type { GenerationContext } from "../../../../lib/ai/types";
import type { InspirationTopic } from "../../../../lib/inspiration";
import { labels } from "../../../../lib/style";
import { db,json,requireApiUser } from "../../_shared";

const schema=z.object({productId:z.string().min(1),inspirationId:z.string().min(1).optional(),customTopic:z.string().trim().min(4).max(160).optional()}).refine(value=>Boolean(value.inspirationId||value.customTopic),"请选择灵感角度或输入自定义主题");
class FactCheckError extends Error{}
const digits=(value:string):string[]=>(value.match(/\d+(?:[.,]\d+)?/g)||[]).map(number=>number.replace(/,/g,""));
function unsupportedSensitiveClaims(text:string,facts:GenerationContext["facts"]){const rules=[{label:"价格",field:/价格|费用|团费/,pattern:/(?:¥|￥|€|\$)\s?\d[\d,.]*|\d[\d,.]*\s?(?:元|欧元|人民币)/gi},{label:"日期",field:/日期|出发|时间/,pattern:/\d{4}[年/-]\d{1,2}(?:[月/-]\d{1,2}日?)?|\d{1,2}月\d{1,2}日/gi},{label:"行程天数",field:/天数|行程|时长/,pattern:/(?:全程|整个行程|行程(?:共|总计|合计)?|共计|总共|为期)\s*\d+\s?(?:天|日)(?:\s*\d+\s?晚)?/gi},{label:"酒店等级",field:/酒店|住宿|星级/,pattern:/(?:[四五六]|[4-6])星(?:级)?酒店/gi},{label:"剩余名额",field:/名额|席位|余位/,pattern:/(?:仅剩|剩余|余)\s*\d+\s?(?:席|位|个名额)/gi},{label:"航班",field:/航班|航线/,pattern:/\b[A-Z]{2}\s?\d{3,4}\b/g}];return[...new Set(rules.flatMap(rule=>(text.match(rule.pattern)||[]).filter(claim=>{const claimDigits=digits(claim);return!facts.some(fact=>rule.field.test(fact.field)&&claimDigits.every(number=>digits(fact.value).includes(number)))}).map(claim=>`${rule.label}“${claim}”没有对应的锁定事实`)))]}

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
  let draft=await ai.generateCopy(context,strategy),verification=await ai.verifyCopy(context,draft);
  let issues=[...copyQualityIssues(draft),...verification.naturalness_issues];
  if(issues.length||!verification.fact_safe){const revised=await ai.reviseCopy({...context,blocks:draft.blocks,lockedBlockIds:[],instruction:`这是唯一一次质量修复。务必将全文写到410-470个非空白字符，低于350字视为失败；恰好保留7个Emoji或视觉符号；前三段只写知识内容，第四段以后再自然连接2-5条产品事实，最后一句必须完整。修正以下问题并保持事实不变：${[...issues,...verification.fact_issues].join("；")}`});const recheck=await ai.verifyCopy(context,revised,draft);draft=revised;verification=recheck;issues=[...copyQualityIssues(draft),...recheck.naturalness_issues]}
  const sensitive=unsupportedSensitiveClaims(blocksToText(draft.blocks),facts);
  if(sensitive.length)throw new FactCheckError(`事实检查未通过：${sensitive.join("；")}`);
  if(!verification.fact_safe)throw new FactCheckError(`事实检查未通过：${verification.fact_issues.join("；")||"存在无法支持的事实"}`);
  if(issues.length)return json({code:"COPY_QUALITY_FAILED",error:`文案完整性检查未通过：${issues.join("；")}`},{status:422});
  const id=crypto.randomUUID(),now=new Date().toISOString(),topicMeta={inspiration:inspiration||{angleType:"custom",title:topic,sources:[]}};
  const productSnapshot={id:product.id,name:product.name,facts,analysis:parseJson(product.ai_analysis,{})};
  await db().prepare("INSERT INTO contents (id,user_id,product_id,topic_title,topic_meta,source_input,sales_intensity,status,product_snapshot,fingerprint,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.userId,product.id,topic,JSON.stringify(topicMeta),topic,1,"draft",JSON.stringify(productSnapshot),JSON.stringify({countries:inspiration?[inspiration.country]:[],theme:topic,product:product.id,contentTypes:[inspiration?.angleType||"custom"]}),now,now).run();
  await db().prepare("INSERT INTO content_versions (id,content_id,user_id,version_no,strategy_type,text_content,blocks,locked_block_ids,change_type,change_instruction,is_adopted,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,?)").bind(crypto.randomUUID(),id,user.userId,1,"single",blocksToText(draft.blocks),JSON.stringify(draft.blocks),"[]","initial",inspiration?.angleType||"custom",now).run();
  return json({contentId:id,topic,versionNo:1,draft,verification},{status:201});
 }catch(error){if(error instanceof FactCheckError)return json({code:"FACT_CHECK_FAILED",error:error.message},{status:422});return json({code:"AI_GENERATION_FAILED",error:error instanceof Error?error.message:"文案生成失败，请重试"},{status:422})}
}
