import { config, db } from "./bindings";
import { parseJson } from "./content";

export type UserApiKeys = { deepseek: string; bocha: string; tavily: string; pixabay: string };
export type UserApiKeyName = keyof UserApiKeys;
const NAMES: UserApiKeyName[] = ["deepseek", "bocha", "tavily", "pixabay"];
type Sealed = { v: 1; iv: string; data: string };

const bytesToBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const base64ToBytes = (value: string) => new Uint8Array(Buffer.from(value, "base64"));

async function encryptionKey(userId: string) {
  const secret = config().ACCESS_SECRET;
  if (!secret) throw new Error("账号密钥加密服务尚未配置");
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:api-keys:${userId}`));
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function seal(userId: string, value: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(userId), new TextEncoder().encode(value));
  return { v: 1, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) };
}

async function unseal(userId: string, value: Sealed): Promise<string> {
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(value.iv) }, await encryptionKey(userId), base64ToBytes(value.data));
  return new TextDecoder().decode(decrypted);
}

async function readSettings(userId: string) {
  const row = await db().prepare("SELECT settings FROM profiles WHERE id=?").bind(userId).first<{ settings: string }>();
  return parseJson<Record<string, unknown>>(row?.settings || "{}", {});
}

export async function getUserApiKeys(userId: string): Promise<Partial<UserApiKeys>> {
  const settings = await readSettings(userId);
  const encrypted = parseJson<Partial<Record<UserApiKeyName, Sealed>>>(JSON.stringify(settings.apiCredentials || {}), {});
  const result: Partial<UserApiKeys> = {};
  await Promise.all(NAMES.map(async (name) => {
    const value = encrypted[name];
    if (!value?.iv || !value?.data) return;
    try { result[name] = await unseal(userId, value); } catch { /* 损坏或旧密钥不再使用 */ }
  }));
  return result;
}

export async function userApiKeyStatus(userId: string) {
  const keys = await getUserApiKeys(userId);
  return Object.fromEntries(NAMES.map((name) => [name, keys[name] ? { configured: true, last4: keys[name]!.slice(-4) } : { configured: false, last4: "" }])) as Record<UserApiKeyName, { configured: boolean; last4: string }>;
}

export async function updateUserApiKeys(userId: string, patch: Partial<Record<UserApiKeyName, string | null>>) {
  const settings = await readSettings(userId);
  const encrypted = parseJson<Partial<Record<UserApiKeyName, Sealed>>>(JSON.stringify(settings.apiCredentials || {}), {});
  for (const name of NAMES) {
    if (!(name in patch)) continue;
    const value = patch[name]?.trim();
    if (!value) delete encrypted[name];
    else encrypted[name] = await seal(userId, value);
  }
  settings.apiCredentials = encrypted;
  await db().prepare("UPDATE profiles SET settings=?,updated_at=? WHERE id=?").bind(JSON.stringify(settings), new Date().toISOString(), userId).run();
  return userApiKeyStatus(userId);
}

