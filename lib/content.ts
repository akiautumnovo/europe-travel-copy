import type { DraftBlock, LockedFact } from "./ai/types";

export function parseJson<T>(value: unknown, fallback: T): T { try { return typeof value === "string" ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
export function blocksToText(blocks: DraftBlock[]) { return blocks.map(b=>b.text).join("\n\n"); }

/** 并发保存同一内容版本时，数据库唯一约束会把后到请求转成可重试的 409。 */
export function isVersionConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:UNIQUE constraint failed|unique constraint|SQLITE_CONSTRAINT)/i.test(message)
    && /content_versions|content_id|version_no/i.test(message);
}
/**
 * 解析锁定事实。
 * 必须防御非数组：`products.facts` 的默认值是 `'{}'`（对象），
 * 直接对它调用 `.filter` 会抛 TypeError，把整个列表接口打成 500。
 */
export function normalizeFacts(value: unknown): LockedFact[] {
  const facts = parseJson<unknown>(value, []);
  if (!Array.isArray(facts)) return [];
  return facts.filter((f):f is LockedFact=>Boolean(f&&typeof f==="object"&&typeof (f as LockedFact).field==="string"&&typeof (f as LockedFact).value==="string"));
}
/**
 * 合并 AI 的改写结果：锁定段落逐字保留，其余段落按 id（退化时按位置）替换。
 * 段落数量不一致不再直接报错——AI 合并或追加段落很常见，硬失败会让整次修改白等。
 */
export function preserveLocked(previous:DraftBlock[],next:DraftBlock[],lockedIds:string[],targetId?:string){
  const byId=new Map(next.map(block=>[block.id,block]));
  const consumed=new Set<number>();
  const mustKeep=(block:DraftBlock)=>lockedIds.includes(block.id)||(targetId?block.id!==targetId:false);
  const blocks=previous.map(block=>{
    if(mustKeep(block))return block;
    const matched=byId.get(block.id);
    // 已用过的段落不能再次匹配，否则会凭空重复一整段。
    const picked=matched&&!consumed.has(next.indexOf(matched))?matched:next.find((_,index)=>!consumed.has(index));
    if(picked)consumed.add(next.indexOf(picked));
    return picked?{...picked,id:block.id}:block;
  });
  // 只有“全文修改”才接受 AI 追加的段落，避免“只改这段”意外改变结构。
  if(!targetId)for(const [index,block] of next.entries()){
    if(consumed.has(index)||previous.some(item=>item.id===block.id)||!block.text.trim())continue;
    blocks.push({...block,id:crypto.randomUUID()});
  }
  return blocks;
}

