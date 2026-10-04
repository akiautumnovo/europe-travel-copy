/**
 * 启动前把配置载入 process.env。
 *
 * 用法：`node --import ./scripts/load-env.mjs ...`（见 package.json 的 serve 脚本）
 * 预加载时机在 Next 启动之前，保证首个请求就能读到配置。
 *
 * 载入顺序（先载入的优先，已存在的值不会被覆盖）：
 *   1. `.dev.vars`       —— 本地开发用（沿用原有 wrangler 的 KEY=value 格式，已被 git 忽略）
 *   2. `.env.production` —— 线上密钥（已被 .gitignore 的 `.env*` 覆盖，不会误提交）
 *   3. `config/app.env`  —— 非密钥的线上开关，随源码一起发布
 *
 * 这样本地改 .dev.vars 就能调试，线上由 config/app.env + .env.production 提供配置，互不干扰。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCES = [".dev.vars", ".env.production", "config/app.env"];

function parseValue(raw) {
  const value = raw.trim();
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
  return quoted ? value.slice(1, -1) : value;
}

let loaded = 0;
const touched = [];

for (const relative of SOURCES) {
  const filePath = join(process.cwd(), relative);
  if (!existsSync(filePath)) continue;
  let count = 0;
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = parseValue(line.slice(separator + 1));
    count += 1;
  }
  loaded += count;
  touched.push(`${relative}(${count})`);
}

if (process.env.APP_ENV_DEBUG === "1") {
  console.log(`[load-env] 已载入 ${loaded} 项：${touched.join(" ") || "无配置文件"}`);
}
