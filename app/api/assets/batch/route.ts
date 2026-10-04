import { bucket,db,json,requireApiUser } from "../../_shared";
import { resolveFolderId } from "../folders/store";
const licenses:Record<string,{status:string;risk:string}>={owned:{status:"owned",risk:"green"},authorized:{status:"authorized",risk:"green"},purchased:{status:"purchased",risk:"green"},other:{status:"unknown",risk:"yellow"}};
const MAX_FILES=20,MAX_BYTES=15*1024*1024;
async function digest(buffer:ArrayBuffer){const value=await crypto.subtle.digest("SHA-256",buffer);return [...new Uint8Array(value)].map(x=>x.toString(16).padStart(2,"0")).join("")}
export async function POST(request:Request){
 const user=await requireApiUser(request);
 if(user instanceof Response)return user;
 let form:FormData;
 try{form=await request.formData()}catch{return json({error:"上传内容无法读取，请重新选择图片"},{status:400})}
 const choice=String(form.get("licenseType")||"other"),license=licenses[choice]||licenses.other;
 const files=form.getAll("files").filter((x):x is File=>x instanceof File&&x.size>0);
 if(!files.length)return json({error:"请选择图片"},{status:400});
 if(files.length>MAX_FILES)return json({error:`一次最多上传${MAX_FILES}张图片`},{status:400});
 // 先整体校验，再开始落盘：避免前面的图片已经写入、后面的图片才报错造成的“半成功”。
 const rejected=files.filter(file=>file.size>MAX_BYTES||!file.type.startsWith("image/"));
 if(rejected.length)return json({error:rejected.map(file=>file.size>MAX_BYTES?`${file.name} 超过15MB`:`${file.name} 不是支持的图片`).join("；")},{status:400});
 const items:Array<{id:string;sourceName:string;duplicate:boolean}>=[],failed:Array<{sourceName:string;error:string}>=[];
 const now=new Date().toISOString();
 const folderId=await resolveFolderId(user.userId,form.get("folderId"));
 for(const file of files){
  try{
   const buffer=await file.arrayBuffer(),hash=await digest(buffer);
   const existing=await db().prepare("SELECT id,source_name as sourceName FROM assets WHERE user_id=? AND content_hash=? LIMIT 1").bind(user.userId,hash).first<{id:string;sourceName:string}>();
   if(existing){items.push({...existing,duplicate:true});continue}
   const id=crypto.randomUUID(),safe=file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g,"-"),path=`${user.userId}/user-asset/${id}-${safe}`;
   await bucket().put(path,buffer,{httpMetadata:{contentType:file.type}});
   const metadata={size:file.size,type:file.type,licenseType:choice};
   await db().prepare("INSERT INTO assets (id,user_id,asset_type,storage_path,source_name,license_status,risk_level,tags,metadata,content_hash,folder_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.userId,"user_upload",path,file.name,license.status,license.risk,"[]",JSON.stringify(metadata),hash,folderId,now).run();
   items.push({id,sourceName:file.name,duplicate:false});
  }catch(error){failed.push({sourceName:file.name,error:error instanceof Error?error.message:"写入失败"})}
 }
 if(!items.length)return json({error:failed[0]?.error||"上传失败",failed},{status:422});
 return json({items,failed},{status:201});
}
