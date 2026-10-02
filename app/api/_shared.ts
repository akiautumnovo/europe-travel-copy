import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";

const OWNER_EMAIL = "akiautumnovo@gmail.com";

export async function requireApiUser() {
  const user = await getChatGPTUser();
  const localPreviewUser = process.env.NODE_ENV !== "production" && user?.email === "seedy@sites.test";
  if (!user || (!localPreviewUser && user.email.toLowerCase() !== OWNER_EMAIL)) throw new Response("Unauthorized", { status: 401 });
  return user;
}

export function db() {
  if (!env.DB) throw new Response("Database unavailable", { status: 503 });
  return env.DB;
}

export function bucket() {
  if (!env.BUCKET) throw new Response("Storage unavailable", { status: 503 });
  return env.BUCKET;
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}
