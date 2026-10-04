import { getSearchProvider } from "../../../../lib/search";import { needsFreshSearch } from "../../../../lib/search/freshness";import { db,json,requireApiUser } from "../../_shared";
async function hash(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("")}
export async function POST(request:Request){
  const user=await requireApiUser(request);
  if(user instanceof Response)return user;
  // 请求体解析失败属于参数问题，不能和“联网不可用”混成同一个提示。
  let body:{claim?:string;level?:"quick"|"deep"};
  try{body=await request.json() as typeof body}catch{return json({code:"INVALID_REQUEST",error:"请求格式无效，请重试"},{status:400})}
  const claim=body.claim?.trim();
  if(!claim)return json({code:"INVALID_REQUEST",error:"请输入需要核验的事实"},{status:400});
  const level=body.level==="deep"?"deep":"quick";
  try{
    const queryKey=await hash(`${level}:${claim}`);
    const cached=await db().prepare("SELECT id,claim,sources,verification_level as verificationLevel,status,verified_at as verifiedAt,expires_at as expiresAt FROM fact_cache WHERE user_id=? AND query_key=? AND expires_at>? ORDER BY verified_at DESC LIMIT 1").bind(user.userId,queryKey,new Date().toISOString()).first();
    // 命中缓存也要告诉前端“联网搜索已配置”，否则前端会把核验成功误报成无法联网。
    if(cached)return json({...cached,sources:JSON.parse(String(cached.sources)),cached:true,configured:true});
    const trigger=needsFreshSearch(claim),provider=getSearchProvider();
    if(!provider)return json({claim,status:"insufficient",verificationLevel:level,sources:[],freshSearchNeeded:trigger.needed,configured:false});
    const result=await provider.verifyClaim(claim,level),id=crypto.randomUUID();
    await db().prepare("INSERT INTO fact_cache (id,user_id,query_key,claim,sources,verification_level,status,verified_at,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,user.userId,queryKey,claim,JSON.stringify(result.sources),result.level,result.status,result.verifiedAt,result.expiresAt,result.verifiedAt).run();
    return json({id,...result,cached:false,configured:true});
  }catch{
    return json({code:"SEARCH_UNAVAILABLE",error:"当前无法联网核验，这条事实暂时不会写入文案"},{status:503});
  }
}
