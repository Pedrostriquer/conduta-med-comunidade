/* O banco de questões: carrega o índice uma vez (sem o corpo das questões), indexa por prova, área, especialidade e tema,
   baixa o corpo por prova quando a questão vai aparecer e decide o que entra por padrão (questões com vídeo, sem divergência e sem polêmica). */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { AreaId, Exam, FullQuestion, Question, QuestionBody } from "./types";

export type Topic = { key: string; area: AreaId; esp: string; ids: string[]; temas: { tema: string; ids: string[] }[] };

export type Bank = {
  exams: Exam[];
  examById: Record<string, Exam>;
  /** as válidas; as anuladas ficam só em `byId` e `annulled` */
  all: Question[];
  byId: Record<string, Question>;
  byExam: Record<string, Question[]>;
  annulled: Question[];
  annulledByExam: Record<string, Question[]>;
  /** especialidades por área, com os temas de cada uma */
  topics: Topic[];
  topicByKey: Record<string, Topic>;
};

let bank: Bank | null = null;
let error: string | null = null;
const subs = new Set<() => void>();

function index(exams: Exam[], raw: Question[]): Bank {
  const byId: Record<string, Question> = {}, byExam: Record<string, Question[]> = {}, annulledByExam: Record<string, Question[]> = {};
  const tmap = new Map<string, Topic>();
  const all: Question[] = [], annulled: Question[] = [];
  for (const q of raw) {
    byId[q.id] = q;
    if (q.an) { annulled.push(q); (annulledByExam[q.p] ||= []).push(q); continue; }
    all.push(q);
    (byExam[q.p] ||= []).push(q);
    const esp = q.esp || "Outros";
    const key = q.area + "/" + esp;
    let t = tmap.get(key);
    if (!t) { t = { key, area: q.area, esp, ids: [], temas: [] }; tmap.set(key, t); }
    t.ids.push(q.id);
    const tema = q.tema || esp;
    let tm = t.temas.find((x) => x.tema === tema);
    if (!tm) { tm = { tema, ids: [] }; t.temas.push(tm); }
    tm.ids.push(q.id);
  }
  for (const k in byExam) byExam[k].sort((a, b) => a.n - b.n);
  const topics = [...tmap.values()].sort((a, b) => b.ids.length - a.ids.length);
  topics.forEach((t) => t.temas.sort((a, b) => b.ids.length - a.ids.length));
  return { exams, examById: Object.fromEntries(exams.map((e) => [e.id, e])), all, byId, byExam, annulled, annulledByExam, topics, topicByKey: Object.fromEntries(topics.map((t) => [t.key, t])) };
}

const getJson = async (url: string, fresh = false) => {
  const r = await fetch(url, { credentials: "same-origin", cache: fresh ? "reload" : "default" });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

/* ---------- o índice: todas as questões sem o corpo (formato em scripts/dividir_banco.py) ---------- */
const AREA_IDS: AreaId[] = ["clinica", "cirurgia", "go", "pediatria", "preventiva"];
type Row = [id: string, n: number, area: number, esp: number, tema: number, g: string, marcas: number, as?: number, video?: number, s?: number, f?: number | null, canal?: number];
type IndexFile = { v: number; esp: string[]; tema: string[]; as: string[]; videos: string[]; canais: string[]; blocos: [string, Row[]][] };

function expand(f: IndexFile): Question[] {
  if (f.v !== 1) throw new Error("índice de outra versão");
  const out: Question[] = [];
  for (const [p, rows] of f.blocos) for (const r of rows) {
    const q: Question = { id: r[0], p, n: r[1], area: AREA_IDS[r[2]], esp: r[3] < 0 ? null : f.esp[r[3]], tema: r[4] < 0 ? null : f.tema[r[4]], g: r[5] };
    const m = r[6];
    if (m & 1) q.ok = 1;
    if (m & 2) q.an = 1;
    if (m & 4) q.img = 1;
    if (r[7] != null && r[7] >= 0) q.as = f.as[r[7]];
    if (r[8] != null) { q.v = { id: f.videos[r[8]], s: r[9]!, f: r[10] ?? null }; if (r[11] != null && r[11] >= 0) q.v.c = f.canais[r[11]]; }
    out.push(q);
  }
  return out;
}

let loading: Promise<Bank | null> | null = null;

/** baixa o índice do banco, uma vez só. Em produção /data/indice.json pede login: chame só com a pessoa conectada.
    O corpo das questões (enunciado, alternativas, explicação) vem depois, por prova: `ensureBodies`. */
export function loadBank() {
  if (bank) return Promise.resolve(bank);
  if (!loading) {
    error = null;
    subs.forEach((f) => f());
    loading = (async () => {
      try {
        const [exams, idx] = await Promise.all([getJson("/data/provas.json"), getJson("/data/indice.json")]);
        bank = index(exams, expand(idx));
      } catch {
        error = "Não foi possível carregar as questões. Confira a conexão e tente de novo.";
      }
      loading = null;
      subs.forEach((f) => f());
      return bank;
    })();
  }
  return loading;
}

/* ---------- o corpo das questões: um arquivo por prova, baixado quando a questão vai aparecer ---------- */
const bodies = new Map<string, QuestionBody>();
const examFiles = new Map<string, Promise<void>>();
const bodySubs = new Set<() => void>();
const stale = new Set<string>();
let bodyVersion = 0;

function loadExam(p: string, fresh = false) {
  let job = examFiles.get(p);
  if (!job) {
    job = getJson(`/data/q/${encodeURIComponent(p)}.json`, fresh).then((file: Record<string, QuestionBody>) => {
      for (const id in file) bodies.set(id, file[id]);
      bodyVersion++;
      bodySubs.forEach((f) => f());
    });
    // se falhar, a próxima chamada tenta de novo
    job.catch(() => { if (examFiles.get(p) === job) examFiles.delete(p); });
    examFiles.set(p, job);
  }
  return job;
}

/** garante o corpo destas questões: baixa só os arquivos de prova que faltam, cada um uma vez. Rejeita se algum não vier. */
export async function ensureBodies(wanted: Iterable<string>): Promise<void> {
  const b = bank, ids = [...wanted];
  if (!b) throw new Error("banco não carregado");
  const need = new Set<string>();
  for (const id of ids) { const q = b.byId[id]; if (q && !bodies.has(id)) need.add(q.p); }
  if (!need.size) return;
  await Promise.all([...need].map((p) => loadExam(p, stale.has(p))));
  // o arquivo veio, mas sem alguma questão do índice: é uma cópia antiga guardada pelo navegador. A próxima tentativa pede de novo ao servidor
  let missing = false;
  for (const id of ids) { const q = b.byId[id]; if (q && !bodies.has(id)) { missing = true; stale.add(q.p); examFiles.delete(q.p); } }
  if (missing) throw new Error("corpo incompleto");
}

/** a questão com o corpo, se ele já chegou */
export function fullQuestion(id: string | null | undefined): FullQuestion | null {
  if (!id || !bank) return null;
  const q = bank.byId[id], body = bodies.get(id);
  return q && body ? { ...q, ...body } : null;
}
/** o corpo de uma questão que já chegou (sem copiar) */
export const bodyOf = (id: string) => bodies.get(id) ?? null;

const subscribeBodies = (cb: () => void) => { bodySubs.add(cb); return () => { bodySubs.delete(cb); }; };

/** pede o corpo destas questões e diz quando chegou. `ready` só vira true com todos; `error` se a rede falhar (use `retry`). */
export function useBodies(ids: readonly string[] | null | undefined): { ready: boolean; error: boolean; retry: () => void } {
  useSyncExternalStore(subscribeBodies, () => bodyVersion, () => bodyVersion);
  const [fail, setFail] = useState<{ key: string; n: number } | null>(null);
  const [turn, setTurn] = useState(0);
  const key = ids ? ids.join("\n") : "";
  const ready = !ids || !bank || ids.every((id) => bodies.has(id) || !bank!.byId[id]);
  useEffect(() => {
    if (!ids || !ids.length || !bank) return;
    let on = true;
    ensureBodies(ids).then(() => { if (on) setFail(null); }, () => { if (on) setFail({ key, n: turn }); });
    return () => { on = false; };
  }, [key, turn]); // eslint-disable-line
  return { ready, error: !ready && fail?.key === key && fail.n === turn, retry: () => setTurn((t) => t + 1) };
}

/** uma questão com o corpo: null enquanto baixa */
export function useFullQuestion(id: string | null | undefined) {
  const ids = useMemo(() => (id ? [id] : []), [id]);
  const state = useBodies(ids);
  const q = useMemo(() => (state.ready ? fullQuestion(id) : null), [id, state.ready]); // eslint-disable-line
  return { q, ...state };
}

const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
export function useBank() {
  return useSyncExternalStore(subscribe, () => bank, () => bank);
}
export function useBankError() {
  return useSyncExternalStore(subscribe, () => error, () => error);
}
export const getBank = () => bank!;

/** questões disponíveis com as preferências: por padrão só as marcadas como ok */
export function pool(b: Bank, includeAll: boolean) {
  return includeAll ? b.all : b.all.filter((q) => q.ok);
}
