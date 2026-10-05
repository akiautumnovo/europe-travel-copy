import { analysisResultSchema,inputTypeSchema } from "../../../../../lib/ai/types";
import { db,json,requireApiUser } from "../../../_shared";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await requireApiUser(request);if(user instanceof Response)return user;
 const {id}=await params;
 try{
  const body=await request.json() as {type?:unknown;rawText?:unknown;analysis?:unknown};
  const type=inputTypeSchema.parse(body.type),analysis=analysisResultSchema.parse(body.analysis),rawText=typeof body.rawText==="string"?body.rawText:"";
  const exists=await db().prepare("SELECT id FROM products WHERE id=? AND user_id=?").bind(id,user.userId).first();if(!exists)return json({error:"产品不存在"},{status:404});
  await db().prepare("UPDATE products SET source_type=?,raw_content=?,ai_analysis=?,updated_at=? WHERE id=? AND user_id=?").bind(type,rawText,JSON.stringify(analysis),new Date().toISOString(),id,user.userId).run();
  return json({ok:true});
 }catch(error){return json({error:error instanceof Error?error.message:"待确认结果保存失败"},{status:422})}
}
