import type { Draft } from "./ai/types";
import { blocksToText } from "./content";

export function copyQualityIssues(draft:Draft){
  const issues:string[]=[];
  const text=blocksToText(draft.blocks),length=text.replace(/\s/g,"").length;
  const visualCount=(text.match(/\p{Extended_Pictographic}|[✅【】]/gu)||[]).length;
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

