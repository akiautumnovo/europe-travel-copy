"use client";
import { useEffect,useRef,useState } from "react";
import { ArrowLeft,ArrowRight,Check,ExternalLink,ImagePlus,LoaderCircle,Search,X } from "lucide-react";
import { friendlyApiError,readApiError } from "@/lib/friendly-error";
import ConfirmDialog from "@/components/confirm-dialog";
import { mediaProviderCredit } from "@/lib/media/types";
type Asset={id:string;sourceName:string;imageUrl:string;sourceUrl?:string;author?:string;riskLevel:string;assetType:string};type Photo={provider:"pixabay"|"pexels";providerId:string;width:number;height:number;alt:string;photographer:string;photographerUrl:string;sourceUrl:string;thumbnailUrl:string;displayUrl:string;retrievedAt:string};type Board={roles:Array<{id:string;label:string;description:string;searchTheme:string}>;searchThemes:Array<{label:string;query:string}>};type Pick={assetId?:string;roleId?:string;pexels?:Photo;key:string;imageUrl:string;label:string;riskLevel:string};
/** 选中状态与入库来源都必须带 provider，否则两家图库的自增 id 会互相覆盖。 */
const photoKey=(photo:Photo)=>`${photo.provider}-${photo.providerId}`;
type ApiPhotos={photos?:Photo[];configured?:boolean;message?:string;error?:string;code?:string};
export default function StoryboardPanel({contentId,blocks,onClose,notify}:{contentId:string;blocks:Array<{text:string}>;onClose:()=>void;notify:(s:string)=>void}){
 const [board,setBoard]=useState<Board|null>(null),[assets,setAssets]=useState<Asset[]>([]),[photos,setPhotos]=useState<Photo[]>([]),[selected,setSelected]=useState<Pick[]>([]),[target,setTarget]=useState<1|3|6|9>(6),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[redConflict,setRedConflict]=useState("");const dragIndex=useRef<number|null>(null);
 useEffect(()=>{void (async()=>{
   try{
     // 同时读素材库与已保存的配图选择。
     // 不把选择读回来的话，重新打开这个面板选择状态就空了，看起来像"存的图没了"。
     const [assetsRes,savedRes]=await Promise.all([fetch("/api/assets"),fetch(`/api/contents/${contentId}`)]);
     if(!assetsRes.ok){setMessage(await readApiError(assetsRes,"本人素材读取失败，请稍后重试。"));return}
     // 产品源文件（PDF/Excel）不是图片，混进配图网格只会是破图
     const list=(await assetsRes.json() as Asset[]).filter(asset=>asset.assetType!=="source_file");
     setAssets(list);
     if(!savedRes.ok)return;
     const saved=await savedRes.json() as {content?:{topicMeta?:{assetSelection?:{targetCount?:number;items?:Array<{assetId?:string;roleId?:string|null}>}}}};
     const selection=saved.content?.topicMeta?.assetSelection;
     if(selection?.targetCount&&([1,3,6,9] as const).includes(selection.targetCount as 1|3|6|9))setTarget(selection.targetCount as 1|3|6|9);
     const items=Array.isArray(selection?.items)?selection.items:[];
     const restored:Pick[]=[];
     for(const item of items){
       if(typeof item.assetId!=="string")continue;
       const asset=list.find(candidate=>candidate.id===item.assetId);
       if(!asset)continue; // 素材已被删除，跳过这一张
       restored.push({assetId:asset.id,roleId:item.roleId||undefined,key:asset.id,imageUrl:asset.imageUrl,label:asset.sourceName,riskLevel:asset.riskLevel});
     }
     if(restored.length)setSelected(restored);
   }catch{setMessage("本人素材读取失败，请稍后重试。")}
 })()},[contentId]);
 const photoCredits=[...new Set(photos.map(photo=>photo.provider))];
 async function generate(){setBusy(true);try{const r=await fetch(`/api/contents/${contentId}/storyboard`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({blocks})}),data=await r.json() as Board&{code?:string;error?:string};if(r.ok){setBoard(data);setPhotos([]);setMessage("")}else setMessage(friendlyApiError(data,"视觉故事板生成暂时失败，请重试。当前文案和已选图片不会丢失。"))}catch{setMessage("视觉故事板生成暂时失败，请重试。当前文案和已选图片不会丢失。")}finally{setBusy(false)}}
 async function search(query:string){setBusy(true);try{const r=await fetch("/api/media/search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query})}),data=await r.json() as ApiPhotos;if(data.configured===false){setPhotos([]);setMessage(data.message||"真实图片搜索尚未配置，可以先使用本人素材。");return}if(!r.ok){setPhotos([]);setMessage(friendlyApiError(data,"图库图片搜索暂时失败，请稍后重试；本人素材仍可正常使用。"));return}const found=data.photos||[];setPhotos(found);setMessage(found.length?"":"这个主题暂时没有搜索到图片，可以换一个主题。")}catch{setMessage("图库图片搜索暂时失败，请稍后重试；本人素材仍可正常使用。")}finally{setBusy(false)}}
 function choose(pick:Pick){
   // 原来选满之后点击是静默无效的，容易被当成"点了没反应"
   if(selected.some(x=>x.key===pick.key)){setSelected(v=>v.filter(x=>x.key!==pick.key));setMessage("");return}
   if(selected.length>=target){setMessage(`已选满 ${target} 张：先取消一张，或者把上方「选择张数」调大。`);return}
   setMessage("");
   setSelected(v=>[...v,pick]);
 }function move(index:number,delta:number){setSelected(v=>{const next=[...v],to=index+delta;if(to<0||to>=next.length)return v;[next[index],next[to]]=[next[to],next[index]];return next})}function finishDrag(x:number,y:number){const from=dragIndex.current;dragIndex.current=null;if(from==null)return;const el=document.elementFromPoint(x,y)?.closest<HTMLElement>("[data-story-index]");const to=Number(el?.dataset.storyIndex);if(Number.isInteger(to)&&to!==from)setSelected(v=>{const next=[...v],[item]=next.splice(from,1);next.splice(to,0,item);return next})}
 async function save(confirmRed=false){const r=await fetch(`/api/contents/${contentId}/assets`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({targetCount:target,items:selected.map((x,i)=>({assetId:x.assetId,pexels:x.pexels,roleId:board?.roles[i]?.id})),confirmRed})});if(r.status===409){const conflict=await r.json().catch(()=>undefined) as {error?:string}|undefined;setRedConflict(conflict?.error||"所选素材中存在红色风险素材。");return}if(r.ok){notify("图片故事板已保存");onClose();return}setMessage(await readApiError(r,"图片顺序保存失败，已选图片不会丢失。"))}
 return <div className="storyboard-backdrop"><section className="storyboard-panel"><header><div><span className="mini-label">视觉故事板</span><h2>让图片也有叙事顺序</h2></div><button onClick={onClose} aria-label="关闭图片故事板"><X/></button></header><div className="storyboard-toolbar"><div className="count-choice"><span>选择张数</span>{([1,3,6,9] as const).map(n=><button className={target===n?"active":""} onClick={()=>{setTarget(n);if(selected.length>n){setSelected(v=>v.slice(0,n));setMessage(`已把配图保留为前 ${n} 张`)}}} key={n}>{n}</button>)}</div><button className="primary-button" disabled={busy} onClick={generate}>{busy?<LoaderCircle className="spin" size={17}/>:<ImagePlus size={17}/>}生成配图方案</button></div><p className="media-message">这里生成的是配图角色与搜索主题，不会生成 AI 图片。您可以搜索真实图库图片，或选择本人素材。</p>{board&&<div className="role-strip">{board.roles.map((role,i)=><div key={role.id}><span>{i+1}</span><strong>{role.label}</strong><small>{role.description}</small></div>)}</div>}{board&&<><h3>点击主题搜索真实图片</h3><div className="theme-buttons">{board.searchThemes.map(theme=><button onClick={()=>search(theme.query)} key={theme.query}><Search size={14}/>{theme.label}</button>)}</div></>}{message&&<p className="media-message" role="alert">{message}</p>}<h3>本人及已保存素材（{assets.length}）</h3>{assets.length===0&&<p className="media-message">素材库还没有图片。可以到左侧「素材」页上传自己的照片，或用上面的主题搜索图库。</p>}<div className="picker-grid">{assets.map(asset=><button className={selected.some(x=>x.key===asset.id)?"picked":""} disabled={asset.riskLevel==="red"} onClick={()=>choose({assetId:asset.id,key:asset.id,imageUrl:asset.imageUrl,label:asset.sourceName,riskLevel:asset.riskLevel})} key={asset.id}><img src={asset.imageUrl} alt={asset.sourceName}/><span>{asset.sourceName}</span>{selected.some(x=>x.key===asset.id)&&<Check/>}</button>)}</div>{photos.length>0&&<><div className="pixabay-credit">{photoCredits.map(name=><a href={mediaProviderCredit[name].homepage} target="_blank" rel="noreferrer" key={name}>Images provided by {mediaProviderCredit[name].label} <ExternalLink size={13}/></a>)}</div><div className="picker-grid">{photos.map(photo=><button className={selected.some(x=>x.key===photoKey(photo))?"picked":""} onClick={()=>choose({pexels:photo,key:photoKey(photo),imageUrl:photo.thumbnailUrl,label:photo.alt,riskLevel:"green"})} key={photoKey(photo)}><img src={photo.thumbnailUrl} alt={photo.alt}/><span>Photo by {photo.photographer} on {mediaProviderCredit[photo.provider].label}</span>{selected.some(x=>x.key===photoKey(photo))&&<Check/>}</button>)}</div></>}{selected.length>0&&<div className="selected-story"><h3>已选 {selected.length}/{target} · 拖动或用按钮调整顺序</h3><div>{selected.map((item,i)=><article key={item.key} data-story-index={i} onPointerDown={e=>{dragIndex.current=i;e.currentTarget.setPointerCapture(e.pointerId)}} onPointerUp={e=>finishDrag(e.clientX,e.clientY)} onPointerCancel={()=>{dragIndex.current=null}}><img src={item.imageUrl} alt={item.label}/><span>{i+1}</span><button aria-label={`第${i+1}张前移`} onClick={()=>move(i,-1)}><ArrowLeft size={15}/></button><button aria-label={`第${i+1}张后移`} onClick={()=>move(i,1)}><ArrowRight size={15}/></button></article>)}</div></div>}<footer><p>绿色状态不代表人物、商标、艺术品或场地等第三方权利一定不存在。</p><button className="primary-button" disabled={!selected.length} onClick={()=>save()}>保存图片顺序</button></footer></section>{redConflict&&<ConfirmDialog title="继续使用红色风险素材？" description={`${redConflict}\n\n红色只表示平台授权层面的风险，不代表图片中的人物、商标、艺术品或场地等第三方权利一定不存在。`} confirmLabel="仍然继续" onConfirm={()=>{setRedConflict("");void save(true)}} onCancel={()=>setRedConflict("")}/>}</div>
}
