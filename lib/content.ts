import type { DraftBlock, LockedFact } from "./ai/types";

export function parseJson<T>(value: unknown, fallback: T): T { try { return typeof value === "string" ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
export function blocksToText(blocks: DraftBlock[]) { return blocks.map(b=>b.text).join("\n\n"); }
export function normalizeFacts(value: unknown): LockedFact[] { const facts=parseJson<unknown[]>(value,[]);return facts.filter((f):f is LockedFact=>Boolean(f&&typeof f==="object"&&typeof (f as LockedFact).field==="string"&&typeof (f as LockedFact).value==="string")); }
export function preserveLocked(previous:DraftBlock[],next:DraftBlock[],lockedIds:string[],targetId?:string){
  if(previous.length!==next.length)throw new Error("AI 改变了段落结构，请重试");
  return previous.map((block,index)=>{const proposed=next.find(x=>x.id===block.id)||next[index];const mustKeep=lockedIds.includes(block.id)||(targetId?block.id!==targetId:false);return mustKeep?block:{...proposed,id:block.id}});
}

