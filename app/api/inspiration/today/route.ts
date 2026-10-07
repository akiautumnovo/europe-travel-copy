import { productInspiration } from "../../../../lib/product-inspiration-store";
import { knowledgeInspiration } from "../../../../lib/knowledge-inspiration-store";
import { json,requireApiUser } from "../../_shared";

export async function GET(request:Request){
 const user=await requireApiUser(request);if(user instanceof Response)return user;
 const url=new URL(request.url),mode=url.searchParams.get("mode");
 if(mode==="knowledge")try{return json(await knowledgeInspiration(user.userId,url.searchParams.get("country")||"random",false))}catch(error){return json({error:error instanceof Error?error.message:"今日灵感生成失败"},{status:422})}
 const productId=url.searchParams.get("productId")?.trim();
 if(!productId)return json({error:"请先选择产品"},{status:400});
 try{return json(await productInspiration(user.userId,productId,false))}catch(error){return json({error:error instanceof Error?error.message:"今日灵感生成失败"},{status:422})}
}
