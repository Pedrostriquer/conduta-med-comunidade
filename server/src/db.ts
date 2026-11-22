/* Banco: SQL à mão com `pg`. `q` devolve as linhas, `one` a primeira ou null, `tx` abre uma transação.
   Migrações: arquivos em migrations/ na ordem do nome, cada um uma vez. */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { env } from "./env";

// bigint e contagens viram number: os valores daqui cabem com folga
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 12, idleTimeoutMillis: 30_000 });

export type Db = { query: pg.Pool["query"] };

export async function q<T extends pg.QueryResultRow = any>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T[]> {
  return (await db.query<T>(sql, params as any[])).rows;
}
export async function one<T extends pg.QueryResultRow = any>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T | null> {
  return (await db.query<T>(sql, params as any[])).rows[0] ?? null;
}
export async function tx<T>(fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

const here = dirname(fileURLToPath(import.meta.url));
/** funciona em src/ (dev) e em dist/ (produção) */
const migrationsDir = process.env.MIGRATIONS_DIR || join(here, "..", "migrations");

export async function migrate() {
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await q<{ name: string }>("SELECT name FROM schema_migrations")).map((r) => r.name));
  for (const f of (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    const sql = await readFile(join(migrationsDir, f), "utf8");
    await tx(async (c) => {
      await c.query(sql);
      await c.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
    });
    console.log(`migração aplicada: ${f}`);
  }
}
