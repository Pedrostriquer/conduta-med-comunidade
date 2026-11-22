/* O cronograma no servidor: porte de app/src/data/plan.ts. O original puxa React e zustand por causa de useGoals,
   então não dá para importar daqui; a lógica é a mesma, recebendo preferências, metas e mínimo por parâmetro.
   Mudou lá, mude aqui: as duas contas precisam mostrar os mesmos dias. */
import { cat, poolOf, topicKey } from "./catalog";
import { addDays, diffDays, today, weekdayOf } from "./dates";
import { weakTopics } from "./stats";
import type { Stats } from "./stats";

export type Plan = {
  banca: string; exame: string; data: string; inicio: string; dias: number[]; meta: number;
  simulado: { freq: "semanal" | "quinzenal" | "nenhum"; dia: number };
  ajustes: Record<string, number>; resolvidoAte: string | null; criadoEm: number;
};
export type PlanPrefs = {
  ritmo: "meta" | "dia" | "horas"; porDia: Record<number, number>; horas: Record<number, number>; minPorQuestao: number; plantoes: number[];
  pausas: { de: string; ate: string; nome?: string }[]; bancas: string[]; areas: Record<string, number>; fases: [number, number]; teto: number | null;
};
export type DayEventKind = "plantao" | "aula" | "viagem" | "outro";
export type DayMode = "normal" | "leve" | "flashcards" | "folga";
export type DayRule = { modo: DayMode; decks: string[]; cards: number | null };
export type DayEvent = { id: string; de: string; ate: string; tipo: DayEventKind; nome?: string; regra?: DayRule };
export const EVENT_LABEL: Record<DayEventKind, string> = { plantao: "Plantão", aula: "Aula ou prova da faculdade", viagem: "Viagem", outro: "Outro compromisso" };
export const DEFAULT_RULES: Record<DayEventKind, DayRule> = {
  plantao: { modo: "flashcards", decks: [], cards: null }, aula: { modo: "leve", decks: [], cards: null }, viagem: { modo: "folga", decks: [], cards: null }, outro: { modo: "leve", decks: [], cards: null },
};
const MODE_WEIGHT: Record<DayMode, number> = { normal: 0, leve: 1, flashcards: 2, folga: 3 };
/** o que vale neste dia pelos compromissos marcados; com mais de um, ganha o que deixa menos tempo livre */
export function dayPlanOf(k: string, eventos: DayEvent[] = [], regras: Partial<Record<DayEventKind, DayRule>> = {}) {
  let best: (DayRule & { label: string }) | null = null;
  for (const e of eventos) {
    if (k < e.de || k > e.ate) continue;
    const r = e.regra || regras[e.tipo] || DEFAULT_RULES[e.tipo];
    if (!best || MODE_WEIGHT[r.modo] > MODE_WEIGHT[best.modo]) best = { ...r, label: e.nome || (e.tipo === "aula" ? "Compromisso" : EVENT_LABEL[e.tipo]) };
  }
  return best;
}

export const DEFAULT_PREFS: PlanPrefs = { ritmo: "meta", porDia: {}, horas: {}, minPorQuestao: 2.5, plantoes: [], pausas: [], bancas: [], areas: {}, fases: [0.65, 0.9], teto: null };
export const SEC_PER_CARD = 10;
export const PHASES = ["Base", "Revisão", "Reta final"] as const;

export type PlanDay = { key: string; kind: "estudo" | "simulado" | "folga" | "vespera" | "prova"; phase: 0 | 1 | 2; topics: string[]; target: number; exam?: string; formato?: "original" | "embaralhada"; light?: boolean; evento?: string; onlyCards?: boolean; decks?: string[]; pausa?: string; cards?: number; minutes?: number };

export const cardsPerDay = (goals: Record<string, number>) => Object.values(goals).reduce((s, n) => s + n, 0);
export const prefsOf = (plan: Plan | null, prefs: Record<string, Partial<PlanPrefs>> = {}): PlanPrefs => (plan ? { ...DEFAULT_PREFS, ...(prefs[String(plan.criadoEm)] || {}) } : DEFAULT_PREFS);
export const targetBancas = (plan: Plan, p: PlanPrefs) => [...new Set([plan.banca, ...p.bancas])];
export const examName = (banca: string, data: string) => {
  const [y, m] = data.split("-").map(Number);
  return `${banca === "Outra" ? "Prova" : banca} ${y + (banca === "ENAMED" ? 0 : m - 1 >= 8 ? 1 : 0)}`;
};

function weights(bancas: string[], areas: Record<string, number> = {}) {
  const c = cat(), any = bancas.includes("Outra");
  const m = new Map<string, number>();
  for (const q of poolOf(false)) {
    if (!any && !bancas.includes(c.examById.get(q.p)?.banca as string)) continue;
    const k = topicKey(q); m.set(k, (m.get(k) || 0) + (areas[q.area] ?? 1));
  }
  return [...m.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
}
export function baseTarget(plan: Plan, p: PlanPrefs, wd: number, cards: number) {
  const cardsMin = cards * SEC_PER_CARD / 60;
  if (p.ritmo === "dia" && p.porDia[wd] != null) return p.porDia[wd];
  if (p.ritmo === "horas" && p.horas[wd] != null) return Math.max(0, Math.round((p.horas[wd] * 60 - cardsMin) / p.minPorQuestao));
  return plan.meta;
}
export const loadMinutes = (q: number, cards: number, p: PlanPrefs) => Math.round(q * p.minPorQuestao + cards * SEC_PER_CARD / 60);
const inPause = (k: string, p: PlanPrefs) => p.pausas.find((x) => k >= x.de && k <= x.ate);

function topicSequence(bancas: string[], emph: Record<string, number>, slots: number) {
  const w = weights(bancas, emph), total = w.reduce((s, [, n]) => s + n, 0) || 1;
  const areas = new Map<string, string[]>();
  for (const [k, n] of w) { const a = k.split("/")[0], l = areas.get(a) || []; for (let i = 0, c = Math.max(1, Math.round((n / total) * slots)); i < c; i++) l.push(k); areas.set(a, l); }
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

export function buildSchedule(plan: Plan, st: Stats | null, prefs: PlanPrefs, cardGoals: Record<string, number>, minimo: number, eventos: DayEvent[] = [], regras: Partial<Record<DayEventKind, DayRule>> = {}): PlanDay[] {
  const c = cat(), days: PlanDay[] = [], bancas = targetBancas(plan, prefs), cardsDay = cardsPerDay(cardGoals);
  const evOf = (k: string) => dayPlanOf(k, eventos, regras);
  const blocked = (k: string) => { const m = evOf(k)?.modo; return m === "folga" || m === "flashcards"; };
  const n = Math.max(0, diffDays(plan.inicio, plan.data));
  const all: string[] = []; for (let i = 0; i <= n; i++) all.push(addDays(plan.inicio, i));
  const usual = all.filter((k) => k !== plan.data && k !== addDays(plan.data, -1) && plan.dias.includes(weekdayOf(k)) && !inPause(k, prefs));
  const study = usual.filter((k) => !blocked(k));
  const N = study.length || 1, [f1, f2] = prefs.fases;
  const phaseOf = (i: number): 0 | 1 | 2 => (i < N * f1 ? 0 : i < N * f2 ? 1 : 2);
  const simDays = new Set<string>();
  if (plan.simulado.freq !== "nenhum") {
    let toggle = false, carry = false, i = -1;
    for (const k of usual) {
      const wd = weekdayOf(k), free = !blocked(k);
      if (free) i++;
      if (wd === plan.simulado.dia) { if (plan.simulado.freq === "semanal" || !toggle) { if (free) simDays.add(k); else carry = true; } toggle = !toggle; }
      else if (free && carry) { simDays.add(k); carry = false; }
      else if (free && phaseOf(i) === 2 && wd === (plan.simulado.dia + 4) % 7) simDays.add(k);
    }
  }
  const own = c.exams.filter((e) => bancas.includes("Outra") || bancas.includes(e.banca));
  const order = [...own, ...c.exams.filter((e) => !own.includes(e))];
  const seq = topicSequence(bancas, prefs.areas, Math.ceil(study.filter((k) => !simDays.has(k)).length * f1) * 2);
  const weak = st ? weakTopics(st).map((w) => w.key) : [];
  const heavy = weights(bancas, prefs.areas).map(([k]) => k);
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
    if (phase === 0 && si < seq.length) { topics = [seq[si], seq[si + 1]].filter(Boolean); si += 2; }
    else {
      const src = weak.length ? weak : heavy;
      topics = [src[wi % src.length], heavy[(wi * 3 + 1) % heavy.length]].filter((x, j, a) => x && a.indexOf(x) === j);
      wi++;
    }
    const wd = weekdayOf(k), light = prefs.plantoes.includes(wd) || ev?.modo === "leve";
    const raw = (light ? Math.min(minimo, baseTarget(plan, prefs, wd, cardsDay)) : baseTarget(plan, prefs, wd, cardsDay)) + (plan.ajustes[k] || 0);
    const target = Math.max(0, prefs.teto ? Math.min(prefs.teto, raw) : raw);
    days.push({ key: k, kind: "estudo", phase, topics, target, light: light || undefined, evento: ev?.label, cards: cardsDay, minutes: loadMinutes(target, cardsDay, prefs) });
  }
  return days;
}

/** o resumo de um plano: para mostrar o impacto antes de aplicar */
export function planImpact(days: PlanDay[], prefs: PlanPrefs, cards: number) {
  const t = today(), study = days.filter((d) => d.kind === "estudo" && d.key >= t);
  const q = study.reduce((s, d) => s + d.target, 0), avgQ = study.length ? Math.round(q / study.length) : 0;
  return {
    dias_de_estudo: study.length, questoes_ate_a_prova: q, media_questoes_por_dia: avgQ, cards_por_dia: cards, carga_media_min: loadMinutes(avgQ, cards, prefs),
    simulados: days.filter((d) => d.kind === "simulado" && d.key >= t).length, dias_de_plantao: study.filter((d) => d.light).length, dias_de_pausa: days.filter((d) => d.pausa).length, maior_dia: study.reduce((m, d) => Math.max(m, d.target), 0),
  };
}

/** questões que ficaram para trás nos dias passados ainda não resolvidos */
export function behindOf(plan: Plan, days: PlanDay[], st: Stats) {
  const t = today();
  let behind = 0, planned = 0, done = 0;
  for (const d of days) {
    if (d.kind !== "estudo") continue;
    planned += d.target;
    const did = st.activity.get(d.key) || 0;
    if (d.key <= t) done += Math.min(d.target, did);
    if (d.key < t && (!plan.resolvidoAte || d.key > plan.resolvidoAte)) behind += Math.max(0, d.target - did);
  }
  return { atrasadas: behind, progresso: planned ? done / planned : 0 };
}
