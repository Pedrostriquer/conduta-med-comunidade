/* As fontes de IA do chat. Cada uma recebe a conversa num formato comum (texto, chamada de ferramenta, resultado) e devolve
   o próximo passo do modelo com a contagem de tokens. Trocar de fonte ou de modelo não muda mais nada no resto do código.
   `billing` diz de onde sai: 'api' é dinheiro cobrado por token; 'assinatura' é para uma fonte que não cobra por token, e aí
   o custo guardado é só o equivalente na API, para comparar. Fontes próprias de uma instalação entram por `registerProvider`
   (ver extras.ts). Em teste, `setChatCaller` troca a chamada de verdade. */
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { getSecret } from "../lib/secrets";
import type { SecretName } from "../lib/secrets";
import { ModelError, thinkingParam } from "./model";
import { costOf, MODELS } from "./pricing";
import type { Usage } from "./pricing";

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  /** pedaço que só a própria fonte entende (raciocínio assinado): volta igual dentro da mesma resposta e não é guardado */
  | { type: "native"; provider: Family; data: unknown };
export type Msg = { role: "user" | "assistant"; content: Block[] };
export type ToolSpec = { name: string; description: string; schema: Record<string, unknown> };

export type TurnIn = { model: string; effort: string; thinking: boolean; system: string; messages: Msg[]; tools: ToolSpec[]; maxTokens: number; /** as ferramentas seguem declaradas (a conversa já as usou), mas o modelo tem de responder em texto */ noTools?: boolean; onText?: (delta: string) => void; signal?: AbortSignal };
/** `costUsd`: quanto a fonte disse que cobrou, quando ela diz (a OpenRouter diz); sem isso o custo sai da tabela de preços */
export type TurnOut = { content: Block[]; usage: Usage; costUsd?: number; stop: "fim" | "ferramentas" | "tamanho" | "recusa" };

export type Family = "anthropic" | "openai" | "openrouter";
/** "anthropic_api", "openai_api", "openrouter_api", "demo" e as que uma instalação registrar */
export type ProviderId = string;
export type Provider = {
  id: ProviderId; label: string; family: Family; billing: "api" | "assinatura";
  /** o segredo cifrado que esta fonte usa (ver lib/secrets.ts); null: não é uma chave ou não precisa de nada */
  secret: SecretName | null;
  /** como a fonte fica pronta: uma chave colada no painel, um login, ou nada */
  auth: "chave" | "login" | "nenhuma";
  /** a credencial desta chamada; lança ModelError se a fonte não está pronta */
  credential: () => Promise<string>;
  turn: (t: TurnIn, credential: string) => Promise<TurnOut>;
  /** fonte de login: se está pronta para responder, e o que o painel mostra dela */
  ready?: () => Promise<boolean>;
  status?: () => Promise<{ set: boolean; hint: string; updatedAt: number | null; needsLogin?: boolean }>;
  /** os modelos que a fonte oferece agora e se um identificador serve, quando não valem os da tabela de preços */
  models?: () => Promise<ModelOption[]>;
  fits?: (model: string) => boolean;
};

type Caller = (p: Provider, t: TurnIn) => Promise<TurnOut>;
let fake: Caller | null = null;
export const setChatCaller = (f: Caller | null) => { fake = f; };

/* ---------- Claude pela API ---------- */

const toAnthropic = (m: Msg) => ({
  role: m.role,
  content: m.content.flatMap((b): unknown[] => {
    if (b.type === "native") return b.provider === "anthropic" ? [b.data] : [];
    if (b.type === "tool_result") return [{ type: "tool_result", tool_use_id: b.tool_use_id, content: b.content, ...(b.is_error ? { is_error: true } : {}) }];
    return [b];
  }),
});

async function anthropicTurn(t: TurnIn, apiKey: string): Promise<TurnOut> {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 180_000 });
  // o que não muda entre as mensagens (instruções e ferramentas) fica em cache: as idas seguintes pagam um décimo por ele
  const tools = t.tools.map((x, i) => ({ name: x.name, description: x.description, input_schema: x.schema, ...(i === t.tools.length - 1 ? { cache_control: { type: "ephemeral" } } : {}) }));
  try {
    const stream = client.messages.stream({
      model: t.model, max_tokens: t.maxTokens,
      system: [{ type: "text", text: t.system, cache_control: { type: "ephemeral" } }],
      messages: t.messages.map(toAnthropic) as never,
      ...(tools.length ? { tools: tools as never, ...(t.noTools ? { tool_choice: { type: "none" as const } } : {}) } : {}),
      output_config: { effort: t.effort as "low" | "medium" | "high" },
      ...thinkingParam(t.model, t.thinking),
    }, { signal: t.signal });
    if (t.onText) stream.on("text", t.onText);
    const m = await stream.finalMessage();
    const u = m.usage;
    const usage: Usage = { in: u.input_tokens, out: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 };
    const content: Block[] = m.content.map((b): Block =>
      b.type === "text" ? { type: "text", text: b.text }
      : b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }
      : { type: "native", provider: "anthropic", data: b });
    return { content, usage, stop: m.stop_reason === "tool_use" ? "ferramentas" : m.stop_reason === "max_tokens" ? "tamanho" : m.stop_reason === "refusal" ? "recusa" : "fim" };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ModelError("A chave de API do Claude foi recusada.", undefined, "fonte");
    if (e instanceof Anthropic.RateLimitError) throw new ModelError("Muitas chamadas à IA agora. Tente de novo em instantes.", undefined, "limite");
    if (e instanceof Anthropic.APIError) throw new ModelError(`A API respondeu ${e.status ?? "com erro"}: ${e.message}`.slice(0, 300), undefined, "fonte");
    throw e;
  }
}

/* ---------- API de respostas (OpenAI, OpenRouter), sem biblioteca: uma chamada HTTP com resposta em fluxo ---------- */

const toOpenAi = (messages: Msg[]) => messages.flatMap((m) => m.content.flatMap((b): unknown[] => {
  if (b.type === "native") return b.provider === "openai" ? [b.data] : [];
  if (b.type === "text") return b.text ? [{ role: m.role, content: [{ type: m.role === "user" ? "input_text" : "output_text", text: b.text }] }] : [];
  if (b.type === "tool_use") return [{ type: "function_call", call_id: b.id, name: b.name, arguments: JSON.stringify(b.input) }];
  return [{ type: "function_call_output", call_id: b.tool_use_id, output: b.content }];
}));

/** lê o fluxo de eventos (`data: {...}` separados por linha em branco) e entrega cada um já em objeto */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, any>> {
  const reader = body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
    let cut: number;
    while ((cut = buf.search(/\r?\n\r?\n/)) >= 0) {
      const chunk = buf.slice(0, cut);
      buf = buf.slice(cut).replace(/^\r?\n\r?\n/, "");
      const data = chunk.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      if (data && data !== "[DONE]") { try { yield JSON.parse(data); } catch { /* linha que não é JSON: ignora */ } }
    }
    if (done) return;
  }
}

export const OPENAI_URL = "https://api.openai.com/v1/responses", OPENROUTER_URL = "https://openrouter.ai/api/v1/responses";
/** A mesma API de respostas serve em mais de um endereço. O que muda de um para outro está aqui. */
export type ResponsesOpt = {
  url: string;
  /** como a fonte aparece nas mensagens de erro: "da OpenAI", "da OpenRouter" */
  who: string;
  headers?: Record<string, string>;
  /** a conversa não fica guardada lá: o raciocínio volta cifrado para ser devolvido na ida seguinte da mesma resposta */
  stateless?: boolean;
  /** a fonte informa quanto cobrou em cada resposta */
  reportsCost?: boolean;
  /** ajuste final do pedido, para uma fonte com exigências próprias */
  body?: (b: Record<string, any>) => Record<string, any>;
  /** erros próprios da fonte; null deixa o tratamento comum */
  error?: (status: number, err: ResponsesErr | undefined) => ModelError | null;
};
export type ResponsesErr = { code?: string; message?: string; param?: string };

function responsesError(opt: ResponsesOpt, status: number, err: ResponsesErr | undefined) {
  const own = opt.error?.(status, err);
  if (own) return own;
  const code = err?.code ?? "";
  if (status === 401) return new ModelError(`A chave de API ${opt.who} foi recusada.`, undefined, "fonte");
  if (status === 402) return new ModelError(`Acabou o crédito ${opt.who}.`, undefined, "limite");
  if (status === 429) return new ModelError("Muitas chamadas à IA agora. Tente de novo em instantes.", undefined, "limite");
  return new ModelError(`A IA respondeu ${status || "com erro"}${code ? ` (${code})` : ""}: ${err?.message ?? ""}`.slice(0, 300), undefined, "fonte");
}

export async function responsesTurn(t: TurnIn, token: string, opt: ResponsesOpt): Promise<TurnOut> {
  const fns = t.tools.map((x) => ({ type: "function", name: x.name, description: x.description, parameters: x.schema, strict: false }));
  const body: Record<string, any> = {
    model: t.model, instructions: t.system, input: toOpenAi(t.messages), stream: true, max_output_tokens: t.maxTokens,
    ...(fns.length ? { tools: fns } : {}),
    ...(t.noTools && fns.length ? { tool_choice: "none" } : {}),
    ...(opt.stateless ? { store: false, include: ["reasoning.encrypted_content"] } : {}),
    reasoning: { effort: t.thinking ? t.effort : "low" },
  };
  const res = await fetch(opt.url, {
    method: "POST", signal: t.signal ?? AbortSignal.timeout(180_000),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...opt.headers },
    body: JSON.stringify(opt.body ? opt.body(body) : body),
  });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: ResponsesErr } | null;
    throw responsesError(opt, res.status, j?.error);
  }
  let final: Record<string, any> | null = null;
  for await (const ev of sseEvents(res.body)) {
    if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") t.onText?.(ev.delta);
    else if (ev.type === "response.completed" || ev.type === "response.incomplete") final = ev.response;
    else if (ev.type === "response.failed" || ev.type === "error") throw responsesError(opt, 0, ev.response?.error ?? ev.error ?? { message: ev.message });
  }
  if (!final) throw new ModelError("A resposta da IA veio incompleta.", undefined, "fonte");
  const content: Block[] = [];
  for (const item of (final.output ?? []) as Record<string, any>[]) {
    if (item.type === "message") { const text = (item.content ?? []).filter((x: any) => x.type === "output_text").map((x: any) => x.text).join(""); if (text) content.push({ type: "text", text }); }
    else if (item.type === "function_call") {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(item.arguments || "{}"); } catch { /* argumentos quebrados: a ferramenta devolve o erro de validação */ }
      content.push({ type: "tool_use", id: item.call_id, name: item.name, input });
    } else if (item.type === "reasoning" && opt.stateless) content.push({ type: "native", provider: "openai", data: item });
  }
  const u = final.usage ?? {}, cached = u.input_tokens_details?.cached_tokens ?? 0, written = u.input_tokens_details?.cache_write_tokens ?? 0;
  // lá a entrada já inclui o que veio do cache; aqui os dois ficam separados, como no Claude
  const usage: Usage = { in: Math.max(0, (u.input_tokens ?? 0) - cached - written), out: u.output_tokens ?? 0, cacheRead: cached, cacheWrite: written };
  const calls = content.some((b) => b.type === "tool_use");
  // a OpenRouter diz quanto cobrou; com chave própria do fornecedor ligada lá, soma o que o fornecedor cobrou
  const costUsd = opt.reportsCost && typeof u.cost === "number" ? u.cost + (u.is_byok ? Number(u.cost_details?.upstream_inference_cost ?? 0) : 0) : undefined;
  return { content, usage, costUsd, stop: calls ? "ferramentas" : final.status === "incomplete" ? (final.incomplete_details?.reason === "content_filter" ? "recusa" : "tamanho") : "fim" };
}

/* ---------- demonstração: só no computador de desenvolvimento, para ver o chat funcionando sem chave nenhuma ----------
   Não chama IA: faz uma busca de verdade no banco com as palavras da pergunta e escreve uma resposta fixa com o total. */
async function demoTurn(t: TurnIn): Promise<TurnOut> {
  const last = t.messages[t.messages.length - 1], result = last.content.find((b) => b.type === "tool_result");
  const question = [...t.messages].reverse().flatMap((m) => (m.role === "user" ? m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])) : []))[0] ?? "";
  const chars = JSON.stringify(t.messages).length + t.system.length;
  if (!result && !t.noTools && t.tools.some((x) => x.name === "conduta_buscar_questoes")) {
    const word = question.toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 4).sort((a, b) => b.length - a.length)[0];
    return { content: [{ type: "tool_use", id: "demo" + Date.now(), name: "conduta_buscar_questoes", input: { ...(word ? { texto: word } : {}), limite: 5 } }], usage: { in: Math.ceil(chars / 3), out: 40, cacheRead: 0, cacheWrite: 0 }, stop: "ferramentas" };
  }
  let total = "algumas", items: { id: string; prova?: string; link?: string }[] = [];
  try { const d = JSON.parse(result?.type === "tool_result" ? result.content : "{}"); total = String(d.total ?? total); items = d.itens ?? []; } catch { /* resultado cortado: segue sem a lista */ }
  const text = `**Resposta de demonstração** (nenhuma IA foi chamada).\n\nA busca no banco achou **${total}** questões com as palavras da sua pergunta.${items.length ? " As primeiras:\n\n" + items.slice(0, 5).map((x) => `- [${x.prova ?? x.id}](${x.link ?? `${env.publicUrl}/questao/${encodeURIComponent(x.id)}`})`).join("\n") : ""}\n\nQuando uma fonte de IA estiver ligada no painel, a resposta de verdade aparece aqui.`;
  for (const piece of text.match(/[\s\S]{1,24}/g) ?? []) { t.onText?.(piece); await new Promise((r) => setTimeout(r, 25)); }
  return { content: [{ type: "text", text }], usage: { in: Math.ceil(chars / 3), out: Math.ceil(text.length / 3), cacheRead: 0, cacheWrite: 0 }, stop: "fim" };
}

const keyOf = (name: SecretName) => async () => { const k = await getSecret(name); if (!k) throw new ModelError("Esta fonte de IA ainda não foi ligada.", undefined, "fonte"); return k; };
export const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic_api: { id: "anthropic_api", label: "Claude (chave de API)", family: "anthropic", billing: "api", secret: "anthropic", auth: "chave", credential: keyOf("anthropic"), turn: anthropicTurn },
  openai_api: { id: "openai_api", label: "GPT (chave de API)", family: "openai", billing: "api", secret: "openai", auth: "chave", credential: keyOf("openai"), turn: (t, k) => responsesTurn(t, k, { url: OPENAI_URL, who: "da OpenAI", stateless: true }) },
  openrouter_api: { id: "openrouter_api", label: "OpenRouter (chave de API)", family: "openrouter", billing: "api", secret: "openrouter", auth: "chave", credential: keyOf("openrouter"), turn: (t, k) => responsesTurn(t, k, { url: OPENROUTER_URL, who: "da OpenRouter", headers: { "x-title": "Conduta Med" }, reportsCost: true }) },
  demo: { id: "demo", label: "Demonstração (sem IA, só em desenvolvimento)", family: "anthropic", billing: "api", secret: null, auth: "nenhuma", credential: async () => "", turn: demoTurn },
};
/** a demonstração só existe com NODE_ENV=development: em produção e nos testes ela não é uma fonte */
export const isProvider = (id: string): id is ProviderId => Object.hasOwn(PROVIDERS, id) && (id !== "demo" || env.dev);
export const providerList = () => Object.values(PROVIDERS).filter((p) => isProvider(p.id)).sort((a, b) => Number(a.id === "demo") - Number(b.id === "demo"));
/** acrescenta uma fonte própria da instalação (chamado a partir de extras.ts) */
export const registerProvider = (p: Provider) => { PROVIDERS[p.id] = p; };

export async function providerReady(id: ProviderId) {
  if (fake) return true;
  const p = PROVIDERS[id];
  if (!isProvider(id)) return false;
  return p.auth === "nenhuma" ? true : p.auth === "login" ? !!(await p.ready?.()) : !!(await getSecret(p.secret!));
}

export async function chatTurn(id: ProviderId, t: TurnIn): Promise<TurnOut> {
  const p = PROVIDERS[id];
  if (fake) return fake(p, t);
  if (!isProvider(id)) throw new ModelError("Esta fonte de IA não existe aqui.", undefined, "fonte");
  return p.turn(t, await p.credential());
}

/* ---------- que modelos cada fonte aceita ---------- */
export type ModelOption = { id: string; label: string; in: number | null; out: number | null };
const staticModels = (family: Family): ModelOption[] => Object.entries(MODELS).filter(([, m]) => m.family === family).map(([id, m]) => ({ id, label: m.label, in: m.in, out: m.out }));

let routerCache: { at: number; items: ModelOption[] } | null = null;
/** o catálogo da OpenRouter, só os modelos que aceitam ferramentas; preço por milhão de tokens */
export async function openRouterModels(): Promise<ModelOption[]> {
  if (routerCache && Date.now() - routerCache.at < 3_600_000) return routerCache.items;
  const key = await getSecret("openrouter");
  const r = await fetch("https://openrouter.ai/api/v1/models?limit=500", { headers: key ? { authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new ModelError(`A OpenRouter não devolveu a lista de modelos (${r.status}).`, undefined, "fonte");
  const j = (await r.json()) as { data?: { id: string; name?: string; pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[] }[] };
  const items = (j.data ?? []).filter((m) => !m.supported_parameters || m.supported_parameters.includes("tools"))
    .map((m) => ({ id: m.id, label: m.name || m.id, in: m.pricing?.prompt != null ? Number(m.pricing.prompt) * 1e6 : null, out: m.pricing?.completion != null ? Number(m.pricing.completion) * 1e6 : null }))
    .sort((a, b) => a.id.localeCompare(b.id));
  routerCache = { at: Date.now(), items };
  return items;
}

export async function modelsOf(id: ProviderId): Promise<ModelOption[]> {
  if (id === "openrouter_api") return openRouterModels();
  if (PROVIDERS[id].models) return PROVIDERS[id].models!();
  return staticModels(PROVIDERS[id].family);
}

/** o identificador serve para esta fonte? Nas de catálogo aberto confere só o formato: quem diz se o modelo existe é a própria fonte */
export function modelFits(id: ProviderId, model: string) {
  if (id === "openrouter_api") return /^[\w.-]+\/[\w.:-]+$/.test(model);
  if (PROVIDERS[id]?.fits) return PROVIDERS[id].fits!(model);
  return MODELS[model]?.family === PROVIDERS[id].family;
}
/** a fonte de um modelo quando só o modelo foi escolhido */
export const providerFor = (model: string): ProviderId | null => (model.includes("/") ? "openrouter_api" : MODELS[model]?.family === "openai" ? "openai_api" : MODELS[model]?.family === "anthropic" ? "anthropic_api" : null);
/** o custo desta ida: o que a fonte informou, ou a tabela de preços (para fonte que não cobra por token é o equivalente na API) */
export const turnCost = (model: string, out: TurnOut) => out.costUsd ?? costOf(model, out.usage);
export const modelLabel = (model: string) => MODELS[model]?.label ?? model;
