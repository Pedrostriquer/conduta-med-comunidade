/* Baralhos importados e o agendamento das revisões (o SM-2 do Anki, com os passos, intervalos e facilidades
   da predefinição de cada baralho; com o FSRS ligado, a retenção desejada encurta ou alonga os intervalos). */
import { useEffect } from "react";
import { create } from "zustand";
import { allDecks, counts, unburyOld } from "./db";
import type { CardRec, DeckRec, Rate } from "./db";
import { presetFor, remaining } from "./config";
import type { Preset } from "./config";

export type { Rate } from "./db";
const MIN = 60000, DAY = 86400000;

export const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };

const capIvl = (p: Preset, d: number) => Math.max(1, Math.min(p.maxIvl, Math.round(d)));
/** no FSRS a retenção desejada vira um fator sobre o intervalo (90% = 1; 95% ≈ metade; 80% ≈ o dobro) */
const retentionFactor = (p: Preset) => (p.fsrs ? Math.log(p.retention) / Math.log(0.9) : 1);

/** o que acontece com o card em cada botão: novo agendamento */
export function schedule(c: CardRec, r: Rate, now = Date.now(), p: Preset = presetFor(c.deck)): CardRec {
  const n: CardRec = { ...c, reps: c.reps + 1 };
  const learning = c.isNew === 1 || c.step > 0;
  if (learning) {
    const steps = (c.relearn ? p.relearnSteps : p.learnSteps).filter((x) => x > 0);
    const cur = c.isNew ? 1 : c.step;
    const graduate = (days: number) => { n.step = 0; delete n.relearn; n.ivl = c.relearn ? Math.max(p.minIvl, c.ivl) : days; n.due = now + n.ivl * DAY; };
    n.isNew = 0;
    if (c.isNew === 1) { n.introduced = now; n.ease = p.startEase; }
    if (!steps.length) { if (r === "again") { n.step = 0; n.due = now + MIN; } else graduate(r === "easy" ? p.easyIvl : p.graduatingIvl); }
    else if (r === "again") { n.step = 1; n.due = now + steps[0] * MIN; }
    else if (r === "hard") { n.step = cur; n.due = now + (cur === 1 ? (steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[0] * 1.5) : steps[cur - 1]) * MIN; }
    else if (r === "good") { if (cur + 1 > steps.length) graduate(p.graduatingIvl); else { n.step = cur + 1; n.due = now + steps[cur] * MIN; } }
    else graduate(c.relearn ? Math.max(p.minIvl, c.ivl) + 1 : p.easyIvl);
    return n;
  }
  const f = p.ivlModifier * retentionFactor(p);
  if (r === "again") {
    n.lapses++; n.ease = Math.max(1.3, c.ease - 0.2);
    n.ivl = Math.max(p.minIvl, Math.round(c.ivl * p.lapseIvl));
    if (p.relearnSteps.length) { n.step = 1; n.relearn = 1; n.due = now + p.relearnSteps[0] * MIN; } else n.due = now + n.ivl * DAY;
    // sanguessuga: no limiar e a cada metade dele depois
    const half = Math.max(1, Math.ceil(p.leechThreshold / 2));
    if (n.lapses >= p.leechThreshold && (n.lapses - p.leechThreshold) % half === 0) {
      n.tags = [...new Set([...(c.tags || []), "sanguessuga"])];
      if (p.leechAction === "suspender") n.suspended = 1;
    }
  } else if (r === "hard") { n.ease = Math.max(1.3, c.ease - 0.15); n.ivl = capIvl(p, Math.max(c.ivl + 1, c.ivl * p.hardMult * f)); n.due = now + n.ivl * DAY; }
  else if (r === "good") { n.ivl = capIvl(p, Math.max(c.ivl + 1, c.ivl * c.ease * f)); n.due = now + n.ivl * DAY; }
  else { n.ease = c.ease + 0.15; n.ivl = capIvl(p, Math.max(c.ivl + 2, c.ivl * c.ease * p.easyBonus * f)); n.due = now + n.ivl * DAY; }
  return n;
}

export function ivlText(ms: number) {
  if (ms < 60 * MIN) return Math.max(1, Math.round(ms / MIN)) + " min";
  if (ms < DAY) return Math.round(ms / (60 * MIN)) + " h";
  return daysText(Math.round(ms / DAY));
}
export function daysText(d: number) {
  return d < 31 ? d + (d === 1 ? " dia" : " dias") : d < 365 ? Math.round(d / 30) + (Math.round(d / 30) === 1 ? " mês" : " meses") : (d / 365).toFixed(1).replace(".", ",") + " anos";
}
export function intervalLabel(c: CardRec, r: Rate) {
  return ivlText(schedule(c, r, 0).due);
}

/* ---------- lista de baralhos com as contagens de hoje ---------- */
export type DeckInfo = DeckRec & { fresh: number; learn: number; rev: number; due: number };
type DeckState = { decks: DeckInfo[]; loaded: boolean; refresh: () => Promise<void> };

export async function deckToday(d: DeckRec): Promise<DeckInfo> {
  await unburyOld(d.id);
  const c = await counts(d.id, endOfToday()), left = remaining(d.id);
  const fresh = Math.min(c.fresh, left.newLeft), rev = Math.min(c.rev, left.revLeft);
  return { ...d, fresh, learn: c.learn, rev, due: fresh + c.learn + rev };
}

export const useDeckStore = create<DeckState>()((set) => ({
  decks: [], loaded: false,
  refresh: async () => {
    if (typeof indexedDB === "undefined") { set({ loaded: true }); return; }
    try {
      const ds = await allDecks();
      const out = await Promise.all(ds.map(deckToday));
      set({ decks: out.sort((a, b) => b.importedAt - a.importedAt), loaded: true });
    } catch { set({ loaded: true }); }
  },
}));

let started = false;
export function useDecks() {
  const decks = useDeckStore((s) => s.decks), loaded = useDeckStore((s) => s.loaded);
  useEffect(() => { if (!started) { started = true; useDeckStore.getState().refresh(); } }, []);
  return { decks, loaded, due: decks.reduce((s, d) => s + d.due, 0) };
}

/* ---------- árvore de sub-baralhos ---------- */
export type Node = { name: string; key: string; depth: number; total: number; fresh: number; learn: number; rev: number; children: Node[] };
export const SEP = " › ";

/** monta a árvore de sub-baralhos a partir dos caminhos dos cards; as contagens são as de hoje, sem os limites diários */
export function buildTree(cards: CardRec[], until = endOfToday()): Node {
  const root: Node = { name: "", key: "", depth: -1, total: 0, fresh: 0, learn: 0, rev: 0, children: [] };
  const idx = new Map<string, Node>([["", root]]);
  for (const c of cards) {
    const q = c.q ?? 2;
    const add = (n: Node) => { n.total++; if (q === 0) n.fresh++; else if (q === 1 && c.due <= until) n.learn++; else if (q === 2 && c.due <= until) n.rev++; };
    add(root);
    let key = "";
    c.path.forEach((name, i) => {
      const k = key ? key + SEP + name : name;
      let n = idx.get(k);
      if (!n) { n = { name, key: k, depth: i, total: 0, fresh: 0, learn: 0, rev: 0, children: [] }; idx.set(k, n); idx.get(key)!.children.push(n); }
      add(n); key = k;
    });
  }
  return root;
}
export const inSub = (c: CardRec, sub: string) => !sub || (c.path.join(SEP) + SEP).startsWith(sub + SEP);

/** estado legível do card */
export function stateOf(c: CardRec): { label: string; tone: "accent" | "warning" | "success" | "neutral" } {
  const q = c.q ?? 2;
  if (q === -1) return { label: "Suspenso", tone: "neutral" };
  if (q === -2) return { label: "Enterrado", tone: "neutral" };
  if (q === 0) return { label: "Novo", tone: "accent" };
  if (q === 1) return { label: c.relearn ? "Reaprendendo" : "Aprendendo", tone: "warning" };
  return { label: "Revisão", tone: "success" };
}

export const FLAGS = [
  { id: 1, name: "Vermelha", color: "#e5484d" }, { id: 2, name: "Laranja", color: "#f08c2e" }, { id: 3, name: "Verde", color: "#2fa36b" },
  { id: 4, name: "Azul", color: "#3b82f6" }, { id: 5, name: "Rosa", color: "#e05bb0" }, { id: 6, name: "Turquesa", color: "#14b8b0" }, { id: 7, name: "Roxa", color: "#8b5cf6" },
];
