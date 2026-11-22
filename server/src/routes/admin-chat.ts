/* Painel do admin: o chat de IA. Qual fonte e modelo valem para todo mundo e para cada pessoa, os limites, e a medição:
   mensagens, tokens de cada tipo, custo equivalente na API por fonte, modelo, pessoa e dia, e quanto custaria em cada modelo. */
import { Hono } from "hono";
import { z } from "zod";
import { one, q } from "../db";
import { invalid, ms, notFound, requireAdmin } from "../http";
import type { AppEnv } from "../http";
import { getSetting, setSetting } from "../lib/settings";
import { deleteSecret, secretInfo, setSecret } from "../lib/secrets";
import { jsonBody, uuidOr404 } from "../lib/validate";
import { setupFor } from "../ia/chat";
import { creditOf, monthStart } from "../ia/credit";
import { ModelError } from "../ia/model";
import { chatTurn, isProvider, modelFits, modelLabel, modelsOf, providerList, PROVIDERS, turnCost } from "../ia/providers";
import type { ProviderId } from "../ia/providers";
import { costOf, MODELS } from "../ia/pricing";

const r = new Hono<AppEnv>();
const n = (x: unknown) => Number(x || 0);
const TOKENS = "COALESCE(sum(tokens_in), 0) AS tin, COALESCE(sum(tokens_out), 0) AS tout, COALESCE(sum(cache_read), 0) AS cr, COALESCE(sum(cache_write), 0) AS cw";
const tokensOf = (x: any) => ({ in: n(x?.tin), out: n(x?.tout), cacheRead: n(x?.cr), cacheWrite: n(x?.cw) });

/** cada fonte e se está pronta: chave cadastrada, conta ligada, ou nada a fazer */
async function providersView() {
  return Promise.all(providerList().map(async (p) => {
    const base = { id: p.id, label: p.label, family: p.family, billing: p.billing, auth: p.auth, needsKey: p.auth === "chave" };
    if (p.auth === "chave") return { ...base, ...(await secretInfo(p.secret!)) };
    if (p.auth === "login") return { ...base, ...((await p.status?.()) ?? { set: false, hint: "", updatedAt: null }) };
    return { ...base, set: true, hint: "", updatedAt: null };
  }));
}

r.get("/admin/chat", async (c) => {
  requireAdmin(c);
  const dias = Math.min(180, Math.max(1, Number(c.req.query("dias")) || 30));
  const since = new Date(Date.now() - dias * 86_400_000), W = "kind = 'chat' AND created_at >= $1";
  const [cfg, ia, providers, totals, month, byModel, byUser, daily, tools, recent] = await Promise.all([
    getSetting("chat"), getSetting("ia"), providersView(),
    one<any>(`SELECT count(*) AS runs, count(*) FILTER (WHERE status = 'erro') AS failed, count(DISTINCT user_id) AS people, COALESCE(sum(cost_usd), 0) AS usd, COALESCE(sum(cost_usd) FILTER (WHERE billing = 'api'), 0) AS usd_api, count(*) FILTER (WHERE fallback_from IS NOT NULL) AS fallbacks,
              ${TOKENS}, avg(ms) FILTER (WHERE status = 'feito') AS avg_ms, avg(rounds) FILTER (WHERE status = 'feito') AS avg_rounds, COALESCE(sum(tool_calls), 0) AS tool_calls, count(DISTINCT chat_id) AS chats FROM ai_runs WHERE ${W}`, [since]),
    one<any>("SELECT COALESCE(sum(cost_usd) FILTER (WHERE billing = 'api'), 0) AS usd_api, COALESCE(sum(cost_usd) FILTER (WHERE kind = 'chat'), 0) AS usd_chat FROM ai_runs WHERE created_at >= $1", [monthStart()]),
    q<any>(`SELECT provider, model, billing, count(*) AS runs, count(*) FILTER (WHERE status = 'erro') AS failed, COALESCE(sum(cost_usd), 0) AS usd, ${TOKENS}, avg(ms) FILTER (WHERE status = 'feito') AS avg_ms FROM ai_runs WHERE ${W} GROUP BY 1, 2, 3 ORDER BY 6 DESC`, [since]),
    q<any>(`SELECT a.user_id, u.handle, u.name, count(*) AS runs, COALESCE(sum(a.cost_usd), 0) AS usd, COALESCE(sum(a.tokens_in + a.cache_read + a.cache_write), 0) AS tin, COALESCE(sum(a.tokens_out), 0) AS tout, max(a.created_at) AS last,
              au.monthly_usd, au.chat_enabled, au.chat_provider, au.chat_model, au.chat_daily
            FROM ai_runs a JOIN users u ON u.id = a.user_id LEFT JOIN ai_user au ON au.user_id = a.user_id WHERE a.kind = 'chat' AND a.created_at >= $1 GROUP BY 1, 2, 3, 9, 10, 11, 12, 13 ORDER BY 5 DESC LIMIT 100`, [since]),
    q<any>(`SELECT (created_at - interval '3 hours')::date AS day, count(*) AS runs, COALESCE(sum(cost_usd), 0) AS usd, COALESCE(sum(tokens_in + cache_read + cache_write), 0) AS tin, COALESCE(sum(tokens_out), 0) AS tout FROM ai_runs WHERE ${W} GROUP BY 1 ORDER BY 1`, [since]),
    q<any>("SELECT tool, count(*) AS calls, count(*) FILTER (WHERE NOT ok) AS failed, avg(ms) AS avg_ms FROM mcp_audit WHERE mode = 'chat' AND at >= $1 GROUP BY 1 ORDER BY 2 DESC", [since]),
    q<any>(`SELECT a.id, a.status, a.provider, a.model, a.billing, a.fallback_from, a.tokens_in, a.tokens_out, a.cache_read, a.cache_write, a.cost_usd, a.rounds, a.tool_calls, a.ms, a.error, a.created_at, a.chat_id, u.handle, u.name
            FROM ai_runs a LEFT JOIN users u ON u.id = a.user_id WHERE a.kind = 'chat' ORDER BY a.created_at DESC LIMIT 60`),
  ]);
  const used = tokensOf(totals);
  return c.json({
    days: dias, config: cfg, defaultUsd: ia.defaultUsd, providers,
    models: Object.entries(MODELS).map(([id, m]) => ({ id, label: m.label, family: m.family, in: m.in, out: m.out })),
    totals: { runs: n(totals?.runs), failed: n(totals?.failed), people: n(totals?.people), chats: n(totals?.chats), usd: n(totals?.usd), usdApi: n(totals?.usd_api), usdPlan: n(totals?.usd) - n(totals?.usd_api), fallbacks: n(totals?.fallbacks), tokens: used, avgMs: Math.round(n(totals?.avg_ms)), avgRounds: n(totals?.avg_rounds), toolCalls: n(totals?.tool_calls) },
    // o mês corrente contra o crédito de API que o plano do dono já traz (todas as chamadas pagas por API, chat ou não)
    month: { usdApi: n(month?.usd_api), usdChat: n(month?.usd_chat), includedUsd: cfg.includedUsd },
    // os mesmos tokens do período, se tudo tivesse rodado em cada modelo: é a conta de viabilidade
    whatIf: Object.entries(MODELS).map(([id, m]) => ({ model: id, label: m.label, usd: costOf(id, used), perMessage: n(totals?.runs) ? costOf(id, used) / n(totals?.runs) : 0 })),
    byModel: byModel.map((x) => ({ provider: x.provider, providerLabel: PROVIDERS[x.provider as ProviderId]?.label ?? x.provider, model: x.model, label: modelLabel(x.model), billing: x.billing, runs: n(x.runs), failed: n(x.failed), usd: n(x.usd), tokens: tokensOf(x), avgMs: Math.round(n(x.avg_ms)) })),
    byUser: byUser.map((x) => ({ id: x.user_id, handle: x.handle, name: x.name, runs: n(x.runs), usd: n(x.usd), tokensIn: n(x.tin), tokensOut: n(x.tout), last: ms(x.last), limitUsd: x.monthly_usd != null ? n(x.monthly_usd) : ia.defaultUsd,
      override: { enabled: x.chat_enabled, provider: x.chat_provider, model: x.chat_model, daily: x.chat_daily } })),
    daily: daily.map((x) => ({ day: new Date(x.day).toISOString().slice(0, 10), runs: n(x.runs), usd: n(x.usd), tokensIn: n(x.tin), tokensOut: n(x.tout) })),
    tools: tools.map((x) => ({ tool: x.tool, calls: n(x.calls), failed: n(x.failed), avgMs: Math.round(n(x.avg_ms)) })),
    runs: recent.map((x) => ({ id: x.id, status: x.status, provider: x.provider, providerLabel: PROVIDERS[x.provider as ProviderId]?.label ?? x.provider, fallbackFrom: x.fallback_from, model: x.model, label: modelLabel(x.model), billing: x.billing, tokensIn: x.tokens_in, tokensOut: x.tokens_out, cacheRead: x.cache_read, cacheWrite: x.cache_write,
      usd: n(x.cost_usd), rounds: x.rounds, toolCalls: x.tool_calls, ms: x.ms, error: x.error, at: ms(x.created_at), chatId: x.chat_id, handle: x.handle, name: x.name })),
  });
});

const checkPair = (provider?: string | null, model?: string | null) => {
  if (provider && !isProvider(provider)) throw invalid("Fonte desconhecida.");
  if (provider && model && !modelFits(provider as ProviderId, model)) throw invalid("Esse modelo não é dessa fonte.");
  if (!provider && model && !MODELS[model] && !model.includes("/")) throw invalid("Modelo desconhecido.");
};

/** os modelos que uma fonte aceita agora: fixos nas de chave direta, do catálogo na OpenRouter, ou o que a própria fonte informar */
r.get("/admin/chat/modelos", async (c) => {
  requireAdmin(c);
  const id = c.req.query("fonte") || "";
  if (!isProvider(id)) throw invalid("Fonte desconhecida.");
  try { return c.json({ items: await modelsOf(id) }); }
  catch (e) { throw invalid(e instanceof ModelError ? e.message : "Não consegui buscar os modelos dessa fonte."); }
});

r.put("/admin/chat/config", async (c) => {
  requireAdmin(c);
  const b = await jsonBody(c, z.object({
    enabled: z.boolean().optional(), provider: z.string().optional(), model: z.string().optional(), effort: z.enum(["low", "medium", "high"]).optional(), thinking: z.boolean().optional(),
    dailyMessages: z.number().int().min(1).max(1000).optional(), maxRounds: z.number().int().min(1).max(12).optional(), includedUsd: z.number().min(0).max(10_000).optional(),
    fallbackProvider: z.string().optional(), fallbackModel: z.string().optional(),
  }));
  const cur = await getSetting("chat");
  checkPair(b.provider ?? cur.provider, b.model ?? cur.model);
  const fp = b.fallbackProvider ?? cur.fallbackProvider, fm = b.fallbackModel ?? cur.fallbackModel;
  if (fp) { checkPair(fp, fm || null); if (!fm) throw invalid("Escolha o modelo da fonte reserva."); if (fp === (b.provider ?? cur.provider)) throw invalid("A reserva tem de ser outra fonte."); }
  return c.json(await setSetting("chat", b));
});

/* ---------- por pessoa: nulo volta ao padrão ---------- */
async function userView(id: string) {
  const u = await one<{ id: string; handle: string; name: string }>("SELECT id, handle, name FROM users WHERE id = $1", [id]);
  if (!u) throw notFound("Não encontramos essa pessoa.");
  const o = await one<any>("SELECT chat_enabled, chat_provider, chat_model, chat_daily FROM ai_user WHERE user_id = $1", [id]);
  const [setup, cr] = await Promise.all([setupFor(id), creditOf(id)]);
  return { ...u, override: { enabled: o?.chat_enabled ?? null, provider: o?.chat_provider ?? null, model: o?.chat_model ?? null, daily: o?.chat_daily ?? null }, effective: setup, credit: { limitUsd: cr.limit, spentUsd: cr.spent } };
}
r.get("/admin/chat/usuarios/:id", async (c) => { requireAdmin(c); return c.json(await userView(uuidOr404(c.req.param("id")))); });
// achar a pessoa pelo @ ou pelo e-mail, para ajustar quem ainda não usou o chat
r.get("/admin/chat/usuarios", async (c) => {
  requireAdmin(c);
  const term = (c.req.query("q") || "").trim().toLowerCase().replace(/^@/, "");
  if (term.length < 2) return c.json({ items: [] });
  const like = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  return c.json({ items: await q("SELECT id, handle, name FROM users WHERE lower(handle) LIKE $1 OR lower(email) LIKE $1 OR lower(name) LIKE $1 ORDER BY handle LIMIT 8", [like]) });
});
r.put("/admin/chat/usuarios/:id", async (c) => {
  requireAdmin(c);
  const id = uuidOr404(c.req.param("id"));
  const b = await jsonBody(c, z.object({ enabled: z.boolean().nullable(), provider: z.string().nullable(), model: z.string().nullable(), daily: z.number().int().min(0).max(1000).nullable() }));
  checkPair(b.provider, b.model);
  if (!(await one("SELECT 1 FROM users WHERE id = $1", [id]))) throw notFound("Não encontramos essa pessoa.");
  await q(
    `INSERT INTO ai_user (user_id, chat_enabled, chat_provider, chat_model, chat_daily) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET chat_enabled = $2, chat_provider = $3, chat_model = $4, chat_daily = $5, updated_at = now()`,
    [id, b.enabled, b.provider, b.model, b.daily],
  );
  return c.json(await userView(id));
});

/* ---------- chaves da OpenAI e da OpenRouter (a da Anthropic já é cadastrada na tela IA) ---------- */
for (const [name, prefix, who] of [["openai", "sk-", "OpenAI"], ["openrouter", "sk-or-", "OpenRouter"]] as const) {
  r.put(`/admin/config/${name}`, async (c) => {
    const a = requireAdmin(c);
    const b = await jsonBody(c, z.object({ key: z.string().trim().min(20, "Essa chave parece incompleta.").max(300) }));
    if (!b.key.startsWith(prefix)) throw invalid(`A chave da ${who} começa com ${prefix}.`);
    await setSecret(name, b.key, a.id);
    return c.json(await secretInfo(name));
  });
  r.delete(`/admin/config/${name}`, async (c) => { requireAdmin(c); await deleteSecret(name); return c.body(null, 204); });
}

/** a menor conversa possível com uma fonte e um modelo, para saber se a chave e o modelo respondem */
r.post("/admin/chat/testar", async (c) => {
  requireAdmin(c);
  const b = await jsonBody(c, z.object({ provider: z.string(), model: z.string() }));
  checkPair(b.provider, b.model);
  if (!isProvider(b.provider)) throw invalid("Fonte desconhecida.");
  const t = Date.now();
  try {
    const out = await chatTurn(b.provider as ProviderId, { model: b.model, effort: "low", thinking: false, system: "Responda em uma palavra.", messages: [{ role: "user", content: [{ type: "text", text: "Diga ok." }] }], tools: [], maxTokens: 400 });
    return c.json({ ok: true, ms: Date.now() - t, usd: turnCost(b.model, out), tokens: out.usage, text: out.content.flatMap((x) => (x.type === "text" ? [x.text] : [])).join("").slice(0, 80) });
  } catch (e) { throw invalid(e instanceof ModelError ? e.message : "Não consegui falar com essa fonte."); }
});

export default r;
