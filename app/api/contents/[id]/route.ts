import { db,json,requireApiUser } from "../../_shared";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const user=await requireApiUser(),{id}=await params;const content=await db().prepare("SELECT id,topic_title as topicTitle,topic_meta as topicMeta,sales_intensity as salesIntensity,status,product_snapshot as productSnapshot,created_at as createdAt FROM contents WHERE id=? AND user_id=?").bind(id,user.userId).first();if(!content)return json({error:"内容不存在"},{status:404});const versions=await db().prepare("SELECT id,version_no as versionNo,strategy_type as strategyType,text_content as textContent,blocks,locked_block_ids as lockedBlockIds,change_type as changeType,change_instruction as changeInstruction,is_adopted as isAdopted,created_at as createdAt FROM content_versions WHERE content_id=? AND user_id=? ORDER BY version_no ASC").bind(id,user.userId).all();return json({content:{...content,topicMeta:JSON.parse(String(content.topicMeta||"{}"))},versions:versions.results})}

export async function DELETE(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await requireApiUser(),{id}=await params;
  const content=await db().prepare("SELECT id FROM contents WHERE id=? AND user_id=?").bind(id,user.userId).first();
  if(!content)return json({error:"内容不存在或已删除"},{status:404});
  await db().batch([
    db().prepare("DELETE FROM content_versions WHERE content_id=? AND user_id=?").bind(id,user.userId),
    db().prepare("DELETE FROM contents WHERE id=? AND user_id=?").bind(id,user.userId),
  ]);
  return json({ok:true});
}
