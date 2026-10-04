import { db, json, requireApiUser } from "../_shared";
export async function POST(request:Request) {
  const user = await requireApiUser(request); if (user instanceof Response) return user; const now = new Date().toISOString();
  await db().prepare("INSERT OR IGNORE INTO profiles (id,email,onboarding,settings,created_at,updated_at) VALUES (?,?, '{}','{}',?,?)").bind(user.userId,user.email,now,now).run();
  return json({ user: { email:user.email, displayName:user.displayName } });
}
