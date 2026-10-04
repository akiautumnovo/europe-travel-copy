# 正式版部署与维护

线上地址：**https://travel-copy-assistant.app.workbuddy.host/**

这份文档说明：怎么改代码、怎么发布、数据放在哪、出问题怎么查。
（本文档写于从「Cloudflare Worker 本地测试版」迁移到「Node 正式版」之后。）

---

## 1. 日常改动流程

```bash
# 1) 本地开发（热更新，端口 5180）
npm run preview:web

# 2) 改完先本地自测
npm run build:web             # 构建正式产物（约 90 秒）
npm run clean:web-cache       # 清掉上线用不到的缓存/开发产物（重要，见下）
PORT=5180 npm run serve       # 用正式模式起一遍，确认没问题
node scripts/smoke-test.mjs   # 跑端到端验证

# 3) 发布
#    在对话里说一句「发布一下」/「同步到线上」，由助手调用发布工具完成
```

**两个必须记住的点：**

1. **发布的是构建产物，不是源码。** 改动 `app/` 下的代码后必须先 `npm run build:web` 再发布，
   否则线上跑的仍是旧产物。
2. **发布前先 `npm run clean:web-cache`。** 本地跑过 `npm run serve`（运行时缓存）或
   `npm run preview:web`（开发产物）之后，`webapp/` 会从 ~18MB 涨到 ~73MB，
   上传会因为超时而失败（报错是含糊的 `fetch failed`，很容易误判成网络问题）。

## 2. 线上验证

```bash
# 对线上跑完整链路（会创建测试数据，结束时自动清理产品与内容）
BASE_URL=https://travel-copy-assistant.app.workbuddy.host node scripts/smoke-test.mjs
```

覆盖：邮箱门禁 → 建产品 → AI 解析 → 批量确认事实 → 三方向生成 → 改稿 → 采用 →
故事板 → 图库搜索 → 事实核验 → 灵感刷新 → 素材上传/读回/去重/删除 →
配图保存与顺序读回（朋友圈预览依赖）→ 文件夹新建/嵌套/重名拦截/移动/改名/删除（含非空确认）。

## 3. 配置在哪

| 内容 | 文件 | 是否需要重新发布 |
|---|---|---|
| 邮箱白名单、登录方式、Provider 顺序 | `config/app.env` | 需要 |
| API 密钥、门禁签名密钥 | `.env.production` | 需要 |

- `config/app.env` 会进 git；`.env.production` 被 `.gitignore` 的 `.env*` 覆盖，**不会提交**，但会随源码上传到应用沙箱。
- 两者的值都由 `scripts/load-env.mjs` 在启动时载入（顺序：`.dev.vars` → `.env.production` → `config/app.env`，先载入的优先）。本地调试改 `.dev.vars` 即可，互不影响。
- **新增可以访问的人**：把邮箱加进 `config/app.env` 的 `ALLOWED_EMAILS`（逗号分隔），然后重新发布。

## 4. 架构：为什么和原来的写法不一样

原来这套代码是给 **Cloudflare Worker** 写的，靠 `cloudflare:workers` 提供 `env`，数据用 D1、文件用 R2。
发布沙箱只给一个 HTTP 端口，没有这些绑定，所以改了运行时：

| 原来 | 现在 | 位置 |
|---|---|---|
| `import { env } from "cloudflare:workers"` | `config()` 读 `process.env` | `lib/bindings.ts` |
| D1（`env.DB`） | SQLite，接口与 D1 子集完全兼容 | `lib/db/sqlite.ts` |
| R2（`env.BUCKET`） | 本地文件存储，接口与 R2 子集兼容 | `lib/storage/local.ts` |
| vite + `@cloudflare/vite-plugin` 构建 | Next.js 原生构建 | `next.config.ts` |
| 输出 `.next/` | 输出 `webapp/` | 同上 |

**业务代码基本没动**：`db().prepare(sql).bind(...).first()/.all()/.run()` 和 `db().batch([...])`
这套接口在两个运行时完全一致，70 处调用一行没改。

构建产物目录特意叫 `webapp/` 而不是 `.next/`：`.next` / `dist` / `build` 这类构建产物**不会随源码上传**，
而沙箱启动窗口只有 60 秒，来不及现场构建，所以必须预构建并让产物跟着源码走。
`webapp/` 是可再生构建产物，保留在 `.gitignore` 中、不提交 Git；发布工具上传的是当前工作目录，
所以发布前仍必须先生成它。`npm run serve` 会核对源码指纹，构建缺失或源码改动后未重建时会直接拒绝启动，
避免把旧产物误发布。

想改回 Cloudflare Worker：只改 `lib/bindings.ts`（把 `config()`/`db()`/`bucket()` 指回 `env`），
再恢复 `vite.config.ts` 的构建链即可。

## 5. 数据在哪

```
.data/app.db        SQLite 数据库（产品、事实、内容、版本、风格、素材记录）
.data/objects/      上传的图片文件（按 <用户键>/<类型>/<id>-<文件名> 分目录）
```

- `.data/` 已加入 `.gitignore`，**不会随发布上传**。
- **重新发布不会清空线上数据**（已实测：发布前后产品列表完全保留）。
- 首次启动会自动按 `drizzle/*.sql` 顺序建表，已应用的记在 `_migrations` 表里，不会重放。
- 数据空间按邮箱隔离：白名单里每个邮箱各有一套产品/内容/素材，互相看不到。

### 备份

数据库就是一个文件，容器内取出来即可：

```bash
# 在应用沙箱内
cp .data/app.db backup-$(date +%F).db
```

目前**没有**内置的导出/导入界面。如果担心数据，建议定期让助手帮忙做一次
「导出全库 JSON + 素材打包」的备份——需要的话可以加一个备份接口。

## 6. 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 打开链接是登录页、输邮箱说不在名单 | 把邮箱加进 `config/app.env` 的 `ALLOWED_EMAILS` 再发布 |
| 改了代码但线上没变 | 忘了 `npm run build:web`，产物没更新 |
| 发布报 `fetch failed` | 八成是上传体积过大（`webapp/` 被本地预览写进了缓存）。先 `npm run clean:web-cache` 再发布 |
| 「AI 尚未配置」/ 搜索不生效 | `.env.production` 没上去或缺 key；确认 `DEEPSEEK_API_KEY` 等存在后重新发布 |
| 发布时报 "did not become reachable within 60s" | 启动命令里带了构建。`startCmd` 必须是 `npm run serve`，构建要提前在本地做好 |
| 上传图片失败 | 看返回的 `code`；`ASSET_SAVE_FAILED` 表示写存储或写库失败，日志里有具体原因 |
| 想确认线上是否健康 | 跑第 2 节的 smoke test，或直接访问 `/api/access` 看 `emailGateEnabled`/`accessMode` |

## 7. 已知限制

- **移动端**：≤700px 时底部导航为「灵感 / 产品 / 素材 / 风格 / 历史 / 账号」，点「账号」可退出登录。
- **素材文件夹最多 6 层**；删除非空文件夹时会先确认，确认后子文件夹一并删除，
  里面的图片移到「未分类」保留（不会删文件）。
- **删除素材**会同时删掉存储里的文件；如果这张图已经被某条内容的故事板用了，素材卡片上会先提示。
- **数据在沙箱文件系统内**：能用、能跨发布保留，但不是托管数据库；重要数据请定期备份。
- **门禁的安全性上限**：邮箱不是秘密，它防的是「误入」，不是「恶意冒充」。要真正防冒充需换成邮箱验证码或平台登录。
- 门禁 cookie 有效期 30 天，签名用 `ACCESS_SECRET`；**换掉这个值会让所有人需要重新登录**。
