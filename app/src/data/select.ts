/* Montar listas e simulados a partir do banco. */
import type { Bank } from "./bank";
import { pool } from "./bank";
import type { AreaId, Exam, Question } from "./types";
import { AREAS } from "./types";
import type { Stats } from "../state/stats";
import { rng, shuffle } from "../lib/random";

export type ListFilter = "novas" | "todas" | "erradas";

export type ListQuery = {
  topics?: string[];      // chaves area/especialidade
  temas?: string[];       // chaves area/especialidade/tema (refinam)
  /** áreas inteiras marcadas na árvore (somam com especialidades e temas) */
  areasPick?: string[];
  areas?: string[];       // filtro rígido por área
  anos?: number[];
  exams?: string[];       // várias provas (Mais filtros)
  withImage?: boolean;
  exam?: string;
  bancas?: string[];
  only?: string[];        // ids fixos (erros, revisão)
  filter: ListFilter;
};

export function matchQuery(b: Bank, includeAll: boolean, q: ListQuery, st: Stats): Question[] {
  let xs = pool(b, includeAll);
  if (q.only) { const set = new Set(q.only); xs = xs.filter((x) => set.has(x.id)); }
  if (q.exam) xs = xs.filter((x) => x.p === q.exam);
  if (q.exams?.length) { const set = new Set(q.exams); xs = xs.filter((x) => set.has(x.p)); }
  if (q.bancas?.length) { const set = new Set(q.bancas); xs = xs.filter((x) => set.has(b.examById[x.p]?.banca)); }
  if (q.anos?.length) { const set = new Set(q.anos); xs = xs.filter((x) => set.has(b.examById[x.p]?.ano)); }
  if (q.withImage) xs = xs.filter((x) => x.img);
  if (q.areas?.length) { const set = new Set(q.areas); xs = xs.filter((x) => set.has(x.area)); }
  if (q.topics?.length || q.temas?.length || q.areasPick?.length) {
    const ap = new Set(q.areasPick || []), tp = new Set(q.topics || []), tm = new Set(q.temas || []);
    xs = xs.filter((x) => { const k = x.area + "/" + (x.esp || "Outros"); return ap.has(x.area) || tp.has(k) || tm.has(k + "/" + (x.tema || x.esp)); });
  }
  if (q.filter === "novas") xs = xs.filter((x) => !st.answered.has(x.id));
  if (q.filter === "erradas") { const w = new Set(st.wrong); xs = xs.filter((x) => w.has(x.id)); }
  return xs;
}

/** Sorteia n questões, alternando as especialidades para a lista não virar um bloco só de um tema. */
export function pick(xs: Question[], n: number, seed = Date.now()) {
  const r = rng(seed);
  const groups = new Map<string, Question[]>();
  for (const q of shuffle(xs, r)) { const k = q.area + "/" + q.esp; (groups.get(k) || groups.set(k, []).get(k)!).push(q); }
  const lanes = shuffle([...groups.values()], r), out: Question[] = [];
  while (out.length < n && lanes.some((l) => l.length)) for (const l of lanes) { if (l.length && out.length < n) out.push(l.shift()!); }
  return out.map((q) => q.id);
}

/** participação de cada área na prova, em % */
export type Shares = Record<AreaId, number>;

/** arredonda mantendo a soma: quem perdeu mais no arredondamento ganha a sobra */
export function roundShares(s: Record<string, number>, total: number): Shares {
  const sum = AREAS.reduce((x, a) => x + (s[a.id] || 0), 0) || 1;
  const raw = AREAS.map((a) => ({ id: a.id, v: ((s[a.id] || 0) / sum) * total }));
  const out = Object.fromEntries(raw.map((x) => [x.id, Math.floor(x.v)])) as Shares;
  let left = total - raw.reduce((x, y) => x + Math.floor(y.v), 0);
  for (const x of [...raw].sort((a, c) => (c.v % 1) - (a.v % 1))) { if (left-- <= 0) break; out[x.id]++; }
  return out;
}

/** A estimativa da plataforma: a média da participação das áreas nas provas da banca, com mais peso nas três mais recentes. */
export function estimatedShares(b: Bank, banca: string): Shares {
  const exams = b.exams.filter((e) => e.banca === banca).sort((a, c) => c.ano - a.ano);
  const sum: Record<string, number> = {};
  exams.forEach((e, i) => {
    const qs = [...(b.byExam[e.id] || []), ...(b.annulledByExam[e.id] || [])];
    for (const q of qs) sum[q.area] = (sum[q.area] || 0) + (i < 3 ? 2 : 1) / qs.length;
  });
  return roundShares(sum, 100);
}

export type ShuffleOpts = { includeAll: boolean; st: Stats; sameBanca: boolean; shares: Shares; annulled?: boolean; seed?: number };

/** Simulado do tamanho da prova, com questões de outros anos (e de outras bancas, se quiser). Não é sorteio solto: cada área
    recebe a parte que tem na proporção, e dentro da área os temas seguem os da própria prova. */
export function shuffledExam(b: Bank, exam: Exam, { includeAll, st, sameBanca, shares, annulled, seed = Date.now() }: ShuffleOpts) {
  const r = rng(seed);
  const base = b.byExam[exam.id] || [];
  const cand = pool(b, includeAll).filter((q) => q.p !== exam.id && (!sameBanca || b.examById[q.p]?.banca === exam.banca));
  const by = (f: (q: Question) => string) => { const m = new Map<string, Question[]>(); for (const q of shuffle(cand, r)) { const k = f(q); (m.get(k) || m.set(k, []).get(k)!).push(q); } return m; };
  const byTema = by((q) => q.area + "/" + q.esp + "/" + q.tema), byEsp = by((q) => q.area + "/" + q.esp), byArea = by((q) => q.area);
  const used = new Set<string>(), out: string[] = [];
  const take = (m: Map<string, Question[]>, k: string) => {
    const l = m.get(k); if (!l) return null;
    // primeiro as que a pessoa ainda não fez
    l.sort((a, c) => Number(st.answered.has(a.id)) - Number(st.answered.has(c.id)));
    const i = l.findIndex((q) => !used.has(q.id));
    if (i < 0) return null;
    const [q] = l.splice(i, 1); used.add(q.id); return q.id;
  };
  const want = roundShares(shares, exam.total);
  for (const a of AREAS) {
    const models = shuffle(base.filter((q) => q.area === a.id), r);
    for (let i = 0; i < want[a.id]; i++) {
      const m = models.length ? models[i % models.length] : null;
      const id = (m && (take(byTema, m.area + "/" + m.esp + "/" + m.tema) || take(byEsp, m.area + "/" + m.esp))) || take(byArea, a.id);
      if (id) out.push(id);
    }
  }
  // só com a banca escolhida pode faltar questão numa área: completa pelas áreas de maior peso
  const heavy = [...AREAS].sort((x, y) => shares[y.id] - shares[x.id]);
  for (let i = 0; out.length < exam.total && i < exam.total * AREAS.length; i++) { const id = take(byArea, heavy[i % heavy.length].id); if (id) out.push(id); }
  if (annulled) {
    // na mesma frequência em que a banca anula: troca algumas por anuladas da mesma área
    const own = b.exams.filter((e) => e.banca === exam.banca).reduce((n, e) => [n[0] + (b.annulledByExam[e.id]?.length || 0), n[1] + e.total], [0, 0]);
    const n = Math.round(exam.total * (own[1] ? own[0] / own[1] : 0));
    const spare = shuffle(b.annulled.filter((q) => q.p !== exam.id && (!sameBanca || b.examById[q.p]?.banca === exam.banca)), r);
    const spots = shuffle(out.map((_, i) => i), r);
    for (let i = 0, s = 0; i < spots.length && s < n; i++) {
      const j = spare.findIndex((q) => q.area === b.byId[out[spots[i]]].area);
      if (j < 0) continue;
      out[spots[i]] = spare.splice(j, 1)[0].id; s++;
    }
  }
  return shuffle(out, r);
}

/** Tempo da prova proporcional ao número de questões, em blocos de 5 minutos */
export function defaultMinutes(exam: Exam, n: number) {
  return Math.max(10, Math.round((exam.duracao_min * n) / exam.total / 5) * 5);
}
