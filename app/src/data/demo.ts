/* Dados de exemplo: dez semanas de estudo de um estudante fictício, para ver as telas preenchidas.
   Usam questões reais do banco; o acerto melhora com o tempo e varia por área. Dá para apagar em Ajustes. */
import type { Bank } from "./bank";
import { pool } from "./bank";
import { addDays, fromKey, today } from "../lib/format";
import { rng, shuffle, uid } from "../lib/random";
import type { Attempt, Plan, Session } from "../state/store";
import { DEFAULT_SETTINGS } from "../state/store";
import { shuffledExam, estimatedShares } from "./select";
import { computeStats } from "../state/stats";

/** letras das alternativas pelo número de alternativas da prova: os dados de exemplo não baixam o corpo das questões */
const letters = (b: Bank, q: { p: string }) => "ABCDE".slice(0, b.examById[q.p]?.alternativas || 4).split("");

const SKILL: Record<string, number> = { clinica: 0.66, cirurgia: 0.62, go: 0.64, pediatria: 0.72, preventiva: 0.55 };

export function makeDemo(b: Bank) {
  const r = rng(20261027);
  // o estudante de exemplo passou por 60% do banco (o resto ainda está por fazer); as demais respostas são repetições
  const all = shuffle(pool(b, false), r), qs = all.slice(0, Math.round(all.length * 0.6));
  const attempts: Attempt[] = [];
  const sessions: Record<string, Session> = {};
  let qi = 0;
  const t = today();
  const start = addDays(t, -72);
  const at = (k: string, minute: number) => { const d = fromKey(k); d.setHours(19, 0, 0, 0); return d.getTime() + minute * 60000; };
  for (let i = 0; i < 72; i++) {
    const k = addDays(start, i), wd = fromKey(k).getDay();
    const progress = i / 72;
    // folga em parte dos domingos e alguns dias soltos; ontem ficou pela metade
    if (wd === 0 && r() < 0.7) continue;
    if (r() < 0.07) continue;
    let n = Math.round(28 + r() * 26 + progress * 8);
    if (k === addDays(t, -1)) n = 17;
    if (wd === 6) n = Math.round(n * 0.6);
    const sid = "demo-" + k;
    const ids: string[] = [];
    for (let j = 0; j < n; j++) {
      const q = qs[qi++ % qs.length];
      const p = SKILL[q.area] + progress * 0.1 + (r() - 0.5) * 0.08;
      const ok = r() < p;
      const wrongs = letters(b, q).filter((l) => l !== q.g);
      const choice = ok ? q.g : wrongs[Math.floor(r() * wrongs.length)];
      const ms = Math.round((95 + r() * 110) * 1000);
      attempts.push({ qid: q.id, choice, correct: ok, at: at(k, j * 3), ms, sid, kind: "lista" });
      ids.push(q.id);
    }
    sessions[sid] = {
      id: sid, kind: "lista", title: "Questões do dia", qids: ids, feedback: "imediato", createdAt: at(k, 0), limitSec: null,
      answers: {}, marked: {}, cur: ids.length - 1, elapsedMs: ids.length * 150000, status: "finalizada", finishedAt: at(k, n * 3), source: { type: "plano", topics: [] },
    };
  }
  // três simulados já feitos
  const stats = computeStats(attempts, b);
  const sims: [string, "original" | "embaralhada", number][] = [["ENARE-2024", "original", -40], ["SUSSP-2025", "original", -19], ["SUSSP-2024", "embaralhada", -5]];
  for (const [exId, formato, offset] of sims) {
    const ex = b.examById[exId]; if (!ex) continue;
    const ids = formato === "original" ? (b.byExam[exId] || []).filter((q) => q.ok).map((q) => q.id) : shuffledExam(b, ex, { includeAll: false, st: stats, sameBanca: false, shares: estimatedShares(b, ex.banca), seed: 7 });
    const k = addDays(t, offset), sid = uid();
    const answers: Session["answers"] = {};
    ids.forEach((qid, j) => {
      const q = b.byId[qid];
      const ok = r() < SKILL[q.area] + 0.04;
      const wrongs = letters(b, q).filter((l) => l !== q.g);
      const choice = j > ids.length - 3 && r() < 0.5 ? null : ok ? q.g : wrongs[Math.floor(r() * wrongs.length)];
      const ms = Math.round((120 + r() * 90) * 1000);
      answers[qid] = { choice, ms, at: at(k, -240 + j * 2.4) };
      attempts.push({ qid, choice, correct: choice === q.g, at: at(k, -240 + j * 2.4), ms, sid, kind: "simulado" });
    });
    sessions[sid] = {
      id: sid, kind: "simulado", title: ex.nome, qids: ids, feedback: "final", createdAt: at(k, -240), limitSec: Math.round((300 * ids.length) / ex.total) * 60,
      answers, marked: {}, cur: ids.length - 1, elapsedMs: Object.values(answers).reduce((s, a) => s + a.ms, 0), status: "finalizada", finishedAt: at(k, -10),
      source: { type: "simulado", exam: exId, formato }, planDay: k,
    };
  }
  attempts.sort((a, c) => a.at - c.at);
  const plan: Plan = {
    banca: "SUS-SP", exame: "SUS-SP 2027", data: nextSunday(addDays(t, 46)), inicio: addDays(t, -48),
    dias: [1, 2, 3, 4, 5, 6], meta: 40, simulado: { freq: "semanal", dia: 6 }, ajustes: {}, resolvidoAte: addDays(t, -2), criadoEm: fromKey(addDays(t, -48)).getTime(),
  };
  return { attempts, sessions, plan, settings: { ...DEFAULT_SETTINGS, nome: "Marina", metaDiaria: 40 }, demo: true, onboarded: true };
}

function nextSunday(k: string) {
  let d = k;
  while (fromKey(d).getDay() !== 0) d = addDays(d, 1);
  return d;
}
