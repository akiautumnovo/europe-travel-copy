"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, FileUp, LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";

type InputType = "official_product" | "colleague_post" | "reference";
type Fact = { field:string; value:string; source_quote:string; confidence:number; requires_confirmation:boolean; freshness:"current"|"time_sensitive"|"unknown"; status:"pending"|"confirmed"|"locked" };
type Result = { hard_facts:Fact[]; subjective_claims:string[]; uncertain_items:string[]; product_summary:string; possible_content_angles:string[] };
type Product = { id:string; name:string; lockedFactCount?:number };
const NEW_PRODUCT = "__new";

export default function AnalysisWorkspace({ initialText, onBack, onContinue, notify }:{ initialText:string; onBack:()=>void; onContinue:(productId:string)=>void; notify:(message:string)=>void }) {
  const [type,setType]=useState<InputType>("colleague_post"),[text,setText]=useState(initialText),[result,setResult]=useState<Result|null>(null);
  const [rawText,setRawText]=useState(initialText),[busy,setBusy]=useState(false),[error,setError]=useState(""),[products,setProducts]=useState<Product[]>([]),[productId,setProductId]=useState("");
  const [saved,setSaved]=useState<{productId:string;lockedCount:number}|null>(null);
  const [newProductName,setNewProductName]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);
  const selectedProduct=products.find(item=>item.id===productId);
  useEffect(()=>{void (async()=>{try{const r=await fetch("/api/products");if(!r.ok)return;const rows=await r.json() as Product[];setProducts(rows);if(rows[0])setProductId(rows[0].id)}catch{/* 产品列表读取失败时保持为空，不阻塞解析 */}})()},[]);

  async function analyze(file?:File){
    setBusy(true);setError("");setResult(null);
    try{
      let response:Response;
      if(file){const form=new FormData();form.set("type",type);form.set("file",file);response=await fetch("/api/analysis",{method:"POST",body:form})}
      else response=await fetch("/api/analysis",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type,text})});
      const data=await response.json() as {error?:string;rawText?:string;analysis?:Result};
      if(!response.ok||!data.analysis)throw new Error(data.error||"解析失败，请重试");
      setRawText(data.rawText||text);setText(data.rawText||text);setResult(data.analysis);
    }catch(e){setError(e instanceof Error?e.message:"解析失败，请重试")}finally{setBusy(false)}
  }
  function updateFact(index:number,patch:Partial<Fact>){setSaved(null);setResult(current=>current?{...current,hard_facts:current.hard_facts.map((fact,i)=>i===index?{...fact,...patch}:fact)}:current)}
  function deleteFact(index:number){setSaved(null);setResult(current=>current?{...current,hard_facts:current.hard_facts.filter((_,i)=>i!==index)}:current)}
  /** 一键确认所有待确认事实，避免十几条事实逐条点击。 */
  function confirmAll(){setSaved(null);setResult(current=>current?{...current,hard_facts:current.hard_facts.map(fact=>fact.status==="pending"?{...fact,status:"confirmed"}:fact)}:current);notify("已全部确认，可直接保存到产品")}
  async function save(){
    if(!result)return setError("请先解析内容");
    // 允许在保存时新建产品：不同来源的资料不应该被迫覆盖到同一个产品上。
    let targetId=productId;
    if(productId===NEW_PRODUCT){
      const name=newProductName.trim();
      if(!name)return setError("请输入新产品名称");
      const created=await fetch("/api/products",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name})});
      const createdData=await created.json() as {id?:string;error?:string};
      if(!created.ok||!createdData.id)return setError(createdData.error||"新建产品失败");
      targetId=createdData.id;
    }
    if(!targetId)return setError("请先选择一个产品");
    const response=await fetch(`/api/products/${targetId}/confirm-analysis`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type,rawText,analysis:result})});
    const data=await response.json() as {error?:string;lockedFacts?:unknown[]};if(!response.ok)return setError(data.error||"保存失败");
    setResult({...result,hard_facts:result.hard_facts.map(f=>f.status==="confirmed"?{...f,status:"locked"}:f)});
    setSaved({productId:targetId,lockedCount:data.lockedFacts?.length??0});
    if(productId===NEW_PRODUCT){
      const refreshed=await fetch("/api/products").then(r=>r.ok?r.json() as Promise<Product[]>:[]).catch(()=>[] as Product[]);
      if(refreshed.length)setProducts(refreshed);
      setProductId(targetId);setNewProductName("");
    }
    notify(type==="reference"?"参考灵感已保存，未写入产品事实":"确认事实已锁定保存");
  }
  return <div className="page-wrap analysis-page">
    <button className="back-button" onClick={onBack}><ArrowLeft size={18}/>返回今日灵感</button>
    <header className="analysis-header"><div><p className="kicker">产品事实确认</p><h1>先分清事实，再开始创作</h1><p>AI 只整理原文，不会替你补全日期、酒店等级或剩余名额。</p></div><span className="analysis-badge"><Sparkles size={17}/>DeepSeek 解析</span></header>
    <section className="analysis-input-card">
      <div className="mode-tabs">{([['official_product','正式产品资料'],['colleague_post','同事朋友圈'],['reference','普通参考内容']] as const).map(([value,label])=><button key={value} className={type===value?"active":""} onClick={()=>setType(value)}>{label}</button>)}</div>
      <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="粘贴行程、报价、同事朋友圈或参考内容…" aria-label="待解析内容"/>
      <div className="analysis-actions"><button className="secondary-button" onClick={()=>fileRef.current?.click()}><FileUp size={17}/>上传并解析</button><input ref={fileRef} hidden type="file" accept=".txt,.pdf,.docx,.xlsx" onChange={e=>e.target.files?.[0]&&analyze(e.target.files[0])}/><button className="primary-button" disabled={busy||(!text.trim())} onClick={()=>analyze()}>{busy?<><LoaderCircle className="spin" size={17}/>正在识别</>:<><Sparkles size={17}/>开始解析</>}</button></div>
      {error&&<p className="analysis-error" role="alert">{error}</p>}
    </section>
    {result&&<section className="analysis-results">
      <div className="result-summary"><span>产品摘要</span><p>{result.product_summary||"原文没有足够信息形成摘要。"}</p></div>
      <div className="result-section"><div className="result-title"><div><span>已识别事实</span><h2>请逐条确认</h2></div><div className="fact-bulk"><small>{result.hard_facts.filter(f=>f.status!=="pending").length}/{result.hard_facts.length} 已确认</small>{result.hard_facts.some(f=>f.status==="pending")&&<button className="secondary-button" onClick={confirmAll}>全部确认</button>}</div></div>
        <div className="fact-list">{result.hard_facts.map((fact,index)=><article className={`fact-row ${fact.status}`} key={`${fact.field}-${index}`}><div className="fact-fields"><input aria-label="事实字段" value={fact.field} onChange={e=>updateFact(index,{field:e.target.value,status:"pending"})}/><input aria-label="事实内容" value={fact.value} onChange={e=>updateFact(index,{value:e.target.value,status:"pending"})}/><blockquote>原文：{fact.source_quote}</blockquote><div className="fact-meta"><span>置信度 {Math.round(fact.confidence*100)}%</span>{fact.requires_confirmation&&<span className="warning-chip">待确认</span>}<span>{fact.freshness==="time_sensitive"?"时效信息":fact.freshness==="current"?"当前资料":"时效未知"}</span></div></div><div className="fact-buttons"><button className="confirm-button" onClick={()=>updateFact(index,{status:fact.status==="confirmed"?"pending":"confirmed"})}><Check size={16}/>{fact.status==="confirmed"?"已确认":"确认"}</button><button className="danger-button" onClick={()=>deleteFact(index)} aria-label="删除事实"><Trash2 size={16}/></button></div></article>)}</div>
        {result.hard_facts.length===0&&<p className="result-empty">此类内容不写入产品事实。</p>}
      </div>
      <div className="result-columns"><ResultList title="主观表达" items={result.subjective_claims}/><ResultList title="不确定信息" items={result.uncertain_items}/><ResultList title="可用内容角度" items={result.possible_content_angles}/></div>
      <div className="save-analysis"><label>保存到产品<select value={productId} onChange={e=>{setProductId(e.target.value);setSaved(null)}}><option value="">请选择产品</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}<option value={NEW_PRODUCT}>＋ 新建产品…</option></select></label>{productId===NEW_PRODUCT&&<label>新产品名称<input value={newProductName} onChange={e=>setNewProductName(e.target.value)} placeholder="例如：西班牙狂欢节12日9晚"/></label>}<button className="primary-button" onClick={save} disabled={!productId||(productId===NEW_PRODUCT&&!newProductName.trim())}>{type==="reference"?"保存参考分析":"锁定已确认事实"}</button></div>
      {selectedProduct&&(selectedProduct.lockedFactCount||0)>0&&<p className="analysis-hint">“{selectedProduct.name}”已有 {selectedProduct.lockedFactCount} 条已确认事实，保存会覆盖它们。想保留原有事实，请选择「＋ 新建产品…」。</p>}
      {saved&&<div className="analysis-next-step"><div><strong>已锁定 {saved.lockedCount} 条事实</strong><p>接下来直接用这些事实生成三个方向，不需要重新整理资料。</p></div><button className="primary-button" onClick={()=>onContinue(saved.productId)}>去生成内容</button></div>}
    </section>}
  </div>
}

function ResultList({title,items}:{title:string;items:string[]}){return <section className="result-list"><h3>{title}</h3>{items.length?items.map((item,i)=><p key={i}><Plus size={14}/>{item}</p>):<small>没有识别到相关内容</small>}</section>}
