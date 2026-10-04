import type { ChatGPTUser } from "../chatgpt-auth";
import { getChatGPTUser } from "../chatgpt-auth";
import { config } from "../../lib/bindings";
import { ACCESS_COOKIE, emailUserId, readAccessEmail, readCookie } from "../../lib/access";

// db() / bucket() 的实现已收敛到 lib/bindings（Node 上走 SQLite 与本地文件，见该文件注释）。
export { bucket, db } from "../../lib/bindings";

/**
 * 邮箱白名单：只有名单内的账号能读写数据。
 * 用 `ALLOWED_EMAILS`（逗号分隔）配置，未配置时回落到默认邮箱。
 */
const DEFAULT_ALLOWED_EMAILS = ["akiautumnovo@gmail.com"];
const DEFAULT_PREVIEW_EMAIL = "seedy@sites.test";

// 注意：配置每请求读取一次，不要在模块顶层求值（部署后改环境变量无需重新构建）。
function runtimeConfig(): Record<string, string | undefined> {
  return config();
}

export function allowedEmails(): string[] {
  const configured = (runtimeConfig().ALLOWED_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ALLOWED_EMAILS;
}

/** 邮箱门禁的签名密钥；未配置时门禁功能关闭，只走平台登录。 */
export function accessSecret(): string {
  return runtimeConfig().ACCESS_SECRET || "";
}

/**
 * platform：平台登录的邮箱在白名单里就直接放行（默认，保持原有行为）。
 * email：一律要求输入白名单邮箱（把邮箱门禁当成登录方式）。
 */
export function accessMode(): "platform" | "email" {
  return runtimeConfig().ACCESS_MODE === "email" ? "email" : "platform";
}

export function isLocalPreviewUser(user: ChatGPTUser): boolean {
  const previewEmail = runtimeConfig().SITES_MOCK_USER_EMAIL || DEFAULT_PREVIEW_EMAIL;
  return process.env.NODE_ENV !== "production" && user.email === previewEmail;
}

/** 门禁 cookie 是否有效（仅回答"是否持有已签名的白名单邮箱"）。 */
export async function grantedEmail(request: Request): Promise<string | null> {
  const secret = accessSecret();
  if (!secret) return null;
  const email = await readAccessEmail(readCookie(request, ACCESS_COOKIE), secret);
  return email && allowedEmails().includes(email) ? email : null;
}

export async function requireApiUser(request: Request) {
  const allowed = allowedEmails();

  // 1. 邮箱门禁：持有效签名 cookie 且邮箱在白名单内即可通过。
  const gated = await grantedEmail(request);
  if (gated) {
    const platformUser = await getChatGPTUser();
    // 平台身份与门禁邮箱一致时沿用平台用户键，否则按邮箱隔离数据。
    if (platformUser && platformUser.email.toLowerCase() === gated) return platformUser;
    return { userId: emailUserId(gated), displayName: gated, email: gated, fullName: null } satisfies ChatGPTUser;
  }

  const user = await getChatGPTUser();
  // 2. 本地开发用模拟账号，直接放行，方便在没有真实登录的环境里调页面。
  if (user && isLocalPreviewUser(user)) return user;

  // 3. 平台身份在白名单内，且没有要求"必须过邮箱门禁"。
  if (accessMode() === "platform" && user && allowed.includes(user.email.toLowerCase())) return user;

  if (!user) return json({ code: "UNAUTHORIZED", error: "请先登录后再使用。" }, { status: 401 });
  return json({ code: "FORBIDDEN_ACCOUNT", error: `当前登录账号（${user.email}）不在允许名单里，请用授权邮箱登录后重试。` }, { status: 403 });
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}
