import { db } from "./bindings";
import { getAIProvider } from "./ai";
import { parseJson } from "./content";
import { EUROPE_COUNTRIES,findEuropeCountry,type EuropeCountry } from "./europe-countries";
import type { InspirationTopic } from "./inspiration";
import { getSearchProvider } from "./search";
import type { SearchSource } from "./search/types";
import { getUserApiKeys } from "./user-api-keys";

const VERSION=1,ORDER=["resources","history","culture","current"] as const;
type Daily={date:string;mode:"knowledge";requestedCountry:string;country:EuropeCountry;reason:string;topics:InspirationTopic[];refreshCount:number;algorithmVersion:number};
const complete=(topics:Array<{angle_type:string}>)=>ORDER.every(angle=>topics.some(topic=>topic.angle_type===angle));
function randomCountry(seed:string,exclude?:string){let hash=2166136261;for(const char of seed)hash=Math.imul(hash^char.charCodeAt(0),16777619);const choices=EUROPE_COUNTRIES.filter(country=>country.code!==exclude);return choices[Math.abs(hash) % choices.length]}
export async function knowledgeInspiration(userId:string,countryRequest="random",refresh=false){
 const profile=await db().prepare("SELECT settings FROM profiles WHERE id=?").bind(userId).first<{settings:string}>(),settings=parseJson<Record<string,unknown>>(profile?.settings||"{}",{}),cache=parseJson<Record<string,Daily>>(JSON.stringify(settings.dailyKnowledgeInspirationByCountry||{}),{}),today=new Date().toISOString().slice(0,10),key=countryRequest.toUpperCase()==="RANDOM"?"random":countryRequest.toUpperCase(),previous=cache[key];
 if(!refresh&&previous?.date===today&&previous.topics?.length===4&&previous.algorithmVersion===VERSION)return previous;
 const country=key==="random"?randomCountry(`${userId}:${today}:${refresh?(previous?.refreshCount||0)+1:0}`,refresh?previous?.country.code:undefined):findEuropeCountry(key);
 if(!country)throw new Error("请选择有效的欧洲国家");
 const apiKeys=await getUserApiKeys(userId),provider=getSearchProvider(apiKeys);let sources:SearchSource[]=[];
 if(provider)try{const result=await provider.search(`${country.nameEn} ${today.slice(0,4)} tourism official news events travel`,{maxResults:8,depth:"advanced"});sources=result.sources.filter(source=>{const text=`${source.title} ${source.content}`;return source.tier<=3&&(text.includes(country.name)||text.toLowerCase().includes(country.nameEn.toLowerCase()))&&/travel|touris|visa|rail|train|flight|museum|visitor|festival|event|旅游|签证|铁路|航班|博物馆|活动/i.test(text)}).slice(0,3)}catch{}
 const refreshCount=refresh?(previous?.refreshCount||0)+1:0,ai=getAIProvider(apiKeys.deepseek||"");
 let generated=await ai.generateKnowledgeInspirations({countryCode:country.code,countryName:country.name,countryNameEn:country.nameEn,flag:country.flag,sourceSummaries:sources.map(s=>({title:s.title,content:s.content.slice(0,900),institution:s.institution})),previousTitles:previous?.topics.map(t=>t.title)||[],refreshNo:refreshCount});
 if(!complete(generated.topics))generated=await ai.generateKnowledgeInspirations({countryCode:country.code,countryName:country.name,countryNameEn:country.nameEn,flag:country.flag,sourceSummaries:sources.map(s=>({title:s.title,content:s.content.slice(0,900),institution:s.institution})),previousTitles:previous?.topics.map(t=>t.title)||[],refreshNo:refreshCount,retryHint:"必须恰好各生成一条 resources、history、culture、current"});
 if(!complete(generated.topics))throw new Error("国家知识灵感类别生成不完整，请重试");
 const byAngle=new Map(generated.topics.map(topic=>[topic.angle_type,topic]));
 const topics=ORDER.map((angle,index):InspirationTopic=>{const topic=byAngle.get(angle)!;const source=topic.source_index==null?undefined:sources[topic.source_index];const currentFallback=angle==="current"&&!source;return{id:`knowledge-${country.code}-${refreshCount}-${angle}-${index}-${Date.now()}`,productId:null,mode:"knowledge",countryCode:country.code,countryNameEn:country.nameEn,angleType:angle,city:topic.city,country:country.name,flag:country.flag,title:topic.title,reason:topic.reason,audience:topic.audience||"旅行知识读者",contentType:currentFallback?"实用科普":topic.content_type,productRelated:false,verification:source?"verified":"evergreen",sources:source?[source]:undefined}});
 const daily:Daily={date:today,mode:"knowledge",requestedCountry:key,country,reason:sources.length?`今天从${country.name}的风景、历史、人文与近期动态切入。`:`今天从${country.name}的风景、历史、人文与稳定实用知识切入。`,topics,refreshCount,algorithmVersion:VERSION};cache[key]=daily;settings.dailyKnowledgeInspirationByCountry=cache;await db().prepare("UPDATE profiles SET settings=?,updated_at=? WHERE id=?").bind(JSON.stringify(settings),new Date().toISOString(),userId).run();return daily;
}
