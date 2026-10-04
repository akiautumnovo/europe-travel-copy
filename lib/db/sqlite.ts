import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { databaseFile, dataDir, migrationsDir } from "../paths";

/**
 * 一个与 Cloudflare D1 子集兼容的 SQLite 适配器。
 *
 * 为什么需要它：业务代码（70 处调用）用的是 D1 的
 * `db().prepare(sql).bind(...).first()/.all()/.run()` 和 `db().batch([...])` 这套接口。
 * 正式版跑在 Node 上（发布沙箱只给一个 HTTP 端口，没有 D1/R2 绑定），
 * 所以这里把同样的接口实现到 node:sqlite 上，业务代码一行都不用改。
 *
 * 想换回 Cloudflare D1：把 app/api/_shared.ts 里的 db() 指回 env.DB 即可。
 */

export type D1Value = string | number | bigint | boolean | null | undefined | Uint8Array | ArrayBuffer;
export type D1Result<T> = { results: T[]; success: true; meta: Record<string, unknown> };
export type D1ExecResult = { success: true; meta: { changes: number; last_row_id: number | string; duration: number } };

/** SQLite 只认 null / number / bigint / string / Uint8Array，其余类型在这里归一化。 */
function normalizeParams(params: D1Value[]): (null | number | bigint | string | Uint8Array)[] {
  return params.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (typeof value === "number" && !Number.isFinite(value)) return null;
    return value;
  });
}

type Row = Record<string, unknown>;

class PreparedStatement {
  constructor(private readonly db: DatabaseSync, private readonly sql: string, private readonly params: D1Value[] = []) {}

  /** D1 的 bind 既支持可变参数也支持传数组。 */
  bind(...params: (D1Value | D1Value[])[]): PreparedStatement {
    const flat = params.length === 1 && Array.isArray(params[0]) ? (params[0] as D1Value[]) : (params as D1Value[]);
    return new PreparedStatement(this.db, this.sql, flat);
  }

  async first<T = Row>(): Promise<T | null> {
    const statement = this.db.prepare(this.sql);
    // .get() 在没有结果行（以及非查询语句）时返回 undefined
    const row = statement.get(...normalizeParams(this.params));
    return (row as T | undefined) ?? null;
  }

  async all<T = Row>(): Promise<D1Result<T>> {
    const statement = this.db.prepare(this.sql);
    const rows = statement.all(...normalizeParams(this.params)) as T[];
    return { results: rows, success: true, meta: { changes: 0, rows_read: rows.length } };
  }

  async run(): Promise<D1ExecResult> {
    const statement = this.db.prepare(this.sql);
    const info = statement.run(...normalizeParams(this.params));
    return {
      success: true,
      meta: { changes: Number(info.changes ?? 0), last_row_id: Number(info.lastInsertRowid ?? 0), duration: 0 },
    };
  }
}

class D1CompatDatabase {
  constructor(private readonly db: DatabaseSync) {}

  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(this.db, sql);
  }

  /** D1 的 batch 是「按顺序执行 + 整体一个事务」。 */
  async batch(statements: PreparedStatement[]): Promise<D1ExecResult[]> {
    this.db.exec("BEGIN");
    try {
      const output: D1ExecResult[] = [];
      for (const statement of statements) output.push(await statement.run());
      this.db.exec("COMMIT");
      return output;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // 回滚本身失败时保留原始错误
      }
      throw error;
    }
  }

  async exec(sql: string): Promise<{ count: number; duration: number }> {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }
}

/** 按文件名顺序应用 drizzle 迁移，已应用过的记在 _migrations 里，重复启动不会重放。 */
function migrate(db: DatabaseSync): void {
  db.exec("CREATE TABLE IF NOT EXISTS `_migrations` (`name` text PRIMARY KEY NOT NULL, `applied_at` text NOT NULL)");
  const done = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map((row) => row.name),
  );

  const dir = migrationsDir();
  if (!existsSync(dir)) return;

  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    db.exec("BEGIN");
    try {
      // 迁移文件里的 `--> statement-breakpoint` 是 `--` 注释，SQLite 会自行忽略
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // 忽略回滚失败
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`数据库迁移 ${file} 执行失败：${reason}`);
    }
  }
}

let cached: D1CompatDatabase | null = null;

/** 首次调用时建目录、打开数据库、补齐迁移；之后复用同一个连接。 */
export function sqliteDatabase(): D1CompatDatabase {
  if (cached) return cached;
  mkdirSync(dataDir(), { recursive: true });
  const db = new DatabaseSync(databaseFile());
  // WAL 让读写不互相阻塞，busy_timeout 避免偶发并发写直接报错
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  cached = new D1CompatDatabase(db);
  return cached;
}
