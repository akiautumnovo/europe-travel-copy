import { z } from "zod";
import { productInspiration } from "../../../../lib/product-inspiration-store";
import { knowledgeInspiration } from "../../../../lib/knowledge-inspiration-store";
import { json,requireApiUser } from "../../_shared";

const schema=z.union([z.object({mode:z.literal("knowledge"),country:z.string().min(2).default("random")}),z.object({productId:z.string().min(1)})]);
export async function POST(request:Request){
 const user=await requireApiUser(request);if(user instanceof Response)return user;
 try{const input=schema.parse(await request.json());return json("mode" in input?await knowledgeInspiration(user.userId,input.country,true):await productInspiration(user.userId,input.productId,true))}catch(error){return json({error:error instanceof Error?error.message:"今日灵感刷新失败"},{status:422})}
}
