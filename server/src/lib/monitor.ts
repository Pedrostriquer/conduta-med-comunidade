/* Saúde do servidor: conta as requisições em memória e grava uma linha por minuto com CPU e memória. Erros de verdade
   (o que virou 500) ficam em server_errors, com a pilha, para ver no painel sem abrir terminal. */
import { freemem, loadavg, totalmem } from "node:os";
import type { Context, MiddlewareHandler } from "hono";
import { pool } from "../db";
import type { AppEnv } from "../http";

const SLOW_MS = 1500, BUSY_PER_MINUTE = 60;
type Bucket = { requests: number; errors: number; slow: number; msTotal: number; msMax: number; mcp: number; users: Map<string, number> };
const empty = (): Bucket => ({ requests: 0, errors: 0, slow: 0, msTotal: 0, msMax: 0, mcp: 0, users: new Map() });
let cur = empty();
let lastCpu = process.cpuUsage(), lastAt = Date.now();

export const monitor: MiddlewareHandler<AppEnv> = async (c, next) => {
  const t = performance.now();
  await next();
  const ms = Math.round(performance.now() - t), b = cur;
  b.requests++;
  b.msTotal += ms;
  if (ms > b.msMax) b.msMax = ms;
  if (ms > SLOW_MS) b.slow++;
  if (c.res.status >= 500) b.errors++;
  if (c.req.path.startsWith("/mcp")) b.mcp++;
  const id = c.get("user")?.id;
  if (id) b.users.set(id, (b.users.get(id) || 0) + 1);
};

export function sample() {
  const now = Date.now(), used = process.cpuUsage(lastCpu), wall = Math.max(1, now - lastAt);
  lastCpu = process.cpuUsage(); lastAt = now;
  return {
    cpuPct: Math.round(((used.user + used.system) / 1000 / wall) * 1000) / 10,
    rssMb: Math.round(process.memoryUsage().rss / 1048576),
    memPct: Math.round((1 - freemem() / totalmem()) * 1000) / 10,
    load1: Math.round(loadavg()[0] * 100) / 100,
  };
}

export async function flushMinute() {
  const b = cur; cur = empty();
  const s = sample();
  const minute = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  await pool.query(
    `INSERT INTO server_minutes (minute, requests, errors, slow, ms_total, ms_max, mcp, cpu_pct, rss_mb, mem_pct, load1)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (minute) DO UPDATE SET requests = server_minutes.requests + $2, errors = server_minutes.errors + $3, slow = server_minutes.slow + $4,
       ms_total = server_minutes.ms_total + $5, ms_max = greatest(server_minutes.ms_max, $6), mcp = server_minutes.mcp + $7, cpu_pct = $8, rss_mb = $9, mem_pct = $10, load1 = $11`,
    [minute, b.requests, b.errors, b.slow, b.msTotal, b.msMax, b.mcp, s.cpuPct, s.rssMb, s.memPct, s.load1],
  );
  for (const [id, n] of b.users) {
    if (n < BUSY_PER_MINUTE) continue;
    await pool.query("INSERT INTO server_busy (minute, user_id, requests) VALUES ($1, $2, $3) ON CONFLICT (minute, user_id) DO UPDATE SET requests = server_busy.requests + $3", [minute, id, n]);
  }
}

export function startMonitor() {
  setInterval(() => { flushMinute().catch((e) => console.error("monitor:", e.message)); }, 60_000).unref();
}

export function recordError(e: unknown, c?: Context<AppEnv>) {
  const err = e instanceof Error ? e : new Error(String(e));
  pool.query("INSERT INTO server_errors (method, path, message, stack, user_id) VALUES ($1, $2, $3, $4, $5)", [
    c?.req.method ?? "", c?.req.path.slice(0, 200) ?? "(fora de requisição)", err.message.slice(0, 1000), err.stack?.slice(0, 4000) ?? null, c?.get("user")?.id ?? null,
  ]).catch(() => { /* o banco é justamente o que pode estar fora; o erro já foi para o log */ });
}
