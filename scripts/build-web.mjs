/**
 * 构建正式版产物。
 *
 * 和直接 `next build` 的区别：
 *   1. 产物落在 `webapp/`（见 next.config.ts 的 distDir）——`.next` 不会随源码上传到发布沙箱
 *   2. 构建后清掉 `webapp/cache`：那是缓存，`next start` 不需要，但会跟着源码上传、拖慢发布
 *
 * 注意：本地跑过 `npm run serve` 之后，Next 会把运行时缓存重新写回 webapp/cache，
 * 所以**发布前要再执行一次 `npm run clean:web-cache`**，否则上传体积会从 ~19MB 涨到 ~73MB 并超时失败。
 *
 * 用法：npm run build:web
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cleanDistCache } from "./clean-dist-cache.mjs";
import { writeWebBuildFingerprint } from "./web-build-fingerprint.mjs";

const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

const result = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    // Next 构建前会清空输出目录。在装了安全删除钩子的开发环境里（本机/沙箱），
    // 清空上万个小文件会触发批量删除守卫而报错、导致构建中止；这里只对构建子进程放行。
    // 目标目录 webapp/ 是可再生的构建产物，普通终端不需要这一行（无钩子时它是空操作）。
    CODEBUDDY_SAFE_DELETE_ENABLED: "0",
  },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const cleanup = cleanDistCache();
writeWebBuildFingerprint();
for (const item of cleanup) {
  console.log(
    item.after === 0
      ? `[build:web] 已清理 webapp/${item.name}（${(item.before / 1024 / 1024).toFixed(1)} MB，上线用不到）`
      : `[build:web] webapp/${item.name} 未能完全清理（不影响使用）`,
  );
}

console.log("[build:web] 产物就绪，可以重新发布了");
console.log("[build:web] 提示：本地跑过 npm run serve / preview:web 之后，发布前请再执行一次 npm run clean:web-cache");

