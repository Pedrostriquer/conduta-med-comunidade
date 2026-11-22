/* Criar cards fora do .apkg: escrever, colar CSV/TSV, a partir de uma questão do banco ou dos rascunhos da IA.
   Tudo entra como card novo no fim da fila do baralho. */
import type { Exam, FullQuestion } from "../../data/types";
import { uid } from "../../lib/random";
import { allDecks, putMany } from "./db";
import type { CardRec, DeckRec } from "./db";
import { presetFor } from "./config";
import { useDeckStore } from "./decks";

export type Tipo = "basico" | "invertido" | "lacunas";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** texto do formulário → HTML do card: escapa tudo menos negrito, itálico, sublinhado e quebras */
export const html = (s: string) => esc(s).replace(/\n/g, "<br>").replace(/&lt;(\/?)(b|i|u|br|sub|sup)&gt;/g, "<$1$2>");
/** HTML do card → texto do formulário */
export const plain = (h: string) => h.replace(/<br\s*\/?>/gi, "\n").replace(/<(?!\/?(b|i|u|sub|sup)>)[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function makeCards(tipo: Tipo, deck: string, path: string[], f: string[], tags: string[], src?: CardRec["src"]): CardRec[] {
  const base = { deck, path, fields: f, due: 0, ivl: 0, ease: presetFor(deck).startEase, reps: 0, lapses: 0, step: 0, isNew: 1 as const, tags, own: 1 as const, ...(src ? { src } : {}) };
  const note = uid(), order = Date.now();
  if (tipo === "lacunas" || (tipo === "basico" && /\{\{c\d+::/.test(f[0]) && !f[1])) {
    const ns = [...new Set([...f[0].matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
    return ns.map((n, i) => ({ ...base, id: `${deck}:u${note}:${n - 1}`, kind: "cloze", ord: n - 1, order: order + i, due: order + i }));
  }
  const xs: CardRec[] = [{ ...base, id: `${deck}:u${note}:0`, kind: "basic", ord: 0, order, due: order }];
  if (tipo === "invertido") xs.push({ ...base, id: `${deck}:u${note}:1`, kind: "basic", ord: 1, order: order + 1, due: order + 1 });
  return xs;
}

/** garante que o baralho existe (cria com este id e nome) */
export async function ensureDeck(id: string, name: string): Promise<DeckRec> {
  const ds = await allDecks(), hit = ds.find((d) => d.id === id);
  if (hit) return hit;
  const rec: DeckRec = { id, name, file: "", importedAt: Date.now(), cards: 0, images: 0, groups: [] };
  await putMany("decks", [rec]);
  return rec;
}

/** grava os cards e atualiza a contagem do baralho */
export async function addCards(deck: string, cards: CardRec[]) {
  if (!cards.length) return;
  await putMany("cards", cards);
  const rec = (await allDecks()).find((x) => x.id === deck);
  if (rec) await putMany("decks", [{ ...rec, cards: rec.cards + cards.length }]);
  useDeckStore.getState().refresh();
}

/* ---------- colar CSV/TSV ---------- */
export type Row = { front: string; back: string; tags: string[]; qid?: string };

/** linhas "frente<sep>verso[<sep>etiquetas ou id da questão]"; o separador é o mais comum (tab, ponto e vírgula ou vírgula) */
export function parseDelimited(text: string): { rows: Row[]; sep: string; skipped: number } {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const score = (c: string) => lines.filter((l) => splitLine(l, c).length >= 2).length;
  const sep = ["\t", ";", ","].sort((a, b) => score(b) - score(a))[0];
  const rows: Row[] = [];
  let skipped = 0;
  for (const l of lines) {
    const cells = splitLine(l, sep).map((c) => c.trim());
    if (cells.length < 2 || !cells[0] || (!cells[1] && !/\{\{c\d+::/.test(cells[0]))) { skipped++; continue; }
    if (/^(frente|front|pergunta)$/i.test(cells[0]) && /^(verso|back|resposta)$/i.test(cells[1])) continue; // cabeçalho
    const extra = cells.slice(2).join(" ");
    const qid = extra.match(/\b([A-Za-z0-9-]+-Q\d{2,3})\b/)?.[1];
    rows.push({ front: cells[0], back: cells[1], tags: extra.split(/\s+/).filter((t) => t && t !== qid), qid });
  }
  return { rows, sep, skipped };
}
/** divide uma linha respeitando aspas ("texto, com vírgula") */
function splitLine(l: string, sep: string) {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === sep && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/* ---------- a partir de uma questão do banco ---------- */
/** enunciado curto: até ~2 frases do caso e a pergunta final */
export function shortStem(e: string, max = 360) {
  const t = e.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const ss = t.split(/(?<=[.?!:])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/);
  const last = ss[ss.length - 1];
  let head = "";
  for (const s of ss.slice(0, -1)) { if ((head + " " + s).length > max - last.length - 4) break; head = (head + " " + s).trim(); }
  return (head ? head + " … " : "… ") + last;
}

export function questionCard(q: FullQuestion, exam?: Exam) {
  const alt = q.a[q.g];
  const front = esc(shortStem(q.e));
  const back = `<b>${esc(q.g)}) ${esc(alt || "")}</b>` + (q.x ? `<br><br>${esc(q.x)}` : "") + (exam ? `<br><br><small>${esc(exam.nome)} · questão ${q.n}</small>` : "");
  return { front, back, frontText: shortStem(q.e), backText: `${q.g}) ${alt || ""}${q.x ? "\n\n" + q.x : ""}` };
}
