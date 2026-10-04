"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Clock3, ExternalLink, FileUp, Image as ImageIcon, Layers3, Lightbulb, LoaderCircle, LogOut, Package, Plus, RefreshCw, Send, ShieldCheck, Sparkles, Trash2, UserRound, WandSparkles, X } from "lucide-react";
import AnalysisWorkspace from "./analysis-workspace";
import CreationWorkspace from "./creation-workspace";
import AssetLibrary from "./asset-library";
import StyleDNA from "./style-dna";
import ConfirmDialog from "@/components/confirm-dialog";
import { readApiError } from "@/lib/friendly-error";

type MainView = "inspiration" | "products" | "assets" | "style" | "history";
type View = MainView | "analysis" | "creation";

const navItems: { id: MainView; label: string; icon: typeof Lightbulb }[] = [
  { id: "inspiration", label: "灵感", icon: Lightbulb }, { id: "products", label: "产品", icon: Package },
  { id: "assets", label: "素材", icon: ImageIcon }, { id: "style", label: "风格", icon: UserRound },
  { id: "history", label: "历史", icon: Clock3 },
];

export default function Home() {
  const [view, setView] = useState<View>("inspiration");
  const [toast, setToast] = useState("");
  const [analysisText, setAnalysisText] = useState("");
  const [creationTopic,setCreationTopic]=useState(""),[resumeContentId,setResumeContentId]=useState(""),[creationProductId,setCreationProductId]=useState("");
  const [access,setAccess]=useState<{state:"checking"}|{state:"granted";name:string}|{state:"gate";gateEnabled:boolean;signedInEmail:string|null}>({state:"checking"});
  const [gateEmail,setGateEmail]=useState(""),[gateBusy,setGateBusy]=useState(false),[gateError,setGateError]=useState(""),[accountOpen,setAccountOpen]=useState(false);
  const activeMain: MainView = ["analysis", "creation"].includes(view) ? "inspiration" : (view as MainView);
  useEffect(() => { void (async()=>{
    try{
      const r=await fetch("/api/access");
      const data=await r.json() as {granted?:boolean;email?:string;emailGateEnabled?:boolean;signedInEmail?:string|null};
      if(data.granted){
        // 通过后再建 profile 行，避免未授权时就写库。
        await fetch("/api/bootstrap",{method:"POST"}).catch(()=>undefined);
        setAccess({state:"granted",name:data.email||"已登录"});
        return;
      }
      setAccess({state:"gate",gateEnabled:Boolean(data.emailGateEnabled),signedInEmail:data.signedInEmail||null});
    }catch{setAccess({state:"gate",gateEnabled:false,signedInEmail:null})}
  })() }, []);
  function flash(message: string) { setToast(message); window.setTimeout(() => setToast(""), 1800); }
  async function submitGate(event:React.FormEvent){event.preventDefault();setGateBusy(true);setGateError("");try{
    const r=await fetch("/api/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:gateEmail})});
    const data=await r.json() as {error?:string;granted?:boolean};
    if(!r.ok||!data.granted){setGateError(data.error||"这个邮箱没有访问权限");return}
    await fetch("/api/bootstrap",{method:"POST"}).catch(()=>undefined);
    window.location.reload();
  }catch{setGateError("验证失败，请重试")}finally{setGateBusy(false)}}
  async function signOut(){try{await fetch("/api/access",{method:"DELETE"})}catch{/* 即使清 cookie 失败也继续走平台登出 */}/* /signout-with-chatgpt 是托管平台的路由，必须整页跳转，不能走客户端路由 */window.location.href="/signout-with-chatgpt?return_to=/"}

  if (access.state === "checking") return <div className="signin-gate"><p className="signin-note">正在确认访问权限…</p></div>;
  if (access.state === "gate") return <div className="signin-gate"><section className="signin-card">
    <span className="brand-mark">旅</span>
    {access.gateEnabled?<>
      <h1>输入授权邮箱后进入</h1>
      <p>只有名单内的邮箱可以访问这个工作台。验证通过后会在本机保留 30 天，不用每次重复输入。</p>
      <form className="email-gate-form" onSubmit={submitGate}>
        <input type="email" value={gateEmail} onChange={e=>setGateEmail(e.target.value)} placeholder="you@example.com" aria-label="授权邮箱" autoFocus required/>
        <button className="primary-button" disabled={gateBusy||!gateEmail.trim()}>{gateBusy?"验证中…":"进入"}</button>
      </form>
      {gateError&&<p className="analysis-error" role="alert">{gateError}</p>}
      {access.signedInEmail&&<p className="signin-fineprint">当前 ChatGPT 账号是 {access.signedInEmail}，不在允许名单里，可以用授权邮箱直接进入。</p>}
      <p className="signin-fineprint">这个门禁只核对邮箱是否在名单内，不发送验证码，因此它防的是「误入」，不是「恶意冒充」。</p>
    </>:<>
      <h1>需要登录后才能使用</h1>
      <p>{access.signedInEmail?`当前登录账号（${access.signedInEmail}）不在允许名单里，请换一个授权账号。`:"这个工作台只对授权账号开放。登录后会回到今日灵感页，你之前保存的产品、内容和素材都还在。"}</p>
      <div className="signin-actions">{access.signedInEmail&&<a className="secondary-button" href="/signout-with-chatgpt?return_to=/" target="_top">退出并换个账号</a>}<a className="primary-button" href="/signin-with-chatgpt?return_to=/" target="_top">用 ChatGPT 登录</a></div>
    </>}
  </section></div>;

  // 侧边栏很窄（≤980px 时文本区只剩约 70px），直接显示完整邮箱会换行溢出，破坏版式。
  // 这里只取 @ 前的部分，完整邮箱放到 title 里，鼠标悬停可查看。
  const accountShort = access.name.includes("@") ? access.name.split("@")[0] : access.name;

  return <div className="app-shell">
    <aside className="desktop-sidebar">
      <button className="brand" onClick={() => setView("inspiration")} aria-label="返回今日灵感"><span className="brand-mark">旅</span><span><strong>旅笺</strong><small>朋友圈内容助手</small></span></button>
      <nav aria-label="主导航">{navItems.map((item) => { const Icon = item.icon; const longLabel = item.label === "灵感" ? "今日灵感" : item.label === "风格" ? "我的风格" : item.label === "历史" ? "内容历史" : item.label; return <button key={item.id} className={activeMain === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)}><Icon size={19}/><span>{longLabel}</span></button>; })}</nav>
      <div className="account-card"><span className="account-avatar">{accountShort.slice(0,1).toUpperCase()}</span><div><strong title={access.name}>{accountShort}</strong><small>数据已保存</small></div><button className="account-signout" title={`退出登录（${access.name}）`} aria-label="退出登录" onClick={()=>void signOut()}><LogOut size={17}/></button></div>
      <div className="phase-note"><span>MVP</span><p>完整创作闭环</p></div>
    </aside>
    <main className="main-content">
      {view === "inspiration" && <Inspiration onGenerate={(topic) => {setCreationTopic(topic);setResumeContentId("");setCreationProductId("");setView("creation")}} onUseProduct={(id)=>{setCreationProductId(id);setCreationTopic("");setResumeContentId("");setView("creation")}} onAnalyze={(value)=>{setAnalysisText(value);setView("analysis")}} onMock={flash}/>} {view === "products" && <Products onMock={flash}/>} {view === "assets" && <AssetLibrary notify={flash}/>} {view === "style" && <StyleDNA notify={flash}/>} {view === "history" && <History notify={flash} onOpen={(id)=>{setResumeContentId(id);setCreationTopic("");setCreationProductId("");setView("creation")}}/>}
      {view === "analysis" && <AnalysisWorkspace initialText={analysisText} onBack={()=>setView("inspiration")} onContinue={(productId)=>{setCreationProductId(productId);setCreationTopic("");setResumeContentId("");setView("creation")}} notify={flash}/>} 
      {view === "creation" && <CreationWorkspace initialTopic={creationTopic} initialContentId={resumeContentId||undefined} initialProductId={creationProductId||undefined} onBack={()=>setView("inspiration")} notify={flash}/>} 
    </main>
    <nav className="mobile-nav" aria-label="手机主导航">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={activeMain === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon size={21}/><span>{item.label}</span></button>; })}<button className={accountOpen ? "active" : ""} onClick={() => setAccountOpen(true)} aria-label={`账号：${access.name}`}><span className="nav-avatar">{accountShort.slice(0,1).toUpperCase()}</span><span>账号</span></button></nav>
    {accountOpen&&<div className="sheet-backdrop" onClick={()=>setAccountOpen(false)}><section className="account-sheet" role="dialog" aria-modal="true" aria-label="账号" onClick={e=>e.stopPropagation()}><div className="sheet-handle"/><header><div><span className="mini-label">当前账号</span><h2>{access.name}</h2></div><button onClick={()=>setAccountOpen(false)} aria-label="关闭"><X size={20}/></button></header><p className="account-sheet-note">产品、内容和素材都记在这个账号下。退出后重新输入同一个邮箱，数据还在。</p><button className="secondary-button account-sheet-signout" onClick={()=>void signOut()}><LogOut size={17}/>退出登录</button></section></div>}
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
  </div>;
}

function PageHeader({ kicker, title, action }: { kicker: string; title: string; action?: React.ReactNode }) { return <header className="page-header"><div><p className="kicker">{kicker}</p><h1>{title}</h1></div>{action}</header>; }

function Inspiration({ onGenerate, onAnalyze, onUseProduct, onMock }: { onGenerate: (topic:string) => void; onAnalyze:(text:string)=>void; onUseProduct:(productId:string)=>void; onMock: (s: string) => void }) {
  type Source={title:string;url:string;institution:string;tier?:number;publishedAt?:string};
  type Topic={id:string;city?:string;flag:string;country:string;title:string;reason:string;audience:string;contentType:string;productRelated:boolean;verification:"verified"|"pending"|"evergreen";sources?:Source[]};
  type FocusProduct={id:string;name:string;status:string;lockedFactCount:number};
  const [quickText,setQuickText]=useState(""),[topics,setTopics]=useState<Topic[]>([]),[products,setProducts]=useState<FocusProduct[]>([]),[selectedProductId,setSelectedProductId]=useState(""),[reason,setReason]=useState("正在结合季节、产品和近期内容准备推荐…"),[loading,setLoading]=useState(true),[sheet,setSheet]=useState<Topic|null>(null);
  // 不在 effect 同步路径上 setState：初始 loading 已是 true，刷新时由点击事件置位。
  const load=async(refresh=false)=>{try{const [r,pr]=await Promise.all([fetch(refresh?"/api/inspiration/refresh":"/api/inspiration/today",{method:refresh?"POST":"GET"}),fetch("/api/products")]);if(!r.ok){onMock(await readApiError(r,"今日推荐暂时无法读取"));return}const data=await r.json() as {topics?:Topic[];reason?:string};if(!data.topics)throw new Error();setTopics(data.topics);setReason(data.reason||"");if(pr.ok){const list=await pr.json() as FocusProduct[];setProducts(list);setSelectedProductId(previous=>previous&&list.some(item=>item.id===previous)?previous:(list.find(item=>item.status==="focus")?.id||list[0]?.id||""))}if(refresh)onMock("已换一组推荐")}catch{onMock("今日推荐暂时无法读取，请稍后重试")}finally{setLoading(false)}};
  useEffect(()=>{void (async()=>{await load()})()},[]);
  const date=new Intl.DateTimeFormat("zh-CN",{month:"long",day:"numeric",weekday:"long"}).format(new Date());
  const selectedProduct=products.find(item=>item.id===selectedProductId);
  const tones=["ice","sun","rose","amber"];
  return <div className="page-wrap inspiration-page"><PageHeader kicker={date} title="今天发什么？" action={<button className="icon-action" disabled={loading} onClick={() => {setLoading(true);void load(true)}}><RefreshCw className={loading?"spin":""} size={17}/>换一组</button>}/>
    <section className="recommendation-reason"><div className="reason-icon"><Sparkles size={20}/></div><div><p>今天为什么这样推荐</p><h2>{reason}</h2></div></section>
    {products.length>0&&<section className="focus-product-bar"><div><label className="mini-label" htmlFor="focus-product-select">{selectedProduct?.status==="focus"?"主推产品":"选择要写的产品"}</label><select id="focus-product-select" value={selectedProductId} onChange={e=>setSelectedProductId(e.target.value)}>{products.map(item=><option key={item.id} value={item.id}>{item.name}{item.lockedFactCount>0?`（已确认 ${item.lockedFactCount} 条事实）`:"（尚未确认事实）"}</option>)}</select><small>{selectedProduct?selectedProduct.lockedFactCount>0?`已确认 ${selectedProduct.lockedFactCount} 条事实，可直接生成，不需要重新解析资料`:"这个产品还没有确认过事实，生成前建议先解析它的资料":"请先在产品页创建产品"}</small></div><button className="primary-button" onClick={()=>onUseProduct(selectedProductId)} disabled={!selectedProductId}><WandSparkles size={17}/>用它生成</button></section>}
    <section className="section-block"><div className="section-heading"><div><span>今日推荐</span><h2>4 个值得写的角度</h2></div><small>{loading?"准备中":"已按近期内容去重"}</small></div><div className="topic-grid">{topics.map((topic,i) => <article className={`topic-card ${tones[i%4]}`} key={topic.id}><div className="topic-art"><span className="big-flag">{topic.flag}</span><span className="place-label">{topic.city||topic.country}</span><span className="card-index">0{i+1}</span></div><div className="topic-body"><div className="topic-meta"><span className="tag">{topic.contentType}</span><button className={`verification-badge ${topic.verification}`} onClick={()=>setSheet(topic)}><ShieldCheck size={14}/>{topic.verification==="verified"?"已核验":topic.verification==="pending"?"等待联网核验":"常青内容"}</button></div><h3>{topic.title}</h3><p>{topic.reason}</p><p className="topic-audience">适合：{topic.audience}{topic.productRelated?" · 与主推产品相关":""}</p><div className="card-actions"><button className="primary-button" onClick={()=>onGenerate(topic.title)}><WandSparkles size={17}/>生成朋友圈</button></div></div></article>)}</div></section>
    <section className="quick-start"><div><span className="mini-label">AI 输入理解</span><h2>已经有内容？先识别事实</h2><p>粘贴产品资料或同事朋友圈，确认事实后再用于创作。</p></div><div className="quick-input"><textarea value={quickText} onChange={e=>setQuickText(e.target.value)} aria-label="粘贴待解析内容" placeholder="粘贴产品、同事朋友圈或参考内容…"/><button onClick={()=>onAnalyze(quickText)} aria-label="开始解析"><Send size={19}/></button></div></section>
    {sheet&&<div className="sheet-backdrop" onClick={()=>setSheet(null)}><section className="source-sheet" onClick={e=>e.stopPropagation()}><div className="sheet-handle"/><header><div><span className="mini-label">事实来源</span><h2>{sheet.title}</h2></div><button onClick={()=>setSheet(null)} aria-label="关闭"><X size={20}/></button></header>{sheet.verification==="verified"&&sheet.sources?.length?<div className="source-list">{sheet.sources.map((s,i)=><a href={s.url} target="_blank" rel="noreferrer" key={`${s.url}-${i}`}><span><strong>{s.title}</strong><small>{s.institution} · {s.tier===1?"一手来源":"参考来源"}{s.publishedAt?` · ${s.publishedAt}`:""}</small></span><ExternalLink size={16}/></a>)}</div>:<div className="source-empty"><ShieldCheck size={22}/><p>{sheet.verification==="pending"?"当前未配置联网搜索，涉及最新信息时请先人工确认。":"这是稳定的体验或文化主题，默认无需实时联网。"}</p></div>}</section></div>}
  </div>;
}

type Product = { id:string; name:string; status:string; sourceType:string; sourceFilePath?:string; lockedFactCount?:number };
/** 新建产品的唯一入口。原来页面上同时有"新建产品"按钮和常驻表单，两者重复。 */
function NewProductDialog({busy,onCreate,onCancel}:{busy:boolean;onCreate:(name:string,status:string)=>void;onCancel:()=>void}) {
  const [name,setName]=useState(""),[status,setStatus]=useState("normal");
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")onCancel()};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[onCancel]);
  return <div className="confirm-backdrop" onClick={onCancel}><section className="confirm-dialog" role="dialog" aria-modal="true" aria-label="新建产品" onClick={e=>e.stopPropagation()}>
    <h2>新建产品</h2>
    <div className="dialog-field"><label htmlFor="np-name">产品名称</label><input id="np-name" value={name} autoFocus onChange={e=>setName(e.target.value)} placeholder="例如：西班牙狂欢节12日9晚"/></div>
    <div className="dialog-field"><label htmlFor="np-status">状态</label><select id="np-status" value={status} onChange={e=>setStatus(e.target.value)}><option value="normal">普通</option><option value="focus">主推</option><option value="paused">暂停</option></select></div>
    <div className="confirm-actions"><button className="secondary-button" onClick={onCancel}>取消</button><button className="primary-button" disabled={busy||!name.trim()} onClick={()=>onCreate(name.trim(),status)}>{busy?"保存中…":"创建产品"}</button></div>
  </section></div>;
}

function Products({ onMock }: { onMock: (s: string) => void }) {
  const [items,setItems]=useState<Product[]>([]),[busy,setBusy]=useState(false),[showCreate,setShowCreate]=useState(false),[pendingDelete,setPendingDelete]=useState<Product|null>(null); const fileRef=useRef<HTMLInputElement>(null);
  const load=async()=>{try{const r=await fetch("/api/products");if(!r.ok){onMock(await readApiError(r,"产品数据暂时无法读取"));return}setItems(await r.json() as Product[])}catch{onMock("产品数据暂时无法读取，请稍后重试")}};
  useEffect(()=>{void (async()=>{await load()})()},[]);
  async function create(nextName:string,nextStatus:string){setBusy(true);try{const r=await fetch("/api/products",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:nextName,status:nextStatus})});if(!r.ok){onMock(await readApiError(r,"保存失败，请重试"));return}setShowCreate(false);await load();onMock(`已创建“${nextName}”`)}catch{onMock("保存失败，请重试")}finally{setBusy(false)}}
  async function update(item:Product,patch:Partial<Product>){try{const r=await fetch(`/api/products/${item.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(patch)});if(!r.ok){onMock(await readApiError(r,"产品更新失败"));return}await load();onMock("产品已更新")}catch{onMock("产品更新失败，请重试")}}
  async function remove(item:Product){try{const r=await fetch(`/api/products/${item.id}`,{method:"DELETE"});if(!r.ok){onMock(await readApiError(r,"删除失败"));return}await load();onMock("产品已删除")}catch{onMock("删除失败，请重试")}}
  async function uploadSource(file:File){try{const form=new FormData();form.set("file",file);form.set("kind","source");const r=await fetch("/api/assets",{method:"POST",body:form});onMock(r.ok?"产品文件已存入素材库":await readApiError(r,"上传失败，请重试"))}catch{onMock("上传失败，请重试")}}
  return <div className="page-wrap"><PageHeader kicker="产品库" title="你正在关注的产品" action={<div className="product-top-actions"><button className="secondary-button" onClick={()=>fileRef.current?.click()}><FileUp size={17}/>上传产品文件</button><button className="primary-button" onClick={()=>setShowCreate(true)}><Plus size={18}/>新建产品</button></div>}/>
    <input ref={fileRef} hidden type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={e=>e.target.files?.[0]&&uploadSource(e.target.files[0])}/>
    <p className="list-hint">产品文件最大支持 25MB。产品名称和状态可以直接在下面点开修改。想写哪个产品的内容，就去首页用产品选择器生成。</p>
    <div className="product-list">{items.map((item,i)=><article className={item.status==="focus"?"product-card featured":"product-card"} key={item.id}><div className="product-country">{i%2?"🇮🇹":"🇨🇭"}</div><div className="product-info"><div><span className={item.status==="focus"?"status focus":"status"}>{item.status==="focus"?"主推":item.status==="paused"?"暂停":"普通"}</span><span className="muted">{(item.lockedFactCount||0)>0?`已确认 ${item.lockedFactCount} 条事实`:"尚未确认事实"}</span></div><input className="inline-name" aria-label="产品名称" value={item.name} onChange={e=>setItems(v=>v.map(p=>p.id===item.id?{...p,name:e.target.value}:p))} onBlur={()=>update(item,{name:item.name})}/><select className="inline-status" aria-label="产品状态" value={item.status} onChange={e=>update(item,{status:e.target.value})}><option value="focus">主推</option><option value="normal">普通</option><option value="paused">暂停</option></select></div><button className="danger-button" aria-label="删除产品" onClick={()=>setPendingDelete(item)}><Trash2 size={18}/></button></article>)}</div>
    {items.length===0&&<div className="empty-hint"><Layers3 size={22}/><div><strong>还没有保存产品</strong><p>点右上角「新建产品」创建第一个产品。</p></div></div>}
    {showCreate&&<NewProductDialog busy={busy} onCreate={create} onCancel={()=>setShowCreate(false)}/>}
    {pendingDelete&&<ConfirmDialog title={`删除“${pendingDelete.name}”？`} description="该产品及其已确认事实会一起删除，且无法恢复。" onConfirm={()=>{const target=pendingDelete;setPendingDelete(null);void remove(target)}} onCancel={()=>setPendingDelete(null)}/>}
  </div>;
}

type HistoryItem={id:string;title:string;status:string;createdAt:string};
function History({onOpen,notify}:{onOpen:(id:string)=>void;notify:(message:string)=>void}) { const [rows,setRows]=useState<HistoryItem[]>([]),[deleting,setDeleting]=useState(""),[pendingDelete,setPendingDelete]=useState<HistoryItem|null>(null);const load=async()=>{try{const r=await fetch("/api/contents");if(!r.ok){notify(await readApiError(r,"内容历史暂时无法读取"));return}setRows(await r.json() as HistoryItem[])}catch{notify("内容历史暂时无法读取，请稍后重试")}};useEffect(()=>{void (async()=>{await load()})()},[]);async function remove(row:HistoryItem){setDeleting(row.id);try{const r=await fetch(`/api/contents/${row.id}`,{method:"DELETE"}),data=await r.json() as {error?:string};if(!r.ok)throw new Error(data.error||"删除失败");setRows(items=>items.filter(item=>item.id!==row.id));notify("历史内容已删除")}catch(error){notify(error instanceof Error?error.message:"删除失败，请重试")}finally{setDeleting("")}}return <div className="page-wrap"><PageHeader kicker="内容历史" title="最近写过的朋友圈"/><div className="history-list">{rows.map((row,i)=><article className="history-row" key={row.id}><button className="history-open" onClick={()=>onOpen(row.id)}><div className="history-number">{String(i+1).padStart(2,"0")}</div><div className="history-copy"><h2>{row.title}</h2><p>{new Date(row.createdAt).toLocaleDateString("zh-CN")} · 点击继续编辑</p></div><span className="history-status">{row.status==="adopted"?"已采用":"草稿"}</span></button><button className="danger-button history-delete" disabled={deleting===row.id} aria-label={`删除${row.title}`} title="删除此内容" onClick={()=>setPendingDelete(row)}>{deleting===row.id?<LoaderCircle className="spin" size={18}/>:<Trash2 size={18}/>}</button></article>)}</div>{rows.length===0&&<div className="empty-hint"><Clock3 size={22}/><div><strong>还没有内容记录</strong><p>完成一次三方向生成后会自动保存在这里。</p></div></div>}{pendingDelete&&<ConfirmDialog title={`删除“${pendingDelete.title}”？`} description={"文案和全部历史版本都会删除，且无法恢复。"} onConfirm={()=>{const target=pendingDelete;setPendingDelete(null);void remove(target)}} onCancel={()=>setPendingDelete(null)}/>}</div>; }
