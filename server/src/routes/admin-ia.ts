/* Painel do admin: a IA. Quanto já gastou, para onde vai no fim do mês, todas as execuções, trocar de modelo, ajustar o crédito
   e rodar de novo uma análise com outro modelo para comparar. */
import { Hono } from "hono";
import { z } from "zod";
import { one, q } from "../db";
import { invalid, ms, notFound, requireAdmin } from "../http";
import type { AppEnv } from "../http";
import { getSetting, setSetting } from "../lib/settings";
import { jsonBody, uuidOr404 } from "../lib/validate";
import { monthStart } from "../ia/credit";
import { hasApiKey, ModelError, pingModel } from "../ia/model";
import { costOf, isAnalysisModel, MODELS } from "../ia/pricing";
import { rerun } from "../ia/runs";

const r = new Hono<AppEnv>();

r.get("/admin/ia", async (c) => {
  requireAdmin(c);
  const start = monthStart(), now = new Date();
  const [cfg, totals, byModel, byKind, daily, users, recent, accuracy, usersN] = await Promise.all([
    getSetting("ia"),
    one<any>("SELECT COALESCE(sum(cost_usd), 0) AS spent, count(*) AS runs, count(*) FILTER (WHERE status = 'erro') AS failed, COALESCE(sum(tokens_in), 0) AS tin, COALESCE(sum(tokens_out), 0) AS tout, avg(ms) FILTER (WHERE status = 'feito') AS avg_ms, count(DISTINCT user_id) AS people FROM ai_runs WHERE created_at >= $1", [start]),
    q<any>("SELECT model, count(*) AS runs, sum(cost_usd) AS usd, sum(tokens_in) AS tin, sum(tokens_out) AS tout FROM ai_runs WHERE created_at >= $1 GROUP BY 1 ORDER BY 3 DESC", [start]),
    q<any>("SELECT kind, trigger, count(*) AS runs, sum(cost_usd) AS usd, avg(cost_usd) AS avg_usd, avg(tokens_in) AS avg_in, avg(tokens_out) AS avg_out FROM ai_runs WHERE created_at >= $1 GROUP BY 1, 2 ORDER BY 4 DESC", [start]),
    q<any>("SELECT (created_at - interval '3 hours')::date AS day, sum(cost_usd) AS usd, count(*) AS runs FROM ai_runs WHERE created_at >= $1 GROUP BY 1 ORDER BY 1", [start]),
    q<any>(`SELECT a.user_id, u.handle, u.name, sum(a.cost_usd) AS usd, count(*) AS runs, max(a.created_at) AS last, au.monthly_usd FROM ai_runs a JOIN users u ON u.id = a.user_id LEFT JOIN ai_user au ON au.user_id = a.user_id
            WHERE a.created_at >= $1 AND a.charged GROUP BY 1, 2, 3, 7 ORDER BY 4 DESC LIMIT 30`, [start]),
    q<any>(`SELECT a.id, a.kind, a.trigger, a.status, a.model, a.effort, a.est_usd, a.est_in, a.est_out, a.tokens_in, a.tokens_out, a.cost_usd, a.ms, a.error, a.created_at, a.source, a.parent, a.prompt IS NOT NULL AS has_prompt, u.handle, u.name
            FROM ai_runs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 60`),
    one<any>("SELECT avg(tokens_in::float8 / NULLIF(est_in, 0)) AS rin, avg(tokens_out::float8 / NULLIF(est_out, 0)) AS rout, count(*) AS n FROM (SELECT * FROM ai_runs WHERE status = 'feito' AND est_in > 0 AND tokens_in > 0 ORDER BY created_at DESC LIMIT 100) x"),
    one<any>("SELECT count(*) AS n FROM users"),
  ]);
  const spent = Number(totals?.spent || 0);
  // projeção linear pelo ritmo do mês
  const y = now.getUTCFullYear(), mo = now.getUTCMonth(), daysInMonth = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const elapsed = Math.max(1 / 24, (now.getTime() - start.getTime()) / 86_400_000);
  return c.json({
    config: cfg, hasKey: await hasApiKey(),
    models: Object.entries(MODELS).filter(([id]) => isAnalysisModel(id)).map(([id, m]) => ({ id, label: m.label, in: m.in, out: m.out, typical: costOf(id, { in: 31_600, out: id.includes("haiku") ? 15_000 : 8_700 }) })),
    month: { spent, runs: Number(totals?.runs || 0), failed: Number(totals?.failed || 0), tokensIn: Number(totals?.tin || 0), tokensOut: Number(totals?.tout || 0), people: Number(totals?.people || 0), avgMs: Math.round(Number(totals?.avg_ms || 0)), projected: (spent / elapsed) * daysInMonth, daysInMonth, dayOfMonth: Math.ceil(elapsed), users: Number(usersN?.n || 0) },
    byModel: byModel.map((x) => ({ model: x.model, label: MODELS[x.model]?.label || x.model, runs: Number(x.runs), usd: Number(x.usd), tokensIn: Number(x.tin), tokensOut: Number(x.tout) })),
    byKind: byKind.map((x) => ({ kind: x.kind, trigger: x.trigger, runs: Number(x.runs), usd: Number(x.usd), avgUsd: Number(x.avg_usd), avgIn: Math.round(Number(x.avg_in)), avgOut: Math.round(Number(x.avg_out)) })),
    daily: daily.map((x) => ({ day: new Date(x.day).toISOString().slice(0, 10), usd: Number(x.usd), runs: Number(x.runs) })),
    users: users.map((x) => ({ id: x.user_id, handle: x.handle, name: x.name, usd: Number(x.usd), runs: Number(x.runs), last: ms(x.last), limit: x.monthly_usd != null ? Number(x.monthly_usd) : cfg.defaultUsd })),
    runs: recent.map((x) => ({ id: x.id, kind: x.kind, trigger: x.trigger, status: x.status, model: x.model, effort: x.effort, estUsd: Number(x.est_usd), estIn: x.est_in, estOut: x.est_out, tokensIn: x.tokens_in, tokensOut: x.tokens_out, costUsd: Number(x.cost_usd), ms: x.ms, error: x.error, createdAt: ms(x.created_at)!, title: x.source?.title || null, parent: x.parent, hasPrompt: x.has_prompt, who: x.handle ? { handle: x.handle, name: x.name } : null })),
    accuracy: { in: accuracy?.rin ?? null, out: accuracy?.rout ?? null, n: Number(accuracy?.n || 0) },
  });
});

r.put("/admin/ia/config", async (c) => {
  requireAdmin(c);
  const b = await jsonBody(c, z.object({ enabled: z.boolean().optional(), model: z.string().optional(), effort: z.enum(["low", "medium", "high"]).optional(), thinking: z.boolean().optional(), defaultUsd: z.number().min(0).max(1000).optional(), capUsd: z.number().min(0).max(100000).nullable().optional() }));
  if (b.model && !isAnalysisModel(b.model)) throw invalid("Modelo desconhecido.");
  return c.json(await setSetting("ia", b));
});

r.post("/admin/ia/testar", async (c) => {
  requireAdmin(c);
  const { model } = await getSetting("ia");
  try { const u = await pingModel(model); return c.json({ ok: true, model, usd: costOf(model, u) }); }
  catch (e) { throw invalid(e instanceof ModelError ? e.message : "Não consegui falar com a API."); }
});

r.get("/admin/ia/runs/:id", async (c) => {
  requireAdmin(c);
  const x = await one<any>(`SELECT a.*, u.handle, u.name FROM ai_runs a LEFT JOIN users u ON u.id = a.user_id WHERE a.id = $1`, [uuidOr404(c.req.param("id"))]);
  if (!x) throw notFound("Não encontramos essa execução.");
  return c.json({ id: x.id, kind: x.kind, trigger: x.trigger, status: x.status, model: x.model, effort: x.effort, source: x.source, options: x.options, estIn: x.est_in, estOut: x.est_out, estUsd: Number(x.est_usd), tokensIn: x.tokens_in, tokensOut: x.tokens_out, costUsd: Number(x.cost_usd), charged: x.charged, ms: x.ms, error: x.error, result: x.result, prompt: x.prompt, system: x.system, parent: x.parent, createdAt: ms(x.created_at)!, who: x.handle ? { handle: x.handle, name: x.name } : null });
});

r.post("/admin/ia/runs/:id/rerun", async (c) => {
  const a = requireAdmin(c);
  const b = await jsonBody(c, z.object({ model: z.string(), effort: z.enum(["low", "medium", "high"]), thinking: z.boolean().optional() }));
  return c.json({ id: await rerun(uuidOr404(c.req.param("id")), b.model, b.effort, b.thinking ?? true, a.id) });
});

export default r;
