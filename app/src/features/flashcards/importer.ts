/* Estado da importação, fora dos componentes: dá para sair da tela e a importação continua. */
import { create } from "zustand";
import { deleteDeck } from "./db";
import type { Group, Out } from "./anki.worker";
import { useDeckStore } from "./decks";
import { uid } from "../../lib/random";
import { trackImportedDeck } from "../../sync/engine";

type Step = "idle" | "reading" | "review" | "importing" | "done" | "error";
type Summary = Extract<Out, { type: "summary" }>;

type ImportState = {
  step: Step;
  file: { name: string; size: number } | null;
  summary: Summary | null;
  groups: Record<string, boolean>;
  phase: "cards" | "images";
  n: number; total: number;
  result: { cards: number; images: number } | null;
  error: string | null;
  deck: string;
  open: (f: File) => void;
  toggle: (g: string) => void;
  start: () => void;
  cancel: () => void;
  reset: () => void;
};

let worker: Worker | null = null;

export const useImport = create<ImportState>()((set, get) => ({
  step: "idle", file: null, summary: null, groups: {}, phase: "cards", n: 0, total: 0, result: null, error: null, deck: "",
  open: (f) => {
    if (!/\.apkg$/i.test(f.name)) { set({ step: "error", error: `“${f.name}” não é um baralho do Anki. Exporte pelo Anki em Arquivo › Exportar, no formato .apkg.` }); return; }
    worker?.terminate();
    worker = new Worker(new URL("./anki.worker.ts", import.meta.url), { type: "module" });
    const deck = uid();
    set({ step: "reading", file: { name: f.name, size: f.size }, deck, error: null, summary: null, result: null, n: 0, total: 0 });
    worker.onmessage = (e: MessageEvent<Out>) => {
      const m = e.data;
      if (m.type === "summary") set({ step: "review", summary: m, groups: Object.fromEntries(m.groups.map((g: Group) => [g.name, true])) });
      if (m.type === "progress") set({ phase: m.phase, n: m.n, total: m.total });
      if (m.type === "done") {
        set({ step: "done", result: { cards: m.cards, images: m.images } }); worker?.terminate(); worker = null; useDeckStore.getState().refresh();
        // o Worker gravou direto no IndexedDB: agora o baralho entra na fila de envio, com as imagens, em segundo plano
        trackImportedDeck(deck);
      }
      if (m.type === "error") { set({ step: "error", error: m.message }); worker?.terminate(); worker = null; }
    };
    worker.postMessage({ type: "open", file: f, deck });
  },
  toggle: (g) => set((s) => ({ groups: { ...s.groups, [g]: !s.groups[g] } })),
  start: () => {
    const g = Object.entries(get().groups).filter(([, v]) => v).map(([k]) => k);
    set({ step: "importing", phase: "cards", n: 0, total: 0 });
    worker?.postMessage({ type: "import", groups: g });
  },
  cancel: () => {
    const { step, deck } = get();
    worker?.terminate(); worker = null;
    if (step === "importing" || step === "done") deleteDeck(deck).then(() => useDeckStore.getState().refresh());
    set({ step: "idle", file: null, summary: null, n: 0, total: 0, result: null, error: null });
  },
  reset: () => set({ step: "idle", file: null, summary: null, n: 0, total: 0, result: null, error: null }),
}));

export function fileSize(b: number) {
  if (b > 1e9) return (b / 1e9).toFixed(2).replace(".", ",") + " GB";
  if (b > 1e6) return Math.round(b / 1e6) + " MB";
  return Math.max(1, Math.round(b / 1e3)) + " KB";
}

// só no desenvolvimento: permite testar a importação sem o seletor de arquivos
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__condutaImport = useImport;
