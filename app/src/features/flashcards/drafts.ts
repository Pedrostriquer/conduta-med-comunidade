/* Rascunhos de cards (da IA, colados de uma resposta dela, ou automáticos a partir das questões erradas).
   Nada vira card sem o aluno aceitar. Ficam no navegador e são espelhados no servidor (ver sync/engine.ts). */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getBank } from "../../data/bank";
import { areaLabel } from "../../data/types";
import { uid } from "../../lib/random";
import { quietly } from "../../state/quiet";
import { addCards, ensureDeck, html, makeCards } from "./make";

export type Draft = { id: string; front: string; back: string; qid?: string; origin: "ia" | "auto"; at: number };

type DraftState = {
  drafts: Draft[];
  add: (rows: Omit<Draft, "id" | "at">[]) => number;
  update: (id: string, p: Partial<Draft>) => void;
  remove: (ids: string[]) => void;
};

export const useDrafts = create<DraftState>()(persist((set, get) => ({
  drafts: [],
  add: (rows) => {
    // a mesma frente da mesma questão não entra duas vezes
    const seen = new Set(get().drafts.map((d) => (d.qid || "") + "|" + d.front.trim().toLowerCase()));
    const fresh = rows.filter((r) => !seen.has((r.qid || "") + "|" + r.front.trim().toLowerCase())).map((r) => ({ ...r, id: uid(), at: Date.now() }));
    set((s) => ({ drafts: [...fresh, ...s.drafts] }));
    return fresh.length;
  },
  update: (id, p) => set((s) => ({ drafts: s.drafts.map((d) => (d.id === id ? { ...d, ...p } : d)) })),
  remove: (ids) => set((s) => ({ drafts: s.drafts.filter((d) => !ids.includes(d.id)) })),
}), { name: "conduta-fc-drafts", version: 1, partialize: (s) => ({ drafts: s.drafts }) as DraftState }));

// outra aba gravou: recarrega daqui para uma não apagar o que a outra salvou
if (typeof window !== "undefined") addEventListener("storage", (e: StorageEvent) => { if (e.key === "conduta-fc-drafts") quietly(() => useDrafts.persist.rehydrate()); });

export const ERR_DECK = "meus-erros";

/** aceita os rascunhos: viram cards novos no baralho "Meus erros", num sub-baralho pela área da questão */
export async function acceptDrafts(ds: Draft[]) {
  if (!ds.length) return 0;
  await ensureDeck(ERR_DECK, "Meus erros");
  let bank: ReturnType<typeof getBank> | null = null;
  try { bank = getBank(); } catch { bank = null; }
  const cards = ds.flatMap((d) => {
    const q = d.qid && bank ? bank.byId[d.qid] : undefined;
    const path = q ? [areaLabel(q.area), ...(q.esp ? [q.esp] : [])] : ["Outros"];
    const tags = ["meus-erros", d.origin === "ia" ? "gerado-por-ia" : "rascunho-automatico"];
    return makeCards("basico", ERR_DECK, path, [html(d.front), html(d.back)], tags, { q: d.qid, ...(d.origin === "ia" ? { ai: 1 as const } : { auto: 1 as const }) });
  });
  await addCards(ERR_DECK, cards);
  useDrafts.getState().remove(ds.map((d) => d.id));
  return cards.length;
}
