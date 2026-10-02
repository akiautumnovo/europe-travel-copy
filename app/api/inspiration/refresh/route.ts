import { getSearchProvider } from "../../../../lib/search";
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
 if(provider){
  try{
   const theme=searchThemes[count%searchThemes.length];
   const result=await provider.search(`${theme} ${today} different destinations current`,{maxResults:10,depth:"advanced"});
   const priorUrls=new Set(previous?.topics?.flatMap(t=>t.sources?.map(s=>s.url)||[])||[]);
   const useful=result.sources.filter(s=>s.tier<=3&&!priorUrls.has(s.url)&&/travel|touris|visa|rail|train|flight|museum|visitor|border|strike|festival|event|airport/i.test(`${s.title} ${s.content}`)).slice(0,2);
   const fresh=useful.map((source,index):InspirationTopic=>({id:`fresh-${count}-${index}-${source.url}`,country:"欧洲",flag:"🇪🇺",title:source.title,reason:"来自本次刷新发现的近期可靠旅行信息，适合及时提醒客户。",audience:"近期计划欧洲出行的客人",contentType:index?"旅行动态":"最新提醒",productRelated:false,verification:"verified",sources:[source]}));
   topics=[...fresh,...topics.filter(t=>!fresh.some(f=>f.title===t.title))].slice(0,4);
   if(fresh.length)reason=`已切换联网搜索主题，并找到 ${fresh.length} 条新的可靠动态；其余选题也已更换目的地和角度。`;
  }catch{reason+=" 本次联网搜索暂时不可用，已从扩展常青题库中更换一组。"}
 }
 const daily={date:today,reason,topics,refreshCount:count};
 settings.dailyInspiration=daily;
 await db().prepare("UPDATE profiles SET settings=?,updated_at=? WHERE id=?").bind(JSON.stringify(settings),new Date().toISOString(),user.userId).run();
 return json({...daily,searchConfigured:Boolean(provider)});
}
