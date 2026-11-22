/* Flashcards no formato exato do app (features/flashcards/make.ts, db.ts e config.ts). Baralhos importados do Anki podem
   ter dezenas de milhares de cards, então a leitura é feita com SQL sobre o JSON em vez de carregar tudo.
   Os números saem como float8 porque o agendamento do app pode gravar `due` com casas decimais. */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { AREAS } from "../../bank";
import { one, q } from "../../db";
import { env } from "../../env";
import { getRecord, listRecords } from "../../records";
import type { Change } from "../../records";
import { cat, norm } from "../catalog";
import { PERIODS, pct, secs, settingsOf, sinceOf, saveIa } from "../data";
import { dayKey, endOfToday } from "../dates";
import { readTool, ToolError, writeTool } from "../define";

export type DeckRec = { id: string; name: string; file: string; importedAt: number; cards: number; images: number; groups: string[] };
type Tipo = "basico" | "invertido" | "lacunas";
type Preset = Record<string, unknown> & { id: string; name: string; profile?: string; newPerDay: number | null; maxReviews: number; leechThreshold: number; startEase: number; fsrs: boolean; retention: number; reviewOrder: string; mix: string };
type FcConfig = { presets: Record<string, Preset>; deckPreset: Record<string, string>; paused: Record<string, true>; deckLimits: Record<string, { newPerDay?: number; maxReviews?: number }>; today: Record<string, unknown> };

const DEFAULT_ID = "padrao", ERR_DECK = "meus-erros";
const DEFAULT_FSRS = "0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621";
const defaults = (id = DEFAULT_ID, name = "Padrão"): Preset => ({
  id, name, profile: "padrao", newPerDay: null, maxReviews: 200, newIgnoresReviewLimit: false, limitsFromTop: false,
  learnSteps: [1, 10], graduatingIvl: 1, easyIvl: 4, insertOrder: "sequencial", relearnSteps: [10], minIvl: 1, leechThreshold: 8, leechAction: "marcar",
  newGather: "baralho", newOrder: "baralho", mix: "misturar", interdayMix: "misturar", reviewOrder: "vencimento", buryNew: true, buryReview: true, buryInterday: false,
  noAutoplay: false, skipQuestionOnReplay: false, maxAnswerSecs: 60, showTimer: false, stopTimerOnAnswer: true,
  autoQuestionSecs: 0, autoAnswerSecs: 0, autoWaitAudio: true, autoQuestionAction: "mostrar_resposta", autoAnswerAction: "bom",
  easyDays: ["normal", "normal", "normal", "normal", "normal", "normal", "normal"], maxIvl: 36500, startEase: 2.5, easyBonus: 1.3, ivlModifier: 1, hardMult: 1.2, lapseIvl: 0,
  historicalRetention: 0.9, ignoreBefore: "", customScheduling: "", fsrs: true, retention: 0.9, fsrsParams: DEFAULT_FSRS, rescheduleOnChange: false,
});

const PROFILES: Record<"leve" | "padrao" | "reta_final", { id: string; name: string; hint: string; set: Partial<Preset> }> = {
  leve: { id: "leve", name: "Leve", hint: "Internato pesado, plantões: poucos cards novos e teto baixo de revisões.", set: { newPerDay: 10, maxReviews: 100, retention: 0.85, fsrs: true, reviewOrder: "vencimento", mix: "misturar" } },
  padrao: { id: "padrao", name: "Padrão", hint: "Rotina regular: 20 novos por dia e lembrar 9 de cada 10 cards.", set: { newPerDay: 20, maxReviews: 200, retention: 0.9, fsrs: true, reviewOrder: "vencimento", mix: "misturar" } },
  reta_final: { id: "reta", name: "Reta final", hint: "Últimas semanas: quase nada novo, sem teto de revisões, os mais esquecidos primeiro.", set: { newPerDay: 3, maxReviews: 9999, retention: 0.92, fsrs: true, reviewOrder: "recuperabilidade", mix: "depois" } },
};

/* ---------- opções do baralho: nome em português, onde mora no Preset e o que faz ---------- */
const STEPS = z.array(z.number().min(0.1).max(525600)).max(10);
const OPTS = {
  novos_por_dia: { key: "newPerDay", schema: z.number().int().min(0).max(9999).nullable(), desc: "Quantos cards novos entram por dia. null usa o valor geral dos ajustes." },
  maximo_de_revisoes_por_dia: { key: "maxReviews", schema: z.number().int().min(0).max(9999), desc: "Teto de revisões por dia. 9999 é sem teto." },
  passos_de_aprendizado_min: { key: "learnSteps", schema: STEPS, desc: "Em quantos minutos um card novo volta a cada acerto antes de virar revisão. Padrão [1, 10]: volta em 1 min e depois em 10 min." },
  intervalo_ao_formar_dias: { key: "graduatingIvl", schema: z.number().int().min(1).max(365), desc: "Em quantos dias volta o card que terminou os passos com Bom." },
  intervalo_do_facil_dias: { key: "easyIvl", schema: z.number().int().min(1).max(365), desc: "Em quantos dias volta o card novo marcado como Fácil." },
  passos_ao_errar_min: { key: "relearnSteps", schema: STEPS, desc: "Quando errar uma revisão: em quantos minutos o card volta. Padrão [10]. Lista vazia manda direto para o intervalo mínimo." },
  intervalo_minimo_apos_erro_dias: { key: "minIvl", schema: z.number().int().min(1).max(365), desc: "Menor intervalo depois de errar uma revisão." },
  fracao_do_intervalo_apos_erro: { key: "lapseIvl", schema: z.number().min(0).max(1), desc: "Quanto do intervalo sobra depois de errar: 0 recomeça do mínimo, 0.5 mantém metade." },
  limite_sanguessuga: { key: "leechThreshold", schema: z.number().int().min(1).max(99), desc: "Quantos erros até o card virar sanguessuga." },
  acao_sanguessuga: { key: "leechAction", schema: z.enum(["marcar", "suspender"]), desc: "O que fazer com a sanguessuga: só marcar ou suspender." },
  ordem_das_revisoes: { key: "reviewOrder", schema: z.enum(["vencimento", "vencimento_baralho", "intervalo", "intervalo_desc", "facilidade", "recuperabilidade", "aleatoria"]), desc: "Ordem das revisões. recuperabilidade traz primeiro os mais esquecidos." },
  novos_e_revisoes: { key: "mix", schema: z.enum(["misturar", "antes", "depois"]), desc: "Cards novos misturados com as revisões, antes ou depois delas." },
  enterrar_irmaos_novos: { key: "buryNew", schema: z.boolean(), desc: "Deixa para amanhã os outros cards novos da mesma nota." },
  enterrar_irmaos_revisao: { key: "buryReview", schema: z.boolean(), desc: "Deixa para amanhã as outras revisões da mesma nota." },
  segundos_maximos_por_resposta: { key: "maxAnswerSecs", schema: z.number().int().min(5).max(600), desc: "Tempo máximo contado em cada card." },
  mostrar_cronometro: { key: "showTimer", schema: z.boolean(), desc: "Mostra o cronômetro na revisão." },
  dias_faceis: { key: "easyDays", schema: z.array(z.enum(["normal", "reduzido", "minimo"])).length(7), desc: "Carga de cada dia da semana, de domingo a sábado: normal, reduzido ou minimo." },
  intervalo_maximo_dias: { key: "maxIvl", schema: z.number().int().min(1).max(36500), desc: "Maior intervalo entre revisões. Na reta final, reduzir faz os cards voltarem antes da prova." },
  facilidade_inicial: { key: "startEase", schema: z.number().min(1.3).max(5), desc: "Facilidade com que um card novo começa: quanto o intervalo cresce a cada Bom. Padrão 2.5." },
  bonus_do_facil: { key: "easyBonus", schema: z.number().min(1).max(5), desc: "Quanto a mais o intervalo cresce com Fácil. Padrão 1.3." },
  modificador_de_intervalo: { key: "ivlModifier", schema: z.number().min(0.1).max(5), desc: "Multiplica todos os intervalos. Menos de 1 faz os cards voltarem antes." },
  multiplicador_do_dificil: { key: "hardMult", schema: z.number().min(1).max(2), desc: "Quanto o intervalo cresce com Difícil. Padrão 1.2." },
  usar_fsrs: { key: "fsrs", schema: z.boolean(), desc: "Liga o agendamento pela retenção desejada." },
  retencao_desejada: { key: "retention", schema: z.number().min(0.7).max(0.97), desc: "Quanto a pessoa quer lembrar quando o card volta. 0.9 é lembrar 9 de cada 10; mais alto significa mais revisões." },
} as const;
type OptName = keyof typeof OPTS;

/* ---------- leitura ---------- */
const clean = (h: unknown, max = 500) => {
  const s = String(h ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\n{2,}/g, "\n").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
};
const decksOf = async (uid: string) => (await listRecords<DeckRec>(uid, "fc_deck")).map((r) => r.data).filter((d) => d?.id);
export async function fcConfigOf(uid: string): Promise<FcConfig> {
  const r = await getRecord<Partial<FcConfig>>(uid, "fc_config", "main");
  const presets = Object.fromEntries(Object.entries({ [DEFAULT_ID]: defaults(), ...(r?.presets || {}) }).map(([k, v]) => [k, { ...defaults(k, v.name), ...v }]));
  return { presets, deckPreset: r?.deckPreset || {}, paused: r?.paused || {}, deckLimits: r?.deckLimits || {}, today: r?.today || {} };
}
const presetFor = (deck: string, s: FcConfig) => s.presets[s.deckPreset[deck]] || s.presets[DEFAULT_ID] || defaults();

/** de qual perfil pronto a predefinição está igual, como profileOf do app */
function profileOf(p: Preset, geral: number) {
  const keys = ["newPerDay", "maxReviews", "reviewOrder", "mix", ...(p.fsrs ? ["retention"] : [])];
  const val = (k: string) => (k === "newPerDay" ? p.newPerDay ?? geral : p[k]);
  return Object.values(PROFILES).find((pr) => keys.every((k) => val(k) === (pr.set as Record<string, unknown>)[k]))?.name ?? "Personalizado";
}

/** o baralho pelo nome (sem ligar para acento) ou pelo id */
export async function findDeck(uid: string, ref: string): Promise<DeckRec> {
  const ds = await decksOf(uid), n = norm(ref.trim());
  const hit = ds.find((d) => d.id === ref) || ds.find((d) => norm(d.name) === n);
  if (hit) return hit;
  const partial = ds.filter((d) => norm(d.name).includes(n));
  if (partial.length === 1) return partial[0];
  throw new ToolError(`Não encontrei o baralho "${ref}". ${ds.length ? `Baralhos da pessoa: ${ds.map((d) => d.name).join(", ")}.` : "A pessoa ainda não tem baralhos."}`);
}
async function deckCounts(uid: string) {
  const rows = await q<{ deck: string; total: number; novos: number; aprendendo: number; vencidos: number; suspensos: number; com_lapso: number }>(
    `SELECT data->>'deck' AS deck, count(*) AS total,
       count(*) FILTER (WHERE (data->>'isNew')::float8 = 1) AS novos,
       count(*) FILTER (WHERE (data->>'isNew')::float8 = 0 AND (data->>'step')::float8 > 0) AS aprendendo,
       count(*) FILTER (WHERE (data->>'isNew')::float8 = 0 AND (data->>'due')::float8 <= $2 AND coalesce(data->>'suspended','0') <> '1') AS vencidos,
       count(*) FILTER (WHERE data->>'suspended' = '1') AS suspensos,
       count(*) FILTER (WHERE (data->>'lapses')::float8 > 0) AS com_lapso
     FROM user_records WHERE user_id = $1 AND coll = 'fc_card' AND NOT deleted GROUP BY 1`, [uid, endOfToday()]);
  return new Map(rows.map((r) => [r.deck, r]));
}

function cardView(id: string, c: { deck: string; path?: string[]; kind: string; fields: string[]; ord: number; lapses: number; ivl: number; ease: number; reps: number; isNew: number; step: number; due: number; suspended?: number; relearn?: number; tags?: string[]; src?: { q?: string; ai?: number } }, deckName: string) {
  const [frente, verso] = c.kind === "basic" && c.ord === 1 ? [c.fields[1], c.fields[0]] : [c.fields[0], c.fields[1]];
  return {
    id, baralho: deckName, caminho: (c.path || []).join(" › ") || undefined, tipo: c.kind === "cloze" ? "lacunas" : c.kind !== "basic" ? "lacunas (pergunta e resposta)" : c.ord === 1 ? "invertido" : "basico",
    frente: clean(frente), verso: clean(verso), lapsos: c.lapses, intervalo_dias: c.ivl, facilidade: c.ease, repeticoes: c.reps,
    estado: c.suspended ? "suspenso" : c.isNew ? "novo" : c.step > 0 ? (c.relearn ? "reaprendendo" : "aprendendo") : "revisão", vence: c.isNew ? null : dayKey(c.due),
    etiquetas: c.tags?.length ? c.tags : undefined, questao_id: c.src?.q, gerado_por_ia: c.src?.ai ? true : undefined,
  };
}

/* ---------- criar cards: como makeCards e html() de make.ts ---------- */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = (s: string) => esc(s).replace(/\n/g, "<br>").replace(/&lt;(\/?)(b|i|u|br|sub|sup)&gt;/g, "<$1$2>");
const uid = () => randomBytes(5).toString("hex") + Date.now().toString(36).slice(-4);

type CardIn = { frente: string; verso?: string; tipo: Tipo; etiquetas?: string[]; questao_id?: string };

function makeCards(c: CardIn, deck: string, startEase: number, order: number) {
  const q0 = c.questao_id ? cat().byId.get(c.questao_id) : undefined;
  const path = q0 ? [AREAS[q0.area] ?? q0.area, ...(q0.esp ? [q0.esp] : [])] : [];
  const f = [toHtml(c.frente), toHtml(c.verso || "")];
  const base = { deck, path, fields: f, due: 0, ivl: 0, ease: startEase, reps: 0, lapses: 0, step: 0, isNew: 1 as const, q: 0, tags: [...new Set([...(c.etiquetas || []), "gerado-por-ia"])], own: 1 as const, src: { ai: 1 as const, ...(c.questao_id ? { q: c.questao_id } : {}) } };
  const note = uid();
  if (c.tipo === "lacunas") {
    const ns = [...new Set([...f[0].matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
    return ns.map((n, i) => ({ ...base, id: `${deck}:u${note}:${n - 1}`, kind: "cloze", ord: n - 1, order: order + i, due: order + i }));
  }
  const xs = [{ ...base, id: `${deck}:u${note}:0`, kind: "basic", ord: 0, order, due: order }];
  if (c.tipo === "invertido") xs.push({ ...base, id: `${deck}:u${note}:1`, kind: "basic", ord: 1, order: order + 1, due: order + 1 });
  return xs;
}

const frontKey = (html: string) => norm(clean(html, 2000)).replace(/\s+/g, " ");

async function planCards(uidUser: string, a: { baralho_nome: string; cards: CardIn[] }) {
  const b = cat(), name = a.baralho_nome.trim(), n = norm(name), ds = await decksOf(uidUser);
  const deck = ds.find((d) => norm(d.name) === n) || (n === "meus erros" ? ds.find((d) => d.id === ERR_DECK) : undefined) || null;
  const problems: string[] = [];
  a.cards.forEach((c, i) => {
    const pos = `Card ${i + 1}`;
    if (c.tipo === "lacunas" && !/\{\{c\d+::[\s\S]+?\}\}/.test(c.frente)) problems.push(`${pos}: lacunas precisam de {{c1::texto}} na frente.`);
    if (c.tipo !== "lacunas" && !c.verso?.trim()) problems.push(`${pos}: falta o verso.`);
    if (c.questao_id && !b.byId.has(c.questao_id)) problems.push(`${pos}: a questão ${c.questao_id} não existe.`);
  });
  if (problems.length) throw new ToolError(problems.slice(0, 8).join(" "));
  const existing = new Set<string>();
  if (deck) for (const r of await q<{ f: string }>("SELECT data->'fields'->>0 AS f FROM user_records WHERE user_id = $1 AND coll = 'fc_card' AND NOT deleted AND data->>'deck' = $2", [uidUser, deck.id])) existing.add(frontKey(r.f || ""));
  const seen = new Set<string>(), fresh: CardIn[] = [];
  for (const c of a.cards) { const k = frontKey(toHtml(c.frente)); if (existing.has(k) || seen.has(k)) continue; seen.add(k); fresh.push(c); }
  return { deck, name, fresh, duplicated: a.cards.length - fresh.length };
}

const ETIQUETA = z.string().min(1).max(40);

export const tools = [
  readTool({
    name: "conduta_listar_baralhos", title: "Listar baralhos", group: "Flashcards", summary: "Os baralhos da pessoa com cards novos, vencidos, suspensos e o perfil de cada um.",
    description: "Use para saber quais baralhos a pessoa tem e como estão: total de cards, novos, vencidos hoje, suspensos, com erro e o perfil de estudo de cada um. Chame antes de criar cards ou mudar opções. Para ver os cards, conduta_ver_flashcards.",
    input: {},
    run: async (_a, c) => {
      const [ds, counts, cfg, s] = await Promise.all([decksOf(c.user.id), deckCounts(c.user.id), fcConfigOf(c.user.id), settingsOf(c.user.id)]);
      return {
        resumo: `${ds.length} baralhos`,
        data: { baralhos: ds.sort((x, y) => y.importedAt - x.importedAt).map((d) => { const n = counts.get(d.id); return { id: d.id, nome: d.name, cards: n?.total ?? 0, novos: n?.novos ?? 0, vencidos_hoje: n?.vencidos ?? 0, aprendendo: n?.aprendendo ?? 0, suspensos: n?.suspensos ?? 0, com_erro: n?.com_lapso ?? 0, perfil: profileOf(presetFor(d.id, cfg), s.cardsNovosPorDia), link: `${env.publicUrl}/flashcards/baralho/${encodeURIComponent(d.id)}` }; }), importar_e_criar: `${env.publicUrl}/flashcards` },
      };
    },
  }),
  readTool({
    name: "conduta_ver_flashcards", title: "Ver flashcards", group: "Flashcards", summary: "Os cards em texto limpo, com lapsos e intervalo, filtrando errados, sanguessugas, vencidos ou novos.",
    description: "Use para ver os flashcards da pessoa, principalmente os que ela erra, e gerar inteligência a partir deles: texto limpo de frente e verso, lapsos (quantas vezes errou), intervalo e estado. Filtros: errados, sanguessugas (erra sempre), vencidos, novos ou todos. Paginado. Para números gerais, conduta_estatisticas_flashcards.",
    input: {
      baralho: z.string().optional().describe("Nome ou id do baralho. Sem ele, todos."),
      filtro: z.enum(["errados", "sanguessugas", "vencidos", "novos", "todos"]).default("errados").describe("errados: já errou (lapso, reaprendendo ou De novo nos últimos 30 dias). sanguessugas: erra sempre. vencidos: para revisar hoje. novos: ainda não vistos. todos."),
      limite: z.number().int().min(1).max(100).default(20).describe("Quantos nesta página (até 100)."),
      offset: z.number().int().min(0).default(0).describe("Quantos pular, para a próxima página."),
    },
    run: async (a: { baralho?: string; filtro: "errados" | "sanguessugas" | "vencidos" | "novos" | "todos"; limite: number; offset: number }, c) => {
      const uidU = c.user.id, ds = await decksOf(uidU), names = new Map(ds.map((d) => [d.id, d.name]));
      const deck = a.baralho ? await findDeck(uidU, a.baralho) : null, cfg = await fcConfigOf(uidU);
      const args: unknown[] = [uidU];
      const param = (v: unknown) => { args.push(v); return `$${args.length}`; };
      const conds = [deck ? `data->>'deck' = ${param(deck.id)}` : "true"];
      if (a.filtro === "errados") conds.push(`((data->>'lapses')::float8 > 0 OR data->>'relearn' = '1' OR id IN (SELECT data->>'card' FROM user_records WHERE user_id = $1 AND coll = 'fc_revlog' AND NOT deleted AND data->>'rate' = 'again' AND (data->>'at')::float8 > ${param(Date.now() - 30 * 86_400_000)}))`);
      if (a.filtro === "sanguessugas") conds.push(`(coalesce(data->'tags', '[]'::jsonb) ? 'sanguessuga' OR (data->>'lapses')::float8 >= ${param(deck ? presetFor(deck.id, cfg).leechThreshold : defaults().leechThreshold)})`);
      if (a.filtro === "vencidos") conds.push(`(data->>'isNew')::float8 = 0 AND (data->>'due')::float8 <= ${param(endOfToday())} AND coalesce(data->>'suspended','0') <> '1'`);
      if (a.filtro === "novos") conds.push(`(data->>'isNew')::float8 = 1`);
      const order = a.filtro === "errados" || a.filtro === "sanguessugas" ? "(data->>'lapses')::float8 DESC" : a.filtro === "vencidos" ? "(data->>'due')::float8" : "(data->>'order')::float8";
      const where = `user_id = $1 AND coll = 'fc_card' AND NOT deleted AND ${conds.join(" AND ")}`;
      const total = (await one<{ n: number }>(`SELECT count(*) AS n FROM user_records WHERE ${where}`, args))?.n ?? 0;
      const rows = await q<{ id: string; data: Parameters<typeof cardView>[1] }>(`SELECT id, data FROM user_records WHERE ${where} ORDER BY ${order}, id LIMIT ${a.limite} OFFSET ${a.offset}`, args);
      return { resumo: `${rows.length} de ${total} (${a.filtro})`, data: { filtro: a.filtro, total, offset: a.offset, proxima: a.offset + a.limite < total ? a.offset + a.limite : null, cards: rows.map((r) => cardView(r.id, r.data, names.get(r.data.deck) ?? r.data.deck)) } };
    },
  }),
  readTool({
    name: "conduta_estatisticas_flashcards", title: "Estatísticas de flashcards", group: "Flashcards", summary: "Revisões, retenção real, botões apertados, tempo por card e os cards mais errados no período.",
    description: "Use quando a pessoa perguntar como vão os flashcards: revisões no período, retenção real (acerto nas revisões), botões apertados, tempo por card, dias com revisão, por baralho, o que vence nos próximos dias e os cards mais errados. Flashcards não entram nas estatísticas de questões.",
    input: {
      periodo: z.enum(PERIODS).default("30d").describe("Janela de tempo: 7d, 30d, 90d ou tudo."),
      baralho: z.string().optional().describe("Nome ou id do baralho. Sem ele, todos."),
    },
    run: async (a: { periodo: (typeof PERIODS)[number]; baralho?: string }, c) => {
      const uidU = c.user.id, since = sinceOf(a.periodo), ds = await decksOf(uidU), names = new Map(ds.map((d) => [d.id, d.name])), deck = a.baralho ? await findDeck(uidU, a.baralho) : null;
      const filter = `user_id = $1 AND coll = 'fc_revlog' AND NOT deleted AND (data->>'at')::float8 >= $2${deck ? " AND data->>'deck' = $3" : ""}`, args: unknown[] = [uidU, since, ...(deck ? [deck.id] : [])];
      const rows = await q<{ deck: string; rate: string; kind: string; n: number; ms: number }>(`SELECT data->>'deck' AS deck, data->>'rate' AS rate, data->>'kind' AS kind, count(*) AS n, sum((data->>'ms')::float8)::float8 AS ms FROM user_records WHERE ${filter} GROUP BY 1, 2, 3`, args);
      const days = await one<{ n: number }>(`SELECT count(DISTINCT to_char(to_timestamp((data->>'at')::float8 / 1000) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')) AS n FROM user_records WHERE ${filter}`, args);
      const worst = await q<{ card: string; n: number }>(`SELECT data->>'card' AS card, count(*) AS n FROM user_records WHERE ${filter} AND data->>'rate' = 'again' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, args);
      const worstCards = worst.length ? await q<{ id: string; data: Parameters<typeof cardView>[1] }>("SELECT id, data FROM user_records WHERE user_id = $1 AND coll = 'fc_card' AND NOT deleted AND id = ANY($2)", [uidU, worst.map((w) => w.card)]) : [];
      const end = endOfToday(), ahead = await one<{ hoje: number; sete: number }>(
        `SELECT count(*) FILTER (WHERE (data->>'due')::float8 <= $2) AS hoje, count(*) FILTER (WHERE (data->>'due')::float8 <= $3) AS sete FROM user_records
         WHERE user_id = $1 AND coll = 'fc_card' AND NOT deleted AND (data->>'isNew')::float8 = 0 AND coalesce(data->>'suspended','0') <> '1'${deck ? " AND data->>'deck' = $4" : ""}`, [uidU, end, end + 7 * 86_400_000, ...(deck ? [deck.id] : [])]);
      const botoes = { de_novo: 0, dificil: 0, bom: 0, facil: 0 }, map: Record<string, keyof typeof botoes> = { again: "de_novo", hard: "dificil", good: "bom", easy: "facil" };
      let total = 0, ms = 0, rev = 0, revAgain = 0, novos = 0;
      const perDeck = new Map<string, { n: number; rev: number; again: number }>();
      for (const r of rows) {
        total += r.n; ms += r.ms || 0;
        if (map[r.rate]) botoes[map[r.rate]] += r.n;
        if (r.kind === "new") novos += r.n;
        const d = perDeck.get(r.deck) || { n: 0, rev: 0, again: 0 }; d.n += r.n;
        if (r.kind === "review") { rev += r.n; d.rev += r.n; if (r.rate === "again") { revAgain += r.n; d.again += r.n; } }
        perDeck.set(r.deck, d);
      }
      return {
        resumo: `${total} revisões em ${a.periodo}`,
        data: {
          periodo: a.periodo, revisoes: total, cards_novos_vistos: novos, dias_com_revisao: days?.n ?? 0, retencao_real_pct: rev ? pct(1 - revAgain / rev) : null, tempo_medio_por_card_s: total ? secs(ms / total) : null, botoes,
          por_baralho: [...perDeck.entries()].map(([id, d]) => ({ baralho: names.get(id) ?? id, revisoes: d.n, retencao_pct: d.rev ? pct(1 - d.again / d.rev) : null })).sort((x, y) => y.revisoes - x.revisoes),
          a_vencer: { hoje: ahead?.hoje ?? 0, ate_7_dias: ahead?.sete ?? 0 },
          mais_errados: worst.map((w) => { const r = worstCards.find((x) => x.id === w.card); return { vezes_de_novo: w.n, ...(r ? cardView(r.id, r.data, names.get(r.data.deck) ?? r.data.deck) : { id: w.card }) }; }),
          tela: `${env.publicUrl}/flashcards/estatisticas`,
        },
      };
    },
  }),
  writeTool({
    name: "conduta_criar_flashcards", title: "Criar flashcards", group: "Flashcards", summary: "Cria flashcards num baralho com nome; cria o baralho se ele não existir.",
    description: "Use para criar flashcards num baralho, dando o nome do baralho: se não existir, ele é criado. Bom para cards a partir dos erros (conduta_erros, conduta_ver_flashcards). Tipos: basico (frente e verso), invertido (vira dois cards) e lacunas (frente com {{c1::resposta}}; cada número vira um card). Frente curta, um fato por card, sem inventar dose nem critério. Cards com a mesma frente no baralho são pulados. Pede confirmação: a primeira chamada só mostra a prévia. Até 100 cards por vez.",
    input: {
      baralho_nome: z.string().min(1).max(120).describe("Nome do baralho. Use um existente para somar a ele, ou um nome novo para criar."),
      cards: z.array(z.object({
        frente: z.string().min(1).max(4000).describe("Frente do card. Em lacunas, o texto com {{c1::resposta}}. Aceita <b>, <i>, <u>, <sub> e <sup>."),
        verso: z.string().max(4000).optional().describe("Verso: a resposta e uma linha do porquê. Obrigatório em basico e invertido. Em lacunas, é o texto extra."),
        tipo: z.enum(["basico", "invertido", "lacunas"]).default("basico").describe("basico, invertido (cria também o card ao contrário) ou lacunas."),
        etiquetas: z.array(ETIQUETA).max(10).optional().describe("Etiquetas do card, como cardiologia ou erro:conduta."),
        questao_id: z.string().optional().describe("Id da questão de onde o card veio, como PROVA-2026-Q001. Põe o card no sub-baralho da área dela."),
      })).min(1).max(100).describe("Os cards a criar."),
    },
    preview: async (a: { baralho_nome: string; cards: CardIn[] }, c) => {
      const p = await planCards(c.user.id, a);
      if (!p.fresh.length) throw new ToolError(`Esses cards já existem no baralho "${p.deck?.name ?? p.name}": nada a criar.`);
      const shown = p.fresh.slice(0, 15).map((x, i) => `${i + 1}. [${x.tipo}] ${clean(x.frente, 120)}${x.verso ? ` → ${clean(x.verso, 120)}` : ""}`);
      return [`Criar ${p.fresh.length} ${p.fresh.length === 1 ? "card" : "cards"} no baralho ${p.deck ? `existente "${p.deck.name}"` : `novo "${p.name}"`}. Entram como novos, no fim da fila.`, ...(p.duplicated ? [`${p.duplicated} já existiam com a mesma frente e serão pulados.`] : []), ...shown, ...(p.fresh.length > shown.length ? [`… e mais ${p.fresh.length - shown.length}.`] : [])].join("\n");
    },
    apply: async (a: { baralho_nome: string; cards: CardIn[] }, c) => {
      const p = await planCards(c.user.id, a), now = Date.now();
      const id = p.deck?.id ?? (norm(p.name) === "meus erros" ? ERR_DECK : uid());
      const ease = presetFor(id, await fcConfigOf(c.user.id)).startEase;
      const cards = p.fresh.flatMap((x, i) => makeCards(x, id, ease, now + i * 10));
      const deck: DeckRec = p.deck ? { ...p.deck, cards: p.deck.cards + cards.length } : { id, name: p.name, file: "", importedAt: now, cards: cards.length, images: 0, groups: [] };
      const changes: Change[] = [{ c: "fc_deck", id, data: deck, at: now }, ...cards.map((x) => ({ c: "fc_card", id: x.id, data: x, at: now }))];
      await saveIa(c.user.id, changes);
      return { resumo: `${cards.length} cards em ${deck.name}`, data: { status: "criados", baralho: deck.name, baralho_id: id, baralho_novo: !p.deck, cards_criados: cards.length, pulados_por_repeticao: p.duplicated, link: `${env.publicUrl}/flashcards/baralho/${encodeURIComponent(id)}`, nota: "Aparecem no app na próxima vez que ele sincronizar." } };
    },
  }),
  readTool({
    name: "conduta_ver_opcoes_baralho", title: "Ver opções do baralho", group: "Flashcards", summary: "O perfil e as opções do baralho: quando o card volta, quando errar, dificuldade, limites.",
    description: "Use antes de mudar as opções de um baralho ou quando a pessoa perguntar como ele está configurado: perfil (Leve, Padrão, Reta final ou Personalizado), novos por dia, teto de revisões, quando o card volta, o que acontece ao errar, facilidade, retenção desejada, e se outros baralhos usam as mesmas opções. Cada opção vem com a explicação do que faz.",
    input: { baralho: z.string().describe("Nome ou id do baralho.") },
    run: async (a: { baralho: string }, c) => {
      const d = await findDeck(c.user.id, a.baralho), [cfg, s, ds] = await Promise.all([fcConfigOf(c.user.id), settingsOf(c.user.id), decksOf(c.user.id)]), p = presetFor(d.id, cfg), pid = cfg.deckPreset[d.id] || DEFAULT_ID;
      return {
        resumo: d.name,
        data: {
          baralho: d.name, perfil: profileOf(p, s.cardsNovosPorDia), perfis_prontos: Object.entries(PROFILES).map(([k, v]) => ({ id: k, nome: v.name, para_quem: v.hint })),
          predefinicao: p.name, baralhos_com_as_mesmas_opcoes: ds.filter((x) => x.id !== d.id && (cfg.deckPreset[x.id] || DEFAULT_ID) === pid).map((x) => x.name),
          novos_pausados: !!cfg.paused[d.id], limites_so_deste_baralho: cfg.deckLimits[d.id] ?? null, novos_por_dia_geral_nos_ajustes: s.cardsNovosPorDia,
          opcoes: Object.fromEntries((Object.entries(OPTS) as [OptName, (typeof OPTS)[OptName]][]).map(([name, o]) => [name, { valor: p[o.key], o_que_faz: o.desc }])),
          tela: `${env.publicUrl}/flashcards/opcoes/${encodeURIComponent(d.id)}`,
        },
      };
    },
  }),
  writeTool({
    name: "conduta_configurar_baralho", title: "Configurar baralho", group: "Flashcards", summary: "Escolhe o perfil de estudo do baralho ou ajusta as opções: quando volta, quando errar, dificuldade.",
    description: "Use para mudar como um baralho se comporta: escolher um perfil pronto (leve, padrao, reta_final) ou ajustar opções como novos por dia, teto de revisões, quando o card volta, quando errar, dificuldade e retenção desejada. Para estudante comum, prefira o perfil. Se outros baralhos usam as mesmas opções, só este muda, a não ser que aplicar_em_todos seja true. Pede confirmação: a primeira chamada só mostra o que vai mudar.",
    input: {
      baralho: z.string().describe("Nome ou id do baralho."),
      perfil: z.enum(["leve", "padrao", "reta_final"]).optional().describe(`Perfil pronto. ${Object.entries(PROFILES).map(([k, v]) => `${k}: ${v.hint}`).join(" ")}`),
      aplicar_em_todos: z.boolean().default(false).describe("true: muda também os outros baralhos que usam as mesmas opções. false: só este baralho."),
      pausar_novos: z.boolean().optional().describe("true: para de entrar card novo neste baralho, só revisões."),
      limite_novos_so_neste_baralho: z.number().int().min(0).max(9999).nullable().optional().describe("Novos por dia só neste baralho, acima das opções. null tira."),
      limite_revisoes_so_neste_baralho: z.number().int().min(0).max(9999).nullable().optional().describe("Revisões por dia só neste baralho, acima das opções. null tira."),
      ...Object.fromEntries((Object.entries(OPTS) as [OptName, (typeof OPTS)[OptName]][]).map(([name, o]) => [name, o.schema.optional().describe(o.desc)])),
    } as z.ZodRawShape,
    preview: async (a: Record<string, unknown>, c) => {
      const d = await findDeck(c.user.id, a.baralho as string), [cfg, s, ds] = await Promise.all([fcConfigOf(c.user.id), settingsOf(c.user.id), decksOf(c.user.id)]), p = presetFor(d.id, cfg), pid = cfg.deckPreset[d.id] || DEFAULT_ID;
      const out: string[] = [`Baralho "${d.name}" (perfil atual: ${profileOf(p, s.cardsNovosPorDia)}).`], others = ds.filter((x) => x.id !== d.id && (cfg.deckPreset[x.id] || DEFAULT_ID) === pid);
      if (a.perfil) { const pr = PROFILES[a.perfil as keyof typeof PROFILES]; out.push(`Perfil ${pr.name}: ${pr.hint}`); }
      const opts = (Object.keys(OPTS) as OptName[]).filter((k) => a[k] !== undefined);
      for (const k of opts) out.push(`${k.replace(/_/g, " ")}: ${JSON.stringify(p[OPTS[k].key])} → ${JSON.stringify(a[k])}`);
      if (a.pausar_novos !== undefined) out.push(a.pausar_novos ? "Pausar os cards novos." : "Voltar a entrar cards novos.");
      if (a.limite_novos_so_neste_baralho !== undefined) out.push(`Novos só neste baralho: ${a.limite_novos_so_neste_baralho ?? "sem limite próprio"}.`);
      if (a.limite_revisoes_so_neste_baralho !== undefined) out.push(`Revisões só neste baralho: ${a.limite_revisoes_so_neste_baralho ?? "sem limite próprio"}.`);
      if (out.length === 1) throw new ToolError("Diga o que mudar: um perfil ou alguma opção. As opções atuais estão em conduta_ver_opcoes_baralho.");
      if ((a.perfil || opts.length) && others.length) out.push(a.aplicar_em_todos ? `Vale também para: ${others.map((x) => x.name).join(", ")}.` : `Só este baralho muda; ${others.map((x) => x.name).join(", ")} continuam como estão.`);
      return out.join("\n");
    },
    apply: async (a: Record<string, unknown>, c) => {
      const d = await findDeck(c.user.id, a.baralho as string), [cfg, ds] = await Promise.all([fcConfigOf(c.user.id), decksOf(c.user.id)]), now = Date.now();
      const pid = cfg.deckPreset[d.id] || DEFAULT_ID, shared = ds.some((x) => x.id !== d.id && (cfg.deckPreset[x.id] || DEFAULT_ID) === pid), opts = (Object.keys(OPTS) as OptName[]).filter((k) => a[k] !== undefined);
      const next: FcConfig = { ...cfg, presets: { ...cfg.presets }, deckPreset: { ...cfg.deckPreset }, paused: { ...cfg.paused }, deckLimits: { ...cfg.deckLimits } };
      if (a.perfil || opts.length) {
        const pr = a.perfil ? PROFILES[a.perfil as keyof typeof PROFILES] : null;
        // predefinição usada por outros baralhos: este ganha uma só dele
        const cloning = shared && !a.aplicar_em_todos, id = cloning ? uid() : pid, cur = presetFor(d.id, cfg);
        const preset: Preset = { ...cur, id, name: cloning ? d.name : cur.name, ...(pr?.set || {}), ...(pr ? { profile: pr.id } : {}), ...(opts.length ? { profile: "custom" } : {}) };
        for (const k of opts) (preset as Record<string, unknown>)[OPTS[k].key] = a[k];
        next.presets[id] = preset;
        if (cloning) next.deckPreset[d.id] = id;
      }
      if (a.pausar_novos === true) next.paused[d.id] = true;
      if (a.pausar_novos === false) delete next.paused[d.id];
      if (a.limite_novos_so_neste_baralho !== undefined || a.limite_revisoes_so_neste_baralho !== undefined) {
        const l = { ...(next.deckLimits[d.id] || {}) };
        if (a.limite_novos_so_neste_baralho !== undefined) { if (a.limite_novos_so_neste_baralho === null) delete l.newPerDay; else l.newPerDay = a.limite_novos_so_neste_baralho as number; }
        if (a.limite_revisoes_so_neste_baralho !== undefined) { if (a.limite_revisoes_so_neste_baralho === null) delete l.maxReviews; else l.maxReviews = a.limite_revisoes_so_neste_baralho as number; }
        if (l.newPerDay != null || l.maxReviews != null) next.deckLimits[d.id] = l; else delete next.deckLimits[d.id];
      }
      await saveIa(c.user.id, [{ c: "fc_config", id: "main", data: next, at: now }]);
      return { resumo: `opções de ${d.name}`, data: { status: "alterado", baralho: d.name, tela: `${env.publicUrl}/flashcards/opcoes/${encodeURIComponent(d.id)}`, nota: "Vale no app a partir da próxima vez que ele sincronizar." } };
    },
  }),
];
