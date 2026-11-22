/* Opções dos baralhos, como no Anki: predefinições (presets) compartilháveis entre baralhos, o que cada baralho
   usa, quanto já foi estudado hoje e os aumentos de limite do estudo personalizado. Fica no navegador.
   Para o aluno, a tela mostra só três perfis prontos (Leve, Padrão, Reta final); o resto é o "Modo Anki". */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { dayKey } from "../../lib/format";
import { uid } from "../../lib/random";
import { quietly } from "../../state/quiet";
import { useStore } from "../../state/store";

export type EasyDay = "normal" | "reduzido" | "minimo";
export type ReviewOrder = "vencimento" | "vencimento_baralho" | "intervalo" | "intervalo_desc" | "facilidade" | "recuperabilidade" | "aleatoria";

export type Preset = {
  id: string;
  name: string;
  /** perfil pronto de onde a predefinição veio; "custom" depois de mexer no Modo Anki */
  profile?: ProfileId | "custom";
  /* limites diários; novos nulo = o valor de Ajustes › Flashcards */
  newPerDay: number | null;
  maxReviews: number;
  newIgnoresReviewLimit: boolean;
  limitsFromTop: boolean;
  /* novos cards */
  learnSteps: number[]; // minutos
  graduatingIvl: number; // dias
  easyIvl: number;
  insertOrder: "sequencial" | "aleatoria";
  /* lapsos */
  relearnSteps: number[];
  minIvl: number;
  leechThreshold: number;
  leechAction: "marcar" | "suspender";
  /* ordem de exibição */
  newGather: "baralho" | "posicao" | "aleatoria_notas" | "aleatoria_cards";
  newOrder: "baralho" | "aleatoria";
  mix: "misturar" | "antes" | "depois";
  interdayMix: "misturar" | "antes" | "depois";
  reviewOrder: ReviewOrder;
  /* enterrar */
  buryNew: boolean;
  buryReview: boolean;
  buryInterday: boolean;
  /* áudio */
  noAutoplay: boolean;
  skipQuestionOnReplay: boolean;
  /* cronômetros */
  maxAnswerSecs: number;
  showTimer: boolean;
  stopTimerOnAnswer: boolean;
  /* avanço automático (0 = desligado) */
  autoQuestionSecs: number;
  autoAnswerSecs: number;
  autoWaitAudio: boolean;
  autoQuestionAction: "mostrar_resposta" | "lembrete";
  autoAnswerAction: "bom" | "de_novo" | "enterrar" | "lembrete";
  /* dias fáceis: domingo a sábado */
  easyDays: EasyDay[];
  /* avançado */
  maxIvl: number;
  startEase: number;
  easyBonus: number;
  ivlModifier: number;
  hardMult: number;
  lapseIvl: number; // fração do intervalo que sobra depois do lapso
  historicalRetention: number;
  ignoreBefore: string;
  customScheduling: string;
  /* FSRS */
  fsrs: boolean;
  retention: number;
  fsrsParams: string;
  fsrsOptimizedAt?: number;
  rescheduleOnChange: boolean;
};

/* ---------- os três perfis do aluno ---------- */
export type ProfileId = "leve" | "padrao" | "reta";
export const PROFILES: { id: ProfileId; name: string; who: string; hint: string; set: Partial<Preset> }[] = [
  { id: "leve", name: "Leve", who: "Internato pesado, plantões", hint: "Poucos cards novos e um teto baixo de revisões: dá para manter em dia mesmo nas semanas difíceis.",
    set: { newPerDay: 10, maxReviews: 100, retention: 0.85, fsrs: true, reviewOrder: "vencimento", mix: "misturar" } },
  { id: "padrao", name: "Padrão", who: "Rotina de estudo regular", hint: "O equilíbrio do Anki: 20 novos por dia e lembrar 9 de cada 10 cards quando eles voltam.",
    set: { newPerDay: 20, maxReviews: 200, retention: 0.9, fsrs: true, reviewOrder: "vencimento", mix: "misturar" } },
  { id: "reta", name: "Reta final", who: "Últimas semanas antes da prova", hint: "Quase nada novo, sem teto de revisões e os cards mais esquecidos primeiro.",
    set: { newPerDay: 3, maxReviews: 9999, retention: 0.92, fsrs: true, reviewOrder: "recuperabilidade", mix: "depois" } },
];
export const DEFAULT_FSRS = "0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621";

export const DEFAULT_ID = "padrao";
export const defaults = (id = DEFAULT_ID, name = "Padrão"): Preset => ({
  id, name, profile: "padrao", newPerDay: null, maxReviews: 200, newIgnoresReviewLimit: false, limitsFromTop: false,
  learnSteps: [1, 10], graduatingIvl: 1, easyIvl: 4, insertOrder: "sequencial",
  relearnSteps: [10], minIvl: 1, leechThreshold: 8, leechAction: "marcar",
  newGather: "baralho", newOrder: "baralho", mix: "misturar", interdayMix: "misturar", reviewOrder: "vencimento",
  buryNew: true, buryReview: true, buryInterday: false,
  noAutoplay: false, skipQuestionOnReplay: false,
  maxAnswerSecs: 60, showTimer: false, stopTimerOnAnswer: true,
  autoQuestionSecs: 0, autoAnswerSecs: 0, autoWaitAudio: true, autoQuestionAction: "mostrar_resposta", autoAnswerAction: "bom",
  easyDays: ["normal", "normal", "normal", "normal", "normal", "normal", "normal"],
  maxIvl: 36500, startEase: 2.5, easyBonus: 1.3, ivlModifier: 1, hardMult: 1.2, lapseIvl: 0,
  historicalRetention: 0.9, ignoreBefore: "", customScheduling: "",
  fsrs: true, retention: 0.9, fsrsParams: DEFAULT_FSRS, rescheduleOnChange: false,
});

type Today = { new: number; rev: number; extraNew: number; extraRev: number };
/** limites que valem só para um baralho (a aba "Este baralho" do Anki) */
export type DeckLimits = { newPerDay?: number; maxReviews?: number };
type FcState = {
  presets: Record<string, Preset>;
  /** baralho → predefinição */
  deckPreset: Record<string, string>;
  /** baralhos com os cards novos pausados */
  paused: Record<string, true>;
  deckLimits: Record<string, DeckLimits>;
  /** `${baralho}:${dia}` → estudados hoje e aumentos do estudo personalizado */
  today: Record<string, Today>;
  setPreset: (p: Preset) => void;
  addPreset: (from: Preset, name: string) => string;
  removePreset: (id: string) => void;
  usePreset: (deck: string, id: string) => void;
  bump: (deck: string, p: Partial<Today>) => void;
  setPaused: (deck: string, v: boolean) => void;
  setDeckLimits: (deck: string, l: DeckLimits | null) => void;
};

const tk = (deck: string) => deck + ":" + dayKey();
const zero: Today = { new: 0, rev: 0, extraNew: 0, extraRev: 0 };

export const useFc = create<FcState>()(
  persist(
    (set) => ({
      presets: { [DEFAULT_ID]: defaults() },
      deckPreset: {},
      paused: {},
      deckLimits: {},
      today: {},
      setPreset: (p) => set((s) => ({ presets: { ...s.presets, [p.id]: p } })),
      addPreset: (from, name) => { const id = uid(); set((s) => ({ presets: { ...s.presets, [id]: { ...from, id, name } } })); return id; },
      removePreset: (id) => set((s) => {
        if (id === DEFAULT_ID) return s;
        const presets = { ...s.presets }; delete presets[id];
        const deckPreset = Object.fromEntries(Object.entries(s.deckPreset).filter(([, v]) => v !== id));
        return { presets, deckPreset };
      }),
      usePreset: (deck, id) => set((s) => ({ deckPreset: { ...s.deckPreset, [deck]: id } })),
      setPaused: (deck, v) => set((s) => { const x = { ...s.paused }; if (v) x[deck] = true; else delete x[deck]; return { paused: x }; }),
      setDeckLimits: (deck, l) => set((s) => { const x = { ...s.deckLimits }; if (l && (l.newPerDay != null || l.maxReviews != null)) x[deck] = l; else delete x[deck]; return { deckLimits: x }; }),
      bump: (deck, p) => set((s) => {
        const k = tk(deck), cur = s.today[k] || zero;
        const next = { ...cur };
        (Object.keys(p) as (keyof Today)[]).forEach((x) => { next[x] = Math.max(0, cur[x] + (p[x] || 0)); });
        // só guarda o dia de hoje e os seis anteriores
        const keep = Object.fromEntries(Object.entries(s.today).filter(([key]) => key.slice(-10) >= dayKey(Date.now() - 6 * 86400000)));
        return { today: { ...keep, [k]: next } };
      }),
    }),
    {
      name: "conduta-fc", version: 1,
      merge: (p, cur) => {
        const x = (p || {}) as Partial<FcState>;
        const presets = Object.fromEntries(Object.entries({ ...cur.presets, ...(x.presets || {}) }).map(([k, v]) => [k, { ...defaults(k, v.name), ...v }]));
        return { ...cur, ...x, presets, paused: x.paused || {}, deckLimits: x.deckLimits || {} };
      },
    },
  ),
);

// outra aba gravou: recarrega daqui para uma não apagar o que a outra salvou
if (typeof window !== "undefined") addEventListener("storage", (e: StorageEvent) => { if (e.key === "conduta-fc") quietly(() => useFc.persist.rehydrate()); });

export function presetFor(deck: string, s = useFc.getState()): Preset {
  return s.presets[s.deckPreset[deck]] || s.presets[DEFAULT_ID] || defaults();
}
export const newPerDay = (p: Preset) => p.newPerDay ?? useStore.getState().settings.cardsNovosPorDia;
export const todayOf = (deck: string, s = useFc.getState()) => s.today[tk(deck)] || zero;

/** fator dos dias fáceis sobre os novos de hoje (aproximação: o Anki também espalha as revisões) */
export const EASY_FACTOR: Record<EasyDay, number> = { normal: 1, reduzido: 0.5, minimo: 0 };

/** os limites que valem hoje para o baralho: o "Este baralho" vence a predefinição; os dias fáceis reduzem os novos */
export function limitsFor(deck: string, s = useFc.getState()) {
  const p = presetFor(deck, s), l = s.deckLimits[deck] || {};
  const day = p.easyDays?.[new Date().getDay()] || "normal";
  const nNew = Math.round((l.newPerDay ?? newPerDay(p)) * EASY_FACTOR[day]);
  return { newPerDay: s.paused[deck] ? 0 : nNew, maxReviews: l.maxReviews ?? p.maxReviews, easyDay: day };
}

/** quantos novos e quantas revisões ainda cabem hoje neste baralho */
export function remaining(deck: string) {
  const s = useFc.getState(), p = presetFor(deck, s), t = todayOf(deck, s), lim = limitsFor(deck, s);
  const revLeft = Math.max(0, lim.maxReviews + t.extraRev - t.rev);
  let newLeft = Math.max(0, lim.newPerDay + t.extraNew - t.new);
  // como no Anki: sem "novos ignoram o limite de revisões", o teto de revisões também segura os novos
  if (!p.newIgnoresReviewLimit) newLeft = Math.min(newLeft, Math.max(0, lim.maxReviews + t.extraRev - t.rev - t.new));
  return { newLeft, revLeft };
}

/** de qual perfil pronto a predefinição está igual (ou "custom") */
export function profileOf(p: Preset): ProfileId | "custom" {
  // o perfil é definido pelos limites, pela ordem e (com o FSRS ligado) pela retenção
  const keys = ["newPerDay", "maxReviews", "reviewOrder", "mix", ...(p.fsrs ? ["retention"] : [])];
  const val = (k: string) => (k === "newPerDay" ? newPerDay(p) : (p as Record<string, unknown>)[k]);
  const hit = PROFILES.find((pr) => keys.every((k) => val(k) === (pr.set as Record<string, unknown>)[k]));
  return hit ? hit.id : "custom";
}

/** minutos por dia que o baralho deve tomar: ~40 s por card novo (com os passos) e ~9 s por revisão.
    As revisões vêm do que vence nos próximos dias, quando dá para saber; senão, do equilíbrio de longo prazo. */
export function minutesPerDay(p: Preset, opts: { reviewsAhead?: number; freshLeft?: number } = {}) {
  const nNew = Math.min(newPerDay(p), opts.freshLeft ?? Infinity);
  const factor = p.fsrs ? Math.log(p.retention) / Math.log(0.9) : 1;
  const steady = (newPerDay(p) * 6) / Math.max(0.4, factor);
  const reviews = Math.min(p.maxReviews, opts.reviewsAhead != null ? Math.max(opts.reviewsAhead, steady * 0.6) : steady);
  return Math.max(1, Math.round((nNew * 40 + reviews * 9) / 60));
}

/** "1m 10m 1h 1d" ⇄ [1, 10, 60, 1440] */
export function parseSteps(s: string): number[] | null {
  const parts = s.trim().split(/[\s,;]+/).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const m = p.match(/^(\d+(?:[.,]\d+)?)\s*(s|m|min|h|d)?$/i); if (!m) return null;
    const v = Number(m[1].replace(",", ".")), u = (m[2] || "m").toLowerCase();
    out.push(u === "s" ? v / 60 : u === "h" ? v * 60 : u === "d" ? v * 1440 : v);
  }
  return out;
}
export function stepsText(xs: number[]) {
  return xs.map((m) => (m >= 1440 && m % 1440 === 0 ? m / 1440 + "d" : m >= 60 && m % 60 === 0 ? m / 60 + "h" : m < 1 ? Math.round(m * 60) + "s" : +m.toFixed(2) + "m")).join(" ");
}
