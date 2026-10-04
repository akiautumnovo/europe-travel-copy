/**
 * 应用内邮箱门禁。
 *
 * 通过后签发一个 HMAC 签名的 cookie，里面只有邮箱地址。它**不是**强认证：
 * 邮箱不是秘密，知道白名单邮箱的人都能通过。它的作用是"确认访问者身份并限制名单"，
 * 而不是替代密码或验证码。只有配置了 ACCESS_SECRET 时才启用。
 */

export const ACCESS_COOKIE = "lj_access";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    return atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  } catch {
    return null;
  }
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64url(new Uint8Array(signature));
}

/** 常数时间比较，避免通过响应时间推断签名。 */
function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export async function issueAccessToken(email: string, secret: string): Promise<string> {
  const payload = base64url(new TextEncoder().encode(email.trim().toLowerCase()));
  return `${payload}.${await hmac(secret, payload)}`;
}

/** 校验 token；通过时返回其中的邮箱，否则返回 null。 */
export async function readAccessEmail(token: string | undefined, secret: string): Promise<string | null> {
  if (!token || !secret) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!timingSafeEqual(await hmac(secret, payload), signature)) return null;
  const decoded = fromBase64url(payload);
  return decoded && EMAIL_PATTERN.test(decoded) ? decoded : null;
}

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return undefined;
}

export function accessCookieHeader(token: string, request: Request, maxAge = MAX_AGE_SECONDS): string {
  const secure = new URL(request.url).protocol === "https:";
  return `${ACCESS_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** 邮箱派生出的稳定用户键：没有平台身份时，用它归属数据。 */
export function emailUserId(email: string): string {
  return `email:${email.trim().toLowerCase()}`;
}
