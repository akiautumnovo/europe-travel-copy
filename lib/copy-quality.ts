import type { Draft } from "./ai/types";
import { blocksToText } from "./content";

const visualPattern=/\p{Extended_Pictographic}|[✅【】]/gu;

/** 分散补足或移除装饰符号，不改正文；锁定段落可排除在自动整理之外。 */
export function normalizeVisualSymbols(draft:Draft,protectedIds:string[]=[],min=5,max=9):Draft{
  let excess=(blocksToText(draft.blocks).match(visualPattern)||[]).length-max;
  const protectedSet=new Set(protectedIds),blocks=draft.blocks.map(block=>({...block}));
  for(let index=blocks.length-1;index>=0&&excess>0;index--){
    if(protectedSet.has(blocks[index].id))continue;
    blocks[index].text=blocks[index].text.replace(/\p{Extended_Pictographic}|✅/gu,symbol=>{if(excess<=0)return symbol;excess-=1;return""});
  }
  for(let index=blocks.length-1;index>=0&&excess>0;index--){
    if(protectedSet.has(blocks[index].id))continue;
    blocks[index].text=blocks[index].text.replace(/【([^】]*)】/gu,(pair,inner:string)=>{if(excess<2)return pair;excess-=2;return inner});
  }
  let count=(blocksToText(blocks).match(visualPattern)||[]).length;
  const prefixes=["✨ ","🌍 ","📍 ","🏛️ ","🌿 ","🧭 "];
  for(let index=0;index<blocks.length&&count<min;index++){
    if(protectedSet.has(blocks[index].id))continue;
    blocks[index].text=`${prefixes[count%prefixes.length]}${blocks[index].text}`;
    count+=1;
  }
  return{blocks};
}

export function copyQualityIssues(draft:Draft){
  const issues:string[]=[];
  const text=blocksToText(draft.blocks),length=text.replace(/\s/g,"").length;
  const visualCount=(text.match(visualPattern)||[]).length;
  if(length<300||length>500)issues.push(`全文应为300-500字，当前约${length}字`);
  if(visualCount<5||visualCount>9)issues.push(`Emoji或视觉符号应为5-9个，当前约${visualCount}个`);
  if(draft.blocks.length<5||draft.blocks.length>8)issues.push("全文应分为5-8个完整段落");
  const productIndex=draft.blocks.findIndex(block=>block.category==="objective_fact"||block.category==="marketing");
  if(productIndex<2)issues.push("前半段知识分享不足，产品内容出现过早");
  if(productIndex<0||!draft.blocks.slice(productIndex).some(block=>block.category==="objective_fact"||block.category==="marketing"))issues.push("缺少自然衔接的产品方案段落");
  const ending=draft.blocks.at(-1)?.text.trim()||"";
  if(ending.length<8||/[，、：；（(｜|\/-]$/.test(ending)||/(以及|还有|包括|比如|例如|同时|并且|和|与)$/.test(ending))issues.push("结尾句不完整或疑似被截断");
  const pairs:[[string,string],[string,string]]=[["（","）"],["【","】"]];
  for(const [open,close] of pairs)if((text.split(open).length-1)!==(text.split(close).length-1))issues.push(`存在未闭合的${open}${close}`);
  return issues;
}
