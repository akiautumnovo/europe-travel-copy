import { bucket,db,json,requireApiUser } from "../../../_shared";
const MAX_BYTES=15*1024*1024;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await requireApiUser(request);if(user instanceof Response)return user;const{id}=await params;
 const row=await db().prepare("SELECT storage_path as storagePath,external_url as externalUrl,source_name as sourceName,risk_level as riskLevel,asset_type as assetType,metadata FROM assets WHERE id=? AND user_id=?").bind(id,user.userId).first<{storagePath:string|null;externalUrl:string|null;sourceName:string;riskLevel:string;assetType:string;metadata:string}>();
 if(!row)return json({error:"素材不存在"},{status:404});
 let form:FormData;try{form=await request.formData()}catch{return json({error:"裁切图片无法读取"},{status:400})}
 const file=form.get("file");if(!(file instanceof File)||!file.type.startsWith("image/")||file.size===0)return json({error:"请选择有效的裁切图片"},{status:400});if(file.size>MAX_BYTES)return json({error:"裁切图片不能超过15MB"},{status:400});
 const path=`${user.userId}/cropped/${id}-moments.jpg`;await bucket().put(path,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});
 let metadata:Record<string,unknown>={};try{metadata=JSON.parse(row.metadata||"{}")}catch{}
 metadata={...metadata,originalExternalUrl:(metadata.originalExternalUrl as string|undefined)||row.externalUrl||undefined,croppedAt:new Date().toISOString(),cropRatio:"1:1",cropSize:"1200x1200"};
 await db().prepare("UPDATE assets SET storage_path=?,source_name=?,metadata=? WHERE id=? AND user_id=?").bind(path,`${row.sourceName.replace(/\.[^.]+$/,"")}-朋友圈方图.jpg`,JSON.stringify(metadata),id,user.userId).run();
 if(row.storagePath&&row.storagePath!==path)try{await bucket().delete(row.storagePath)}catch(error){console.error("[assets] 清理裁切前文件失败",row.storagePath,error)}
 return json({id,sourceName:`${row.sourceName.replace(/\.[^.]+$/,"")}-朋友圈方图.jpg`,imageUrl:`/api/assets/${id}/file`,riskLevel:row.riskLevel,assetType:row.assetType});
}
