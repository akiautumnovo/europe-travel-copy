"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, FileUp, LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";

type InputType = "official_product" | "colleague_post" | "reference";
type Fact = { field:string; value:string; source_quote:string; confidence:number; requires_confirmation:boolean; freshness:"current"|"time_sensitive"|"unknown"; status:"pending"|"confirmed"|"locked" };
type Result = { hard_facts:Fact[]; subjective_claims:string[]; uncertain_items:string[]; product_summary:string; possible_content_angles:string[] };
type Product = { id:string; name:string };

export default function AnalysisWorkspace({ initialText, onBack, notify }:{ initialText:string; onBack:()=>void; notify:(message:string)=>void }) {
  const [type,setType]=useState<InputType>("colleague_post"),[text,setText]=useState(initialText),[result,setResult]=useState<Result|null>(null);
  const [rawText,setRawText]=useState(initialText),[busy,setBusy]=useState(false),[error,setError]=useState(""),[products,setProducts]=useState<Product[]>([]),[productId,setProductId]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{fetch("/api/products").then(async r=>await r.json() as Product[]).then(rows=>{setProducts(rows);if(rows[0])setProductId(rows[0].id)}).catch(()=>undefined)},[]);

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
  function updateFact(index:number,patch:Partial<Fact>){setResult(current=>current?{...current,hard_facts:current.hard_facts.map((fact,i)=>i===index?{...fact,...patch}:fact)}:current)}
  function deleteFact(index:number){setResult(current=>current?{...current,hard_facts:current.hard_facts.filter((_,i)=>i!==index)}:current)}
  async function save(){
    if(!result||!productId)return setError("请先选择一个产品");
    const response=await fetch(`/api/products/${productId}/confirm-analysis`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type,rawText,analysis:result})});
    const data=await response.json() as {error?:string};if(!response.ok)return setError(data.error||"保存失败");
    setResult({...result,hard_facts:result.hard_facts.map(f=>f.status==="confirmed"?{...f,status:"locked"}:f)});notify(type==="reference"?"参考灵感已保存，未写入产品事实":"确认事实已锁定保存");
  }
  return <div className="page-wrap analysis-page">
    <button className="back-button" onClick={onBack}><ArrowLeft size={18}/>返回今日灵感</button>
    <header className="analysis-header"><div><p className="kicker">Phase 2 · AI 输入理解</p><h1>先分清事实，再开始创作</h1><p>AI 只整理原文，不会替你补全日期、酒店等级或剩余名额。</p></div><span className="analysis-badge"><Sparkles size={17}/>DeepSeek 解析</span></header>
    <section className="analysis-input-card">
      <div className="mode-tabs">{([['official_product','正式产品资料'],['colleague_post','同事朋友圈'],['reference','普通参考内容']] as const).map(([value,label])=><button key={value} className={type===value?"active":""} onClick={()=>setType(value)}>{label}</button>)}</div>
      <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="粘贴行程、报价、同事朋友圈或参考内容…" aria-label="待解析内容"/>
      <div className="analysis-actions"><button className="secondary-button" onClick={()=>fileRef.current?.click()}><FileUp size={17}/>上传并解析</button><input ref={fileRef} hidden type="file" accept=".txt,.pdf,.docx,.xlsx" onChange={e=>e.target.files?.[0]&&analyze(e.target.files[0])}/><button className="primary-button" disabled={busy||(!text.trim())} onClick={()=>analyze()}>{busy?<><LoaderCircle className="spin" size={17}/>正在识别</>:<><Sparkles size={17}/>开始解析</>}</button></div>
      {error&&<p className="analysis-error" role="alert">{error}</p>}
    </section>
    {result&&<section className="analysis-results">
      <div className="result-summary"><span>产品摘要</span><p>{result.product_summary||"原文没有足够信息形成摘要。"}</p></div>
      <div className="result-section"><div className="result-title"><div><span>已识别事实</span><h2>请逐条确认</h2></div><small>{result.hard_facts.filter(f=>f.status!=="pending").length}/{result.hard_facts.length} 已确认</small></div>
        <div className="fact-list">{result.hard_facts.map((fact,index)=><article className={`fact-row ${fact.status}`} key={`${fact.field}-${index}`}><div className="fact-fields"><input aria-label="事实字段" value={fact.field} onChange={e=>updateFact(index,{field:e.target.value,status:"pending"})}/><input aria-label="事实内容" value={fact.value} onChange={e=>updateFact(index,{value:e.target.value,status:"pending"})}/><blockquote>原文：{fact.source_quote}</blockquote><div className="fact-meta"><span>置信度 {Math.round(fact.confidence*100)}%</span>{fact.requires_confirmation&&<span className="warning-chip">待确认</span>}<span>{fact.freshness==="time_sensitive"?"时效信息":fact.freshness==="current"?"当前资料":"时效未知"}</span></div></div><div className="fact-buttons"><button className="confirm-button" onClick={()=>updateFact(index,{status:fact.status==="confirmed"?"pending":"confirmed"})}><Check size={16}/>{fact.status==="confirmed"?"已确认":"确认"}</button><button className="danger-button" onClick={()=>deleteFact(index)} aria-label="删除事实"><Trash2 size={16}/></button></div></article>)}</div>
        {result.hard_facts.length===0&&<p className="result-empty">此类内容不写入产品事实。</p>}
      </div>
      <div className="result-columns"><ResultList title="主观表达" items={result.subjective_claims}/><ResultList title="不确定信息" items={result.uncertain_items}/><ResultList title="可用内容角度" items={result.possible_content_angles}/></div>
      <div className="save-analysis"><label>保存到产品<select value={productId} onChange={e=>setProductId(e.target.value)}><option value="">请选择产品</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><button className="primary-button" onClick={save} disabled={!productId}>{type==="reference"?"保存参考分析":"锁定已确认事实"}</button></div>
    </section>}
  </div>
}

function ResultList({title,items}:{title:string;items:string[]}){return <section className="result-list"><h3>{title}</h3>{items.length?items.map((item,i)=><p key={i}><Plus size={14}/>{item}</p>):<small>没有识别到相关内容</small>}</section>}
