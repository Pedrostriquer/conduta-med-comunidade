/* Monta o material de cada análise a partir do que a pessoa tem guardado. Quanto vai no texto decide o custo:
   por isso as opções, e por isso a mesma função serve para estimar (sem chamar o modelo) e para rodar. */
import { AREAS, bank, bankExtra } from "../bank";
import type { Question } from "../bank";
import { one, q as sql } from "../db";
import { HttpError, notFound } from "../http";
import { attemptsOf, goalsOf, planOf, reviewsOf, settingsOf } from "../mcp/data";
import { loadTranscript, slice } from "../mcp/transcripts";
import { getRecord } from "../records";
import { estimatedShares, historyOf, priorities, recommend } from "./numbers";
import type { Shares } from "./numbers";

export type ResultOptions = { detalhe: "leve" | "padrao" | "completo"; acertos: boolean; dicas: boolean; transcricao: boolean; anterior: string | null };
export const DEFAULT_RESULT: ResultOptions = { detalhe: "padrao", acertos: true, dicas: true, transcricao: false, anterior: null };

type SessionRec = { id: string; kind: "lista" | "simulado"; title: string; qids: string[]; feedback: string; elapsedMs: number; status: string; finishedAt?: number; source: { type: string; exam?: string; formato?: string }; answers: Record<string, { choice: string | null; ms: number; checked?: boolean }> };

const cut = (s: string | undefined | null, n: number) => { const t = (s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
const pct = (x: number) => Math.round(x * 100) + "%";
const when = (ms: number) => { const d = Math.round((Date.now() - ms) / 86_400_000); return d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`; };
const CONF: Record<string, string> = { sabia: "disse que sabia", chutei: "disse que chutou", distracao: "disse que foi distração", naosabia: "disse que não sabia" };

export async function sharesFor(userId: string, banca: string | null): Promise<{ shares: Shares; ajustada: boolean }> {
  const goals = await goalsOf(userId) as { proporcoes?: Record<string, Shares> };
  const own = banca ? goals.proporcoes?.[banca] : null;
  return own ? { shares: own, ajustada: true } : { shares: estimatedShares(banca), ajustada: false };
}

const transcriptLines = async (q: Question) => {
  if (!q.v) return "";
  const lines = await loadTranscript(q.v.id);
  return lines ? slice(lines, q.v.s, q.v.f ?? q.v.s + 240) : "";
};

export async function buildResultPackage(userId: string, sessionId: string, o: ResultOptions) {
  const s = await getRecord<SessionRec>(userId, "session", sessionId);
  if (!s) throw notFound("Não encontramos essa sessão no servidor. Espere sincronizar e tente de novo.");
  if (s.status !== "finalizada") throw new HttpError("conflito", "Termine a sessão para analisar.");
  const b = bank(), extra = bankExtra().questoes;
  const [attempts, reviews, plan, settings] = await Promise.all([attemptsOf(userId), reviewsOf(userId), planOf(userId), settingsOf(userId)]);
  const exam = s.source.exam ? b.examById.get(s.source.exam) : null;
  const banca = exam?.banca || plan?.banca || null;
  const { shares, ajustada } = await sharesFor(userId, banca && banca !== "Outra" ? banca : null);
  const hist = historyOf(attempts, s.id);

  const rows = s.qids.map((id, i) => ({ i: i + 1, q: b.byId.get(id), a: s.answers[id] })).filter((x): x is { i: number; q: Question; a: SessionRec["answers"][string] } => !!x.q && !x.q.an);
  const scored = rows.map((x) => ({ ...x, ok: !!x.a?.choice && x.a.choice === x.q.g }));
  const { areas, especialidades } = priorities(scored, attempts, shares, s.id);
  const right = scored.filter((x) => x.ok), wrong = scored.filter((x) => !x.ok);
  const blanks = wrong.filter((x) => !x.a?.choice).length;
  const conf: Record<string, number> = {};
  for (const x of scored) { const r = reviews.get(x.q.id); if (r) conf[r.kind] = (conf[r.kind] || 0) + 1; }
  const answered = scored.length - blanks;
  // o que o modelo mais barato deixa passar sozinho: o ritmo caindo ao longo da prova e o erro que se repete
  const third = Math.ceil(scored.length / 3);
  const ritmo = scored.length >= 12 ? [0, 1, 2].map((p) => {
    const xs = scored.slice(p * third, (p + 1) * third), timed = xs.filter((x) => (x.a?.ms || 0) > 1000);
    return { parte: p + 1, de: xs[0]?.i ?? 0, ate: xs[xs.length - 1]?.i ?? 0, n: xs.length, certas: xs.filter((x) => x.ok).length, brancos: xs.filter((x) => !x.a?.choice).length, segundos: timed.length ? Math.round(timed.reduce((t, x) => t + (x.a?.ms || 0), 0) / timed.length / 1000) : 0 };
  }) : [];
  const repetidas = wrong.filter((x) => (hist.get(x.q.id)?.wrong || 0) >= 1).map((x) => ({ n: x.i, vezes: hist.get(x.q.id)!.wrong }));
  const chutes = right.filter((x) => reviews.get(x.q.id)?.kind === "chutei").map((x) => x.i);
  const geral = { titulo: s.title, tipo: s.kind, total: scored.length, certas: right.length, erradas: wrong.length - blanks, brancos: blanks, anuladas: s.qids.length - rows.length, acerto: scored.length ? right.length / scored.length : 0, segundosPorQuestao: answered ? Math.round(s.elapsedMs / 1000 / answered) : 0, banca, ajustada };
  const recomendadas = recommend(areas, especialidades, attempts, { n: 30, banca, includeAll: settings.incluirTodas, seed: Math.floor(Date.now() / 86_400_000) });
  const numeros = { geral, shares, areas, especialidades: especialidades.slice(0, 12), ritmo, repetidas, chutes };

  const parts: string[] = [];
  const min = Math.round(s.elapsedMs / 60_000);
  parts.push(`# Resultado\n${s.title} · ${s.kind === "simulado" ? "simulado" : "lista"} · ${scored.length} questões · ${pct(geral.acerto)} de acerto · ${geral.erradas} erradas e ${blanks} em branco${min ? ` · ${min} min no total, ${geral.segundosPorQuestao} s por questão` : ""}`);
  parts.push(`# Onde a nota está sendo perdida (já calculado)\n${banca ? `Prova-alvo: ${banca}. Proporção ${ajustada ? "ajustada pela própria pessoa" : "estimada pelas provas da banca"}.` : "Sem prova-alvo definida: proporção média do banco."}\nPerda = peso na prova × (1 − acerto estimado), em pontos a cada 100 questões. O acerto estimado junta esta sessão e o histórico.\n` + areas.map((a) => `${a.nome}: peso ${a.peso}%${a.n ? `, aqui ${a.ok} de ${a.n}` : ", sem questões aqui"}${a.histN ? `, histórico ${pct(a.histOk / a.histN)} em ${a.histN}` : ""}, perda ${a.perda.toFixed(1)}`).join("\n"));
  const fracas = especialidades.filter((e) => e.n).slice(0, 8);
  if (fracas.length) parts.push(`# Especialidades que mais perdem pontos\n` + fracas.map((e) => `${AREAS[e.area]} › ${e.nome}: aqui ${e.ok} de ${e.n}${e.histN ? `, histórico ${pct(e.histOk / e.histN)} em ${e.histN}` : ""}`).join("\n"));
  if (ritmo.length && ritmo.some((r) => r.segundos)) parts.push(`# Ritmo ao longo da prova (já calculado)\n` + ritmo.map((r) => `Da Q${r.de} à Q${r.ate}: ${r.certas} de ${r.n} certas, ${r.segundos} s por questão${r.brancos ? `, ${r.brancos} em branco` : ""}`).join("\n"));
  if (repetidas.length) parts.push(`# Questões erradas aqui que a pessoa já tinha errado antes (já calculado)\n` + repetidas.map((r) => `Q${r.n} (${r.vezes}×)`).join(", "));
  if (chutes.length) parts.push(`# Acertos que a pessoa marcou como chute (já calculado)\n` + chutes.map((n) => `Q${n}`).join(", "));
  const confText = Object.entries(conf).map(([k, n]) => `${k}: ${n}`).join(", ");
  if (confText) parts.push(`# Como a pessoa avaliou as respostas\n${confText}`);

  const blocks: string[] = [];
  for (const x of wrong.slice(0, 150)) {
    const q = x.q, h = hist.get(q.id), ms = x.a?.ms || 0, r = reviews.get(q.id), ex = extra[q.id];
    const head = `Q${x.i} · ${AREAS[q.area]} › ${q.esp || "Outros"}${q.tema && q.tema !== q.esp ? ` › ${q.tema}` : ""} · ${x.a?.choice ? `marcou ${x.a.choice}` : "em branco"}, gabarito ${q.g}${ms > 1000 ? ` · ${Math.round(ms / 1000)} s` : ""}${h ? ` · antes: errou ${h.wrong}, acertou ${h.right}, última ${when(h.lastAt)}` : ""}${r ? ` · ${CONF[r.kind] || ""}` : ""}`;
    const lines = [head];
    if (o.detalhe === "completo") {
      lines.push(`Enunciado: ${cut(q.e, 4000)}`);
      for (const [L, t] of Object.entries(q.a)) lines.push(`${L}) ${cut(t, 400)}`);
      if (q.x) lines.push(`Explicação: ${cut(q.x, 1200)}`);
    } else {
      if (o.detalhe === "padrao") lines.push(`Enunciado: ${cut(q.e, 600)}`);
      const n = o.detalhe === "padrao" ? 200 : 120;
      if (x.a?.choice && q.a[x.a.choice]) lines.push(`Marcada: ${cut(q.a[x.a.choice], n)}`);
      lines.push(`Gabarito: ${cut(q.a[q.g], n)}`);
      if (q.x && o.detalhe === "padrao") lines.push(`Explicação: ${cut(q.x, 400)}`);
    }
    if (o.dicas && ex?.d?.length) lines.push(`Dicas do professor: ${cut(ex.d.join(" "), o.detalhe === "completo" ? 800 : 300)}`);
    if (o.transcricao) { const t = await transcriptLines(q); if (t) lines.push(`Correção em vídeo: ${cut(t, 3000)}`); }
    blocks.push(lines.join("\n"));
  }
  parts.push(`# Questões erradas (${wrong.length})\n` + (blocks.join("\n\n") || "Nenhuma."));
  if (o.acertos && right.length) {
    parts.push(`# Questões certas (${right.length})\n` + right.slice(0, 150).map((x) => { const r = reviews.get(x.q.id), ms = x.a?.ms || 0; return `Q${x.i} · ${AREAS[x.q.area]} › ${x.q.esp || "Outros"}${ms > 1000 ? ` · ${Math.round(ms / 1000)} s` : ""}${r ? ` · ${CONF[r.kind] || ""}` : ""}`; }).join("\n"));
  }
  if (o.anterior) {
    const prev = await one<{ result: { analise?: { resumo?: string; padroes_erro?: { titulo: string; explicacao: string }[] }; numeros?: { geral?: { titulo?: string; acerto?: number }; areas?: { nome: string; acerto: number | null }[] } }; created_at: Date }>(
      "SELECT result, created_at FROM ai_runs WHERE id = $1 AND user_id = $2 AND kind = 'resultado' AND status = 'feito'", [o.anterior, userId],
    );
    if (prev?.result?.analise) {
      const a = prev.result.analise, g = prev.result.numeros?.geral;
      parts.push(`# Análise anterior (${when(new Date(prev.created_at).getTime())}: ${g?.titulo || ""}${g?.acerto != null ? `, ${pct(g.acerto)}` : ""})\n${a.resumo || ""}\n` + (a.padroes_erro || []).map((p) => `Padrão: ${p.titulo}. ${p.explicacao}`).join("\n") + (prev.result.numeros?.areas ? `\nAcerto por área naquela prova: ${prev.result.numeros.areas.filter((x) => x.acerto != null).map((x) => `${x.nome} ${pct(x.acerto!)}`).join(", ")}` : "") + `\nCompare em "comparacao": o que melhorou, o que se repetiu.`);
    }
  }
  if (!o.anterior) parts.push(`Não há análise anterior para comparar: deixe "comparacao" como null.`);

  return { prompt: parts.join("\n\n"), numeros, recomendadas, source: { sessionId: s.id, title: s.title, kind: s.kind, exam: s.source.exam || null, banca }, wrongCount: wrong.length, rightCount: right.length };
}

/* ---------- flashcards do dia ---------- */
export type FlashOptions = { limite: number; filtro: "erros" | "dificeis" | "todos"; dia?: string };
type Rev = { card: string; deck: string; rate: "again" | "hard" | "good" | "easy"; at: number };
type Card = { id: string; deck: string; path?: string[]; kind?: string; fields: string[]; ord?: number; due: number; ivl: number; ease: number; reps: number; lapses: number; isNew: 0 | 1; suspended?: 1 };

const strip = (h: string) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
const cardText = (c: Card) => {
  if (c.kind === "cloze") return { f: strip((c.fields[0] || "").replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, "[$1]")), v: strip(c.fields[1] || "") };
  return { f: strip(c.fields[0] || ""), v: strip(c.fields[1] || "") };
};
export const startOfDay = (day?: string) => { const d = day || new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10); return { day: d, ms: new Date(`${d}T03:00:00Z`).getTime() }; };

export async function buildFlashPackage(userId: string, o: FlashOptions) {
  const { day, ms } = startOfDay(o.dia);
  const logs = (await sql<{ data: Rev }>("SELECT data FROM user_records WHERE user_id = $1 AND coll = 'fc_revlog' AND NOT deleted AND client_at >= $2 AND client_at < $3", [userId, ms, ms + 86_400_000])).map((r) => r.data).filter((x) => x?.card);
  const per = new Map<string, { again: number; hard: number; good: number; easy: number }>();
  for (const l of logs) { const x = per.get(l.card) || { again: 0, hard: 0, good: 0, easy: 0 }; x[l.rate]++; per.set(l.card, x); }
  const take = [...per.entries()].filter(([, x]) => o.filtro === "todos" || x.again > 0 || (o.filtro === "dificeis" && x.hard > 0)).sort((a, c) => c[1].again * 2 + c[1].hard - (a[1].again * 2 + a[1].hard)).slice(0, o.limite);
  const cards = new Map((await sql<{ id: string; data: Card }>("SELECT id, data FROM user_records WHERE user_id = $1 AND coll = 'fc_card' AND NOT deleted AND id = ANY($2)", [userId, take.map(([id]) => id)])).map((r) => [r.id, r.data]));
  const blocks: string[] = [], ids: string[] = [];
  for (const [id, x] of take) {
    const c = cards.get(id); if (!c) continue;
    const t = cardText(c);
    ids.push(id);
    blocks.push(`C${ids.length} · ${(c.path || []).join(" › ") || "sem grupo"} · errou ${x.again}, difícil ${x.hard}, boa ${x.good + x.easy} hoje · ${c.reps} revisões na vida, ${c.lapses} lapsos\nFrente: ${cut(t.f, 300)}\nVerso: ${cut(t.v, 300)}`);
  }
  const counts = { revisados: per.size, erros: [...per.values()].filter((x) => x.again).length, dificeis: [...per.values()].filter((x) => x.hard && !x.again).length, avaliacoes: logs.length };
  const prompt = `# Flashcards de ${day}\n${counts.revisados} cards revisados, ${counts.erros} com erro, ${counts.dificeis} só difíceis.\n\n# Cards (${blocks.length})\n${blocks.join("\n\n") || "Nenhum."}`;
  return { prompt, ids, counts, reviewed: new Set(per.keys()), source: { day, ...counts }, size: blocks.length };
}

const MARKS = /[̀-ͯ]/g;
const norm = (s: string) => s.normalize("NFD").replace(MARKS, "").toLowerCase();

export type PickedCard = { id: string; deck: string; frente: string; tema: string; motivo: string; novo: boolean };

/** Procura nos baralhos da pessoa cards dos temas em que ela errou. Quem já foi visto várias vezes e está bom fica de fora:
    bater com o tipo de erro não adianta se o card já foi aprendido. Só entra novo ou card com métrica ruim. */
export async function pickCards(userId: string, temas: { nome: string; palavras_chave: string[] }[], reviewed: Set<string>, pull: number) {
  const terms = [...new Set(temas.flatMap((t) => t.palavras_chave).map(norm).filter((x) => x.length >= 4))].slice(0, 40);
  if (!terms.length) return [] as PickedCard[];
  const rows = await sql<{ id: string; data: Card }>(
    `SELECT id, data FROM user_records WHERE user_id = $1 AND coll = 'fc_card' AND NOT deleted AND NOT (data ? 'suspended')
       AND ((data->>'isNew') = '1' OR (data->>'lapses')::int >= 2 OR (data->>'ease')::float8 < 2.1)
       AND COALESCE((data->>'ivl')::float8, 0) < 21
       AND f_unaccent(lower((data->'fields')::text)) LIKE ANY($2)
     LIMIT 3000`,
    [userId, terms.map((t) => `%${t.replace(/[%_\\]/g, "")}%`)],
  );
  const scored: (PickedCard & { score: number })[] = [];
  for (const { id, data: c } of rows) {
    if (reviewed.has(id) || (c.reps >= 3 && c.lapses === 0)) continue;
    const text = norm(strip(c.fields.join(" ")));
    let best = 0, tema = "";
    for (const t of temas) {
      const hits = t.palavras_chave.filter((k) => k.length >= 4 && text.includes(norm(k))).length;
      if (hits > best) { best = hits; tema = t.nome; }
    }
    if (!best) continue;
    const novo = c.isNew === 1;
    const metric = novo ? 1 : c.lapses >= 2 ? 1.5 : 0.5;
    scored.push({ id, deck: c.deck, frente: cut(cardText(c).f, 140), tema, novo, motivo: novo ? "ainda não viu" : `${c.lapses} lapsos`, score: best * (1 + metric) });
  }
  scored.sort((a, c) => c.score - a.score);
  // um pouco de cada tema, em vez de todos do primeiro
  const perTheme = new Map<string, number>(), out: PickedCard[] = [], cap = Math.max(3, Math.ceil(pull / Math.max(1, temas.length)) + 1);
  for (const { score: _s, ...x } of scored) {
    if (out.length >= pull) break;
    const n = perTheme.get(x.tema) || 0;
    if (n >= cap) continue;
    perTheme.set(x.tema, n + 1); out.push(x);
  }
  return out;
}
