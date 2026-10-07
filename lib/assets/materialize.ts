import { bucket,db } from "../bindings";
import { getUserApiKeys } from "../user-api-keys";

type SelectedAsset={id:string;assetType:string;storagePath:string|null;externalUrl:string|null;sourceName:string;author:string|null;sourceUrl:string|null;licenseStatus:string;riskLevel:string;metadata:string};
export type CropAsset={id:string;sourceName:string;imageUrl:string;author?:string;sourceUrl?:string;riskLevel:string};
const MAX_DOWNLOAD_BYTES=25*1024*1024;

function safeRemoteImageUrl(raw:string):URL{
  const url=new URL(raw);
  if(!["http:","https:"].includes(url.protocol))throw new Error("图片地址不是 HTTP 链接");
  const host=url.hostname.toLowerCase();
  if(host==="localhost"||host.endsWith(".localhost")||host==="::1"||/^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host))throw new Error("图片地址指向内部网络");
  return url;
}

async function fetchRemoteImage(initial:URL,signal:AbortSignal):Promise<Response>{
  let url=initial;
  for(let redirects=0;redirects<4;redirects++){
    const response=await fetch(url,{signal,redirect:"manual"});
    if(response.status<300||response.status>=400)return response;
    const location=response.headers.get("location");if(!location)throw new Error("图片跳转地址无效");
    url=safeRemoteImageUrl(new URL(location,url).toString());
  }
  throw new Error("图片跳转次数过多");
}

async function materialize(row:SelectedAsset,userId:string):Promise<void>{
  if(row.storagePath||!row.externalUrl)return;
  let metadata:Record<string,unknown>={};try{metadata=JSON.parse(row.metadata||"{}")}catch{}
  if(row.assetType==="unsplash"&&!metadata.unsplashDownloadTrackedAt){
    const downloadLocation=typeof metadata.downloadLocation==="string"?metadata.downloadLocation:"";
    const accessKey=(await getUserApiKeys(userId)).unsplash;
    if(!downloadLocation||!accessKey)throw new Error("Unsplash 下载追踪信息或当前账号 Access Key 缺失，请在账号设置中补齐后重试");
    const trackingUrl=safeRemoteImageUrl(downloadLocation),trackingController=new AbortController(),trackingTimer=setTimeout(()=>trackingController.abort(),15_000);
    try{
      const tracked=await fetch(trackingUrl,{headers:{Authorization:`Client-ID ${accessKey}`,"Accept-Version":"v1"},signal:trackingController.signal});
      if(!tracked.ok)throw new Error(`Unsplash 下载追踪失败（${tracked.status}）`);
      metadata={...metadata,unsplashDownloadTrackedAt:new Date().toISOString()};
      await db().prepare("UPDATE assets SET metadata=? WHERE id=? AND user_id=?").bind(JSON.stringify(metadata),row.id,userId).run();
    }finally{clearTimeout(trackingTimer)}
  }
  const url=safeRemoteImageUrl(row.externalUrl),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20_000);
  try{
    const response=await fetchRemoteImage(url,controller.signal);
    if(!response.ok)throw new Error(`下载失败（${response.status}）`);
    const type=(response.headers.get("content-type")||"").split(";")[0];
    if(!type.startsWith("image/"))throw new Error("远端内容不是图片");
    const declared=Number(response.headers.get("content-length")||0);if(declared>MAX_DOWNLOAD_BYTES)throw new Error("图片超过25MB");
    const buffer=await response.arrayBuffer();if(buffer.byteLength>MAX_DOWNLOAD_BYTES)throw new Error("图片超过25MB");
    const extension=type==="image/png"?"png":type==="image/webp"?"webp":type==="image/gif"?"gif":"jpg",path=`${userId}/adopted-source/${row.id}-source.${extension}`;
    await bucket().put(path,buffer,{httpMetadata:{contentType:type}});
    metadata={...metadata,originalExternalUrl:row.externalUrl,downloadedAt:new Date().toISOString(),originalContentType:type,originalSize:buffer.byteLength};
    await db().prepare("UPDATE assets SET storage_path=?,metadata=? WHERE id=? AND user_id=?").bind(path,JSON.stringify(metadata),row.id,userId).run();
  }finally{clearTimeout(timer)}
}

export async function prepareAdoptedCropAssets(contentId:string,userId:string):Promise<{assets:CropAsset[];warnings:string[]}>{
  const content=await db().prepare("SELECT topic_meta FROM contents WHERE id=? AND user_id=?").bind(contentId,userId).first<{topic_meta:string}>();
  let ids:string[]=[];try{const meta=JSON.parse(content?.topic_meta||"{}") as {assetSelection?:{items?:Array<{assetId?:unknown}>}};ids=(meta.assetSelection?.items||[]).flatMap(item=>typeof item.assetId==="string"?[item.assetId]:[])}catch{}
  const assets:CropAsset[]=[],warnings:string[]=[];
  for(const id of [...new Set(ids)]){
    const row=await db().prepare("SELECT id,asset_type as assetType,storage_path as storagePath,external_url as externalUrl,source_name as sourceName,author,source_url as sourceUrl,license_status as licenseStatus,risk_level as riskLevel,metadata FROM assets WHERE id=? AND user_id=?").bind(id,userId).first<SelectedAsset>();
    if(!row)continue;
    let existingMetadata:Record<string,unknown>={};try{existingMetadata=JSON.parse(row.metadata||"{}")}catch{}
    // 已完成 1:1 裁切的素材会直接复用。历史内容再次编辑、采用时不应重复弹出裁切器。
    if(row.storagePath&&typeof existingMetadata.croppedAt==="string")continue;
    try{await materialize(row,userId)}catch(error){warnings.push(`${row.sourceName}：${error instanceof Error?error.message:"下载失败"}`);continue}
    const ready=await db().prepare("SELECT storage_path as storagePath FROM assets WHERE id=? AND user_id=?").bind(id,userId).first<{storagePath:string|null}>();
    if(ready?.storagePath)assets.push({id:row.id,sourceName:row.sourceName,imageUrl:`/api/assets/${row.id}/file`,author:row.author||undefined,sourceUrl:row.sourceUrl||undefined,riskLevel:row.riskLevel});
  }
  return{assets,warnings};
}
