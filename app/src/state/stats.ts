/* O que se calcula das tentativas: atividade por dia, sequência, acerto por área e tema, erros e pontos fracos.
   Flashcards ficam de fora de propósito: não influenciam nenhum número daqui. */
import { useMemo } from "react";
import type { Bank } from "../data/bank";
import { addDays, dayKey, today } from "../lib/format";
import type { DayKey } from "../lib/format";
import { useStore } from "./store";
import type { Attempt } from "./store";

export type Stats = {
  activity: Map<DayKey, number>;
  correctByDay: Map<DayKey, number>;
  total: number;
  correct: number;
  accuracy: number;
  streak: number;
  longest: number;
  /** última tentativa de cada questão */
  last: Map<string, Attempt>;
  /** questões cuja última resposta foi errada (ou em branco) */
  wrong: string[];
  /** questões erradas há mais de um dia: para revisar hoje */
  dueWrong: string[];
  answered: Set<string>;
  byArea: Map<string, { n: number; ok: number }>;
  byTopic: Map<string, { n: number; ok: number }>;
  byTema: Map<string, { n: number; ok: number }>;
  /** tempo médio por questão (s), últimos 14 dias */
  paceSec: number;
};

export function computeStats(attempts: Attempt[], bank: Bank | null): Stats {
  const activity = new Map<DayKey, number>(), correctByDay = new Map<DayKey, number>();
  const last = new Map<string, Attempt>();
  const byArea = new Map<string, { n: number; ok: number }>(), byTopic = new Map<string, { n: number; ok: number }>(), byTema = new Map<string, { n: number; ok: number }>();
  let total = 0, correct = 0, paceMs = 0, paceN = 0;
  const cutoff = Date.now() - 14 * 86400000;
  const bump = (m: Map<string, { n: number; ok: number }>, k: string, ok: boolean) => { const x = m.get(k) || { n: 0, ok: 0 }; x.n++; if (ok) x.ok++; m.set(k, x); };
  for (const a of attempts) {
    const prev = last.get(a.qid);
    if (!prev || prev.at <= a.at) last.set(a.qid, a);
    if (a.choice === null) continue;
    const d = dayKey(a.at);
    activity.set(d, (activity.get(d) || 0) + 1);
    if (a.correct) correctByDay.set(d, (correctByDay.get(d) || 0) + 1);
    total++; if (a.correct) correct++;
    if (a.at > cutoff && a.ms > 3000 && a.ms < 15 * 60000) { paceMs += a.ms; paceN++; }
    const q = bank?.byId[a.qid];
    if (q) { bump(byArea, q.area, a.correct); bump(byTopic, q.area + "/" + (q.esp || "Outros"), a.correct); bump(byTema, q.area + "/" + (q.esp || "Outros") + "/" + (q.tema || q.esp), a.correct); }
  }
  // sequência: dias seguidos com pelo menos uma questão, contando hoje se já estudou (senão, até ontem)
  let streak = 0, d = today();
  if (!activity.get(d)) d = addDays(d, -1);
  while (activity.get(d)) { streak++; d = addDays(d, -1); }
  let longest = 0, run = 0;
  const keys = [...activity.keys()].sort();
  for (let i = 0; i < keys.length; i++) {
    run = i && addDays(keys[i - 1], 1) === keys[i] ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const wrong: string[] = [], dueWrong: string[] = [], answered = new Set<string>();
  const dueBefore = Date.now() - 20 * 3600000;
  for (const [qid, a] of last) {
    answered.add(qid);
    if (!a.correct) { wrong.push(qid); if (a.at < dueBefore) dueWrong.push(qid); }
  }
  return { activity, correctByDay, total, correct, accuracy: total ? correct / total : 0, streak, longest, last, wrong, dueWrong, answered, byArea, byTopic, byTema, paceSec: paceN ? paceMs / paceN / 1000 : 0 };
}

export function useStats(bank: Bank | null) {
  const attempts = useStore((s) => s.attempts);
  return useMemo(() => computeStats(attempts, bank), [attempts, bank]);
}

/** especialidades com acerto mais baixo (pelo menos 6 respostas), da pior para a melhor */
export function weakTopics(st: Stats, min = 6) {
  return [...st.byTopic.entries()].filter(([, v]) => v.n >= min).map(([k, v]) => ({ key: k, acc: v.ok / v.n, n: v.n })).sort((a, b) => a.acc - b.acc);
}

/** questões que a autoavaliação mandou voltar até o fim de `until` (padrão: hoje), as mais atrasadas primeiro */
export function dueReviews(state: { reviews: Record<string, { due: number }> }, until = endOfDay()): string[] {
  return Object.entries(state.reviews || {}).filter(([, r]) => r.due <= until).sort((a, b) => a[1].due - b[1].due).map(([qid]) => qid);
}
const endOfDay = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };

/** questões respondidas hoje */
export const todayCount = (st: Stats) => st.activity.get(today()) || 0;

/* ---------- Desempenho num período (Perfil › Desempenho) ---------- */

export type Tally = { n: number; ok: number; ms: number; msN: number };
export type PeriodMetrics = {
  /** primeiro dia do período */
  from: DayKey;
  days: number;
  total: number;
  correct: number;
  accuracy: number;
  /** tempo médio por questão (s), só respostas entre 3 s e 15 min */
  paceSec: number;
  byArea: Map<string, Tally>;
  /** um ponto por dia do período, do mais antigo para hoje */
  daily: { key: DayKey; n: number; ok: number }[];
  /** semanas (segunda a domingo) que tocam o período */
  weekly: { start: DayKey; n: number; ok: number; studyDays: number }[];
};

const mondayOf = (k: DayKey) => { const d = new Date(k + "T12:00:00"); return addDays(k, -((d.getDay() + 6) % 7)); };

/** métricas das respostas dos últimos `days` dias (null: desde a primeira resposta) */
export function periodMetrics(attempts: Attempt[], bank: Bank | null, days: number | null): PeriodMetrics {
  const t = today();
  let from = days ? addDays(t, -(days - 1)) : t;
  if (!days) for (const a of attempts) { const k = dayKey(a.at); if (k < from) from = k; }
  const byArea = new Map<string, Tally>(), byDay = new Map<DayKey, { n: number; ok: number }>();
  let total = 0, correct = 0, ms = 0, msN = 0;
  for (const a of attempts) {
    if (a.choice === null) continue;
    const k = dayKey(a.at); if (k < from) continue;
    total++; if (a.correct) correct++;
    const dd = byDay.get(k) || { n: 0, ok: 0 }; dd.n++; if (a.correct) dd.ok++; byDay.set(k, dd);
    const good = a.ms > 3000 && a.ms < 15 * 60000;
    if (good) { ms += a.ms; msN++; }
    const q = bank?.byId[a.qid];
    if (q) {
      const x = byArea.get(q.area) || { n: 0, ok: 0, ms: 0, msN: 0 };
      x.n++; if (a.correct) x.ok++; if (good) { x.ms += a.ms; x.msN++; }
      byArea.set(q.area, x);
    }
  }
  const daily: PeriodMetrics["daily"] = [];
  for (let k = from; k <= t; k = addDays(k, 1)) { const v = byDay.get(k); daily.push({ key: k, n: v?.n || 0, ok: v?.ok || 0 }); }
  const weekly: PeriodMetrics["weekly"] = [];
  for (let w = mondayOf(from); w <= t; w = addDays(w, 7)) {
    let n = 0, ok = 0, studyDays = 0;
    for (let i = 0; i < 7; i++) { const v = byDay.get(addDays(w, i)); if (v) { n += v.n; ok += v.ok; studyDays++; } }
    weekly.push({ start: w, n, ok, studyDays });
  }
  return { from, days: daily.length, total, correct, accuracy: total ? correct / total : 0, paceSec: msN ? ms / msN / 1000 : 0, byArea, daily, weekly };
}

/** especialidades fracas pesadas pelo quanto caem nas provas: (1 − acerto) × participação no banco */
export function weakFrequent(st: Stats, bank: Bank, n = 5, min = 5) {
  const all = bank.all.length || 1;
  return [...st.byTopic.entries()]
    .filter(([, v]) => v.n >= min)
    .map(([key, v]) => { const share = (bank.topicByKey[key]?.ids.length || 0) / all; const acc = v.ok / v.n; return { key, acc, n: v.n, share, score: (1 - acc) * Math.sqrt(share) }; })
    .filter((x) => x.acc < 0.8)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/** progresso em cada prova do banco: quantas questões já fez (última resposta) e quantas acertou */
export function examProgress(st: Stats, bank: Bank) {
  const out = new Map<string, { done: number; ok: number }>();
  for (const [qid, a] of st.last) {
    const q = bank.byId[qid]; if (!q || a.choice === null) continue;
    const x = out.get(q.p) || { done: 0, ok: 0 }; x.done++; if (a.correct) x.ok++; out.set(q.p, x);
  }
  return out;
}
