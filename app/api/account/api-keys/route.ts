import { z } from "zod";
import { json, requireApiUser } from "../../_shared";
import { updateUserApiKeys, userApiKeyStatus } from "../../../../lib/user-api-keys";

const schema = z.object({
  deepseek: z.string().max(500).nullable().optional(),
  bocha: z.string().max(500).nullable().optional(),
  tavily: z.string().max(500).nullable().optional(),
  pixabay: z.string().max(500).nullable().optional(),
});

export async function GET(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  return json({ keys: await userApiKeyStatus(user.userId) });
}

export async function PUT(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  try {
    return json({ keys: await updateUserApiKeys(user.userId, schema.parse(await request.json())) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "密钥保存失败" }, { status: 400 });
  }
}
