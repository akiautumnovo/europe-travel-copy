"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpenText, Check, ChevronRight, Clock3, Copy, FileUp, Image as ImageIcon, Layers3, Lightbulb, LogOut, MessageCircleMore, Package, PenLine, Plus, RefreshCw, Send, Sparkles, Trash2, Upload, UserRound, WandSparkles } from "lucide-react";
import AnalysisWorkspace from "./analysis-workspace";
import CreationWorkspace from "./creation-workspace";

type MainView = "inspiration" | "products" | "assets" | "style" | "history";
type View = MainView | "analysis" | "creation" | "directions" | "editor";

const navItems: { id: MainView; label: string; icon: typeof Lightbulb }[] = [
  { id: "inspiration", label: "灵感", icon: Lightbulb }, { id: "products", label: "产品", icon: Package },
  { id: "assets", label: "素材", icon: ImageIcon }, { id: "style", label: "风格", icon: UserRound },
  { id: "history", label: "历史", icon: Clock3 },
];

const topics = [
  { flag: "🇨🇭", place: "瑞士", title: "第一次去瑞士，为什么不要每天换酒店", reason: "实用建议容易引发收藏，也能自然体现你的行程经验。", type: "专业建议", tone: "ice" },
  { flag: "🇮🇹", place: "托斯卡纳", title: "为什么慢旅行更适合这里", reason: "今天适合发轻松一点的生活方式内容。", type: "生活方式", tone: "sun" },
  { flag: "🇫🇷", place: "巴黎", title: "第一次去巴黎，为什么不要把每天排满", reason: "把熟悉的目的地换成更松弛、更真实的角度。", type: "旅行观点", tone: "rose" },
  { flag: "🇪🇸", place: "西班牙", title: "当地晚餐时间会怎样影响旅行安排", reason: "具体又有趣，适合开启一段轻知识分享。", type: "当地文化", tone: "amber" },
];

const directions = [
  { name: "生活分享型", eyebrow: "轻松 · 日常感", copy: "第一次去瑞士，很多人会忍不住把地图上的每个名字都塞进行程。\n\n但我更建议少换几次酒店，把时间留给湖边散步和一顿不赶时间的晚餐。", icon: MessageCircleMore },
  { name: "专业顾问型", eyebrow: "判断 · 实用建议", copy: "瑞士看起来不大，但每天换酒店并不等于看得更多。\n\n真正影响体验的，往往是换乘、行李和天气。第一次去，把两晚以上留给同一个区域，行程会从容很多。", icon: BookOpenText },
  { name: "情绪种草型", eyebrow: "画面 · 体验想象", copy: "瑞士最让人难忘的，可能不是打卡了多少地方。\n\n而是清晨推开窗，看见山雾慢慢散开；或者傍晚坐在湖边，终于不用赶下一班车。", icon: Sparkles },
];

const mockAssets = [["雪山列车","🇨🇭","asset-blue"],["托斯卡纳午后","🇮🇹","asset-gold"],["巴黎街角","🇫🇷","asset-rose"],["海边小城","🇪🇸","asset-coral"],["阿尔卑斯湖","🇨🇭","asset-teal"],["意大利餐桌","🇮🇹","asset-olive"]];

export default function Home() {
  const [view, setView] = useState<View>("inspiration");
  const [selectedDirection, setSelectedDirection] = useState(1);
  const [toast, setToast] = useState("");
  const [analysisText, setAnalysisText] = useState("");
  const [creationTopic,setCreationTopic]=useState(""),[resumeContentId,setResumeContentId]=useState("");
  const [draft, setDraft] = useState("瑞士看起来不大，但每天换酒店并不等于看得更多。\n\n真正影响体验的，往往是换乘、行李和天气。第一次去，把两晚以上留给同一个区域，行程会从容很多。\n\n旅行不是把地图上的点连得越密越好。留一点空白，才有机会真正感受到一个地方。\n\n如果你正在计划第一次瑞士旅行，可以先从减少一次换酒店开始。🇨🇭");
  const activeMain: MainView = ["analysis", "creation", "directions", "editor"].includes(view) ? "inspiration" : (view as MainView);
  useEffect(() => { fetch("/api/bootstrap", { method:"POST" }).catch(() => undefined); }, []);
  function flash(message: string) { setToast(message); window.setTimeout(() => setToast(""), 1800); }

  return <div className="app-shell">
    <aside className="desktop-sidebar">
      <button className="brand" onClick={() => setView("inspiration")} aria-label="返回今日灵感"><span className="brand-mark">旅</span><span><strong>旅笺</strong><small>朋友圈内容助手</small></span></button>
      <nav aria-label="主导航">{navItems.map((item) => { const Icon = item.icon; const longLabel = item.label === "灵感" ? "今日灵感" : item.label === "风格" ? "我的风格" : item.label === "历史" ? "内容历史" : item.label; return <button key={item.id} className={activeMain === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)}><Icon size={19}/><span>{longLabel}</span></button>; })}</nav>
      <div className="account-card"><span className="account-avatar">A</span><div><strong>Aki</strong><small>数据已安全保存</small></div><a href="/signout-with-chatgpt?return_to=/" title="退出登录"><LogOut size={17}/></a></div>
      <div className="phase-note"><span>Phase 3</span><p>三方向 · 段落编辑 · 版本</p></div>
    </aside>
    <main className={view === "editor" ? "main-content editor-main" : "main-content"}>
      {view === "inspiration" && <Inspiration onGenerate={(topic) => {setCreationTopic(topic);setResumeContentId("");setView("creation")}} onAnalyze={(value)=>{setAnalysisText(value);setView("analysis")}} onMock={flash}/>} {view === "products" && <Products onMock={flash}/>} {view === "assets" && <Assets onMock={flash}/>} {view === "style" && <Style/>} {view === "history" && <History onOpen={(id)=>{setResumeContentId(id);setCreationTopic("");setView("creation")}}/>}
      {view === "analysis" && <AnalysisWorkspace initialText={analysisText} onBack={()=>setView("inspiration")} notify={flash}/>} 
      {view === "creation" && <CreationWorkspace initialTopic={creationTopic} initialContentId={resumeContentId||undefined} onBack={()=>setView("inspiration")} notify={flash}/>} 
      {view === "directions" && <Directions selected={selectedDirection} onSelect={setSelectedDirection} onBack={() => setView("inspiration")} onContinue={() => { setDraft(directions[selectedDirection].copy + "\n\n如果你正在计划第一次瑞士旅行，可以先从减少一次换酒店开始。🇨🇭"); setView("editor"); }}/>} 
      {view === "editor" && <Editor draft={draft} setDraft={setDraft} onBack={() => setView("directions")} onMock={flash}/>} 
    </main>
    {view !== "editor" && <nav className="mobile-nav" aria-label="手机主导航">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={activeMain === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon size={21}/><span>{item.label}</span></button>; })}</nav>}
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
  </div>;
}

function PageHeader({ kicker, title, action }: { kicker: string; title: string; action?: React.ReactNode }) { return <header className="page-header"><div><p className="kicker">{kicker}</p><h1>{title}</h1></div>{action}</header>; }

function Inspiration({ onGenerate, onAnalyze, onMock }: { onGenerate: (topic:string) => void; onAnalyze:(text:string)=>void; onMock: (s: string) => void }) {
  const [quickText,setQuickText]=useState("");
  return <div className="page-wrap inspiration-page"><PageHeader kicker="10月2日 · 星期五" title="今天发什么？" action={<button className="icon-action" onClick={() => onMock("已换一组模拟选题")}><RefreshCw size={17}/>换一组</button>}/>
    <section className="recommendation-reason"><div className="reason-icon"><Sparkles size={20}/></div><div><p>今天为什么这样推荐</p><h2>今天建议轻一点。最近几条都是产品内容，今天更适合发一篇欧洲生活方式内容。</h2></div></section>
    <section className="section-block"><div className="section-heading"><div><span>今日推荐</span><h2>4 个值得写的角度</h2></div><small>推荐选题</small></div><div className="topic-grid">{topics.map((topic,i) => <article className={`topic-card ${topic.tone}`} key={topic.place}><div className="topic-art"><span className="big-flag">{topic.flag}</span><span className="place-label">{topic.place}</span><span className="card-index">0{i+1}</span></div><div className="topic-body"><span className="tag">{topic.type}</span><h3>{topic.title}</h3><p>{topic.reason}</p><div className="card-actions"><button className="primary-button" onClick={()=>onGenerate(topic.title)}><WandSparkles size={17}/>生成朋友圈</button><button className="text-button" onClick={() => onMock("已切换到另一个推荐角度")}>换个角度</button></div></div></article>)}</div></section>
    <section className="quick-start"><div><span className="mini-label">AI 输入理解</span><h2>已经有内容？先识别事实</h2><p>粘贴产品资料或同事朋友圈，确认事实后再用于创作。</p></div><div className="quick-input"><textarea value={quickText} onChange={e=>setQuickText(e.target.value)} aria-label="粘贴待解析内容" placeholder="粘贴产品、同事朋友圈或参考内容…"/><button onClick={()=>onAnalyze(quickText)} aria-label="开始解析"><Send size={19}/></button></div></section>
  </div>;
}

type Product = { id:string; name:string; status:string; sourceType:string; sourceFilePath?:string };
function Products({ onMock }: { onMock: (s: string) => void }) {
  const [items,setItems]=useState<Product[]>([]),[name,setName]=useState(""),[status,setStatus]=useState("normal"),[busy,setBusy]=useState(false); const fileRef=useRef<HTMLInputElement>(null);
  const load=()=>fetch("/api/products").then(r=>r.ok?r.json() as Promise<Product[]>:Promise.reject()).then(data=>setItems(data)).catch(()=>onMock("产品数据暂时无法读取"));
  useEffect(()=>{void load();},[]);
  async function create(){if(!name.trim())return onMock("请先输入产品名称");setBusy(true);const r=await fetch("/api/products",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,status})});if(r.ok){setName("");await load();onMock("产品已保存")}else onMock("保存失败，请重试");setBusy(false)}
  async function update(item:Product,patch:Partial<Product>){const r=await fetch(`/api/products/${item.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(patch)});if(r.ok){await load();onMock("产品已更新")}}
  async function remove(item:Product){if(!confirm(`删除“${item.name}”？`))return;await fetch(`/api/products/${item.id}`,{method:"DELETE"});await load();onMock("产品已删除")}
  async function uploadSource(file:File){const form=new FormData();form.set("file",file);form.set("kind","source");const r=await fetch("/api/assets",{method:"POST",body:form});onMock(r.ok?"产品文件已上传":"上传失败，请重试")}
  return <div className="page-wrap"><PageHeader kicker="产品库" title="你正在关注的产品" action={<button className="primary-button top-action" onClick={()=>document.getElementById("new-product")?.scrollIntoView({behavior:"smooth"})}><Plus size={18}/>新建产品</button>}/>
    <section id="new-product" className="data-form"><div><label htmlFor="product-name">产品名称</label><input id="product-name" value={name} onChange={e=>setName(e.target.value)} placeholder="例如：瑞士8日小团"/></div><div><label htmlFor="product-status">状态</label><select id="product-status" value={status} onChange={e=>setStatus(e.target.value)}><option value="focus">主推</option><option value="normal">普通</option><option value="paused">暂停</option></select></div><button className="primary-button" disabled={busy} onClick={create}>{busy?"保存中…":"保存产品"}</button><button className="secondary-button" onClick={()=>fileRef.current?.click()}><FileUp size={17}/>上传产品文件</button><input ref={fileRef} hidden type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={e=>e.target.files?.[0]&&uploadSource(e.target.files[0])}/></section>
    <div className="product-list">{items.map((item,i)=><article className={item.status==="focus"?"product-card featured":"product-card"} key={item.id}><div className="product-country">{i%2?"🇮🇹":"🇨🇭"}</div><div className="product-info"><div><span className={item.status==="focus"?"status focus":"status"}>{item.status==="focus"?"主推":item.status==="paused"?"暂停":"普通"}</span><span className="muted">手工创建 · 已保存</span></div><input className="inline-name" aria-label="产品名称" value={item.name} onChange={e=>setItems(v=>v.map(p=>p.id===item.id?{...p,name:e.target.value}:p))} onBlur={()=>update(item,{name:item.name})}/><select className="inline-status" aria-label="产品状态" value={item.status} onChange={e=>update(item,{status:e.target.value})}><option value="focus">主推</option><option value="normal">普通</option><option value="paused">暂停</option></select></div><button className="danger-button" aria-label="删除产品" onClick={()=>remove(item)}><Trash2 size={18}/></button></article>)}</div>
    {items.length===0&&<div className="empty-hint"><Layers3 size={22}/><div><strong>还没有保存产品</strong><p>创建第一个产品后，刷新页面它仍会保留。</p></div></div>}
  </div>;
}

type Asset={id:string;sourceName:string;assetType:string;createdAt:string};
function Assets({ onMock }: { onMock: (s: string) => void }) { const [items,setItems]=useState<Asset[]>([]),[busy,setBusy]=useState(false);const input=useRef<HTMLInputElement>(null);const load=()=>fetch("/api/assets").then(r=>r.ok?r.json() as Promise<Asset[]>:Promise.reject()).then(data=>setItems(data)).catch(()=>onMock("素材暂时无法读取"));useEffect(()=>{void load();},[]);async function upload(file:File){setBusy(true);const form=new FormData();form.set("file",file);form.set("kind","asset");const r=await fetch("/api/assets",{method:"POST",body:form});if(r.ok){await load();onMock("素材已安全保存")}else onMock("上传失败，请重试");setBusy(false)}return <div className="page-wrap"><PageHeader kicker="我的素材" title="为下一条内容找画面" action={<button className="primary-button top-action" disabled={busy} onClick={()=>input.current?.click()}><Upload size={18}/>{busy?"上传中":"上传素材"}</button>}/><input ref={input} hidden type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/><div className="asset-grid">{items.map((asset,i)=><article className={`asset-card ${["asset-blue","asset-gold","asset-rose","asset-coral","asset-teal","asset-olive"][i%6]}`} key={asset.id}><div className="asset-number">{String(i+1).padStart(2,"0")}</div><div className="asset-flag">📷</div><div className="asset-caption"><strong>{asset.sourceName}</strong><span>本人上传 · 已保存</span></div></article>)}</div>{items.length===0&&<div className="empty-hint"><ImageIcon size={22}/><div><strong>还没有上传素材</strong><p>选择一张照片，上传后刷新页面仍会保留。</p></div></div>}</div>; }

function Style() { return <div className="page-wrap narrow"><PageHeader kicker="我的风格" title="让文字慢慢更像你"/><section className="style-hero"><div className="dna-orbit"><span>DNA</span></div><div><span className="tag">冷启动中</span><h2>你的 Style DNA 还在形成中。</h2><p>不需要先填一份很长的问卷。随着你使用，它会逐步理解你真正喜欢的表达。</p></div></section><section className="learning-card"><h2>系统会根据</h2>{[[Check,"你最终采用的内容"],[PenLine,"你亲手做过的修改"],[MessageCircleMore,"你明确喜欢或不喜欢的表达"]].map(([Icon,text],i) => { const C=Icon as typeof Check; return <div className="learning-row" key={i}><span><C size={18}/></span><p>{String(text)}</p></div>; })}</section></div>; }

type HistoryItem={id:string;title:string;status:string;createdAt:string};
function History({onOpen}:{onOpen:(id:string)=>void}) { const [rows,setRows]=useState<HistoryItem[]>([]);const load=()=>fetch("/api/contents").then(r=>r.ok?r.json() as Promise<HistoryItem[]>:Promise.reject()).then(data=>setRows(data)).catch(()=>undefined);useEffect(()=>{void load();},[]);return <div className="page-wrap"><PageHeader kicker="内容历史" title="最近写过的朋友圈"/><div className="history-list">{rows.map((row,i)=><button className="history-row history-button" onClick={()=>onOpen(row.id)} key={row.id}><div className="history-number">{String(i+1).padStart(2,"0")}</div><div className="history-copy"><h2>{row.title}</h2><p>{new Date(row.createdAt).toLocaleDateString("zh-CN")} · 点击继续编辑</p></div><span className="history-status">{row.status==="adopted"?"已采用":"草稿"}</span></button>)}</div>{rows.length===0&&<div className="empty-hint"><Clock3 size={22}/><div><strong>还没有内容记录</strong><p>完成一次三方向生成后会自动保存在这里。</p></div></div>}</div>; }

function Directions({selected,onSelect,onBack,onContinue}:{selected:number;onSelect:(n:number)=>void;onBack:()=>void;onContinue:()=>void}) { return <div className="page-wrap directions-page"><button className="back-button" onClick={onBack}><ArrowLeft size={18}/>返回今日灵感</button><PageHeader kicker="创作工作台 · 第 1 步" title="选择一个更像你的方向"/><p className="page-intro">同一个主题，先从三种不同表达开始。选中后还可以继续修改。</p><div className="direction-grid">{directions.map((item,i)=>{const Icon=item.icon;return <button key={item.name} className={selected===i?"direction-card selected":"direction-card"} onClick={()=>onSelect(i)}><div className="direction-top"><span className="direction-icon"><Icon size={20}/></span>{selected===i&&<span className="selected-check"><Check size={15}/></span>}</div><span className="direction-eyebrow">{item.eyebrow}</span><h2>{item.name}</h2><p>{item.copy}</p><span className="choose-label">{selected===i?"已选择":"选择这个方向"}</span></button>})}</div><div className="continue-bar"><div><span>当前选择</span><strong>{directions[selected].name}</strong></div><button className="primary-button" onClick={onContinue}>用这个继续<ChevronRight size={18}/></button></div></div>; }

function Editor({draft,setDraft,onBack,onMock}:{draft:string;setDraft:(s:string)=>void;onBack:()=>void;onMock:(s:string)=>void}) { const quicks=["更自然","更专业","销售味弱一点","缩短","换个开头","换个结尾"]; return <div className="editor-page"><header className="editor-header"><button className="back-button" onClick={onBack}><ArrowLeft size={18}/>返回选择方向</button><div><span>创作工作台 · 模拟编辑</span><strong>瑞士｜第一次去瑞士为什么不要每天换酒店</strong></div><button className="desktop-copy" onClick={()=>onMock("已模拟复制完整文案")}><Copy size={17}/>复制文案</button></header><div className="editor-layout"><section className="draft-panel"><div className="panel-label"><span>朋友圈正文</span><small>{draft.length} 字</small></div><textarea value={draft} onChange={e=>setDraft(e.target.value)} aria-label="朋友圈正文"/></section><aside className="tools-panel"><div><span className="mini-label">快捷修改</span><h2>想让这版怎么变化？</h2></div><div className="quick-tools">{quicks.map(q=><button key={q} onClick={()=>onMock(`“${q}”将在后续阶段接入 AI`)}>{q}</button>)}</div><div className="custom-revision"><label htmlFor="revision">还想怎么改？</label><div><input id="revision" placeholder="例如：第二段再轻松一点"/><button onClick={()=>onMock("自然语言修改将在后续阶段开放")}><Send size={17}/></button></div></div><div className="mock-notice"><Sparkles size={18}/><p>现在可以直接手工修改正文。快捷工具为 Phase 0 交互演示。</p></div></aside></div><div className="mobile-editor-actions"><button onClick={()=>onMock("快捷修改已展开")}><WandSparkles size={19}/>修改</button><button onClick={()=>onMock("配图功能将在后续阶段开放")}><ImageIcon size={19}/>配图</button><button className="active" onClick={()=>onMock("已模拟复制完整文案")}><Copy size={19}/>复制</button></div></div>; }
