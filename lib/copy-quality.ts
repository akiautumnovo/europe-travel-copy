import type { Draft, DraftBlock } from "./ai/types";
import { blocksToText } from "./content";

const visualPattern=/\p{Extended_Pictographic}|[✅【】]/gu;

/** 字数建议区间：偏离只会提示，不拦截生成。 */
export const LENGTH_ADVISED:[number,number]=[300,500];
/** 字数硬性区间：比建议区间宽，避免模型数不准中文字符时把可用文案直接判死。 */
export const LENGTH_HARD:[number,number]=[280,620];

export function isProductFactBlock(block:DraftBlock):boolean{
  return block.category==="objective_fact"||block.category==="marketing";
}

/** 只有产品方案段参与与锁定资料的一致性核验。 */
export function productFactDraft(draft:Draft):Draft{
  return{blocks:draft.blocks.filter(isProductFactBlock)};
}

/** 知识/灵感段不拦截生成，但逐段提示用户发布前人工复查。 */
export function manualReviewWarnings(draft:Draft):string[]{
  return draft.blocks.flatMap((block,index)=>{
    if(isProductFactBlock(block))return[];
    const text=block.text.replace(/\s+/g," ").trim(),excerpt=text.slice(0,34);
    return excerpt?[`第${index+1}段“${excerpt}${text.length>34?"…":""}”属于产品资料之外的知识内容，系统未作事实核验，发布前建议自行检查地名、历史背景、文化和旅游常识。`]:[];
  });
}

/** 字数偏离建议区间时的提醒，只提示不拦截。 */
export function lengthWarnings(draft:Draft):string[]{
  const length=blocksToText(draft.blocks).replace(/\s/g,"").length,[advisedMin,advisedMax]=LENGTH_ADVISED;
  if(length>advisedMax)return[`全文约${length}字，多于建议的${advisedMin}-${advisedMax}字，发布前可适当精简。`];
  if(length<advisedMin)return[`全文约${length}字，少于建议的${advisedMin}-${advisedMax}字，发布前可适当补充。`];
  return[];
}

/**
 * 数据类内容（价格、日期、天数、住宿、航班、名额、签证、退改…）。
 * 按当前策略，这类内容不再由系统判定对错，改为在生成页展示「已锁定产品事实」，由用户对照自行核对。
 */
const dataClaimPattern=/价格|费用|团费|报价|单价|房差|差额|金额|日期|出发|班期|天数|住宿|酒店|星级|航班|航线|名额|席位|余位|签证|保险|退改|退款|欧元|人民币|瑞郎|元|[¥￥€$]/;

/** 只保留常识类核验问题；数据类问题不阻断生成，避免把可用文案判死。 */
export function commonSenseFactIssues(issues:string[]):string[]{
  return issues.filter(issue=>!dataClaimPattern.test(issue));
}

/** 发布前的人工复查提醒：事实来源与字数，均为提示、不拦截。 */
export function reviewWarnings(draft:Draft):string[]{
  return[...lengthWarnings(draft),...manualReviewWarnings(draft)];
}

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
  // 字数只做宽松硬拦截：建议区间之外的偏差交给 lengthWarnings 提示，避免误杀可用文案。
  const [hardMin,hardMax]=LENGTH_HARD;
  if(length<hardMin||length>hardMax)issues.push(`全文应为${hardMin}-${hardMax}字，当前约${length}字（建议${LENGTH_ADVISED[0]}-${LENGTH_ADVISED[1]}字）`);
  if(visualCount<5||visualCount>9)issues.push(`Emoji或视觉符号应为5-9个，当前约${visualCount}个`);
  if(draft.blocks.length<5||draft.blocks.length>8)issues.push("全文应分为5-8个完整段落");
  const productIndex=draft.blocks.findIndex(isProductFactBlock);
  if(productIndex<2)issues.push("前半段知识分享不足，产品内容出现过早");
  if(productIndex<0||!draft.blocks.slice(productIndex).some(block=>block.category==="objective_fact"||block.category==="marketing"))issues.push("缺少自然衔接的产品方案段落");
  const ending=draft.blocks.at(-1)?.text.trim()||"";
  if(ending.length<8||/[，、：；（(｜|\/-]$/.test(ending)||/(以及|还有|包括|比如|例如|同时|并且|和|与)$/.test(ending))issues.push("结尾句不完整或疑似被截断");
  const pairs:[[string,string],[string,string]]=[["（","）"],["【","】"]];
  for(const [open,close] of pairs)if((text.split(open).length-1)!==(text.split(close).length-1))issues.push(`存在未闭合的${open}${close}`);
  return issues;
}
