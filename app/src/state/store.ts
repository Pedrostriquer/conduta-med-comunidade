/* Estado do estudante, guardado no navegador e espelhado no servidor por sync/engine.ts:
   preferências, sessões (listas e simulados), tentativas (cada resposta registrada), cronograma e marcações. */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DayKey } from "../lib/format";
import { uid } from "../lib/random";
import { quietly } from "./quiet";

export type Feedback = "imediato" | "final";

export type SessionAnswer = { choice: string | null; ms: number; at?: number; struck?: string[]; checked?: boolean };

export type SessionSource =
  | { type: "temas"; topics: string[]; temas?: string[] }
  | { type: "erros" }
  | { type: "fracos"; topics: string[] }
  | { type: "prova"; exam: string }
  | { type: "simulado"; exam: string; formato: "original" | "embaralhada" }
  | { type: "plano"; topics: string[] }
  | { type: "revisao" }
  | { type: "busca"; query: string }
  | { type: "salvas" }
  /** refazer as que errou numa sessão, até acertar todas */
  | { type: "refazer"; from: string }
  /** questões que voltaram pela autoavaliação (Sabia · Chutei · Não sabia) */
  | { type: "retorno" }
  /** lista montada pela IA da pessoa, pelo plugin */
  | { type: "ia"; nota?: string }
  /** lista recomendada por uma análise com IA */
  | { type: "analise"; id: string }
  /** questões de um assunto (ou de um bloco do resumo dele) */
  | { type: "assunto"; slug: string; bloco?: string }
  /** as 3 questões feitas antes de criar a conta */
  | { type: "amostra" };

export type Session = {
  id: string;
  kind: "lista" | "simulado";
  title: string;
  qids: string[];
  feedback: Feedback;
  createdAt: number;
  /** limite de tempo do simulado, em segundos (null: sem limite) */
  limitSec: number | null;
  answers: Record<string, SessionAnswer>;
  marked: Record<string, true>;
  cur: number;
  elapsedMs: number;
  status: "ativa" | "finalizada";
  finishedAt?: number;
  source: SessionSource;
  /** dia do cronograma a que esta sessão atende */
  planDay?: DayKey;
  /** correção feita depois do simulado */
  reviewed?: Record<string, true>;
  /** refazer: quantas vezes cada questão voltou para o fim da fila por erro */
  misses?: Record<string, number>;
  /** análise com IA feita a partir desta sessão */
  analise?: string;
};

export type Attempt = { qid: string; choice: string | null; correct: boolean; at: number; ms: number; sid: string; kind: "lista" | "simulado" };

/** anotação da pessoa numa questão (aparece depois de responder e na correção) */
export type Note = { text: string; at: number };

/** autoavaliação depois de responder: quando a questão volta (sabia 21 dias, chutei ou distração 7, não sabia 2) */
export type Confidence = "sabia" | "chutei" | "distracao" | "naosabia";
export const RETURN_DAYS: Record<Confidence, number> = { sabia: 21, chutei: 7, distracao: 7, naosabia: 2 };
export type Review = { kind: Confidence; at: number; due: number };

export type Plan = {
  banca: string;
  exame: string;
  data: DayKey;
  inicio: DayKey;
  /** dias da semana de estudo (0 = domingo) */
  dias: number[];
  meta: number;
  simulado: { freq: "semanal" | "quinzenal" | "nenhum"; dia: number };
  /** questões a mais (ou a menos) num dia, depois de redistribuir o que ficou para trás */
  ajustes: Record<DayKey, number>;
  /** o que ficou para trás até este dia já foi resolvido */
  resolvidoAte: DayKey | null;
  criadoEm: number;
};

export type Settings = {
  nome: string;
  metaDiaria: number;
  feedbackLista: Feedback;
  feedbackSimulado: Feedback;
  video: "app" | "youtube";
  incluirTodas: boolean;
  leitura: { scale: number; face: "serif" | "sans" };
  cardsNovosPorDia: number;
};

export const DEFAULT_SETTINGS: Settings = {
  nome: "",
  metaDiaria: 30,
  feedbackLista: "imediato",
  feedbackSimulado: "final",
  video: "app",
  incluirTodas: false,
  leitura: { scale: 1, face: "serif" },
  cardsNovosPorDia: 20,
};

type State = {
  settings: Settings;
  sessions: Record<string, Session>;
  attempts: Attempt[];
  plan: Plan | null;
  onboarded: boolean;
  demo: boolean;
  /** dias em que a celebração da meta já apareceu */
  celebrated: Record<DayKey, true>;
  /** questões salvas (id → quando salvou) */
  saved: Record<string, number>;
  /** anotações por questão */
  notes: Record<string, Note>;
  /** questões agendadas para voltar pela autoavaliação */
  reviews: Record<string, Review>;
  /** etiquetas da pessoa nas questões (inclusive as postas pela IA, como erro:diagnostico) */
  qtags: Record<string, { tags: string[]; at: number }>;

  setSettings: (p: Partial<Settings>) => void;
  startSession: (s: Omit<Session, "id" | "createdAt" | "answers" | "marked" | "cur" | "elapsedMs" | "status">) => string;
  setAnswer: (sid: string, qid: string, p: Partial<SessionAnswer>) => void;
  /** registra a resposta (correção na hora); null é a anulada, que não vira tentativa */
  commit: (sid: string, qid: string, correct: boolean | null) => void;
  toggleMark: (sid: string, qid: string) => void;
  setCur: (sid: string, i: number) => void;
  addTime: (sid: string, qid: string | null, ms: number) => void;
  finish: (sid: string, gabarito: (qid: string) => string) => void;
  /** encerra a lista com as que já foram respondidas */
  finishEarly: (sid: string) => void;
  markReviewed: (sid: string, qid: string) => void;
  removeSession: (sid: string) => void;
  setPlan: (p: Plan | null) => void;
  patchPlan: (p: Partial<Plan>) => void;
  celebrate: (d: DayKey) => void;
  finishOnboarding: () => void;
  toggleSaved: (qid: string) => boolean;
  /** texto vazio apaga a anotação */
  setNote: (qid: string, text: string) => void;
  /** tira a questão das salvas e apaga a anotação */
  forget: (qid: string) => void;
  /** autoavaliação: agenda a volta da questão (null desfaz) */
  rate: (qid: string, kind: Confidence | null) => void;
  setTags: (qid: string, tags: string[]) => void;
  /** refazer: a questão errada vai para o fim da fila e a resposta é limpa */
  requeue: (sid: string, qid: string) => void;
  load: (s: Partial<Pick<State, "sessions" | "attempts" | "plan" | "demo" | "settings" | "onboarded">>) => void;
  resetAll: () => void;
};

const initial = { settings: DEFAULT_SETTINGS, sessions: {}, attempts: [], plan: null, onboarded: false, demo: false, celebrated: {}, saved: {}, notes: {}, reviews: {}, qtags: {} };

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...initial,
      setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      startSession: (s) => {
        const id = uid();
        set((st) => ({ sessions: { ...st.sessions, [id]: { ...s, id, createdAt: Date.now(), answers: {}, marked: {}, cur: 0, elapsedMs: 0, status: "ativa" } } }));
        return id;
      },
      setAnswer: (sid, qid, p) => set((st) => {
        const s = st.sessions[sid]; if (!s) return st;
        const prev = s.answers[qid] || { choice: null, ms: 0 };
        return { sessions: { ...st.sessions, [sid]: { ...s, answers: { ...s.answers, [qid]: { ...prev, ...p } } } } };
      }),
      commit: (sid, qid, correct) => set((st) => {
        const s = st.sessions[sid]; if (!s) return st;
        const a = s.answers[qid] || { choice: null, ms: 0 };
        const at = Date.now();
        // a questão que voltou pela autoavaliação foi refeita: sai da fila de retorno
        let reviews = st.reviews;
        if (reviews[qid] && reviews[qid].due <= at) { reviews = { ...reviews }; delete reviews[qid]; }
        return {
          sessions: { ...st.sessions, [sid]: { ...s, answers: { ...s.answers, [qid]: { ...a, checked: true, at } } } },
          attempts: correct === null ? st.attempts : [...st.attempts, { qid, choice: a.choice, correct, at, ms: a.ms, sid, kind: s.kind }],
          reviews,
        };
      }),
      toggleMark: (sid, qid) => set((st) => {
        const s = st.sessions[sid]; if (!s) return st;
        const m = { ...s.marked }; if (m[qid]) delete m[qid]; else m[qid] = true;
        return { sessions: { ...st.sessions, [sid]: { ...s, marked: m } } };
      }),
      setCur: (sid, i) => set((st) => {
        const s = st.sessions[sid]; if (!s || s.cur === i) return st;
        return { sessions: { ...st.sessions, [sid]: { ...s, cur: i } } };
      }),
      addTime: (sid, qid, ms) => set((st) => {
        const s = st.sessions[sid]; if (!s || s.status !== "ativa" || ms <= 0) return st;
        const answers = qid ? { ...s.answers, [qid]: { ...(s.answers[qid] || { choice: null, ms: 0 }), ms: (s.answers[qid]?.ms || 0) + ms } } : s.answers;
        return { sessions: { ...st.sessions, [sid]: { ...s, elapsedMs: s.elapsedMs + ms, answers } } };
      }),
      finish: (sid, gabarito) => set((st) => {
        const s = st.sessions[sid]; if (!s || s.status === "finalizada") return st;
        const now = Date.now();
        // na correção ao final, as respostas viram tentativas agora (em branco conta como erro)
        const fresh: Attempt[] = s.feedback === "final"
          ? s.qids.filter((qid) => gabarito(qid)).map((qid) => { const a = s.answers[qid]; return { qid, choice: a?.choice ?? null, correct: !!a?.choice && a.choice === gabarito(qid), at: a?.at ?? now, ms: a?.ms ?? 0, sid, kind: s.kind }; })
          : [];
        return { sessions: { ...st.sessions, [sid]: { ...s, status: "finalizada", finishedAt: now } }, attempts: [...st.attempts, ...fresh] };
      }),
      finishEarly: (sid) => set((st) => {
        const s = st.sessions[sid]; if (!s) return st;
        const qids = s.qids.filter((q) => s.answers[q]?.checked);
        return { sessions: { ...st.sessions, [sid]: { ...s, qids, cur: Math.max(0, qids.length - 1), status: "finalizada", finishedAt: Date.now() } } };
      }),
      markReviewed: (sid, qid) => set((st) => {
        const s = st.sessions[sid]; if (!s || s.reviewed?.[qid]) return st;
        return { sessions: { ...st.sessions, [sid]: { ...s, reviewed: { ...(s.reviewed || {}), [qid]: true } } } };
      }),
      removeSession: (sid) => set((st) => { const x = { ...st.sessions }; delete x[sid]; return { sessions: x }; }),
      setPlan: (p) => set({ plan: p }),
      patchPlan: (p) => set((st) => (st.plan ? { plan: { ...st.plan, ...p } } : st)),
      celebrate: (d) => set((st) => ({ celebrated: { ...st.celebrated, [d]: true } })),
      finishOnboarding: () => set({ onboarded: true }),
      toggleSaved: (qid) => {
        const on = !get().saved[qid];
        set((st) => { const x = { ...st.saved }; if (on) x[qid] = Date.now(); else delete x[qid]; return { saved: x }; });
        return on;
      },
      setNote: (qid, text) => set((st) => {
        const x = { ...st.notes }, t = text.trim();
        if (t) x[qid] = { text: t, at: Date.now() }; else delete x[qid];
        return { notes: x };
      }),
      forget: (qid) => set((st) => { const a = { ...st.saved }, b = { ...st.notes }; delete a[qid]; delete b[qid]; return { saved: a, notes: b }; }),
      rate: (qid, kind) => set((st) => {
        const x = { ...st.reviews };
        if (kind) { const at = Date.now(); x[qid] = { kind, at, due: at + RETURN_DAYS[kind] * 86400000 }; } else delete x[qid];
        return { reviews: x };
      }),
      setTags: (qid, tags) => set((st) => {
        const x = { ...st.qtags };
        if (tags.length) x[qid] = { tags, at: Date.now() }; else delete x[qid];
        return { qtags: x };
      }),
      requeue: (sid, qid) => set((st) => {
        const s = st.sessions[sid]; if (!s) return st;
        const qids = s.qids.filter((x) => x !== qid).concat(qid);
        const prev = s.answers[qid] || { choice: null, ms: 0 };
        return { sessions: { ...st.sessions, [sid]: { ...s, qids, answers: { ...s.answers, [qid]: { choice: null, ms: prev.ms } }, misses: { ...(s.misses || {}), [qid]: (s.misses?.[qid] || 0) + 1 } } } };
      }),
      load: (s) => set(s as Partial<State>),
      resetAll: () => set({ ...initial, onboarded: false }),
    }),
    {
      name: "conduta",
      version: 2,
      partialize: (s) => ({ settings: s.settings, sessions: s.sessions, attempts: s.attempts, plan: s.plan, onboarded: s.onboarded, demo: s.demo, celebrated: s.celebrated, saved: s.saved, notes: s.notes, reviews: s.reviews, qtags: s.qtags }),
      // v2: simulado volta a corrigir ao final e listas do banco na hora (o padrão pedido)
      migrate: (p, v) => {
        const x = (p || {}) as Partial<State>;
        if (v < 2 && x.settings) x.settings = { ...x.settings, feedbackSimulado: "final", feedbackLista: "imediato" };
        return x as State;
      },
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<State>;
        return { ...current, ...p, reviews: p.reviews || {}, qtags: p.qtags || {}, settings: { ...DEFAULT_SETTINGS, ...(p.settings || {}), leitura: { ...DEFAULT_SETTINGS.leitura, ...(p.settings?.leitura || {}) } } };
      },
    },
  ),
);

export const get = () => useStore.getState();

// outra aba do app gravou: recarrega daqui para uma não apagar o que a outra salvou
if (typeof window !== "undefined") addEventListener("storage", (e: StorageEvent) => { if (e.key === "conduta") quietly(() => useStore.persist.rehydrate()); });
