import { getSearchProvider } from "../../../../lib/search";
import { getAIProvider } from "../../../../lib/ai";
import { evergreenTopics,recommendationReason,searchThemes,type InspirationTopic } from "../../../../lib/inspiration";
import { db,json,requireApiUser } from "../../_shared";

export async function POST(){
 const user=await requireApiUser(),today=new Date().toISOString().slice(0,10);
 const [product,profile,recent]=await Promise.all([
  db().prepare("SELECT name FROM products WHERE user_id=? AND status='focus' ORDER BY updated_at DESC LIMIT 1").bind(user.userId).first<{name:string}>(),
  db().prepare("SELECT settings FROM profiles WHERE id=?").bind(user.userId).first<{settings:string}>(),
  db().prepare("SELECT fingerprint FROM contents WHERE user_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 30").bind(user.userId,new Date(Date.now()-30*86400_000).toISOString()).all<{fingerprint:string}>()
 ]);
 let settings:Record<string,unknown>={};try{settings=JSON.parse(profile?.settings||"{}")}catch{}
 const previous=settings.dailyInspiration as {topics?:InspirationTopic[];refreshCount?:number}|undefined;
 const count=(previous?.refreshCount||0)+1,excluded=previous?.topics?.map(t=>t.id)||[];
 const usedCountries=recent.results.flatMap(row=>{try{return JSON.parse(row.fingerprint)?.countries||[]}catch{return[]}});
 let topics=evergreenTopics(`${today}:refresh:${count}:${Date.now()}`,product?.name,excluded);
 let reason=recommendationReason(usedCountries,product?.name,true);
 const provider=getSearchProvider();
 let searchSources:NonNullable<InspirationTopic["sources"]>=[];
 if(provider){
  try{
   const theme=searchThemes[count%searchThemes.length];
   const result=await provider.search(`${theme} ${today} different destinations current`,{maxResults:10,depth:"advanced"});
   const priorUrls=new Set(previous?.topics?.flatMap(t=>t.sources?.map(s=>s.url)||[])||[]);
   const useful=result.sources.filter(s=>s.tier<=3&&!priorUrls.has(s.url)&&/travel|touris|visa|rail|train|flight|museum|visitor|border|strike|festival|event|airport/i.test(`${s.title} ${s.content}`)).slice(0,2);
   searchSources=useful;
  }catch{reason+=" 本次联网搜索暂时不可用，已从扩展常青题库中更换一组。"}
 }
 try{
  const generated=await getAIProvider().generateInspirations({sourceSummaries:searchSources.map(s=>({title:s.title,content:s.content.slice(0,900),institution:s.institution})),previousTitles:previous?.topics?.map(t=>t.title)||[],recentCountries:usedCountries.slice(0,12),productName:product?.name,refreshNo:count});
  topics=generated.topics.map((topic,index)=>{const source=topic.source_index===null?undefined:searchSources[topic.source_index];return{id:`ai-${count}-${index}-${Date.now()}`,country:topic.country,flag:topic.flag,title:topic.title,reason:topic.reason,audience:topic.audience,contentType:topic.content_type,productRelated:Boolean(product?.name&&topic.title.includes(product.name.slice(0,2))),verification:source?"verified":"evergreen",sources:source?[source]:undefined}});
  reason=searchSources.length?"这组由近期可靠信息与常青主题共同生成，四条分别解决不同的旅行问题。":"这组已重新组合客群、场景、决策问题和表达结构，而不只是替换目的地。";
 }catch{reason+=" AI 选题整理暂时不可用，已使用多维度候选池。"}
 const daily={date:today,reason,topics,refreshCount:count,algorithmVersion:2};
 settings.dailyInspiration=daily;
 await db().prepare("UPDATE profiles SET settings=?,updated_at=? WHERE id=?").bind(JSON.stringify(settings),new Date().toISOString(),user.userId).run();
 return json({...daily,searchConfigured:Boolean(provider)});
}
