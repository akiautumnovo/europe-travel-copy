import { getAIProvider } from "../../../../lib/ai";
import { evergreenTopics,recommendationReason,searchThemes,type InspirationTopic } from "../../../../lib/inspiration";
import { getSearchProvider } from "../../../../lib/search";
import { db,json,requireApiUser } from "../../_shared";

export async function GET(){
 const user=await requireApiUser(),today=new Date().toISOString().slice(0,10);
 const profile=await db().prepare("SELECT settings FROM profiles WHERE id=?").bind(user.userId).first<{settings:string}>();
 let settings:Record<string,unknown>={};try{settings=JSON.parse(profile?.settings||"{}")}catch{}
 const cached=settings.dailyInspiration as {date?:string;reason?:string;topics?:InspirationTopic[];algorithmVersion?:number}|undefined;
 if(cached?.date===today&&cached.topics?.length===4&&cached.algorithmVersion===2)return json({...cached,searchConfigured:Boolean(getSearchProvider())});
 const [product,recent]=await Promise.all([
  db().prepare("SELECT id,name FROM products WHERE user_id=? AND status='focus' ORDER BY updated_at DESC LIMIT 1").bind(user.userId).first<{id:string;name:string}>(),
  db().prepare("SELECT fingerprint FROM contents WHERE user_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 30").bind(user.userId,new Date(Date.now()-30*86400_000).toISOString()).all<{fingerprint:string}>()
 ]);
 const countries=recent.results.flatMap(row=>{try{return JSON.parse(row.fingerprint)?.countries||[]}catch{return[]}});
 let topics=evergreenTopics(`${today}:initial`,product?.name),reason=recommendationReason(countries,product?.name);
 const provider=getSearchProvider();let sources:NonNullable<InspirationTopic["sources"]>=[];
 if(provider)try{const result=await provider.search(`${searchThemes[new Date().getDate()%searchThemes.length]} ${today}`,{maxResults:8,depth:"advanced"});sources=result.sources.filter(s=>s.tier<=3&&/travel|touris|visa|rail|train|flight|museum|visitor|border|strike|festival|event/i.test(`${s.title} ${s.content}`)).slice(0,2)}catch{reason+=" 联网暂时不可用，已使用稳定内容。"}
 try{
  const generated=await getAIProvider().generateInspirations({sourceSummaries:sources.map(s=>({title:s.title,content:s.content.slice(0,900),institution:s.institution})),previousTitles:[],recentCountries:countries.slice(0,12),productName:product?.name,refreshNo:0});
  topics=generated.topics.map((topic,index)=>{const source=topic.source_index===null?undefined:sources[topic.source_index];return{id:`ai-initial-${index}`,country:topic.country,flag:topic.flag,title:topic.title,reason:topic.reason,audience:topic.audience,contentType:topic.content_type,productRelated:Boolean(product?.name&&topic.title.includes(product.name.slice(0,2))),verification:source?"verified":"evergreen",sources:source?[source]:undefined}});
  reason=sources.length?"今天的四个方向结合了近期可靠信息，并分别从不同旅行问题切入。":recommendationReason(countries,product?.name);
 }catch{}
 const daily={date:today,reason,topics,refreshCount:0,algorithmVersion:2};settings.dailyInspiration=daily;
 await db().prepare("UPDATE profiles SET settings=?,updated_at=? WHERE id=?").bind(JSON.stringify(settings),new Date().toISOString(),user.userId).run();
 return json({...daily,searchConfigured:Boolean(provider)});
}
