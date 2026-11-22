/* Crédito de IA de cada pessoa: limite do mês, o que já gastou e o que está reservado por análises em andamento.
   Para a pessoa aparece sempre em porcentagem; os dólares ficam só no painel do admin. */
import { one } from "../db";
import type { Db } from "../db";
import { getSetting } from "../lib/settings";

export const monthKey = (d = new Date()) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 7);
/** início do mês no fuso de São Paulo */
export const monthStart = (d = new Date()) => new Date(`${monthKey(d)}-01T03:00:00Z`);

export async function creditOf(userId: string, db?: Db) {
  const cfg = await getSetting("ia");
  const r = await one<{ monthly_usd: string | null; extra_usd: string | null; extra_month: string | null; spent: string; reserved: string; runs: number }>(
    `SELECT a.monthly_usd, a.extra_usd, a.extra_month,
       (SELECT COALESCE(sum(cost_usd), 0) FROM ai_runs WHERE user_id = $1 AND charged AND created_at >= $2) AS spent,
       (SELECT COALESCE(sum(reserved_usd), 0) FROM ai_runs WHERE user_id = $1 AND charged AND status = 'rodando') AS reserved,
       (SELECT count(*) FROM ai_runs WHERE user_id = $1 AND charged AND created_at >= $2 AND status = 'feito') AS runs
     FROM (SELECT 1) x LEFT JOIN ai_user a ON a.user_id = $1`,
    [userId, monthStart()], db,
  );
  const month = monthKey();
  const limit = (r?.monthly_usd != null ? Number(r.monthly_usd) : cfg.defaultUsd) + (r?.extra_month === month ? Number(r?.extra_usd || 0) : 0);
  const spent = Number(r?.spent || 0), reserved = Number(r?.reserved || 0);
  return { limit, spent, reserved, runs: r?.runs || 0, left: Math.max(0, limit - spent - reserved) };
}

export const percentOf = (usd: number, limit: number) => (limit > 0 ? (usd / limit) * 100 : 100);

/** o gasto de todo mundo no mês: o teto geral protege contra uma conta maior que o combinado */
export async function globalSpent() {
  const r = await one<{ spent: string }>("SELECT COALESCE(sum(cost_usd), 0) + COALESCE(sum(reserved_usd) FILTER (WHERE status = 'rodando'), 0) AS spent FROM ai_runs WHERE created_at >= $1 AND billing = 'api'", [monthStart()]);
  return Number(r?.spent || 0);
}
