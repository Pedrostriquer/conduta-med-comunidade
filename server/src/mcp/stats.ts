/* Estatísticas a partir das tentativas: a mesma conta de app/src/state/stats.ts e da sequência de state/goals.ts,
   sem React nem armazenamento local. Mude lá, mude aqui. Flashcards não influenciam os números de questões. */
import type { DayEvent, DayEventKind, DayRule } from "./plan";
import { cat, topicKey, temaOf } from "./catalog";
import { addDays, dayKey, today } from "./dates";

export type Attempt = { qid: string; choice: string | null; correct: boolean; at: number; ms: number; sid: string; kind: "lista" | "simulado" };
export type Tally = { n: number; ok: number };
export type Stats = {
  activity: Map<string, number>; correctByDay: Map<string, number>; total: number; correct: number; accuracy: number; streak: number; longest: number;
  last: Map<string, Attempt>; wrong: string[]; dueWrong: string[]; answered: Set<string>;
  byArea: Map<string, Tally>; byTopic: Map<string, Tally>; byTema: Map<string, Tally>; paceSec: number;
};

const goodTime = (ms: number) => ms > 3000 && ms < 15 * 60000;

export function computeStats(attempts: Attempt[]): Stats {
  const c = cat();
  const activity = new Map<string, number>(), correctByDay = new Map<string, number>(), last = new Map<string, Attempt>();
  const byArea = new Map<string, Tally>(), byTopic = new Map<string, Tally>(), byTema = new Map<string, Tally>();
  let total = 0, correct = 0, paceMs = 0, paceN = 0;
  const cutoff = Date.now() - 14 * 86400000;
  const bump = (m: Map<string, Tally>, k: string, ok: boolean) => { const x = m.get(k) || { n: 0, ok: 0 }; x.n++; if (ok) x.ok++; m.set(k, x); };
  for (const a of attempts) {
    const prev = last.get(a.qid);
    if (!prev || prev.at <= a.at) last.set(a.qid, a);
    if (a.choice === null) continue;
    const d = dayKey(a.at);
    activity.set(d, (activity.get(d) || 0) + 1);
    if (a.correct) correctByDay.set(d, (correctByDay.get(d) || 0) + 1);
    total++; if (a.correct) correct++;
    if (a.at > cutoff && goodTime(a.ms)) { paceMs += a.ms; paceN++; }
    const q = c.byId.get(a.qid);
    if (q) { const k = topicKey(q); bump(byArea, q.area, a.correct); bump(byTopic, k, a.correct); bump(byTema, k + "/" + temaOf(q), a.correct); }
  }
  let streak = 0, d = today();
  if (!activity.get(d)) d = addDays(d, -1);
  while (activity.get(d)) { streak++; d = addDays(d, -1); }
  let longest = 0, run = 0;
  const keys = [...activity.keys()].sort();
  keys.forEach((k, i) => { run = i && addDays(keys[i - 1], 1) === k ? run + 1 : 1; longest = Math.max(longest, run); });
  const wrong: string[] = [], dueWrong: string[] = [], answered = new Set<string>(), dueBefore = Date.now() - 20 * 3600000;
  for (const [qid, a] of last) { answered.add(qid); if (!a.correct) { wrong.push(qid); if (a.at < dueBefore) dueWrong.push(qid); } }
  return { activity, correctByDay, total, correct, accuracy: total ? correct / total : 0, streak, longest, last, wrong, dueWrong, answered, byArea, byTopic, byTema, paceSec: paceN ? paceMs / paceN / 1000 : 0 };
}

/** especialidades com acerto mais baixo (pelo menos `min` respostas), da pior para a melhor */
export function weakTopics(st: Stats, min = 6) {
  return [...st.byTopic.entries()].filter(([, v]) => v.n >= min).map(([key, v]) => ({ key, acc: v.ok / v.n, n: v.n })).sort((a, b) => a.acc - b.acc);
}

/** especialidades fracas pesadas pelo quanto caem nas provas: (1 − acerto) × raiz da participação no banco */
export function weakFrequent(st: Stats, n = 5, min = 5) {
  const c = cat(), all = c.all.length || 1;
  return [...st.byTopic.entries()].filter(([, v]) => v.n >= min)
    .map(([key, v]) => { const share = (c.topicByKey.get(key)?.ids.length || 0) / all, acc = v.ok / v.n; return { key, acc, n: v.n, share, score: (1 - acc) * Math.sqrt(share) }; })
    .filter((x) => x.acc < 0.8).sort((a, b) => b.score - a.score).slice(0, n);
}

export type Goals = { prefs: Record<string, Record<string, unknown>>; eventos: DayEvent[]; regras: Partial<Record<DayEventKind, DayRule>>; cardGoals: Record<string, number>; minimo: { questoes: number; cards: number }; plantao: Record<string, true>; fechados: Record<string, true>; marcos: Record<string, string>; passosOk: boolean; desde: string };
export const defaultGoals = (): Goals => ({ prefs: {}, eventos: [], regras: {}, cardGoals: {}, minimo: { questoes: 10, cards: 20 }, plantao: {}, fechados: {}, marcos: {}, passosOk: false, desde: today() });

/** sequência: dias em que o mínimo foi cumprido (questões OU cards); dia de plantão preserva */
export function streakOf(st: Stats, cards: Map<string, number>, g: Pick<Goals, "minimo" | "plantao">) {
  const t = today();
  const counts = (k: string) => (st.activity.get(k) || 0) >= g.minimo.questoes || (cards.get(k) || 0) >= g.minimo.cards || !!g.plantao[k];
  let current = 0, d = counts(t) ? t : addDays(t, -1);
  while (counts(d)) { current++; d = addDays(d, -1); }
  const sorted = [...new Set([...st.activity.keys(), ...cards.keys(), ...Object.keys(g.plantao)])].filter(counts).sort();
  let best = 0, run = 0;
  sorted.forEach((k, i) => { run = i && addDays(sorted[i - 1], 1) === k ? run + 1 : 1; best = Math.max(best, run); });
  return { atual: current, recorde: Math.max(best, current), hoje_conta: counts(t) };
}
