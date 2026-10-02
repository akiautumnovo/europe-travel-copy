import type { SearchSource } from "./search/types";
export type InspirationTopic={id:string;country:string;flag:string;title:string;reason:string;audience:string;contentType:string;productRelated:boolean;verification:"verified"|"pending"|"evergreen";factId?:string;sources?:SearchSource[]};
const destinations=[
 {country:"瑞士",flag:"🇨🇭",city:"卢塞恩",scene:"湖区与山间小镇"},{country:"意大利",flag:"🇮🇹",city:"托斯卡纳",scene:"小城、餐桌与乡间"},
 {country:"法国",flag:"🇫🇷",city:"巴黎",scene:"街区、市场与咖啡馆"},{country:"西班牙",flag:"🇪🇸",city:"塞维利亚",scene:"晚餐、广场与夜晚"},
 {country:"奥地利",flag:"🇦🇹",city:"维也纳",scene:"艺术、咖啡馆与城市散步"},{country:"德国",flag:"🇩🇪",city:"慕尼黑",scene:"城市与阿尔卑斯周边"},
 {country:"葡萄牙",flag:"🇵🇹",city:"里斯本",scene:"坡道、电车与海风"},{country:"希腊",flag:"🇬🇷",city:"雅典",scene:"古迹之外的城市日常"},
 {country:"荷兰",flag:"🇳🇱",city:"阿姆斯特丹",scene:"运河、街区与博物馆"},{country:"捷克",flag:"🇨🇿",city:"布拉格",scene:"清晨、老城与河岸"},
 {country:"挪威",flag:"🇳🇴",city:"卑尔根",scene:"峡湾、天气与慢节奏"},{country:"英国",flag:"🇬🇧",city:"伦敦",scene:"街区、市场与城市生活"},
];
const angles=[
 {type:"专业建议",title:(d:typeof destinations[number])=>`第一次去${d.city}，行程里最值得留白的半天`,reason:"用取舍和节奏体现顾问判断，比罗列景点更容易被收藏。",audience:"第一次去欧洲、担心行程太赶的客人"},
 {type:"生活方式",title:(d:typeof destinations[number])=>`在${d.city}，怎样把一天过得更像当地人`,reason:(d:typeof destinations[number])=>`从${d.scene}切入，让内容更有生活感，也减少产品广告感。`,audience:"喜欢慢旅行和当地生活的客人"},
 {type:"旅行观点",title:(d:typeof destinations[number])=>`${d.country}旅行，为什么“少去一个地方”反而更完整`,reason:"用鲜明但不过度的观点开启讨论，适合建立专业形象。",audience:"正在比较多国或深度行程的客人"},
 {type:"实用建议",title:(d:typeof destinations[number])=>`带父母去${d.country}，安排顺序比景点数量更重要`,reason:"围绕真实客群需求展开，内容具体且容易自然关联产品。",audience:"计划带父母出行的家庭客人"},
 {type:"当地文化",title:(d:typeof destinations[number])=>`${d.city}最容易被忽略的，不是景点而是一天的节奏`,reason:"从文化和日常节奏切入，既轻松又有目的地辨识度。",audience:"对人文体验感兴趣的客人"},
 {type:"季节灵感",title:(d:typeof destinations[number])=>`这个季节去${d.city}，可以把期待放在哪些小事上`,reason:"用季节氛围和具体场景提供画面感，不依赖易过期数字。",audience:"正在决定近期目的地的客人"},
];
function hash(value:string){let h=2166136261;for(const char of value)h=Math.imul(h^char.charCodeAt(0),16777619);return h>>>0}
function seededShuffle<T>(items:T[],seed:string){const copy=[...items];let state=hash(seed);for(let i=copy.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}
export function evergreenTopics(seed:string,productName?:string,excludedIds:string[]=[]){const pool=destinations.flatMap((d,di)=>angles.map((a,ai):InspirationTopic=>({id:`evergreen-${di}-${ai}`,country:d.country,flag:d.flag,title:a.title(d),reason:typeof a.reason==="function"?a.reason(d):a.reason,audience:a.audience,contentType:a.type,productRelated:Boolean(productName&&(productName.includes(d.country)||productName.includes(d.city))),verification:"evergreen"})));const excluded=new Set(excludedIds),available=pool.filter(x=>!excluded.has(x.id)),shuffled=seededShuffle(available.length>=4?available:pool,seed),picked:InspirationTopic[]=[];for(const topic of shuffled){if(picked.some(x=>x.country===topic.country||x.contentType===topic.contentType))continue;picked.push(topic);if(picked.length===4)break}if(picked.length<4)for(const topic of shuffled){if(!picked.some(x=>x.id===topic.id))picked.push(topic);if(picked.length===4)break}return picked}
export const searchThemes=["official Europe tourism autumn events transport updates","official European rail airport travel changes this week","official Europe museum attraction visitor rules recent","official Europe seasonal festivals tourism October","official Europe visa border entry travel updates","official European city tourism new openings events"];
export function recommendationReason(recentCountries:string[],productName?:string,refreshed=false){if(refreshed)return"这组已更换目的地、客群和表达角度，并避开刚才看过的选题。";if(recentCountries.length>=2&&recentCountries[0]===recentCountries[1])return`最近内容连续涉及${recentCountries[0]}，今天优先换一个目的地和表达角度。`;if(productName)return`结合当前主推的“${productName}”，今天保留产品相关方向，同时用不同目的地丰富内容节奏。`;return"今天兼顾实用建议、当地文化和生活方式，四个方向尽量不重复。"}
