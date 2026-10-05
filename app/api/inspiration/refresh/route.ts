import { z } from "zod";
import { productInspiration } from "../../../../lib/product-inspiration-store";
import { json,requireApiUser } from "../../_shared";

const schema=z.object({productId:z.string().min(1)});
export async function POST(request:Request){
 const user=await requireApiUser(request);if(user instanceof Response)return user;
 try{const {productId}=schema.parse(await request.json());return json(await productInspiration(user.userId,productId,true))}catch(error){return json({error:error instanceof Error?error.message:"今日灵感刷新失败"},{status:422})}
}
