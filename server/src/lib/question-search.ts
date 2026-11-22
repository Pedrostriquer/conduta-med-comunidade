/* Busca de questões por palavra do enunciado ou das alternativas: porte de app/src/features/busca/search.ts, que antes
   rodava no navegador com o banco inteiro. O texto normalizado (minúsculas, sem acento, mesmo comprimento do original)
   é preparado uma vez, na primeira busca; cada pedido só percorre esse índice. */
import { bank } from "../bank";
import type { Question } from "../bank";

const MARKS = /[̀-ͯ]/g;

/** minúsculas e sem acento, com o mesmo comprimento do original (para os índices baterem) */
export function norm(s: string) {
  const n = s.normalize("NFD").replace(MARKS, "").toLowerCase();
  if (n.length === s.length) return n;
  let out = "";
  for (const c of s) { const x = c.normalize("NFD").replace(MARKS, "").toLowerCase(); out += x.length === c.length ? x : c; }
  return out;
}

const STOP = new Set("a o as os e de da do das dos em no na nos nas um uma uns umas com por para pra ao aos que se ou sem sob".split(" "));

/** termos da busca, sem acento, do mais longo ao mais curto; "de", "com" e "para" só contam se forem tudo o que foi digitado */
export function terms(query: string) {
  const all = [...new Set(norm(query).split(/[\s,;.]+/).filter((t) => t.length >= 2))];
  const strong = all.filter((t) => !STOP.has(t));
  return (strong.length ? strong : all).sort((a, b) => b.length - a.length);
}
const phraseOf = (query: string) => norm(query).replace(/\s+/g, " ").trim();

type Doc = { q: Question; stem: string; alts: [letter: string, text: string, norm: string][]; banca: string | undefined; ano: number };
let cache: { of: unknown; docs: Doc[] } | null = null;

function docs() {
  const b = bank();
  if (cache?.of !== b) {
    cache = { of: b, docs: b.all.map((q) => {
      const ex = b.examById.get(q.p);
      return { q, stem: norm(q.e), alts: Object.entries(q.a).map(([L, t]) => [L, t, norm(t)] as [string, string, string]), banca: ex?.banca, ano: ex?.ano ?? 0 };
    }) };
  }
  return cache.docs;
}
export type Hit = { q: Question; score: number; where: "stem" | string; ano: number };
export type SearchFilter = { bancas?: string[]; anos?: number[]; areas?: string[]; excluir?: string[] };

/** questões com todos os termos (no enunciado ou nas alternativas), as que têm no enunciado primeiro. Anuladas nunca entram;
    sem `includeAll`, só as marcadas como ok. */
export function searchQuestions(includeAll: boolean, query: string, f: SearchFilter = {}): Hit[] {
  const ts = terms(query), phrase = ts.length > 1 ? phraseOf(query) : "";
  const bancas = f.bancas?.length ? new Set(f.bancas) : null, anos = f.anos?.length ? new Set(f.anos) : null, areas = f.areas?.length ? new Set(f.areas) : null;
  const skip = f.excluir?.length ? new Set(f.excluir) : null;
  const out: Hit[] = [];
  for (const d of docs()) {
    const q = d.q;
    if (!includeAll && !q.ok) continue;
    if (bancas && !bancas.has(d.banca as string)) continue;
    if (anos && !anos.has(d.ano)) continue;
    if (areas && !areas.has(q.area)) continue;
    if (skip && skip.has(q.id)) continue;
    if (!ts.length) { out.push({ q, score: 0, where: "stem", ano: d.ano }); continue; }
    let score = 0;
    for (const t of ts) {
      const i = d.stem.indexOf(t);
      if (i >= 0) { score += 2 + (i < 200 ? 1 : 0); continue; }
      if (!d.alts.some((x) => x[2].includes(t))) { score = -1; break; }
      score += 1;
    }
    if (score < 0) continue;
    // a expressão inteira junta vale mais; o trecho mostra onde está o termo mais longo
    let where: Hit["where"] = "stem";
    if (phrase && d.stem.includes(phrase)) score += 6;
    else if (phrase) { const a = d.alts.find((x) => x[2].includes(phrase)); if (a) { score += 5; where = a[0]; } }
    if (where === "stem" && !d.stem.includes(phrase || ts[0])) { const a = d.alts.find((x) => x[2].includes(phrase || ts[0])) || d.alts.find((x) => x[2].includes(ts[0])); if (a && !d.stem.includes(ts[0])) where = a[0]; }
    out.push({ q, score, where, ano: d.ano });
  }
  if (ts.length) out.sort((a, b) => b.score - a.score || b.ano - a.ano);
  return out;
}

/** trecho de ~len caracteres em volta do primeiro termo encontrado */
export function snippet(text: string, ts: string[], len = 170) {
  const n = norm(text);
  let at = -1;
  for (const t of ts) { const i = n.indexOf(t); if (i >= 0) { at = i; break; } } // os termos vêm do mais longo ao mais curto
  if (at < 0 || text.length <= len) return text.length > len ? text.slice(0, len).replace(/\s+\S*$/, "") + "…" : text;
  let a = Math.max(0, at - Math.round(len * 0.35));
  if (a > 0) { const sp = text.indexOf(" ", a); a = sp > 0 && sp < at ? sp + 1 : a; }
  let b = Math.min(text.length, a + len);
  if (b < text.length) { const sp = text.lastIndexOf(" ", b); b = sp > at ? sp : b; }
  return (a > 0 ? "…" : "") + text.slice(a, b) + (b < text.length ? "…" : "");
}
