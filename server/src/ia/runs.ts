/* Uma análise, do orçamento ao resultado: estima antes (sem gastar nada), reserva o crédito, chama o modelo em segundo plano
   e guarda tudo. Erro de execução não cobra a pessoa; o gasto real continua contando no total do mês. */
import { bank } from "../bank";
import { one, q, tx } from "../db";
import { HttpError, notFound } from "../http";
import { applyChanges } from "../records";
import { getSetting } from "../lib/settings";
import { recordError } from "../lib/monitor";
import { creditOf, globalSpent, percentOf } from "./credit";
import { callModel, hasApiKey, ModelError } from "./model";
import { buildFlashPackage, buildResultPackage, DEFAULT_RESULT, pickCards } from "./packages";
import type { FlashOptions, PickedCard, ResultOptions } from "./packages";
import { costOf, isAnalysisModel, tokensOf } from "./pricing";
import { FLASH_JSON, FLASH_SYSTEM, FlashOut, RESULT_JSON, RESULT_SYSTEM, ResultOut } from "./prompts";

/** a resposta em si tem uns 3 mil tokens; o resto é raciocínio, que também é cobrado. Com menos de 32 mil, o Haiku chegou a estourar nos testes */
const MAX_TOKENS = 32_000;
/** tamanho típico da saída, medido nos testes (docs/IA-COMPARATIVO.md) */
const EFFORT_OUT: Record<string, number> = { low: 1, medium: 1.5, high: 2.2 };
export const outTokens = (kind: "resultado" | "flashcards", size: number, effort: string) => Math.round((kind === "resultado" ? 1500 + 400 * Math.min(size, 60) : 500 + 80 * Math.min(size, 100)) * (EFFORT_OUT[effort] || 1));

/** compara o que foi estimado com o que aconteceu nas últimas execuções e corrige as próximas contas */
let calib: { at: number; in: number; out: number } | null = null;
async function calibration() {
  if (calib && Date.now() - calib.at < 600_000) return calib;
  const r = await one<{ in_ratio: number | null; out_ratio: number | null; n: number }>(
    `SELECT avg(tokens_in::float8 / NULLIF(est_in, 0)) AS in_ratio, avg(tokens_out::float8 / NULLIF(est_out, 0)) AS out_ratio, count(*) AS n
     FROM (SELECT tokens_in, tokens_out, est_in, est_out FROM ai_runs WHERE status = 'feito' AND est_in > 0 AND tokens_in > 0 ORDER BY created_at DESC LIMIT 40) x`,
  );
  const clamp = (x: number | null) => (x == null || !r?.n || r.n < 5 ? 1 : Math.max(0.5, Math.min(2.5, x)));
  calib = { at: Date.now(), in: clamp(r?.in_ratio ?? null), out: clamp(r?.out_ratio ?? null) };
  return calib;
}
export const resetCalibration = () => { calib = null; };

export type Estimate = { model: string; effort: string; tokensIn: number; tokensOut: number; usd: number; worstUsd: number; maxTokens: number };

export async function estimate(kind: "resultado" | "flashcards", chars: number, size: number, model?: string, effort?: string): Promise<Estimate> {
  const cfg = await getSetting("ia"), m = model || cfg.model, e = effort || cfg.effort, c = await calibration();
  // sem raciocínio sobra só a resposta
  const tokensIn = Math.ceil(tokensOf(chars) * c.in), tokensOut = Math.ceil(outTokens(kind, size, e) * c.out * (cfg.thinking ? 1 : 0.2));
  return { model: m, effort: e, tokensIn, tokensOut, usd: costOf(m, { in: tokensIn, out: tokensOut }), worstUsd: costOf(m, { in: Math.ceil(tokensIn * 1.3), out: MAX_TOKENS }), maxTokens: MAX_TOKENS };
}

/** por que não dá para rodar agora (null: pode) */
export async function blockReason(userId: string, usd: number) {
  const cfg = await getSetting("ia");
  if (!cfg.enabled) return { code: "desligada", message: "As análises com IA estão desligadas por enquanto." };
  if (!(await hasApiKey())) return { code: "sem_chave", message: "As análises com IA ainda não foram ligadas." };
  if (cfg.capUsd != null && (await globalSpent()) + usd > cfg.capUsd) return { code: "pausa", message: "As análises com IA voltam no mês que vem." };
  const cr = await creditOf(userId);
  if (cr.left < usd) return { code: "sem_credito", message: "Seu crédito de IA deste mês acabou. Ele renova no dia 1." };
  return null;
}

type Pack = { kind: "resultado" | "flashcards"; system: string; prompt: string; schema: Record<string, unknown>; size: number; source: unknown; options: unknown; extra: Record<string, unknown>; reviewed?: Set<string>; pull?: number; apply?: boolean };

export async function resultPack(userId: string, sessionId: string, options: Partial<ResultOptions>): Promise<Pack & { numeros: unknown; recomendadas: unknown }> {
  const o = { ...DEFAULT_RESULT, ...options };
  const p = await buildResultPackage(userId, sessionId, o);
  // menos material também encurta o raciocínio: nos testes, o leve gastou uns 30% menos de saída e a transcrição uns 20% mais
  const weight = (o.detalhe === "leve" ? 0.72 : o.detalhe === "completo" ? 1.05 : 1) * (o.transcricao ? 1.2 : 1);
  return { kind: "resultado", system: RESULT_SYSTEM, prompt: p.prompt, schema: RESULT_JSON, size: Math.round(p.wrongCount * weight), source: p.source, options: o, numeros: p.numeros, recomendadas: p.recomendadas, extra: { numeros: p.numeros, recomendadas: p.recomendadas } };
}
export async function flashPack(userId: string, o: FlashOptions, pull: number, apply: boolean): Promise<Pack & { counts: unknown }> {
  const p = await buildFlashPackage(userId, o);
  return { kind: "flashcards", system: FLASH_SYSTEM, prompt: p.prompt, schema: FLASH_JSON, size: p.size, source: p.source, options: { ...o, pull, apply }, counts: p.counts, extra: { ids: p.ids, counts: p.counts }, reviewed: p.reviewed, pull, apply };
}

export async function startRun(userId: string, pack: Pack, trigger: "manual" | "auto") {
  const cfg = await getSetting("ia");
  const est = await estimate(pack.kind, pack.system.length + pack.prompt.length, pack.size, cfg.model, cfg.effort);
  const block = await blockReason(userId, est.usd);
  if (block) throw new HttpError("limite", block.message, { motivo: block.code });
  const run = await tx(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 7))", [userId]);
    const cr = await creditOf(userId, db);
    if (cr.left < est.usd) throw new HttpError("limite", "Seu crédito de IA deste mês acabou. Ele renova no dia 1.", { motivo: "sem_credito" });
    const running = await one<{ n: number }>("SELECT count(*) AS n FROM ai_runs WHERE user_id = $1 AND status = 'rodando' AND kind <> 'chat'", [userId], db);
    if ((running?.n || 0) >= 2) throw new HttpError("limite", "Espere as análises em andamento terminarem.");
    return one<{ id: string }>(
      `INSERT INTO ai_runs (user_id, kind, trigger, model, effort, source, options, est_in, est_out, est_usd, reserved_usd, prompt_chars, prompt, system)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [userId, pack.kind, trigger, est.model, est.effort, JSON.stringify(pack.source), JSON.stringify(pack.options), est.tokensIn, est.tokensOut, est.usd, Math.min(est.worstUsd, cr.left), pack.prompt.length + pack.system.length, pack.prompt, pack.system],
      db,
    );
  });
  const id = run!.id;
  void execute(id, userId, pack, est);
  return { id, percent: percentOf(est.usd, (await creditOf(userId)).limit) };
}

async function execute(id: string, userId: string, pack: Pack, est: Estimate) {
  const t = Date.now();
  try {
    const { thinking } = await getSetting("ia");
    const r = await callModel({ model: est.model, effort: est.effort, thinking, system: pack.system, user: pack.prompt, schema: pack.schema, maxTokens: est.maxTokens });
    const cost = costOf(est.model, r.usage);
    const parsed = (pack.kind === "resultado" ? ResultOut : FlashOut).safeParse(JSON.parse(r.text));
    if (!parsed.success) throw new ModelError("A resposta veio fora do formato.", r.usage);
    let result: Record<string, unknown>;
    if (pack.kind === "resultado") result = { analise: parsed.data, ...pack.extra };
    else {
      const out = parsed.data as ReturnType<typeof FlashOut.parse>;
      const picked = await pickCards(userId, out.temas, pack.reviewed || new Set(), pack.pull || 10);
      result = { analise: out, cards: picked, applied: false, ...pack.extra };
      if (pack.apply && picked.length) { await applyPicked(userId, id, picked); result.applied = true; }
    }
    await q(
      `UPDATE ai_runs SET status = 'feito', tokens_in = $2, tokens_out = $3, cache_read = $4, cache_write = $5, cost_usd = $6, reserved_usd = 0, result = $7, finished_at = now(), ms = $8 WHERE id = $1`,
      [id, r.usage.in, r.usage.out, r.usage.cacheRead || 0, r.usage.cacheWrite || 0, cost, JSON.stringify(result), Date.now() - t],
    );
  } catch (e) {
    const usage = e instanceof ModelError ? e.usage : undefined;
    if (!(e instanceof ModelError)) recordError(e);
    await q(
      `UPDATE ai_runs SET status = 'erro', charged = false, tokens_in = $2, tokens_out = $3, cost_usd = $4, reserved_usd = 0, error = $5, finished_at = now(), ms = $6 WHERE id = $1`,
      [id, usage?.in || 0, usage?.out || 0, usage ? costOf(est.model, usage) : 0, (e as Error).message.slice(0, 500), Date.now() - t],
    ).catch((err) => console.error("análise:", err.message));
  }
}

/** Coloca os cards na frente: novos no começo da fila de novos (ocupam as vagas de hoje e amanhã), vistos com métrica ruim já vencem. */
export async function applyPicked(userId: string, runId: string, picked: PickedCard[]) {
  const rows = await q<{ id: string; data: Record<string, unknown> }>("SELECT id, data FROM user_records WHERE user_id = $1 AND coll = 'fc_card' AND NOT deleted AND id = ANY($2)", [userId, picked.map((p) => p.id)]);
  const decks = [...new Set(rows.map((r) => r.data.deck as string))];
  const mins = new Map((await q<{ deck: string; min: number }>(
    "SELECT data->>'deck' AS deck, min((data->>'due')::float8) AS min FROM user_records WHERE user_id = $1 AND coll = 'fc_card' AND NOT deleted AND (data->>'isNew') = '1' AND data->>'deck' = ANY($2) GROUP BY 1", [userId, decks],
  )).map((r) => [r.deck, Number(r.min)]));
  const now = Date.now();
  const order = new Map(picked.map((p, i) => [p.id, i]));
  const changes = rows.map((r) => {
    const d: Record<string, unknown> = { ...r.data, boost: runId };
    if (d.isNew === 1) d.due = (mins.get(d.deck as string) ?? 0) - picked.length + (order.get(r.id) ?? 0);
    else if ((d.due as number) > now) d.due = now;
    return { c: "fc_card", id: r.id, data: d, at: now };
  });
  await applyChanges(userId, changes, "ia");
  return changes.length;
}

/** quem caiu no meio (servidor reiniciado) não fica rodando para sempre nem segura crédito */
export async function recoverRuns() {
  await q("UPDATE ai_runs SET status = 'erro', charged = false, reserved_usd = 0, error = 'Interrompida: o servidor reiniciou.', finished_at = now() WHERE status = 'rodando'");
}

export type RunRow = { id: string; user_id: string | null; kind: string; trigger: string; status: string; model: string; effort: string; source: Record<string, unknown>; options: Record<string, unknown>; est_in: number; est_out: number; est_usd: string; tokens_in: number; tokens_out: number; cache_read: number; cache_write: number; cost_usd: string; charged: boolean; prompt_chars: number; result: Record<string, unknown> | null; error: string | null; parent: string | null; created_at: Date; finished_at: Date | null; ms: number | null };

export const RUN_COLS = "id, user_id, kind, trigger, status, model, effort, source, options, est_in, est_out, est_usd, tokens_in, tokens_out, cache_read, cache_write, cost_usd, charged, prompt_chars, result, error, parent, created_at, finished_at, ms";

/** teste do admin: o mesmo texto de uma execução, com outro modelo ou esforço, para comparar. Não entra no crédito da pessoa */
export async function rerun(runId: string, model: string, effort: string, thinking: boolean, adminId: string) {
  if (!isAnalysisModel(model)) throw new HttpError("invalido", "Modelo desconhecido.");
  const p = await one<{ id: string; kind: string; prompt: string | null; system: string | null; source: unknown; options: unknown }>("SELECT id, kind, prompt, system, source, options FROM ai_runs WHERE id = $1", [runId]);
  if (!p) throw notFound("Não encontramos essa execução.");
  if (!p.prompt || !p.system) throw new HttpError("conflito", "O texto desta execução já foi apagado (fica 30 dias).");
  const kind = (p.kind === "teste" ? (p.options as { base?: string }).base : p.kind) as "resultado" | "flashcards";
  const size = (p.prompt.match(/^[QC]\d+ ·/gm) || []).length;
  const est = await estimate(kind, p.prompt.length + p.system.length, size, model, effort);
  const run = await one<{ id: string }>(
    `INSERT INTO ai_runs (user_id, kind, trigger, model, effort, source, options, est_in, est_out, est_usd, charged, prompt_chars, prompt, system, parent)
     VALUES ($1, 'teste', 'admin', $2, $3, $4, $5, $6, $7, $8, false, $9, $10, $11, $12) RETURNING id`,
    [adminId, model, effort, JSON.stringify(p.source), JSON.stringify({ base: kind, thinking }), est.tokensIn, est.tokensOut, est.usd, p.prompt.length + p.system.length, p.prompt, p.system, p.id],
  );
  void (async () => {
    const t = Date.now();
    try {
      const r = await callModel({ model, effort, thinking, system: p.system!, user: p.prompt!, schema: kind === "resultado" ? RESULT_JSON : FLASH_JSON, maxTokens: est.maxTokens });
      await q(`UPDATE ai_runs SET status = 'feito', tokens_in = $2, tokens_out = $3, cost_usd = $4, result = $5, finished_at = now(), ms = $6 WHERE id = $1`, [run!.id, r.usage.in, r.usage.out, costOf(model, r.usage), JSON.stringify({ analise: JSON.parse(r.text) }), Date.now() - t]);
    } catch (e) {
      const usage = e instanceof ModelError ? e.usage : undefined;
      await q(`UPDATE ai_runs SET status = 'erro', tokens_in = $2, tokens_out = $3, cost_usd = $4, error = $5, finished_at = now(), ms = $6 WHERE id = $1`, [run!.id, usage?.in || 0, usage?.out || 0, usage ? costOf(model, usage) : 0, (e as Error).message.slice(0, 500), Date.now() - t]);
    }
  })();
  return run!.id;
}

export const bankReady = () => bank().all.length > 0;
