/* O cronograma: dos dias disponíveis até a prova sai a agenda de cada dia (temas, questões, simulados),
   e do que foi feito sai o status (em dia, atrasado, adiantado) e o novo ritmo quando algo fica para trás. */
import type { Bank } from "./bank";
import { pool } from "./bank";
import { estimatedShares } from "./select";
import type { AreaId } from "./types";
import { addDays, diffDays, fromKey, today } from "../lib/format";
import type { DayKey } from "../lib/format";
import type { Plan, Session } from "../state/store";
import type { Stats } from "../state/stats";
import { weakTopics } from "../state/stats";
import { cardsPerDay, dayPlanOf, prefsFor, SEC_PER_CARD, useGoals } from "../state/goals";
import type { DayEvent, DayEventKind, DayRule, PlanPrefs } from "../state/goals";

export type Phase = 0 | 1 | 2;
export const PHASES = [
  { id: 0, name: "Base", hint: "Passar por todos os temas, na ordem do que mais cai" },
  { id: 1, name: "Revisão", hint: "Voltar aos temas em que você mais erra" },
  { id: 2, name: "Reta final", hint: "Mais simulados e revisão de erros" },
] as const;

export type PlanDay = {
  key: DayKey;
  kind: "estudo" | "simulado" | "folga" | "vespera" | "prova";
  phase: Phase;
  /** especialidades do dia (area/especialidade) */
  topics: string[];
  /** questões planejadas */
  target: number;
  /** prova do simulado e formato */
  exam?: string;
  formato?: "original" | "embaralhada";
  /** dia de plantão: só o mínimo */
  light?: boolean;
  /** plantão ou compromisso marcado no calendário */
  evento?: string;
  /** dia sem questões: só os cards, destes baralhos (vazio: todos os do plano) */
  onlyCards?: boolean;
  decks?: string[];
  /** férias ou pausa (o nome, se tiver) */
  pausa?: string;
  /** cards planejados (soma dos baralhos do plano) */
  cards?: number;
  /** carga estimada do dia, em minutos (questões e cards) */
  minutes?: number;
};

/** as bancas que pesam no plano: a principal e as outras escolhidas */
export const targetBancas = (plan: Plan, prefs: PlanPrefs) => [...new Set([plan.banca, ...prefs.bancas])];

/** peso de cada especialidade: quantas questões ela tem nas provas das bancas-alvo, vezes a ênfase da área */
function weights(b: Bank, bancas: string[], areas: Record<string, number> = {}) {
  const any = bancas.includes("Outra");
  const xs = pool(b, false).filter((q) => any || bancas.includes(b.examById[q.p]?.banca as string));
  const m = new Map<string, number>();
  // a proporção que a pessoa ajustou pesa junto com o que o banco tem de cada banca
  const fix = (banca: string | undefined, area: string) => { const own = banca ? useGoals.getState().proporcoes[banca] : null; if (!own) return 1; const est = estimatedShares(b, banca!)[area as AreaId]; return est ? own[area as AreaId] / est : 1; };
  for (const q of xs) { const k = q.area + "/" + (q.esp || "Outros"); m.set(k, (m.get(k) || 0) + (areas[q.area] ?? 1) * fix(b.examById[q.p]?.banca, q.area)); }
  return [...m.entries()].filter(([, n]) => n >= 3).sort((a, b2) => b2[1] - a[1]);
}

/** questões de um dia de estudo pela regra do plano (sem os ajustes de atraso) */
export function baseTarget(plan: Plan, prefs: PlanPrefs, wd: number, cards = cardsPerDay(useGoals.getState().cardGoals)) {
  const cardsMin = cards * SEC_PER_CARD / 60;
  if (prefs.ritmo === "dia" && prefs.porDia[wd] != null) return prefs.porDia[wd];
  if (prefs.ritmo === "horas" && prefs.horas[wd] != null) return Math.max(0, Math.round((prefs.horas[wd] * 60 - cardsMin) / prefs.minPorQuestao));
  return plan.meta;
}

/** carga do dia em minutos */
export const loadMinutes = (questions: number, cards: number, prefs: PlanPrefs) => Math.round(questions * prefs.minPorQuestao + cards * SEC_PER_CARD / 60);

const inPause = (k: DayKey, prefs: PlanPrefs) => prefs.pausas.find((p) => k >= p.de && k <= p.ate);

/** Ordem dos temas na fase de base: proporcional ao peso, alternando as áreas (rodízio ponderado). */
function topicSequence(b: Bank, bancas: string[], emph: Record<string, number>, slots: number) {
  const w = weights(b, bancas, emph), total = w.reduce((s, [, n]) => s + n, 0) || 1;
  const alloc = w.map(([k, n]) => ({ k, area: k.split("/")[0], c: Math.max(1, Math.round((n / total) * slots)) }));
  const areas = new Map<string, string[]>();
  for (const a of alloc) { const l = areas.get(a.area) || []; for (let i = 0; i < a.c; i++) l.push(a.k); areas.set(a.area, l); }
  const lanes = [...areas.entries()].map(([area, list]) => ({ area, list, w: list.length, cur: 0 }));
  const sum = lanes.reduce((s, l) => s + l.w, 0), seq: string[] = [];
  while (lanes.some((l) => l.list.length)) {
    let best: (typeof lanes)[number] | null = null;
    for (const l of lanes) { if (!l.list.length) continue; l.cur += l.w; if (!best || l.cur > best.cur) best = l; }
    if (!best) break;
    best.cur -= sum; seq.push(best.list.shift()!);
  }
  return seq;
}

export function buildSchedule(plan: Plan, b: Bank, st: Stats | null, prefs: PlanPrefs = prefsFor(plan), cardGoals: Record<string, number> = useGoals.getState().cardGoals,
  eventos: DayEvent[] = useGoals.getState().eventos, regras: Partial<Record<DayEventKind, DayRule>> = useGoals.getState().regras): PlanDay[] {
  const days: PlanDay[] = [];
  const evOf = (k: DayKey) => dayPlanOf(k, eventos, regras);
  const blocked = (k: DayKey) => { const m = evOf(k)?.modo; return m === "folga" || m === "flashcards"; };
  const bancas = targetBancas(plan, prefs);
  const minimo = useGoals.getState().minimo.questoes;
  const cardsDay = cardsPerDay(cardGoals);
  const n = Math.max(0, diffDays(plan.inicio, plan.data));
  const all: DayKey[] = []; for (let i = 0; i <= n; i++) all.push(addDays(plan.inicio, i));
  const usual = all.filter((k) => k !== plan.data && k !== addDays(plan.data, -1) && plan.dias.includes(fromKey(k).getDay()) && !inPause(k, prefs));
  // plantão com só flashcards ou folga sai da conta dos dias de estudo: os temas seguem para os dias livres
  const study = usual.filter((k) => !blocked(k));
  const N = study.length || 1;
  const [f1, f2] = prefs.fases;
  const phaseOf = (i: number): Phase => (i < N * f1 ? 0 : i < N * f2 ? 1 : 2);
  // simulados: no dia escolhido; quinzenal pula uma semana; na reta final, um a mais por semana
  const simDays = new Set<DayKey>();
  if (plan.simulado.freq !== "nenhum") {
    let toggle = false, carry = false, i = -1;
    for (const k of usual) {
      const wd = fromKey(k).getDay(), free = !blocked(k);
      if (free) i++;
      // o simulado que cairia num plantão passa para o próximo dia livre
      if (wd === plan.simulado.dia) { if (plan.simulado.freq === "semanal" || !toggle) { if (free) simDays.add(k); else carry = true; } toggle = !toggle; }
      else if (free && carry) { simDays.add(k); carry = false; }
      else if (free && phaseOf(i) === 2 && wd === (plan.simulado.dia + 4) % 7) simDays.add(k);
    }
  }
  // provas para os simulados: da banca alvo, da mais recente para a mais antiga; depois, embaralhadas
  const own = b.exams.filter((e) => bancas.includes("Outra") || bancas.includes(e.banca));
  const order = [...own, ...b.exams.filter((e) => !own.includes(e))];
  const studyOnly = study.filter((k) => !simDays.has(k)).length;
  const seq = topicSequence(b, bancas, prefs.areas, Math.ceil(studyOnly * f1) * 2);
  const weak = st ? weakTopics(st).map((w) => w.key) : [];
  const heavy = weights(b, bancas, prefs.areas).map(([k]) => k);
  let si = 0, ei = 0, wi = 0, prev = 0;
  const studyIndex = new Map(study.map((k, i) => [k, i]));
  for (const k of all) {
    if (k === plan.data) { days.push({ key: k, kind: "prova", phase: 2, topics: [], target: 0 }); continue; }
    const i = studyIndex.get(k);
    if (k === addDays(plan.data, -1)) { days.push({ key: k, kind: "vespera", phase: 2, topics: [], target: 0 }); continue; }
    const ev = evOf(k);
    if (ev?.modo === "flashcards") {
      const cards = ev.cards ?? cardsDay;
      days.push({ key: k, kind: "estudo", phase: phaseOf(prev), topics: [], target: 0, light: true, onlyCards: true, evento: ev.label, decks: ev.decks, cards, minutes: loadMinutes(0, cards, prefs) });
      continue;
    }
    if (i === undefined) { const pz = inPause(k, prefs); days.push({ key: k, kind: "folga", phase: phaseOf(prev), topics: [], target: 0, pausa: ev?.modo === "folga" ? ev.label : pz ? pz.nome || "Pausa" : undefined }); continue; }
    prev = i;
    const phase = phaseOf(i);
    if (simDays.has(k)) {
      const ex = order[ei % order.length], round = Math.floor(ei / order.length);
      ei++;
      days.push({ key: k, kind: "simulado", phase, topics: [], target: 0, exam: ex?.id, formato: round ? "embaralhada" : "original", evento: ev?.label, cards: cardsDay, minutes: loadMinutes(0, cardsDay, prefs) + 240 });
      continue;
    }
    let topics: string[];
    if (phase === 0 && si < seq.length) { topics = [seq[si], seq[si + 1]].filter(Boolean) as string[]; si += 2; }
    else {
      const src = weak.length ? weak : heavy;
      topics = [src[wi % src.length], heavy[(wi * 3 + 1) % heavy.length]].filter((x, j, a) => x && a.indexOf(x) === j);
      wi++;
    }
    const wd = fromKey(k).getDay(), light = prefs.plantoes.includes(wd) || ev?.modo === "leve";
    const raw = (light ? Math.min(minimo, baseTarget(plan, prefs, wd, cardsDay)) : baseTarget(plan, prefs, wd, cardsDay)) + (plan.ajustes[k] || 0);
    const target = Math.max(0, prefs.teto ? Math.min(prefs.teto, raw) : raw);
    days.push({ key: k, kind: "estudo", phase, topics, target, light: light || undefined, evento: ev?.label, cards: cardsDay, minutes: loadMinutes(target, cardsDay, prefs) });
  }
  return days;
}

export type PlanStatus = {
  /** questões que ficaram para trás (dias passados ainda não resolvidos) */
  behind: number;
  /** simulados planejados que passaram sem ser feitos */
  missedSims: PlanDay[];
  /** dias de estudo que restam (contando hoje) */
  remainingStudy: number;
  todayPlan: PlanDay | null;
  todayDone: number;
  /** fração do plano já feita */
  progress: number;
  week: { key: DayKey; plan: PlanDay | null; done: number }[];
  weekTarget: number; weekDone: number; weekSims: number; weekSimsDone: number;
  daysLeft: number;
  phase: Phase;
};

export function simDoneOn(sessions: Record<string, Session>, k: DayKey) {
  return Object.values(sessions).some((s) => s.kind === "simulado" && s.status === "finalizada" && (s.planDay === k || (s.finishedAt && new Date(s.finishedAt).toDateString() === fromKey(k).toDateString())));
}

export function planStatus(plan: Plan, days: PlanDay[], st: Stats, sessions: Record<string, Session>): PlanStatus {
  const t = today();
  let behind = 0, planned = 0, done = 0;
  const missedSims: PlanDay[] = [];
  for (const d of days) {
    if (d.kind === "estudo") {
      planned += d.target;
      const did = st.activity.get(d.key) || 0;
      if (d.key <= t) done += Math.min(d.target, did);
      if (d.key < t && (!plan.resolvidoAte || d.key > plan.resolvidoAte)) behind += Math.max(0, d.target - did);
    }
    if (d.kind === "simulado" && d.key < t && (!plan.resolvidoAte || d.key > plan.resolvidoAte) && !simDoneOn(sessions, d.key)) missedSims.push(d);
  }
  const todayPlan = days.find((d) => d.key === t) || null;
  const remainingStudy = days.filter((d) => d.kind === "estudo" && d.key >= t).length;
  // semana de segunda a domingo
  const wd = (fromKey(t).getDay() + 6) % 7, monday = addDays(t, -wd);
  const week = Array.from({ length: 7 }, (_, i) => { const k = addDays(monday, i); return { key: k, plan: days.find((d) => d.key === k) || null, done: st.activity.get(k) || 0 }; });
  const weekTarget = week.reduce((s, d) => s + (d.plan?.kind === "estudo" ? d.plan.target : 0), 0);
  const weekDone = week.reduce((s, d) => s + d.done, 0);
  const weekSims = week.filter((d) => d.plan?.kind === "simulado").length;
  const weekSimsDone = week.filter((d) => d.plan?.kind === "simulado" && simDoneOn(sessions, d.key)).length;
  return {
    behind, missedSims, remainingStudy, todayPlan, todayDone: st.activity.get(t) || 0, progress: planned ? done / planned : 0,
    week, weekTarget, weekDone, weekSims, weekSimsDone, daysLeft: diffDays(t, plan.data), phase: todayPlan?.phase ?? 0,
  };
}

/** Como fica o ritmo se o que ficou para trás for espalhado pelos dias que restam (sem passar do teto, se houver). */
export function redistribution(plan: Plan, days: PlanDay[], behind: number, prefs: PlanPrefs = prefsFor(plan)) {
  const t = today();
  const rest = days.filter((d) => d.kind === "estudo" && d.key >= t && !d.light);
  if (!rest.length) return { perDay: 0, extra: 0, ajustes: plan.ajustes, overflow: behind };
  const base = Math.floor(behind / rest.length), rem = behind % rest.length;
  const ajustes = { ...plan.ajustes };
  let overflow = 0;
  rest.forEach((d, i) => {
    let add = base + (i < rem ? 1 : 0);
    if (prefs.teto) { const room = Math.max(0, prefs.teto - d.target); overflow += Math.max(0, add - room); add = Math.min(add, room); }
    ajustes[d.key] = (ajustes[d.key] || 0) + add;
  });
  const extra = Math.ceil((behind - overflow) / rest.length);
  return { perDay: plan.meta + extra, extra, ajustes, overflow };
}

/** O resumo de um plano (ou rascunho): dias, questões, carga média e simulados. Para mostrar o impacto antes de aplicar. */
export function planImpact(days: PlanDay[], prefs: PlanPrefs, cards = cardsPerDay(useGoals.getState().cardGoals)) {
  const t = today();
  const study = days.filter((d) => d.kind === "estudo" && d.key >= t);
  const q = study.reduce((s, d) => s + d.target, 0);
  const avgQ = study.length ? Math.round(q / study.length) : 0;
  return {
    studyDays: study.length, questions: q, avgQ, cards,
    avgMin: loadMinutes(avgQ, cards, prefs),
    sims: days.filter((d) => d.kind === "simulado" && d.key >= t).length,
    light: study.filter((d) => d.light).length,
    paused: days.filter((d) => d.pausa).length,
    maxQ: study.reduce((m, d) => Math.max(m, d.target), 0),
  };
}

export const yesterday = () => addDays(today(), -1);
