/**
 * 清理 webapp/ 里「上传用不到」的产物。
 *
 * 为什么需要单独一步：构建产物要随源码上传到发布沙箱，但 distDir 里有两块只对本地有意义的大目录：
 *   - `webapp/cache`：运行时/构建缓存，`next start` 会重新写回，50MB 量级
 *   - `webapp/dev`  ：`next dev`（npm run preview:web）产生的开发产物，55MB 量级
 * 两者合计能把上传体积从 ~19MB 抬到 ~73MB，发布请求会因超时失败（表现为 fetch failed）。
 * 所以发布前清一次最稳妥。
 *
 * 用法：npm run clean:web-cache
 */
import { existsSync, readdirSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 逐个文件删除再删空目录。
 * 有些环境把「删除目录」重定向到回收站并可能失败，逐文件删更可靠。
 */
function purge(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const target = join(dir, entry.name);
    if (entry.isDirectory()) {
      purge(target);
      try {
        rmdirSync(target);
      } catch {
        // 目录非空或受限，留着即可
      }
    } else {
      try {
        unlinkSync(target);
      } catch {
        // 单个文件删不掉不影响后续
      }
    }
  }
}

function directorySize(dir) {
  let total = 0;
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const target = join(current, entry.name);
      if (entry.isDirectory()) walk(target);
      else {
        try {
          total += statSync(target).size;
        } catch {
          // 忽略读不到的文件
        }
      }
    }
  };
  walk(dir);
  return total;
}

/** 清理 webapp 下只对本地有意义的目录，返回各项清理前后的字节数。 */
export function cleanDistCache() {
  const distDir = fileURLToPath(new URL("../webapp", import.meta.url));
  const report = [];
  for (const name of ["cache", "dev"]) {
    const target = join(distDir, name);
    if (!existsSync(target)) continue;
    const before = directorySize(target);
    purge(target);
    try {
      rmdirSync(target);
    } catch {
      // 忽略
    }
    const after = existsSync(target) ? directorySize(target) : 0;
    report.push({ name, before, after });
  }
  return report;
}

// 直接执行时打印结果
if (process.argv[1] && process.argv[1].endsWith("clean-dist-cache.mjs")) {
  const report = cleanDistCache();
  if (!report.length) console.log("[clean:web-cache] webapp 里没有需要清理的缓存，无需处理");
  for (const item of report) {
    console.log(
      `[clean:web-cache] webapp/${item.name}：清理 ${(item.before / 1024 / 1024).toFixed(1)} MB（残留 ${(item.after / 1024 / 1024).toFixed(1)} MB）`,
    );
  }
}
