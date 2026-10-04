import { join } from "node:path";

/**
 * 运行期数据目录：数据库文件和上传的图片都放在这里。
 *
 * 用的是项目内的 `.data/`（已加入 .gitignore，不参与发布上传），
 * 所以重新发布不会覆盖线上已有数据。需要换位置时设置 `DATA_DIR` 即可。
 */
export function dataDir(): string {
  return process.env.DATA_DIR || join(process.cwd(), ".data");
}

export function databaseFile(): string {
  return join(dataDir(), "app.db");
}

export function objectsDir(): string {
  return join(dataDir(), "objects");
}

/** drizzle 迁移目录（建表脚本随源码一起发布）。 */
export function migrationsDir(): string {
  return join(process.cwd(), "drizzle");
}
