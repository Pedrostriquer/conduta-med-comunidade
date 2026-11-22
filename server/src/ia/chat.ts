/* O chat de IA do app. A pessoa pergunta; o modelo responde chamando as mesmas ferramentas do plugin (buscar e ler questões,
   assuntos, transcrição do vídeo, criar flashcards e listas), com a mesma confirmação em dois passos nas escritas.
   Cada resposta vira uma linha de ai_runs com a fonte, o modelo, os tokens de cada tipo e o custo equivalente na API:
   é o que deixa limitar por pessoa e comparar fontes e modelos no painel. */
import { z } from "zod";
import { one, q, tx } from "../db";
import { HttpError } from "../http";
import type { UserRow } from "../http";
import { getSetting } from "../lib/settings";
import { recordError } from "../lib/monitor";
import { env } from "../env";
import { shapeOf, toolRunner } from "../mcp/define";
import type { AnyTool, RequestCtx } from "../mcp/define";
import { CORE_RULES } from "../mcp/instructions";
import { COMMON_TOOLS } from "../mcp/server";
import { creditOf, globalSpent, percentOf } from "./credit";
import { ModelError } from "./model";
import { chatTurn, isProvider, modelFits, providerFor, providerReady, PROVIDERS, turnCost } from "./providers";
import type { Block, Msg, ProviderId, ToolSpec } from "./providers";
import { costOf, MODELS } from "./pricing";
import type { Usage } from "./pricing";
import { startOfDay } from "./packages";

/** o que o chat pode usar: ler o banco e os dados da própria pessoa, e as duas escritas que nascem de uma conversa de estudo */
const CHAT_TOOL_NAMES = [
  "conduta_buscar_questoes", "conduta_catalogo", "conduta_ler_questao", "conduta_transcricao_explicacao", "conduta_assuntos",
  "conduta_estatisticas", "conduta_erros", "conduta_padroes_de_erro", "conduta_listar_baralhos", "conduta_criar_flashcards",
  "conduta_sugerir_lista", "conduta_criar_lista", "conduta_guia",
];
const MAX_TOKENS = 4096, TOOL_RESULT_MAX = 12_000, OLD_RESULT_MAX = 1500, HISTORY_CHARS = 90_000, TEXT_MAX = 4000;
/** pior caso de uma resposta, para reservar crédito enquanto ela roda */
const WORST: Usage = { in: 60_000, out: 8000 };

let cached: { tools: AnyTool[]; specs: ToolSpec[] } | null = null;
const CTX: RequestCtx = { mode: "chat", ip: "app", user: null };
export function chatTools() {
  if (cached) return cached;
  const tools = CHAT_TOOL_NAMES.map((n) => COMMON_TOOLS.find((t) => t.name === n)).filter(Boolean) as AnyTool[];
  const specs = tools.map((t) => {
    const { $schema: _drop, ...schema } = z.toJSONSchema(z.strictObject(shapeOf(CTX, t)), { io: "input" }) as Record<string, unknown>;
    return { name: t.name, description: t.description, schema };
  });
  return (cached = { tools, specs });
}

export function systemFor(u: UserRow) {
  const first = u.name.trim().split(/\s+/)[0] || "";
  return `Você é a IA do Conduta Med, a plataforma gratuita de questões de residência médica (${env.publicUrl}). Está conversando dentro do app com ${first || "a pessoa"}, que estuda para a prova de residência.

O QUE VOCÊ FAZ
Responde sobre o banco de questões e sobre o estudo da pessoa usando as ferramentas: quantas vezes e como um tema caiu numa banca, quais questões, o que a resolução diz, o trecho do resumo do assunto, o que o professor fala no vídeo da correção, onde a pessoa mais erra. Também monta lista de questões e cria flashcards quando ela quiser.

COMO RESPONDER
- Para "quanto caiu" ou "como caiu": busque com conduta_buscar_questoes (banca, ano, tema, especialidade ou palavras; conduta_catalogo dá os nomes certos), diga o total que a busca devolveu e leia uma amostra com conduta_ler_questao antes de descrever o padrão. Diga quando é amostra e de quantas.
- Cite cada questão pelo nome da prova e número, com o link do app que a ferramenta devolve. Se houver, dê o link do trecho do resumo do assunto e o link do vídeo no segundo exato.
- Escreva em Markdown simples: frases curtas, listas quando ajudam, links no formato [texto](endereço). Sem tabelas largas.
- Depois de responder, pode oferecer uma coisa só que faça sentido (por exemplo, criar flashcards do que foi visto ou montar uma lista). Não insista.
- Se a pessoa estiver treinando com você, não mostre gabarito nem explicação antes de ela responder.
- Toda escrita tem dois passos: a primeira chamada devolve a prévia e um token_confirmacao; mostre a prévia com as suas palavras, espere um sim claro e só então repita a chamada com os mesmos argumentos e o token.
- Não é consulta médica: é estudo para prova. Não oriente tratamento de paciente real.
${CORE_RULES.slice(1).map((r) => "- " + r).join("\n")}
- Respostas curtas, como numa conversa.`;
}

export type ChatSetup = { enabled: boolean; provider: ProviderId; model: string; effort: string; thinking: boolean; daily: number; maxRounds: number; fallback: { provider: ProviderId; model: string } | null };
/** o que vale para esta pessoa: o padrão do painel, trocado pelo que o admin ajustou só para ela */
export async function setupFor(userId: string): Promise<ChatSetup> {
  const cfg = await getSetting("chat");
  const o = await one<{ chat_enabled: boolean | null; chat_provider: string | null; chat_model: string | null; chat_daily: number | null }>("SELECT chat_enabled, chat_provider, chat_model, chat_daily FROM ai_user WHERE user_id = $1", [userId]);
  let provider = (isProvider(cfg.provider) ? cfg.provider : "anthropic_api") as ProviderId, model = cfg.model;
  if (o?.chat_provider && isProvider(o.chat_provider)) {
    provider = o.chat_provider;
    // trocou só a fonte: o modelo padrão serve se for dela; senão, o primeiro modelo fixo dessa fonte
    if (o.chat_model && modelFits(provider, o.chat_model)) model = o.chat_model;
    else if (!modelFits(provider, model)) model = Object.keys(MODELS).find((m) => modelFits(provider, m)) ?? model;
  } else if (o?.chat_model) {
    // trocou só o modelo: a fonte acompanha, a menos que a fonte padrão já o aceite
    const p = modelFits(provider, o.chat_model) ? provider : providerFor(o.chat_model);
    if (p) { provider = p; model = o.chat_model; }
  }
  const fb = cfg.fallbackProvider && isProvider(cfg.fallbackProvider) && cfg.fallbackProvider !== provider && modelFits(cfg.fallbackProvider, cfg.fallbackModel) ? { provider: cfg.fallbackProvider as ProviderId, model: cfg.fallbackModel } : null;
  return { enabled: o?.chat_enabled ?? cfg.enabled, provider, model, effort: cfg.effort, thinking: cfg.thinking, daily: o?.chat_daily ?? cfg.dailyMessages, maxRounds: cfg.maxRounds, fallback: fb };
}

export async function sentToday(userId: string) {
  const r = await one<{ n: number }>("SELECT count(*) AS n FROM ai_runs WHERE user_id = $1 AND kind = 'chat' AND created_at >= $2", [userId, new Date(startOfDay().ms)]);
  return r?.n || 0;
}

/** por que não dá para conversar agora (null: pode) */
export async function chatBlock(userId: string, s: ChatSetup) {
  if (!s.enabled) return { code: "desligado", message: "O chat de IA ainda não está ligado para a sua conta." };
  // a fonte tem de estar pronta e com um modelo dela; se não estiver, a reserva pronta basta
  const ok = (modelFits(s.provider, s.model) && (await providerReady(s.provider))) || (!!s.fallback && (await providerReady(s.fallback.provider)));
  if (!ok) return { code: "sem_fonte", message: "O chat de IA ainda não foi ligado." };
  if ((await sentToday(userId)) >= s.daily) return { code: "limite_dia", message: "Você chegou ao limite de mensagens de hoje. Amanhã tem mais." };
  const cfg = await getSetting("ia");
  if (cfg.capUsd != null && PROVIDERS[s.provider].billing === "api" && (await globalSpent()) >= cfg.capUsd) return { code: "pausa", message: "A IA volta no mês que vem." };
  if ((await creditOf(userId)).left <= 0) return { code: "sem_credito", message: "Seu crédito de IA deste mês acabou. Ele renova no dia 1." };
  return null;
}

type Row = { role: "user" | "assistant"; blocks: Block[] };
const sizeOf = (m: Row) => m.blocks.reduce((n, b) => n + (b.type === "text" ? b.text.length : b.type === "tool_result" ? b.content.length : b.type === "tool_use" ? JSON.stringify(b.input).length + 40 : 0), 0);
const isQuestion = (m: Row) => m.role === "user" && m.blocks.some((b) => b.type === "text");

/** a conversa que vai para o modelo: resultados antigos de ferramenta encolhem e o começo cai quando passa do tamanho, sempre num ponto em que a pessoa falou */
export function historyFor(rows: Row[]): Msg[] {
  const slim = rows.map((m) => ({ role: m.role, blocks: m.blocks.map((b) => (b.type === "tool_result" && b.content.length > OLD_RESULT_MAX ? { ...b, content: b.content.slice(0, OLD_RESULT_MAX) + "\n…(resto cortado; chame a ferramenta de novo se precisar)" } : b)) }));
  let total = slim.reduce((n, m) => n + sizeOf(m), 0), from = 0;
  for (let i = 0; i < slim.length && total > HISTORY_CHARS; i++) {
    total -= sizeOf(slim[i]);
    from = i + 1;
  }
  while (from < slim.length && !isQuestion(slim[from])) from++;
  return slim.slice(from).map((m) => ({ role: m.role, content: m.blocks }));
}

export type ChatEvent =
  | { type: "inicio"; chatId: string; title: string }
  | { type: "texto"; delta: string }
  | { type: "ferramenta"; name: string; title: string; status: "chamando" | "feito" | "erro" }
  | { type: "fim"; percentLeft: number; dailyLeft: number }
  | { type: "erro"; message: string };

const addUsage = (a: Usage, b: Usage): Usage => ({ in: a.in + b.in, out: a.out + b.out, cacheRead: (a.cacheRead || 0) + (b.cacheRead || 0), cacheWrite: (a.cacheWrite || 0) + (b.cacheWrite || 0) });
const keep = (blocks: Block[]) => blocks.filter((b) => b.type !== "native");

/** Uma pergunta da pessoa até a resposta final. `emit` recebe o texto conforme sai e o que a IA está consultando. */
export async function ask(user: UserRow, input: { chatId?: string; text: string; ip: string }, emit: (e: ChatEvent) => void, signal?: AbortSignal) {
  const text = input.text.trim().slice(0, TEXT_MAX);
  const s = await setupFor(user.id);
  const block = await chatBlock(user.id, s);
  if (block) throw new HttpError("limite", block.message, { motivo: block.code });
  const provider = PROVIDERS[s.provider], { tools, specs } = chatTools();
  // a fonte e o modelo em uso nesta resposta: mudam para a reserva se a fonte escolhida falhar
  let active = { provider: s.provider, model: s.model }, fellBack = false;

  // a conversa e a reserva de crédito entram juntas; uma resposta por vez por pessoa
  const { chatId, title, runId, prior } = await tx(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 7))", [user.id]);
    const running = await one<{ n: number }>("SELECT count(*) AS n FROM ai_runs WHERE user_id = $1 AND kind = 'chat' AND status = 'rodando'", [user.id], db);
    if (running?.n) throw new HttpError("limite", "Espere a resposta anterior terminar.");
    const cr = await creditOf(user.id, db);
    let chat = input.chatId ? await one<{ id: string; title: string }>("SELECT id, title FROM ai_chats WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL", [input.chatId, user.id], db) : null;
    if (input.chatId && !chat) throw new HttpError("nao_encontrado", "Não encontramos essa conversa.");
    chat ??= (await one<{ id: string; title: string }>("INSERT INTO ai_chats (user_id, title) VALUES ($1, $2) RETURNING id, title", [user.id, text.replace(/\s+/g, " ").slice(0, 70)], db))!;
    const prior = await q<Row>("SELECT role, blocks FROM ai_chat_messages WHERE chat_id = $1 ORDER BY id", [chat.id], db);
    const run = await one<{ id: string }>(
      `INSERT INTO ai_runs (user_id, kind, trigger, model, effort, provider, billing, chat_id, reserved_usd, prompt_chars, source)
       VALUES ($1, 'chat', 'manual', $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [user.id, s.model, s.effort, s.provider, provider.billing, chat.id, Math.min(costOf(s.model, WORST), cr.left), text.length, JSON.stringify({ chat: chat.id })], db,
    );
    await db.query("INSERT INTO ai_chat_messages (chat_id, role, blocks, run_id) VALUES ($1, 'user', $2, $3)", [chat.id, JSON.stringify([{ type: "text", text }]), run!.id]);
    await db.query("UPDATE ai_chats SET updated_at = now() WHERE id = $1", [chat.id]);
    return { chatId: chat.id, title: chat.title, runId: run!.id, prior };
  });
  emit({ type: "inicio", chatId, title });

  const started = Date.now(), ctx: RequestCtx = { mode: "chat", ip: input.ip, user };
  const messages: Msg[] = [...historyFor(prior), { role: "user", content: [{ type: "text", text }] }];
  const produced: Row[] = [];
  let usage: Usage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 }, cost = 0, rounds = 0, calls = 0;
  const save = async () => {
    for (const m of produced) await q("INSERT INTO ai_chat_messages (chat_id, role, blocks, run_id) VALUES ($1, $2, $3, $4)", [chatId, m.role, JSON.stringify(m.blocks), runId]);
    produced.length = 0;
  };
  try {
    for (;;) {
      rounds++;
      const last = rounds >= s.maxRounds;
      const turn = () => chatTurn(active.provider, {
        model: active.model, effort: s.effort, thinking: s.thinking, system: systemFor(user) + (last ? "\n\nVocê já consultou bastante nesta resposta: responda agora com o que tem, sem chamar mais ferramentas." : ""),
        messages, tools: specs, noTools: last, maxTokens: MAX_TOKENS, onText: (delta) => { wrote = true; emit({ type: "texto", delta }); }, signal,
      });
      let out, wrote = false;
      try { out = await turn(); }
      catch (e) {
        // limite do plano, crédito esgotado, credencial ou pedido recusado: uma vez por resposta, tenta a reserva.
        // Só se esta ida ainda não escreveu nada, para o texto não sair duas vezes.
        if (!(e instanceof ModelError) || !e.kind || fellBack || wrote || !s.fallback || !(await providerReady(s.fallback.provider))) throw e;
        fellBack = true;
        active = s.fallback;
        out = await turn();
      }
      usage = addUsage(usage, out.usage);
      cost += turnCost(active.model, out);
      if (out.stop === "recusa") throw new ModelError("A IA não pôde responder a esse pedido.");
      messages.push({ role: "assistant", content: out.content });
      produced.push({ role: "assistant", blocks: keep(out.content) });
      const wanted = out.content.filter((b) => b.type === "tool_use");
      if (!wanted.length || last) break;
      const results: Block[] = [];
      for (const call of wanted) {
        if (call.type !== "tool_use") continue;
        calls++;
        const def = tools.find((t) => t.name === call.name);
        emit({ type: "ferramenta", name: call.name, title: def?.title ?? call.name, status: "chamando" });
        // o plugin valida os argumentos antes de chamar (é o que preenche os valores padrão); aqui a validação é a mesma
        const args = def ? z.strictObject(shapeOf(ctx, def)).safeParse(call.input) : null;
        const fail = (text: string) => ({ isError: true, content: [{ type: "text" as const, text }] });
        const r = !def ? fail("Essa ferramenta não existe aqui.")
          : !args!.success ? fail("Argumentos inválidos: " + args!.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`).join("; ").slice(0, 600))
          : await toolRunner(ctx, def)(args!.data as Record<string, unknown>);
        const failed = "isError" in r && !!r.isError;
        results.push({ type: "tool_result", tool_use_id: call.id, content: r.content.map((x) => x.text).join("\n").slice(0, TOOL_RESULT_MAX), ...(failed ? { is_error: true } : {}) });
        emit({ type: "ferramenta", name: call.name, title: def?.title ?? call.name, status: failed ? "erro" : "feito" });
      }
      messages.push({ role: "user", content: results });
      produced.push({ role: "user", blocks: results });
      emit({ type: "texto", delta: "\n\n" });
    }
    await save();
    await q(
      `UPDATE ai_runs SET status = 'feito', tokens_in = $2, tokens_out = $3, cache_read = $4, cache_write = $5, cost_usd = $6, reserved_usd = 0, rounds = $7, tool_calls = $8, finished_at = now(), ms = $9,
         provider = $10, model = $11, billing = $12, fallback_from = $13 WHERE id = $1`,
      [runId, usage.in, usage.out, usage.cacheRead || 0, usage.cacheWrite || 0, cost, rounds, calls, Date.now() - started, active.provider, active.model, PROVIDERS[active.provider].billing, fellBack ? s.provider : null],
    );
  } catch (e) {
    if (!(e instanceof ModelError)) recordError(e);
    // o que já foi gasto fica medido; a pessoa não é cobrada por uma resposta que falhou (mesma regra das análises)
    await q(
      `UPDATE ai_runs SET status = 'erro', charged = false, tokens_in = $2, tokens_out = $3, cache_read = $4, cache_write = $5, cost_usd = $6, reserved_usd = 0, rounds = $7, tool_calls = $8, error = $9, finished_at = now(), ms = $10,
         provider = $11, model = $12, billing = $13, fallback_from = $14 WHERE id = $1`,
      [runId, usage.in, usage.out, usage.cacheRead || 0, usage.cacheWrite || 0, cost, rounds, calls, (e as Error).message.slice(0, 500), Date.now() - started, active.provider, active.model, PROVIDERS[active.provider].billing, fellBack ? s.provider : null],
    ).catch((err) => console.error("chat:", err.message));
    // uma resposta pela metade deixaria chamadas de ferramenta sem resultado: a pergunta fica, o resto não
    emit({ type: "erro", message: e instanceof ModelError ? e.message : "Algo deu errado do nosso lado. Tente de novo em instantes." });
    return { chatId, runId };
  }
  const cr = await creditOf(user.id);
  emit({ type: "fim", percentLeft: Math.max(0, 100 - percentOf(cr.spent + cr.reserved, cr.limit)), dailyLeft: Math.max(0, s.daily - (await sentToday(user.id))) });
  return { chatId, runId };
}

export type Shown = { id: number; role: "user" | "assistant"; text: string; tools: string[]; at: number };
/** o que a tela mostra: as falas e, em cada resposta, o que a IA consultou. Resultado de ferramenta não aparece */
export function display(rows: { id: number; role: string; blocks: Block[]; created_at: Date }[]): Shown[] {
  const titles = new Map(chatTools().tools.map((t) => [t.name, t.title]));
  const out: Shown[] = [];
  for (const m of rows) {
    const text = m.blocks.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n\n").trim();
    const tools = m.blocks.flatMap((b) => (b.type === "tool_use" ? [titles.get(b.name) ?? b.name] : []));
    const at = new Date(m.created_at).getTime();
    if (m.role === "user") { if (text) out.push({ id: m.id, role: "user", text, tools: [], at }); continue; }
    // as idas seguidas da mesma resposta viram um balão só
    const prev = out[out.length - 1];
    if (prev?.role === "assistant") { prev.text = [prev.text, text].filter(Boolean).join("\n\n"); prev.tools.push(...tools); }
    else if (text || tools.length) out.push({ id: m.id, role: "assistant", text, tools, at });
  }
  return out;
}
