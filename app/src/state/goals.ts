/* Metas e sequência. O que o cronograma ganhou de personalização (horas por dia, plantões, pausas, várias bancas,
   ênfase por área, fases, teto, flashcards no plano) também mora aqui, por plano, sem mexer no tipo Plan do store.
   A sequência conta dias em que o mínimo foi cumprido (questões OU cards); um "dia de plantão" preserva a sequência.
   Os cards revisados por dia vêm do registro de revisões dos flashcards (IndexedDB), lido só para contar. */
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { addDays, dayKey, diffDays, today } from "../lib/format";
import type { DayKey } from "../lib/format";
import { quietly } from "./quiet";
import { useStore } from "./store";
import type { Plan } from "./store";
import { useStats } from "./stats";
import type { Stats } from "./stats";
import type { Bank } from "../data/bank";
import type { Shares } from "../data/select";

/* ---------- preferências do cronograma ---------- */
export type PlanPrefs = {
  /** "meta": mesma quantidade todo dia de estudo; "dia": questões por dia da semana; "horas": horas por dia da semana */
  ritmo: "meta" | "dia" | "horas";
  /** questões por dia da semana (0 = domingo), quando ritmo = "dia" */
  porDia: Record<number, number>;
  /** horas por dia da semana, quando ritmo = "horas" */
  horas: Record<number, number>;
  /** minutos por questão, com a correção (2,5 por padrão) */
  minPorQuestao: number;
  /** dias da semana com plantão: dia leve (só o mínimo) */
  plantoes: number[];
  /** férias e pausas: dias sem estudo */
  pausas: { de: DayKey; ate: DayKey; nome?: string }[];
  /** bancas-alvo além da principal do plano; pesam a incidência dos temas */
  bancas: string[];
  /** ênfase por grande área: 0,5 (menos), 1 (normal), 1,5 (mais) */
  areas: Record<string, number>;
  /** onde termina cada fase, em fração dos dias de estudo (Base até a, Revisão até b, Reta final até o fim) */
  fases: [number, number];
  /** teto de questões num dia, para nada acumular (null: sem teto) */
  teto: number | null;
};

export const DEFAULT_PREFS: PlanPrefs = {
  ritmo: "meta", porDia: {}, horas: {}, minPorQuestao: 2.5, plantoes: [], pausas: [], bancas: [], areas: {}, fases: [0.65, 0.9], teto: null,
};

/** segundos por card numa revisão (média do Anki com a leitura da resposta) */
export const SEC_PER_CARD = 10;
/** cards por dia somando os baralhos com meta */
export const cardsPerDay = (goals: Record<string, number>) => Object.values(goals).reduce((s, n) => s + n, 0);

/* ---------- plantões e compromissos no calendário: cada tipo tem uma regra do que estudar nesses dias ---------- */
export type DayEventKind = "plantao" | "aula" | "viagem" | "outro";
/** normal: nada muda · leve: só o mínimo de questões · flashcards: sem questões · folga: dia livre */
export type DayMode = "normal" | "leve" | "flashcards" | "folga";
export type DayRule = { modo: DayMode; decks: string[]; cards: number | null };
export type DayEvent = { id: string; de: DayKey; ate: DayKey; tipo: DayEventKind; nome?: string; /** só neste compromisso, sem seguir a regra do tipo */ regra?: DayRule };
export const EVENT_LABEL: Record<DayEventKind, string> = { plantao: "Plantão", aula: "Aula ou prova da faculdade", viagem: "Viagem", outro: "Outro compromisso" };
export const MODE_LABEL: Record<DayMode, string> = { normal: "Normal", leve: "Dia leve", flashcards: "Só flashcards", folga: "Folga" };
export const DEFAULT_RULES: Record<DayEventKind, DayRule> = {
  plantao: { modo: "flashcards", decks: [], cards: null }, aula: { modo: "leve", decks: [], cards: null }, viagem: { modo: "folga", decks: [], cards: null }, outro: { modo: "leve", decks: [], cards: null },
};
const MODE_WEIGHT: Record<DayMode, number> = { normal: 0, leve: 1, flashcards: 2, folga: 3 };
export type DayPlan = DayRule & { label: string };

/** o que vale neste dia pelos compromissos marcados; com mais de um, ganha o que deixa menos tempo livre */
export function dayPlanOf(k: DayKey, eventos: DayEvent[], regras: Partial<Record<DayEventKind, DayRule>> = {}): DayPlan | null {
  let best: DayPlan | null = null;
  for (const e of eventos) {
    if (k < e.de || k > e.ate) continue;
    const r = e.regra || regras[e.tipo] || DEFAULT_RULES[e.tipo];
    if (!best || MODE_WEIGHT[r.modo] > MODE_WEIGHT[best.modo]) best = { ...r, label: e.nome || (e.tipo === "aula" ? "Compromisso" : EVENT_LABEL[e.tipo]) };
  }
  return best;
}

/* ---------- metas e sequência ---------- */
export type Milestone = { n: number; label: string };
export const MILESTONES: Milestone[] = [{ n: 7, label: "7 dias" }, { n: 30, label: "30 dias" }, { n: 100, label: "100 dias" }, { n: 200, label: "200 dias" }, { n: 365, label: "1 ano" }];
/** dias de plantão: ganha 2 por mês, acumula até 6 */
export const PLANTAO_POR_MES = 2, PLANTAO_MAX = 6;

type GoalsState = {
  /** preferências do cronograma, pela data de criação do plano */
  prefs: Record<string, PlanPrefs>;
  /** meta de cards por dia de cada baralho (entra no cronograma e na lista de Hoje) */
  cardGoals: Record<string, number>;
  /** o que conta para a sequência: o dia vale com pelo menos isso (questões OU cards) */
  minimo: { questoes: number; cards: number };
  /** dias de plantão usados (preservam a sequência) */
  plantao: Record<DayKey, true>;
  /** dias fechados com "Fechar o dia" */
  fechados: Record<DayKey, true>;
  /** marcos já comemorados (sequência em dias) */
  marcos: Record<number, DayKey>;
  /** "primeiros passos" dispensado */
  passosOk: boolean;
  /** primeiro dia em que o app guardou metas: conta o saldo de plantões */
  desde: DayKey;
  /** proporção por área em cada banca, em %, quando a pessoa discorda da estimativa */
  proporcoes: Record<string, Shares>;
  /** plantões e compromissos marcados no calendário */
  eventos: DayEvent[];
  /** o que estudar em cada tipo de compromisso */
  regras: Partial<Record<DayEventKind, DayRule>>;

  setProporcao: (banca: string, s: Shares | null) => void;
  addEventos: (e: DayEvent[]) => void;
  removeEvento: (id: string) => void;
  setRegra: (tipo: DayEventKind, r: DayRule) => void;
  setPrefs: (plan: Plan, p: Partial<PlanPrefs>) => void;
  setMinimo: (m: Partial<GoalsState["minimo"]>) => void;
  setCardGoal: (deck: string, n: number | null) => void;
  registerPlantao: (d: DayKey) => void;
  undoPlantao: (d: DayKey) => void;
  closeDay: (d: DayKey) => void;
  reopenDay: (d: DayKey) => void;
  celebrateMilestone: (n: number) => void;
  dismissSteps: () => void;
};

const planKey = (p: Plan) => String(p.criadoEm);

export const useGoals = create<GoalsState>()(persist((set) => ({
  prefs: {},
  cardGoals: {},
  minimo: { questoes: 10, cards: 20 },
  plantao: {},
  fechados: {},
  marcos: {},
  passosOk: false,
  desde: today(),
  proporcoes: {},
  eventos: [],
  regras: {},
  setProporcao: (banca, v) => set((s) => { const x = { ...s.proporcoes }; if (v) x[banca] = v; else delete x[banca]; return { proporcoes: x }; }),
  addEventos: (e) => set((s) => ({ eventos: [...s.eventos, ...e] })),
  removeEvento: (id) => set((s) => ({ eventos: s.eventos.filter((x) => x.id !== id) })),
  setRegra: (tipo, r) => set((s) => ({ regras: { ...s.regras, [tipo]: r } })),
  setPrefs: (plan, p) => set((s) => ({ prefs: { ...s.prefs, [planKey(plan)]: { ...DEFAULT_PREFS, ...(s.prefs[planKey(plan)] || {}), ...p } } })),
  setMinimo: (m) => set((s) => ({ minimo: { ...s.minimo, ...m } })),
  setCardGoal: (deck, n) => set((s) => { const x = { ...s.cardGoals }; if (n == null || n <= 0) delete x[deck]; else x[deck] = n; return { cardGoals: x }; }),
  registerPlantao: (d) => set((s) => ({ plantao: { ...s.plantao, [d]: true } })),
  undoPlantao: (d) => set((s) => { const x = { ...s.plantao }; delete x[d]; return { plantao: x }; }),
  closeDay: (d) => set((s) => ({ fechados: { ...s.fechados, [d]: true } })),
  reopenDay: (d) => set((s) => { const x = { ...s.fechados }; delete x[d]; return { fechados: x }; }),
  celebrateMilestone: (n) => set((s) => ({ marcos: { ...s.marcos, [n]: today() } })),
  dismissSteps: () => set({ passosOk: true }),
}), {
  name: "conduta-goals", version: 1,
  merge: (p, cur) => { const x = (p || {}) as Partial<GoalsState>; return { ...cur, ...x, minimo: { ...cur.minimo, ...(x.minimo || {}) } }; },
}));

/** as preferências do plano (ou as padrão); fora de componente também */
export function prefsFor(plan: Plan | null, s = useGoals.getState()): PlanPrefs {
  if (!plan) return DEFAULT_PREFS;
  return { ...DEFAULT_PREFS, ...(s.prefs[planKey(plan)] || {}) };
}
export function usePlanPrefs(plan: Plan | null) {
  const raw = useGoals((s) => (plan ? s.prefs[planKey(plan)] : undefined));
  return useMemo(() => ({ ...DEFAULT_PREFS, ...(raw || {}) }), [raw]);
}

/* ---------- cards revisados por dia (do registro de revisões dos flashcards) ---------- */
type CardsState = { byDay: Map<DayKey, number>; todayByDeck: Map<string, number>; loaded: boolean; refresh: () => Promise<void> };

/** lê o registro sem criar o banco se ele ainda não existe (quem cria é a parte de flashcards) */
function readCardsByDay(since: number): Promise<{ m: Map<DayKey, number>; deck: Map<string, number> }> {
  return new Promise((done) => {
    const m = new Map<DayKey, number>(), deck = new Map<string, number>(), t = today();
    const res = () => done({ m, deck });
    if (typeof indexedDB === "undefined") return res();
    let r: IDBOpenDBRequest;
    try { r = indexedDB.open("conduta-flashcards"); } catch { return res(); }
    r.onupgradeneeded = () => { r.transaction?.abort(); };
    r.onerror = () => res();
    r.onblocked = () => res();
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("revlog")) { db.close(); return res(); }
      try {
        const ix = db.transaction("revlog").objectStore("revlog").index("at");
        const cur = ix.openCursor(IDBKeyRange.lowerBound(since));
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) { db.close(); res(); return; }
          const v = c.value as { at: number; deck: string }, k = dayKey(v.at);
          m.set(k, (m.get(k) || 0) + 1);
          if (k === t) deck.set(v.deck, (deck.get(v.deck) || 0) + 1);
          c.continue();
        };
        cur.onerror = () => { db.close(); res(); };
      } catch { db.close(); res(); }
    };
  });
}

export const useCardsDone = create<CardsState>()((set) => ({
  byDay: new Map(), todayByDeck: new Map(), loaded: false,
  refresh: async () => { const r = await readCardsByDay(Date.now() - 400 * 86400000); set({ byDay: r.m, todayByDeck: r.deck, loaded: true }); },
}));

let cardsStarted = false;
/** cards revisados por dia; recarrega ao voltar para a aba */
export function useCardsByDay() {
  const byDay = useCardsDone((s) => s.byDay);
  useEffect(() => {
    if (cardsStarted) return;
    cardsStarted = true;
    useCardsDone.getState().refresh();
    const again = () => { if (document.visibilityState === "visible") useCardsDone.getState().refresh(); };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
  }, []);
  return byDay;
}

/* ---------- sequência ---------- */
export type DayMark = "cheio" | "minimo" | "plantao" | "vazio" | "futuro";
export type Streak = {
  current: number;
  best: number;
  /** hoje já conta? */
  todayCounts: boolean;
  /** hoje: questões e cards feitos, e quanto falta para o mínimo */
  today: { questoes: number; cards: number; faltaQ: number; faltaC: number };
  /** saldo de dias de plantão */
  plantoes: number;
  /** o próximo marco e quanto falta */
  next: Milestone | null;
  /** os últimos 84 dias (12 semanas), do mais antigo para hoje */
  grid: { key: DayKey; mark: DayMark; q: number; c: number }[];
  /** ontem ficou sem nada e pode ser salvo com um plantão */
  repairable: DayKey | null;
};

export function computeStreak(st: Stats, cards: Map<DayKey, number>, g: Pick<GoalsState, "minimo" | "plantao" | "desde">, goalQ: number): Streak {
  const t = today();
  const q = (k: DayKey) => st.activity.get(k) || 0, c = (k: DayKey) => cards.get(k) || 0;
  const counts = (k: DayKey) => q(k) >= g.minimo.questoes || c(k) >= g.minimo.cards || !!g.plantao[k];
  const todayCounts = counts(t);
  let current = 0, d = todayCounts ? t : addDays(t, -1);
  while (counts(d)) { current++; d = addDays(d, -1); }
  // recorde: maior série de dias que contam, olhando os dias com qualquer registro
  const keys = new Set<DayKey>([...st.activity.keys(), ...cards.keys(), ...Object.keys(g.plantao)]);
  const sorted = [...keys].filter(counts).sort();
  let best = 0, run = 0;
  sorted.forEach((k, i) => { run = i && addDays(sorted[i - 1], 1) === k ? run + 1 : 1; best = Math.max(best, run); });
  best = Math.max(best, current);
  // saldo de plantões: 2 por mês desde que as metas começaram, até 6, menos os usados
  const start = [g.desde, ...Object.keys(g.plantao)].sort()[0] || t;
  let bal = 0;
  const [sy, sm] = start.split("-").map(Number), [ty, tm] = t.split("-").map(Number);
  for (let y = sy, m = sm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, m = 1) : m++) {
    bal = Math.min(PLANTAO_MAX, bal + PLANTAO_POR_MES);
    const pref = `${y}-${String(m).padStart(2, "0")}`;
    bal -= Object.keys(g.plantao).filter((k) => k.startsWith(pref)).length;
    bal = Math.max(0, bal);
  }
  const next = MILESTONES.find((x) => x.n > current) || null;
  const grid = Array.from({ length: 84 }, (_, i) => {
    const k = addDays(t, i - 83), qq = q(k), cc = c(k);
    const mark: DayMark = k > t ? "futuro" : g.plantao[k] && qq < g.minimo.questoes && cc < g.minimo.cards ? "plantao"
      : qq >= Math.max(goalQ, g.minimo.questoes) ? "cheio" : counts(k) ? "minimo" : "vazio";
    return { key: k, mark, q: qq, c: cc };
  });
  const y = addDays(t, -1);
  // ontem sem nada, mas a sequência de antes de ontem existia: um plantão salva
  const repairable = !counts(y) && counts(addDays(t, -2)) && bal > 0 ? y : null;
  return {
    current, best, todayCounts,
    today: { questoes: q(t), cards: c(t), faltaQ: Math.max(0, g.minimo.questoes - q(t)), faltaC: Math.max(0, g.minimo.cards - c(t)) },
    plantoes: bal, next, grid, repairable,
  };
}

/** a meta de questões de hoje: a do cronograma (se for dia de estudo) ou a meta diária dos Ajustes */
export function goalToday(meta: number, planTarget: number | null) {
  return planTarget ?? meta;
}

export function useStreak(bank: Bank | null, goalQ?: number) {
  const st = useStats(bank);
  const cards = useCardsByDay();
  const minimo = useGoals((s) => s.minimo), plantao = useGoals((s) => s.plantao), desde = useGoals((s) => s.desde);
  const meta = useStore((s) => s.settings.metaDiaria);
  return useMemo(() => computeStreak(st, cards, { minimo, plantao, desde }, goalQ ?? meta), [st, cards, minimo, plantao, desde, goalQ, meta]);
}

/** o progresso de hoje: questões e cards feitos, metas, mínimo e se o dia já foi fechado */
export function useDayProgress(bank: Bank | null, goalQ: number, goalC: number) {
  const st = useStats(bank);
  const cards = useCardsByDay();
  const minimo = useGoals((s) => s.minimo), fechado = useGoals((s) => !!s.fechados[today()]), plantao = useGoals((s) => !!s.plantao[today()]);
  const t = today();
  const q = st.activity.get(t) || 0, c = cards.get(t) || 0;
  return {
    questoes: q, cards: c, goalQ, goalC,
    minimoOk: q >= minimo.questoes || c >= minimo.cards || plantao,
    metaOk: q >= goalQ && c >= goalC,
    fechado, plantao,
    /** fração do dia: média entre questões e cards (só o que tem meta) */
    frac: (() => { const parts = [goalQ ? Math.min(1, q / goalQ) : null, goalC ? Math.min(1, c / goalC) : null].filter((x): x is number => x != null); return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0; })(),
  };
}

/** quantos dias faltam (para textos de marco) */
export const daysTo = (k: DayKey) => diffDays(today(), k);

// outra aba gravou as metas: recarrega daqui para uma não apagar o que a outra salvou
if (typeof window !== "undefined") addEventListener("storage", (e: StorageEvent) => { if (e.key === "conduta-goals") quietly(() => useGoals.persist.rehydrate()); });
