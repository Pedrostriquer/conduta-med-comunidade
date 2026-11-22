/* Leitura do que a pessoa tem guardado, no formato do app, e os ajudantes das respostas das ferramentas. */
import { q } from "../db";
import { applyChanges, getRecord, listRecords } from "../records";
import type { Change } from "../records";
import { computeStats, defaultGoals } from "./stats";
import type { Attempt, Goals } from "./stats";
import type { Plan } from "./plan";
import { dayKey } from "./dates";
import { ToolError } from "./define";

export type Confidence = "sabia" | "chutei" | "distracao" | "naosabia";
export type Review = { kind: Confidence; at: number; due: number };
export const CONFIDENCE_LABEL: Record<Confidence, string> = { sabia: "Sabia", chutei: "Chutei", distracao: "Foi distração", naosabia: "Não sabia" };

export type Settings = { nome: string; metaDiaria: number; feedbackLista: "imediato" | "final"; feedbackSimulado: "imediato" | "final"; video: "app" | "youtube"; incluirTodas: boolean; leitura: { scale: number; face: "serif" | "sans" }; cardsNovosPorDia: number };
export const DEFAULT_SETTINGS: Settings = { nome: "", metaDiaria: 30, feedbackLista: "imediato", feedbackSimulado: "final", video: "app", incluirTodas: false, leitura: { scale: 1, face: "serif" }, cardsNovosPorDia: 20 };

export const attemptsOf = async (uid: string) => (await listRecords<Attempt>(uid, "attempt")).map((r) => r.data).filter((a) => a && a.qid);
export const planOf = (uid: string) => getRecord<Plan>(uid, "plan", "main");
export const goalsOf = async (uid: string): Promise<Goals> => { const g = await getRecord<Partial<Goals>>(uid, "goals", "main"); const d = defaultGoals(); return { ...d, ...(g || {}), minimo: { ...d.minimo, ...(g?.minimo || {}) } }; };
export const settingsOf = async (uid: string): Promise<Settings> => { const s = await getRecord<Partial<Settings>>(uid, "settings", "main"); return { ...DEFAULT_SETTINGS, ...(s || {}), leitura: { ...DEFAULT_SETTINGS.leitura, ...(s?.leitura || {}) } }; };
export const reviewsOf = async (uid: string) => new Map((await listRecords<Review>(uid, "review")).map((r) => [r.id, r.data]));
export const tagsOf = async (uid: string) => new Map((await listRecords<{ tags: string[]; at: number }>(uid, "qtag")).map((r) => [r.id, r.data?.tags || []]));
export const savedOf = async (uid: string) => new Set((await listRecords(uid, "saved")).map((r) => r.id));

/** cards revisados por dia: o servidor já soma em user_days */
export async function cardsByDay(uid: string) {
  const rows = await q<{ day: string; cards: number }>("SELECT to_char(day, 'YYYY-MM-DD') AS day, cards FROM user_days WHERE user_id = $1 AND cards > 0", [uid]);
  return new Map(rows.map((r) => [r.day, r.cards]));
}

export const statsOf = async (uid: string) => computeStats(await attemptsOf(uid));

/** Grava o que a pessoa confirmou, com origem ia. A última escrita ganha pelo relógio de quem gravou: um aparelho com o
    relógio adiantado não pode fazer o "sim" dela se perder em silêncio, então o instante passa à frente do registro atual. */
export async function saveIa(uid: string, changes: Change[]) {
  const rows = await q<{ coll: string; id: string; client_at: number }>(
    "SELECT coll, id, client_at FROM user_records WHERE user_id = $1 AND (coll, id) IN (SELECT * FROM unnest($2::text[], $3::text[]))",
    [uid, changes.map((c) => c.c), changes.map((c) => c.id)],
  );
  const cur = new Map(rows.map((r) => [r.coll + "\0" + r.id, r.client_at]));
  return applyChanges(uid, changes.map((c) => ({ ...c, at: Math.max(c.at, (cur.get(c.c + "\0" + c.id) ?? 0) + 1) })), "ia");
}

export const pct = (v: number) => Math.round(v * 100);
export const secs = (ms: number) => Math.round(ms / 1000);
export const dateOf = (ms: number) => dayKey(ms);

/** período pedido: primeiro instante em ms, ou 0 para tudo */
export const PERIODS = ["7d", "30d", "90d", "tudo"] as const;
export function sinceOf(p: (typeof PERIODS)[number]) { return p === "tudo" ? 0 : Date.now() - Number(p.slice(0, -1)) * 86_400_000; }

export function needDate(s: string | undefined, label: string) {
  if (s === undefined) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + "T00:00:00Z"))) throw new ToolError(`${label} precisa estar no formato AAAA-MM-DD.`);
}
