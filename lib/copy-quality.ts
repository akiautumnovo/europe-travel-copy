import type { Draft, DraftBlock } from "./ai/types";
import { blocksToText } from "./content";

const visualPattern=/\p{Extended_Pictographic}|[✅【】]/gu;

/** 字数建议区间：覆盖用户给的短句示例（207-267 非空白字符）。偏离只会提示，不拦截生成。 */
export const LENGTH_ADVISED:[number,number]=[200,340];
/**
 * 触发「再修一次」的字数区间：只决定是否多跑一次修复，**绝不拦截生成**。
 * 策略：字数不再作为失败条件——模型无法可靠数中文字符，硬拦截会把可用文案直接判死。
 */
export const LENGTH_REPAIR:[number,number]=[180,430];
/** Emoji/视觉符号的建议区间（只提示）与硬性区间（才拦截）。示例用量 6-11，主要做行首标记。 */
export const SYMBOL_ADVISED:[number,number]=[6,14];
export const SYMBOL_HARD:[number,number]=[5,16];
/** 自动补足的目标数量：模型写得偏少时补到这里。 */
export const SYMBOL_TARGET=10;

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
 * 字数明显偏离时，把**实测字数**反馈给模型再修一次（只触发修复，不拦截）。
 * 模型对中文字符数不敏感，给出「当前多少字、要压到多少」比只给区间有效得多。
 */
export function lengthRepairHints(draft:Draft):string[]{
  const length=blocksToText(draft.blocks).replace(/\s/g,"").length,[repairMin,repairMax]=LENGTH_REPAIR,[advisedMin,advisedMax]=LENGTH_ADVISED;
  if(length>repairMax)return[`全文约${length}字，偏长，请精简到${advisedMin}-${advisedMax}字：删掉次要描述与重复表达，只保留必要信息点`];
  if(length<repairMin)return[`全文约${length}字，偏短，请补充到${advisedMin}-${advisedMax}字`];
  return[];
}

/**
 * 数据类内容（价格、日期、天数、住宿、航班、名额、签证、退改…）。
 * 按当前策略，这类内容不再由系统判定对错，改为在生成页展示「已锁定产品事实」，由用户对照自行核对。
 */
const dataClaimPattern=/价格|费用|团费|报价|单价|房差|差额|金额|日期|出发|班期|天数|住宿|酒店|星级|航班|航线|名额|席位|余位|签证|保险|退改|退款|欧元|人民币|瑞郎|元|[¥￥€$]/;

/** Emoji 数量偏离建议区间时的提醒，只提示不拦截。 */
export function symbolWarnings(draft:Draft):string[]{
  const count=(blocksToText(draft.blocks).match(visualPattern)||[]).length,[advisedMin,advisedMax]=SYMBOL_ADVISED;
  if(count<advisedMin)return[`全文只有 ${count} 个 Emoji 或视觉符号，少于建议的 ${advisedMin}-${advisedMax} 个，可适当增加，让段落更有节奏。`];
  if(count>advisedMax)return[`全文有 ${count} 个 Emoji 或视觉符号，多于建议的 ${advisedMin}-${advisedMax} 个，可适当减少。`];
  return[];
}

/**
 * 从知识段落到产品段落的衔接线索：命中其一即视为已有过渡。
 * 判据刻意宽松——漏判只是少做一次自动修复，误判却会白跑一次改稿。
 */
const transitionCuePattern=/如果|想|不妨|也可以|所以|因此|于是|那么|回到|说到|顺着|看完|了解|亲眼|亲身|体验|实际|具体|落地|安排|这就是|这也是|跟着走|走进|落点/;

/**
 * 产品段与前面知识段的衔接是否过于生硬。
 * 只用于触发那一次自动修复，绝不参与拦截——用户策略是尽量不拦。
 */
export function transitionIssues(draft:Draft):string[]{
  const productIndex=draft.blocks.findIndex(isProductFactBlock);
  if(productIndex<1)return[];
  const clean=(value:string)=>value.replace(/\s+/g,"");
  const head=clean(draft.blocks[productIndex].text).slice(0,48);
  const tail=clean(draft.blocks[productIndex-1].text).slice(-30);
  if(transitionCuePattern.test(head)||transitionCuePattern.test(tail))return[];
  return["产品段开头的衔接偏直接，建议先用一句话把上文知识接到产品上（例如先回应上文留下的疑问，再说到怎么亲眼看到、亲身走一遍），下一句再引出产品事实。"];
}

/**
 * 版式偏好提示：产品段出现过早或缺失。
 * 只触发那一次自动修复并在页面上提示，**不拦截**——结构偏好不值得把可用文案判死（用户策略：尽量不拦）。
 */
export function structureHints(draft:Draft):string[]{
  const productIndex=draft.blocks.findIndex(isProductFactBlock);
  if(productIndex<0)return["缺少产品方案段落，请在引子之后补上简短的住/行/门票/价格等短句"];
  if(productIndex<2)return["产品内容出现过早（第3段之前），请先写2-3行简短引子再自然引出产品"];
  return[];
}

/** 只保留常识类核验问题；数据类问题不阻断生成，避免把可用文案判死。 */
export function commonSenseFactIssues(issues:string[]):string[]{
  return issues.filter(issue=>!dataClaimPattern.test(issue));
}

/**
 * 不宜出现在朋友圈文案里的「条款与附加费用」：保险与保费、退改/取消规则与金额、
 * 签证费、小费/自费/押金、行李与税费等。这类内容属行政条款，写进朋友圈会拉低观感。
 */
const unfitProductPattern=/保险|保费|保额|投保|退改|退款|退费|退票|退订|违约|取消(?:规则|政策|条款|说明|限制|费用|金额)|可取消|签证费|小费|自费|押金|超重|行李费|税费|机场税|燃油附加|单房差|房差|差价|补差|差额|加价/;
/**
 * 引子/知识段的窄判据：必须带「费/金额/规则」等字样才判——
 * 人文知识里正常出现「保险」「退改」这类词（如威尼斯的海上保险史）不应误伤。
 */
const unfitAdvicePattern=/保险(?:费|费用|金额|保额)|保费|保额|投保金额|退改|退款|退费|取消(?:规则|政策|条款|说明|限制|费用|金额)|签证费|小费|押金|行李费|超重|税费/;

/** 逐行扫描全篇，返回命中的条款/附加费用片段（用于触发一次修复并在页面上提示）。 */
export function unfitInfoHits(draft:Draft):string[]{
  const hits:string[]=[];
  for(const block of draft.blocks){
    const pattern=isProductFactBlock(block)?unfitProductPattern:unfitAdvicePattern;
    for(const raw of block.text.split("\n")){
      const line=raw.replace(/^[^\p{L}\p{N}]+/u,"").trim();
      if(line&&pattern.test(line))hits.push(line.slice(0,44));
    }
  }
  return[...new Set(hits)];
}

/** 条款/附加费用信息的提醒：只提示，不拦截。 */
export function unfitInfoWarnings(draft:Draft):string[]{
  const hits=unfitInfoHits(draft);
  return hits.length?[`文案里出现「${hits.join("」「")}」这类条款或附加费用信息（保险、退改、签证费、小费等），不太适合朋友圈展示，建议删去或换成更轻的表述。`]:[];
}

/** 发布前的人工复查提醒：事实来源、字数、Emoji 数量与不宜展示的信息，均为提示、不拦截。 */
export function reviewWarnings(draft:Draft):string[]{
  return[...lengthWarnings(draft),...symbolWarnings(draft),...manualReviewWarnings(draft),...unfitInfoWarnings(draft)];
}

/** 分散补足或移除装饰符号，不改正文；锁定段落可排除在自动整理之外。 */
export function normalizeVisualSymbols(draft:Draft,protectedIds:string[]=[],min=SYMBOL_HARD[0],max=SYMBOL_HARD[1]):Draft{
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
  // 补足：第一轮在段首加前缀（每段最多一个），第二轮在段末追加（比连续前缀自然）。
  // 段末一轮跳过最后一段，避免遮住“结尾句完整”的判定。每段最多承担 2 个，故目标不超过 2n-1。
  const target=Math.max(min,Math.min(SYMBOL_TARGET,blocks.length*2-1));
  const prefixes=["✨ ","🌍 ","📍 ","🏛️ ","🌿 ","🧭 "];
  // 行首已有标记的段落不再补前缀，否则会出现「🏛️ 🏛️ 文字」这种重复标记。
  const hasLeadingSymbol=(value:string)=>/^\s*(?:\p{Extended_Pictographic}|✅|【)/u.test(value);
  for(let index=0;index<blocks.length&&count<target;index++){
    if(protectedSet.has(blocks[index].id))continue;
    if(hasLeadingSymbol(blocks[index].text))continue;
    blocks[index].text=`${prefixes[count%prefixes.length]}${blocks[index].text}`;
    count+=1;
  }
  const suffixes=["✨","🌿","🧭","📍","🏔️","🌍"];
  // 行尾已有符号的段落也不再追加，避免两个符号连在一起。
  const hasTrailingSymbol=(value:string)=>/(?:\p{Extended_Pictographic}|✅)\s*$/u.test(value);
  for(let index=blocks.length-2;index>=0&&count<target;index--){
    if(protectedSet.has(blocks[index].id))continue;
    if(hasTrailingSymbol(blocks[index].text))continue;
    blocks[index].text=`${blocks[index].text}${suffixes[count%suffixes.length]}`;
    count+=1;
  }
  // 移除行首符号后可能留下悬空空格（"🌇 文案" → " 文案"），统一清掉每行行首空白。
  for(const block of blocks)block.text=block.text.replace(/^[ \t]+/gm,"");
  return{blocks};
}

export function copyQualityIssues(draft:Draft){
  const issues:string[]=[];
  const text=blocksToText(draft.blocks);
  const visualCount=(text.match(visualPattern)||[]).length;
  // 字数**不再拦截**：偏离建议区间只由 lengthRepairHints 触发一次修复、最终 lengthWarnings 提示。
  // （用户反馈连续出现「字数超限导致生成失败」——模型数不准中文字符，硬拦截误杀率太高。）
  // Emoji 上限放宽到 14：先用 normalizeVisualSymbols 自动整理，这里只在极端情况下兜底。
  const [symbolMin,symbolMax]=SYMBOL_HARD;
  if(visualCount<symbolMin||visualCount>symbolMax)issues.push(`Emoji或视觉符号应为${symbolMin}-${symbolMax}个，当前约${visualCount}个（建议${SYMBOL_ADVISED[0]}-${SYMBOL_ADVISED[1]}个）`);
  // 短句分行风格下，模型可能一段一行，段数上限相应放宽。
  if(draft.blocks.length<4||draft.blocks.length>14)issues.push("全文应分为4-14个段落");
  // 「产品段出现过早/缺失」属版式偏好，只触发一次修复并在页面上提示，不再拦截（见 structureHints）。
  const ending=draft.blocks.at(-1)?.text.trim()||"";
  if(ending.length<8||/[，、：；（(｜|\/-]$/.test(ending)||/(以及|还有|包括|比如|例如|同时|并且|和|与)$/.test(ending))issues.push("结尾句不完整或疑似被截断");
  const pairs:[[string,string],[string,string]]=[["（","）"],["【","】"]];
  for(const [open,close] of pairs)if((text.split(open).length-1)!==(text.split(close).length-1))issues.push(`存在未闭合的${open}${close}`);
  return issues;
}
