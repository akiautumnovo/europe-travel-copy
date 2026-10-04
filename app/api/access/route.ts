import { getChatGPTUser } from "../../chatgpt-auth";
import { EMAIL_PATTERN, accessCookieHeader, issueAccessToken } from "../../../lib/access";
import { accessMode, accessSecret, allowedEmails, grantedEmail, isLocalPreviewUser, json } from "../_shared";

/** 当前是否已获得访问权限，以及是通过哪种方式获得的。 */
export async function GET(request: Request) {
  const emailGateEnabled = Boolean(accessSecret());
  const gated = await grantedEmail(request);
  if (gated) return json({ granted: true, method: "email", email: gated, emailGateEnabled, accessMode: accessMode() });

  const user = await getChatGPTUser();
  if (user && isLocalPreviewUser(user)) return json({ granted: true, method: "preview", email: user.email, emailGateEnabled, accessMode: accessMode() });
  if (accessMode() === "platform" && user && allowedEmails().includes(user.email.toLowerCase())) {
    return json({ granted: true, method: "platform", email: user.email, emailGateEnabled, accessMode: accessMode() });
  }
  return json({ granted: false, method: null, emailGateEnabled, accessMode: accessMode(), signedInEmail: user?.email || null });
}

/** 校验邮箱是否在白名单内；通过则签发门禁 cookie。 */
export async function POST(request: Request) {
  const secret = accessSecret();
  if (!secret) return json({ code: "EMAIL_GATE_DISABLED", error: "邮箱门禁尚未启用（缺少 ACCESS_SECRET）。" }, { status: 503 });

  let body: { email?: string };
  try { body = await request.json() as typeof body; } catch { return json({ code: "INVALID_REQUEST", error: "请求格式无效，请重试" }, { status: 400 }); }

  const email = (body.email || "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return json({ code: "INVALID_EMAIL", error: "请输入有效的邮箱地址" }, { status: 400 });
  if (!allowedEmails().includes(email)) {
    return json({ code: "FORBIDDEN_ACCOUNT", error: `邮箱 ${email} 不在允许名单里，请换一个授权邮箱。` }, { status: 403 });
  }

  const headers = new Headers({ "content-type": "application/json" });
  headers.append("set-cookie", accessCookieHeader(await issueAccessToken(email, secret), request));
  return new Response(JSON.stringify({ granted: true, email }), { status: 200, headers });
}

/** 退出：清掉门禁 cookie（平台登录由 /signout-with-chatgpt 负责）。 */
export async function DELETE(request: Request) {
  const headers = new Headers({ "content-type": "application/json" });
  headers.append("set-cookie", accessCookieHeader("", request, 0));
  return new Response(JSON.stringify({ granted: false }), { status: 200, headers });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
