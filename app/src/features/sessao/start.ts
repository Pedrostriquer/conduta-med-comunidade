/* Começar uma lista ou um simulado: monta as questões, cria a sessão e devolve o id para navegar. */
import { getBank, pool } from "../../data/bank";
import type { Exam } from "../../data/types";
import { defaultMinutes, estimatedShares, matchQuery, pick, shuffledExam } from "../../data/select";
import { useGoals } from "../../state/goals";
import type { PlanDay } from "../../data/plan";
import { useStore } from "../../state/store";
import type { Attempt, Feedback, Session, SessionAnswer, SessionSource } from "../../state/store";
import { computeStats, dueReviews, weakTopics } from "../../state/stats";
import { joinList } from "../../lib/format";

const st = () => computeStats(useStore.getState().attempts, getBank());

export function topicName(key: string) {
  return key.split("/")[1] || key;
}

export function startList({ ids, title, source, feedback, planDay }: { ids: string[]; title: string; source: SessionSource; feedback?: Feedback; planDay?: string }) {
  const s = useStore.getState();
  return s.startSession({ kind: "lista", title, qids: ids, feedback: feedback ?? s.settings.feedbackLista, limitSec: null, source, planDay });
}

/** Questões do dia do cronograma: primeiro as novas dos temas do dia, depois as de temas com mais peso, depois as erradas. */
export function startPlanDay(day: PlanDay, remaining: number) {
  const b = getBank(), stats = st(), inc = useStore.getState().settings.incluirTodas;
  const n = Math.max(5, Math.min(50, remaining));
  let ids = pick(matchQuery(b, inc, { topics: day.topics, filter: "novas" }, stats), n);
  if (ids.length < n) {
    const weak = weakTopics(stats).slice(0, 4).map((w) => w.key);
    const more = pick(matchQuery(b, inc, { topics: weak.length ? weak : undefined, filter: "novas" }, stats).filter((q) => !ids.includes(q.id)), n - ids.length);
    ids = ids.concat(more);
  }
  if (ids.length < n) ids = ids.concat(pick(matchQuery(b, inc, { filter: "erradas" }, stats).filter((q) => !ids.includes(q.id)), n - ids.length));
  const title = day.topics.length ? joinList(day.topics.map(topicName)) : "Questões do dia";
  return startList({ ids, title, source: { type: "plano", topics: day.topics }, planDay: day.key });
}

/** Lista do dia sem cronograma: mistura as áreas, puxando um pouco mais dos pontos fracos. */
export function startDaily(n: number) {
  const b = getBank(), stats = st(), inc = useStore.getState().settings.incluirTodas;
  const weak = weakTopics(stats).slice(0, 3).map((w) => w.key);
  const fromWeak = weak.length ? pick(matchQuery(b, inc, { topics: weak, filter: "novas" }, stats), Math.round(n * 0.4)) : [];
  const rest = pick(matchQuery(b, inc, { filter: "novas" }, stats).filter((q) => !fromWeak.includes(q.id)), n - fromWeak.length);
  return startList({ ids: [...fromWeak, ...rest], title: "Questões do dia", source: { type: "plano", topics: weak } });
}

export function startErrors(limit = 15) {
  const stats = st();
  const b = getBank(), inc = useStore.getState().settings.incluirTodas;
  const okIds = new Set(pool(b, inc).map((q) => q.id));
  const due = stats.dueWrong.filter((id) => okIds.has(id));
  const ids = pick(due.map((id) => b.byId[id]), limit);
  return startList({ ids, title: "Revisão de erros", source: { type: "erros" }, feedback: "imediato" });
}

/** a proporção por área que vale para esta banca: a que a pessoa ajustou ou a estimativa */
export const sharesOf = (banca: string) => useGoals.getState().proporcoes[banca] || estimatedShares(getBank(), banca);

/** problemáticas: gabarito discutido, sem vídeo, desatualizadas. Anuladas são outra coisa: a banca tirou da prova */
export type SimPick = { problematicas: boolean; anuladas: boolean };
export type SimConfig = SimPick & { exam: Exam; formato: "original" | "embaralhada"; sameBanca: boolean; minutes: number | null; feedback: Feedback; planDay?: string };

export function simQuestions(exam: Exam, formato: "original" | "embaralhada", sameBanca: boolean, p: SimPick = { problematicas: useStore.getState().settings.incluirTodas, anuladas: false }) {
  const b = getBank();
  if (formato === "original") return [...(b.byExam[exam.id] || []).filter((q) => p.problematicas || q.ok), ...(p.anuladas ? b.annulledByExam[exam.id] || [] : [])].sort((x, y) => x.n - y.n).map((q) => q.id);
  return shuffledExam(b, exam, { includeAll: p.problematicas, st: st(), sameBanca, shares: sharesOf(exam.banca), annulled: p.anuladas });
}

/** questões que contam na nota: a anulada aparece na prova, mas fica de fora da conta */
export const countedIds = (s: Pick<Session, "qids">) => { const b = getBank(); return s.qids.filter((id) => !b.byId[id]?.an); };

export function startSimulado(c: SimConfig) {
  const ids = simQuestions(c.exam, c.formato, c.sameBanca, c);
  const s = useStore.getState();
  return s.startSession({
    kind: "simulado", title: c.exam.nome + (c.formato === "embaralhada" ? " · embaralhado" : ""), qids: ids, feedback: c.feedback,
    limitSec: c.minutes ? c.minutes * 60 : null, source: { type: "simulado", exam: c.exam.id, formato: c.formato }, planDay: c.planDay,
  });
}

export const simDefaultMinutes = (exam: Exam, n: number) => defaultMinutes(exam, n);

/** as que errou (ou deixou em branco) numa sessão terminada */
export function wrongOf(sid: string) {
  const st = useStore.getState(), s = st.sessions[sid], b = getBank();
  if (!s) return [];
  const ans = sessionAnswers(s, st.attempts);
  return s.qids.filter((q) => b.byId[q] && !b.byId[q].an && ans[q]?.choice !== b.byId[q].g);
}

/** Refazer as erradas de uma sessão com correção na hora: a que errar de novo volta para o fim da fila até acertar.
    Se já existe um refazer em andamento dessa sessão, continua nele. */
export function startRedo(sid: string) {
  const st = useStore.getState(), from = st.sessions[sid];
  const open = Object.values(st.sessions).find((x) => x.status === "ativa" && x.source.type === "refazer" && x.source.from === sid);
  if (open) return open.id;
  const ids = wrongOf(sid);
  return st.startSession({ kind: "lista", title: "Refazer: " + (from?.title || "erradas"), qids: ids, feedback: "imediato", limitSec: null, source: { type: "refazer", from: sid } });
}

/** As questões que a autoavaliação mandou voltar hoje (Sabia 21 dias · Chutei 7 · Não sabia 2), com correção na hora. */
export function startDueReviews(limit = 30) {
  const b = getBank();
  const ids = dueReviews(useStore.getState()).filter((id) => b.byId[id]).slice(0, limit);
  return startList({ ids, title: "Questões que voltaram", source: { type: "retorno" }, feedback: "imediato" });
}

/** respostas da sessão; sessões antigas (ou dos dados de exemplo) só têm as tentativas, então vêm delas */
export function sessionAnswers(s: Session, attempts: Attempt[]): Record<string, SessionAnswer> {
  if (Object.keys(s.answers).length) return s.answers;
  const out: Record<string, SessionAnswer> = {};
  for (const a of attempts) if (a.sid === s.id) out[a.qid] = { choice: a.choice, ms: a.ms, at: a.at, checked: true };
  return out;
}
