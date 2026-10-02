import type { SearchSource } from "./search/types";
export type InspirationTopic={id:string;country:string;flag:string;title:string;reason:string;audience:string;contentType:string;productRelated:boolean;verification:"verified"|"pending"|"evergreen";factId?:string;sources?:SearchSource[]};
const evergreen=[
 {country:"瑞士",flag:"🇨🇭",title:"第一次去瑞士，为什么不要每天换酒店",reason:"实用判断容易被收藏，也能自然体现行程经验。",audience:"第一次去瑞士的客人",contentType:"专业建议"},
 {country:"意大利",flag:"🇮🇹",title:"托斯卡纳为什么更适合慢一点走",reason:"用生活方式切入，适合在产品内容之间调节节奏。",audience:"喜欢人文和慢旅行的客人",contentType:"生活方式"},
 {country:"法国",flag:"🇫🇷",title:"巴黎行程留白，比多打卡一个景点更重要",reason:"从真实体验出发，内容轻但仍有顾问价值。",audience:"城市自由行客人",contentType:"旅行观点"},
 {country:"西班牙",flag:"🇪🇸",title:"晚餐时间，会怎样改变西班牙旅行的一天",reason:"具体、有趣，又不依赖容易过期的数据。",audience:"关注当地生活的客人",contentType:"当地文化"},
 {country:"奥地利",flag:"🇦🇹",title:"维也纳不只适合打卡，也适合慢慢过一天",reason:"城市生活感强，适合轻松的朋友圈表达。",audience:"喜欢艺术与城市漫步的客人",contentType:"生活方式"},
 {country:"德国",flag:"🇩🇪",title:"欧洲火车旅行，真正需要预留的不是车程",reason:"从换乘与行李经验切入，能体现专业判断。",audience:"计划多国旅行的客人",contentType:"实用建议"},
];
export function evergreenTopics(offset=0,productName?:string){const rotated=[...evergreen.slice(offset%evergreen.length),...evergreen.slice(0,offset%evergreen.length)].slice(0,4);return rotated.map((item,index):InspirationTopic=>({...item,id:`evergreen-${offset}-${index}`,productRelated:Boolean(productName&&item.title.includes(productName.slice(0,2))),verification:"evergreen"}))}
export function recommendationReason(recentCountries:string[],productName?:string){if(recentCountries.length>=2&&recentCountries[0]===recentCountries[1])return`最近内容连续涉及${recentCountries[0]}，今天优先换一个目的地和表达角度。`;if(productName)return`结合当前主推的“${productName}”，今天保留一个产品相关方向，其余选题用于丰富内容节奏。`;return"今天以稳定、不过时的欧洲旅行内容为主，兼顾实用建议和生活方式。"}

