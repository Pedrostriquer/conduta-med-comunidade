/* A IA dentro do app, do lado da pessoa: quanto de crédito tem, quanto uma análise vai usar antes de rodar, rodar e ver o resultado.
   Os números da análise (o que mais perde pontos, as próximas questões) saem sem IA e sem crédito. */
import { Hono } from "hono";
import { z } from "zod";
import { one, q } from "../db";
import { hit, HttpError, ms, notFound, requireUser } from "../http";
import type { AppEnv } from "../http";
import { jsonBody, uuidOr404 } from "../lib/validate";
import { creditOf, monthKey, percentOf } from "../ia/credit";
import { costOf } from "../ia/pricing";
import { hasApiKey } from "../ia/model";
import { getSetting } from "../lib/settings";
import { applyPicked, blockReason, estimate, flashPack, outTokens, resultPack, RUN_COLS, startRun } from "../ia/runs";
import type { RunRow } from "../ia/runs";
import type { PickedCard, ResultOptions } from "../ia/packages";
import { startOfDay } from "../ia/packages";

const HOUR = 3_600_000;
const zResult = z.object({
  detalhe: z.enum(["leve", "padrao", "completo"]).optional(), acertos: z.boolean().optional(), dicas: z.boolean().optional(), transcricao: z.boolean().optional(),
  anterior: z.uuid().nullable().optional(),
});
const r = new Hono<AppEnv>();

async function creditView(userId: string) {
  const c = await creditOf(userId), cfg = await getSetting("ia");
  const key = await hasApiKey();
  const now = new Date(Date.now() - 3 * 3_600_000), next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    available: cfg.enabled && key, percentUsed: Math.min(100, percentOf(c.spent + c.reserved, c.limit)), percentLeft: Math.max(0, 100 - percentOf(c.spent + c.reserved, c.limit)),
    runs: c.runs, renews: next.toISOString().slice(0, 10), month: monthKey(),
  };
}

r.get("/ia/credito", async (c) => c.json(await creditView(requireUser(c).id)));

type SuggestOpt = { label: string; options: Partial<ResultOptions>; percent: number };

r.post("/ia/estimar", async (c) => {
  const u = requireUser(c);
  const b = await jsonBody(c, z.object({ sessionId: z.string().min(1).max(100), options: zResult.optional() }));
  hit(`ia-estimar:${u.id}`, 240, HOUR);
  const opts = b.options || {};
  const pack = await resultPack(u.id, b.sessionId, opts as Partial<ResultOptions>);
  const est = await estimate("resultado", pack.system.length + pack.prompt.length, pack.size);
  const cr = await creditOf(u.id);
  const percent = percentOf(est.usd, cr.limit);
  const block = await blockReason(u.id, est.usd);
  const suggestions: SuggestOpt[] = [];
  const cur = pack.options as ResultOptions;
  const tryLighter = async (label: string, change: Partial<ResultOptions>) => {
    const p = await resultPack(u.id, b.sessionId, { ...cur, ...change });
    const e = await estimate("resultado", p.system.length + p.prompt.length, p.size);
    const pc = percentOf(e.usd, cr.limit);
    if (pc < percent * 0.92) suggestions.push({ label, options: change, percent: pc });
  };
  if (cur.transcricao) await tryLighter("Sem a transcrição dos vídeos", { transcricao: false });
  if (cur.detalhe === "completo") await tryLighter("Enunciados resumidos", { detalhe: "padrao" });
  else if (cur.detalhe === "padrao") await tryLighter("Só temas e alternativas, sem enunciado", { detalhe: "leve" });
  if (cur.acertos) await tryLighter("Sem as questões certas", { acertos: false });
  return c.json({
    available: !block || block.code === "sem_credito", blocked: block, percent, percentLeft: Math.max(0, percentOf(cr.left, cr.limit)), runsLeft: est.usd > 0 ? Math.floor(cr.left / est.usd) : null,
    tokensIn: est.tokensIn, tokensOut: est.tokensOut, suggestions, numeros: pack.numeros, recomendadas: pack.recomendadas, options: pack.options, size: pack.size,
  });
});

r.post("/ia/analises", async (c) => {
  const u = requireUser(c);
  const b = await jsonBody(c, z.object({ sessionId: z.string().min(1).max(100), options: zResult.optional() }));
  hit(`ia-rodar:${u.id}`, 30, HOUR);
  const pack = await resultPack(u.id, b.sessionId, (b.options || {}) as Partial<ResultOptions>);
  return c.json(await startRun(u.id, pack, "manual"));
});

const viewRun = (x: RunRow) => ({
  id: x.id, kind: x.kind, trigger: x.trigger, status: x.status, source: x.source, options: x.options, result: x.result, error: x.status === "erro" ? "A análise não terminou e não gastou seu crédito. Tente de novo." : null,
  createdAt: ms(x.created_at)!, finishedAt: ms(x.finished_at),
});

r.get("/ia/analises", async (c) => {
  const u = requireUser(c);
  const rows = await q<RunRow>(`SELECT ${RUN_COLS.replace("result, ", "NULL::jsonb AS result, ")} FROM ai_runs WHERE user_id = $1 AND kind <> 'teste' ORDER BY created_at DESC LIMIT 60`, [u.id]);
  return c.json({ items: rows.map(viewRun) });
});

r.get("/ia/analises/:id", async (c) => {
  const u = requireUser(c);
  const row = await one<RunRow>(`SELECT ${RUN_COLS} FROM ai_runs WHERE id = $1 AND user_id = $2 AND kind <> 'teste'`, [uuidOr404(c.req.param("id")), u.id]);
  if (!row) throw notFound("Não encontramos essa análise.");
  return c.json({ item: viewRun(row) });
});

/* ---------- flashcards do dia ---------- */
const DEFAULTS = { fc_mode: "manual", fc_limit: 30, fc_filter: "erros", fc_pull: 10 };
const aiUser = async (id: string) => (await one<typeof DEFAULTS>("SELECT fc_mode, fc_limit, fc_filter, fc_pull FROM ai_user WHERE user_id = $1", [id])) || DEFAULTS;

r.get("/ia/ajustes", async (c) => {
  const u = requireUser(c), a = await aiUser(u.id), cr = await creditOf(u.id);
  const { model, effort } = await getSetting("ia");
  // uma análise de flashcards típica: cada card leva uns 310 tokens
  const per = (n: number) => percentOf(costOf(model, { in: 500 + 310 * n, out: outTokens("flashcards", n, effort) }), cr.limit);
  return c.json({ modo: a.fc_mode, limite: a.fc_limit, filtro: a.fc_filter, puxar: a.fc_pull, estimativa: { 10: per(10), 30: per(30), 60: per(60), 100: per(100) } });
});

r.put("/ia/ajustes", async (c) => {
  const u = requireUser(c);
  const b = await jsonBody(c, z.object({ modo: z.enum(["desligado", "manual", "meta"]), limite: z.number().int().min(5).max(200), filtro: z.enum(["erros", "dificeis", "todos"]), puxar: z.number().int().min(0).max(50) }));
  await q(
    `INSERT INTO ai_user (user_id, fc_mode, fc_limit, fc_filter, fc_pull) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET fc_mode = $2, fc_limit = $3, fc_filter = $4, fc_pull = $5, updated_at = now()`,
    [u.id, b.modo, b.limite, b.filtro, b.puxar],
  );
  return c.body(null, 204);
});

r.post("/ia/flashcards/estimar", async (c) => {
  const u = requireUser(c);
  hit(`ia-estimar:${u.id}`, 240, HOUR);
  const a = await aiUser(u.id);
  const pack = await flashPack(u.id, { limite: a.fc_limit, filtro: a.fc_filter as "erros" }, a.fc_pull, false);
  const est = await estimate("flashcards", pack.system.length + pack.prompt.length, pack.size);
  const cr = await creditOf(u.id);
  return c.json({ blocked: pack.size ? await blockReason(u.id, est.usd) : null, percent: percentOf(est.usd, cr.limit), percentLeft: percentOf(cr.left, cr.limit), size: pack.size, counts: pack.counts });
});

r.post("/ia/flashcards", async (c) => {
  const u = requireUser(c);
  const b = await jsonBody(c, z.object({ auto: z.boolean().optional() }));
  hit(`ia-rodar:${u.id}`, 30, HOUR);
  const a = await aiUser(u.id);
  if (b.auto) {
    if (a.fc_mode !== "meta") return c.json({ skipped: "desligado" });
    const { ms: from } = startOfDay();
    const done = await one("SELECT 1 FROM ai_runs WHERE user_id = $1 AND kind = 'flashcards' AND trigger = 'auto' AND created_at >= to_timestamp($2 / 1000.0)", [u.id, from]);
    if (done) return c.json({ skipped: "ja_rodou" });
  }
  const pack = await flashPack(u.id, { limite: a.fc_limit, filtro: a.fc_filter as "erros" }, a.fc_pull, !!b.auto);
  if (!pack.size) {
    if (b.auto) return c.json({ skipped: "sem_erros" });
    throw new HttpError("conflito", "Nenhum card com erro hoje para analisar.");
  }
  return c.json(await startRun(u.id, pack, b.auto ? "auto" : "manual"));
});

r.post("/ia/analises/:id/aplicar", async (c) => {
  const u = requireUser(c), id = uuidOr404(c.req.param("id"));
  const row = await one<{ result: { cards?: PickedCard[]; applied?: boolean } | null }>("SELECT result FROM ai_runs WHERE id = $1 AND user_id = $2 AND kind = 'flashcards' AND status = 'feito'", [id, u.id]);
  if (!row?.result) throw notFound("Não encontramos essa análise.");
  const picks = row.result.cards || [];
  if (row.result.applied) return c.json({ applied: 0 });
  const n = picks.length ? await applyPicked(u.id, id, picks) : 0;
  await q("UPDATE ai_runs SET result = jsonb_set(result, '{applied}', 'true') WHERE id = $1", [id]);
  return c.json({ applied: n });
});

export default r;
