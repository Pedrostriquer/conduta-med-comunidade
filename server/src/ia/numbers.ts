/* A conta que não precisa de IA: quanto cada área pesa na prova, quanto a pessoa está perdendo em cada uma e quais questões
   fazer em seguida. Peso × (1 − acerto) é o que decide: Clínica vale 10% e foi mal perde menos pontos que Cirurgia, que vale
   35% e foi médio. A IA só comenta esses números; não recalcula. */
import { AREAS, bank } from "../bank";
import type { AreaId, Question } from "../bank";
import type { Attempt } from "../mcp/stats";

export type Shares = Record<AreaId, number>;
export const AREA_IDS = Object.keys(AREAS) as AreaId[];

function roundShares(s: Record<string, number>, total: number): Shares {
  const sum = AREA_IDS.reduce((x, a) => x + (s[a] || 0), 0) || 1;
  const raw = AREA_IDS.map((id) => ({ id, v: ((s[id] || 0) / sum) * total }));
  const out = Object.fromEntries(raw.map((x) => [x.id, Math.floor(x.v)])) as Shares;
  let left = total - raw.reduce((x, y) => x + Math.floor(y.v), 0);
  for (const x of [...raw].sort((a, c) => (c.v % 1) - (a.v % 1))) { if (left-- <= 0) break; out[x.id]++; }
  return out;
}

/** mesma conta de app/src/data/select.ts */
export function estimatedShares(banca: string | null): Shares {
  const b = bank();
  const exams = b.exams.filter((e) => !banca || e.banca === banca).sort((a, c) => c.ano - a.ano);
  const byExam = new Map<string, Question[]>();
  for (const q of [...b.all, ...b.annulled]) { const l = byExam.get(q.p); if (l) l.push(q); else byExam.set(q.p, [q]); }
  const sum: Record<string, number> = {};
  exams.forEach((e, i) => { const qs = byExam.get(e.id) || []; for (const q of qs) sum[q.area] = (sum[q.area] || 0) + (i < 3 ? 2 : 1) / qs.length; });
  return roundShares(sum, 100);
}

export type Tally = { n: number; ok: number };
export type History = { wrong: number; right: number; lastAt: number; lastOk: boolean };

/** o histórico de cada questão, sem contar a sessão em análise */
export function historyOf(attempts: Attempt[], exceptSession?: string) {
  const m = new Map<string, History>();
  for (const a of attempts) {
    if (a.choice === null || a.sid === exceptSession) continue;
    const h = m.get(a.qid) || { wrong: 0, right: 0, lastAt: 0, lastOk: false };
    if (a.correct) h.right++; else h.wrong++;
    if (a.at >= h.lastAt) { h.lastAt = a.at; h.lastOk = a.correct; }
    m.set(a.qid, h);
  }
  return m;
}

const espKey = (q: Question) => q.area + "/" + (q.esp || "Outros");

export type AreaPriority = { area: AreaId; nome: string; peso: number; n: number; ok: number; acerto: number | null; histN: number; histOk: number; histAcerto: number | null; estimado: number; perda: number };
export type EspPriority = { chave: string; nome: string; area: AreaId; n: number; ok: number; histN: number; histOk: number; acerto: number; perda: number };

/** nesta sessão vale mais; o histórico entra com metade do peso; com pouca resposta, puxa para 60%, para não exagerar */
const blend = (t: Tally, h: Tally) => (t.ok + h.ok * 0.5 + 0.6 * 4) / (t.n + h.n * 0.5 + 4);

export function priorities(rows: { q: Question; ok: boolean }[], attempts: Attempt[], shares: Shares, exceptSession?: string) {
  const b = bank();
  const area = new Map<string, Tally>(), hist = new Map<string, Tally>(), esp = new Map<string, Tally>(), espHist = new Map<string, Tally>();
  const bump = (m: Map<string, Tally>, k: string, ok: boolean) => { const x = m.get(k) || { n: 0, ok: 0 }; x.n++; if (ok) x.ok++; m.set(k, x); };
  for (const r of rows) { bump(area, r.q.area, r.ok); bump(esp, espKey(r.q), r.ok); }
  for (const a of attempts) {
    if (a.choice === null || a.sid === exceptSession) continue;
    const q = b.byId.get(a.qid); if (!q || q.an) continue;
    bump(hist, q.area, a.correct); bump(espHist, espKey(q), a.correct);
  }
  const areas: AreaPriority[] = AREA_IDS.map((id) => {
    const t = area.get(id) || { n: 0, ok: 0 }, h = hist.get(id) || { n: 0, ok: 0 }, est = blend(t, h);
    return { area: id, nome: AREAS[id], peso: shares[id], n: t.n, ok: t.ok, acerto: t.n ? t.ok / t.n : null, histN: h.n, histOk: h.ok, histAcerto: h.n ? h.ok / h.n : null, estimado: est, perda: shares[id] * (1 - est) };
  }).sort((x, y) => y.perda - x.perda);
  // o peso de cada especialidade dentro da área vem de quanto ela cai no banco
  const inArea = new Map<string, number>(), inEsp = new Map<string, number>();
  for (const q of b.all) { inArea.set(q.area, (inArea.get(q.area) || 0) + 1); inEsp.set(espKey(q), (inEsp.get(espKey(q)) || 0) + 1); }
  const especialidades: EspPriority[] = [...new Set([...esp.keys(), ...espHist.keys()])].map((k) => {
    const t = esp.get(k) || { n: 0, ok: 0 }, h = espHist.get(k) || { n: 0, ok: 0 }, id = k.split("/")[0] as AreaId, est = blend(t, h);
    return { chave: k, nome: k.split("/")[1], area: id, n: t.n, ok: t.ok, histN: h.n, histOk: h.ok, acerto: est, perda: shares[id] * ((inEsp.get(k) || 0) / (inArea.get(id) || 1)) * (1 - est) };
  }).sort((x, y) => y.perda - x.perda);
  return { areas, especialidades };
}

export type Recommended = { id: string; why: string };

/** As próximas questões: as áreas que mais perdem pontos ganham mais vagas. Quem errou mais de uma vez vem primeiro,
    depois as inéditas de temas fracos; quem acertou duas vezes sai. */
export function recommend(areas: AreaPriority[], especialidades: EspPriority[], attempts: Attempt[], opts: { n: number; banca: string | null; includeAll: boolean; seed?: number }) {
  const b = bank(), hist = historyOf(attempts), now = Date.now();
  let s = opts.seed ?? 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const espWeak = new Map(especialidades.map((e) => [e.chave, 1 - e.acerto]));
  const total = areas.reduce((x, a) => x + a.perda, 0) || 1;
  const slots = areas.map((a) => ({ ...a, slots: Math.round((a.perda / total) * opts.n) }));
  let over = slots.reduce((x, a) => x + a.slots, 0) - opts.n;
  for (let i = slots.length - 1; over > 0 && i >= 0; i--) { const d = Math.min(over, slots[i].slots); slots[i].slots -= d; over -= d; }
  for (let i = 0; over < 0; i = (i + 1) % slots.length) { slots[i].slots++; over++; }
  const out: Recommended[] = [], perArea: { area: AreaId; nome: string; n: number }[] = [];
  for (const a of slots) {
    if (!a.slots) continue;
    const scored: { q: Question; score: number; why: string }[] = [];
    for (const q of b.all) {
      if (q.area !== a.area || (!opts.includeAll && !q.ok)) continue;
      const h = hist.get(q.id);
      let base = 1, why = "inédita em tema a reforçar";
      if (h) {
        if (h.lastOk && h.right >= 2) continue;
        if (h.lastOk) { base = 0.3; why = "acertou uma vez; vale confirmar"; }
        else {
          base = 1.5 + 0.7 * (h.wrong - 1);
          why = h.wrong > 1 ? `errou ${h.wrong} vezes` : "errou da última vez";
          if (now - h.lastAt < 2 * 86_400_000) base *= 0.3; // errou ontem: ainda está fresco
        }
      }
      const weak = espWeak.get(espKey(q)) ?? 0.4;
      const banca = opts.banca && b.examById.get(q.p)?.banca === opts.banca ? 1.2 : 1;
      scored.push({ q, score: base * (0.6 + weak) * banca * (0.85 + rnd() * 0.3), why });
    }
    scored.sort((x, y) => y.score - x.score);
    // não deixa uma especialidade só tomar a área inteira
    const cap = Math.max(2, Math.ceil(a.slots * 0.4)), inEsp = new Map<string, number>();
    let taken = 0;
    for (const c of scored) {
      if (taken >= a.slots) break;
      const k = espKey(c.q), n = inEsp.get(k) || 0;
      if (n >= cap) continue;
      inEsp.set(k, n + 1); out.push({ id: c.q.id, why: c.why }); taken++; c.why = "";
    }
    // área com poucas especialidades: completa sem o teto
    for (const c of scored) { if (taken >= a.slots) break; if (c.why) { out.push({ id: c.q.id, why: c.why }); taken++; } }
    if (taken) perArea.push({ area: a.area, nome: a.nome, n: taken });
  }
  return { ids: out, perArea };
}
