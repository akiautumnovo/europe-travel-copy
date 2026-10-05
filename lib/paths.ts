import { cpSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * 运行期数据目录：数据库文件和上传的图片都放在这里。
 *
 * 本地开发使用项目内的 `.data/`。正式环境默认使用用户主目录下的独立目录，
 * 避免发布系统替换应用目录时把 SQLite 和上传素材一起删掉。
 * 需要指定挂载盘时可设置绝对路径 `DATA_DIR`。
 */
let preparedDataDir:string|undefined;
export function dataDir(): string {
  if(preparedDataDir)return preparedDataDir;
  const legacy=join(process.cwd(),".data");
  const configured=process.env.DATA_DIR?.trim();
  const target=configured?resolve(configured):process.env.NODE_ENV==="production"?join(homedir(),".europe-travel-copy-data"):legacy;
  mkdirSync(target,{recursive:true});

  // 第一次使用新版时把当前发布目录里的旧数据搬到持久目录；已有持久库绝不覆盖。
  const legacyDatabase=join(legacy,"app.db"),targetDatabase=join(target,"app.db");
  if(target!==legacy&&!existsSync(targetDatabase)&&existsSync(legacyDatabase)){
    cpSync(legacy,target,{recursive:true,force:false,errorOnExist:false});
  }
  preparedDataDir=target;
  return target;
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
