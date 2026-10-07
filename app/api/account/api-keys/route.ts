import { z } from "zod";
import { json, requireApiUser } from "../../_shared";
import { getUserMediaProvider, updateUserApiKeys, updateUserMediaProvider, userApiKeyStatus } from "../../../../lib/user-api-keys";

const schema = z.object({
  deepseek: z.string().max(500).nullable().optional(),
  bocha: z.string().max(500).nullable().optional(),
  tavily: z.string().max(500).nullable().optional(),
  pixabay: z.string().max(500).nullable().optional(),
  unsplash: z.string().max(500).nullable().optional(),
  mediaProvider:z.enum(["pixabay","unsplash"]).optional(),
});

export async function GET(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  return json({ keys: await userApiKeyStatus(user.userId),mediaProvider:await getUserMediaProvider(user.userId) });
}

export async function PUT(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  try {
    const input=schema.parse(await request.json()),{mediaProvider,...keys}=input;
    const status=await updateUserApiKeys(user.userId,keys);
    if(mediaProvider)await updateUserMediaProvider(user.userId,mediaProvider);
    return json({keys:status,mediaProvider:await getUserMediaProvider(user.userId)});
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "密钥保存失败" }, { status: 400 });
  }
}
