/* Importação de um .apkg do Anki, fora da tela (Web Worker): lê o zip por partes (há baralhos com mais de 1 GB),
   descomprime a coleção (zstd), consulta o SQLite (sql.js), grava os cards no IndexedDB e copia só as imagens
   usadas pelos cards escolhidos. */
/// <reference lib="webworker" />
import { decompress as unzstd } from "fzstd";
import { inflateSync } from "fflate";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { putMany, putMedia } from "./db";
import type { CardKind, CardRec, DeckRec } from "./db";

type Entry = { name: string; method: number; csize: number; usize: number; off: number };
type In = { type: "open"; file: File; deck: string } | { type: "import"; groups: string[] };
export type Group = { name: string; cards: number; subdecks: number };
export type Out =
  | { type: "summary"; name: string; cards: number; images: number; subdecks: number; groups: Group[]; unsupported: number }
  | { type: "progress"; phase: "cards" | "images"; n: number; total: number }
  | { type: "done"; cards: number; images: number }
  | { type: "error"; message: string };

const post = (m: Out) => (self as unknown as Worker).postMessage(m);
let file: File, deckId = "", entries = new Map<string, Entry>(), db: Database | null = null;
let notes = new Map<number, { mid: number; flds: string[] }>(), cards: { id: number; nid: number; did: number; ord: number }[] = [];
let deckNames = new Map<number, string[]>(), kinds = new Map<number, CardKind | null>(), root = "";

const bytes = async (a: number, b: number) => new Uint8Array(await file.slice(a, b).arrayBuffer());
const u16 = (v: Uint8Array, i: number) => v[i] | (v[i + 1] << 8);
const u32 = (v: Uint8Array, i: number) => (v[i] | (v[i + 1] << 8) | (v[i + 2] << 16) | (v[i + 3] << 24)) >>> 0;
const u64 = (v: Uint8Array, i: number) => u32(v, i) + u32(v, i + 4) * 4294967296;

async function readDir() {
  const tailLen = Math.min(file.size, 66000), tail = await bytes(file.size - tailLen, file.size);
  let e = -1; for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("zip");
  let count = u16(tail, e + 10), cdSize = u32(tail, e + 12), cdOff = u32(tail, e + 16);
  if (cdOff === 0xffffffff || count === 0xffff) {
    const loc = e - 20; if (loc < 0 || u32(tail, loc) !== 0x07064b50) throw new Error("zip64");
    const recOff = u64(tail, loc + 8), rec = await bytes(recOff, recOff + 56);
    count = u64(rec, 32); cdSize = u64(rec, 40); cdOff = u64(rec, 48);
  }
  const cd = await bytes(cdOff, cdOff + cdSize), dec = new TextDecoder();
  let p = 0;
  entries = new Map();
  while (p + 46 <= cd.length && u32(cd, p) === 0x02014b50) {
    const method = u16(cd, p + 10); let csize = u32(cd, p + 20), usize = u32(cd, p + 24);
    const nlen = u16(cd, p + 28), xlen = u16(cd, p + 30), clen = u16(cd, p + 32); let off = u32(cd, p + 42);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nlen));
    // zip64: tamanhos e posição no campo extra 0x0001
    let x = p + 46 + nlen; const xe = x + xlen;
    while (x + 4 <= xe) {
      const id = u16(cd, x), sz = u16(cd, x + 2); let q = x + 4;
      if (id === 1) { if (usize === 0xffffffff) { usize = u64(cd, q); q += 8; } if (csize === 0xffffffff) { csize = u64(cd, q); q += 8; } if (off === 0xffffffff) { off = u64(cd, q); } }
      x += 4 + sz;
    }
    entries.set(name, { name, method, csize, usize, off });
    p += 46 + nlen + xlen + clen;
  }
}

async function entryData(name: string) {
  const en = entries.get(name); if (!en) return null;
  const lh = await bytes(en.off, en.off + 30);
  const start = en.off + 30 + u16(lh, 26) + u16(lh, 28);
  const raw = await bytes(start, start + en.csize);
  return en.method === 8 ? inflateSync(raw) : raw;
}
const isZstd = (v: Uint8Array) => v.length > 4 && u32(v, 0) === 0xfd2fb528;

/* protobuf mínimo para o índice de mídia novo: MediaEntries { repeated MediaEntry entries = 1 { string name = 1 } } */
function mediaNames(v: Uint8Array) {
  const names: string[] = []; let p = 0; const dec = new TextDecoder();
  const varint = () => { let r = 0, s = 0, b; do { b = v[p++]; r += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return r; };
  while (p < v.length) {
    const tag = varint(), field = tag >> 3, wt = tag & 7;
    if (field === 1 && wt === 2) {
      const len = varint(), end = p + len; let name = "";
      while (p < end) { const t2 = varint(), f2 = t2 >> 3, w2 = t2 & 7; if (w2 === 2) { const l = varint(); if (f2 === 1) name = dec.decode(v.subarray(p, p + l)); p += l; } else if (w2 === 0) varint(); else if (w2 === 5) p += 4; else if (w2 === 1) p += 8; }
      names.push(name);
    } else if (wt === 2) { p += varint(); } else if (wt === 0) varint(); else break;
  }
  return names;
}

function q<T = unknown[]>(sql: string) { const r = db!.exec(sql)[0]; return (r ? r.values : []) as T[]; }

async function open(f: File, deck: string) {
  file = f; deckId = deck;
  await readDir();
  const name = entries.has("collection.anki21b") ? "collection.anki21b" : entries.has("collection.anki21") ? "collection.anki21" : "collection.anki2";
  let col = await entryData(name);
  if (!col) throw new Error("Este arquivo não tem uma coleção do Anki.");
  if (isZstd(col)) col = unzstd(col);
  const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  db = new SQL.Database(col);
  const tables = new Set(q<[string]>("select name from sqlite_master where type='table'").map((r) => r[0]));
  // tipos de nota: nomes dos campos decidem como mostrar
  const fieldNames = new Map<number, string[]>(), isCloze = new Map<number, boolean>();
  if (tables.has("notetypes")) {
    for (const [ntid, ord, fname] of q<[number, number, string]>("select ntid, ord, name from fields order by ntid, ord")) { const l = fieldNames.get(ntid) || []; l[ord] = fname; fieldNames.set(ntid, l); }
    for (const [id, nm] of q<[number, string]>("select id, name from notetypes")) isCloze.set(id, /cloze/i.test(nm) && !/occlusion/i.test(nm));
    for (const [id, nm] of q<[number, string]>("select id, name from decks not indexed")) deckNames.set(id, String(nm).split("\x1f"));
  } else {
    const [models, decks] = q<[string, string]>("select models, decks from col")[0];
    for (const m of Object.values(JSON.parse(models)) as { id: number; flds: { name: string }[]; type: number }[]) { fieldNames.set(Number(m.id), m.flds.map((x) => x.name)); isCloze.set(Number(m.id), m.type === 1); }
    for (const d of Object.values(JSON.parse(decks)) as { id: number; name: string }[]) deckNames.set(Number(d.id), d.name.split("::"));
  }
  notes = new Map();
  for (const [id, mid, flds] of q<[number, number, string]>("select id, mid, flds from notes")) notes.set(id, { mid, flds: String(flds).split("\x1f") });
  cards = q<[number, number, number, number]>("select id, nid, did, ord from cards order by due, id").map(([id, nid, did, ord]) => ({ id, nid, did, ord }));
  kinds = new Map();
  let unsupported = 0;
  for (const [mid, fn] of fieldNames) {
    const lower = fn.map((x) => (x || "").toLowerCase());
    if (isCloze.get(mid)) kinds.set(mid, "cloze");
    else if (lower.some((x) => x.includes("occlusion"))) kinds.set(mid, null);
    else if (lower[0] === "question" && lower[1] === "answer") kinds.set(mid, "qa");
    else kinds.set(mid, "basic");
  }
  // grupos: o nível abaixo da raiz comum (Baralho › Clínica Médica…)
  const used = new Map<number, number>();
  for (const c of cards) { const n = notes.get(c.nid); if (!n || !kinds.get(n.mid)) { unsupported++; continue; } used.set(c.did, (used.get(c.did) || 0) + 1); }
  const roots = new Set([...used.keys()].map((d) => (deckNames.get(d) || ["?"])[0]));
  root = roots.size === 1 ? [...roots][0] : "";
  const groups = new Map<string, Group>();
  for (const [did, n] of used) {
    const parts = deckNames.get(did) || ["Sem baralho"], g = root ? parts[1] || parts[0] : parts[0];
    const x = groups.get(g) || { name: g, cards: 0, subdecks: 0 }; x.cards += n; x.subdecks++; groups.set(g, x);
  }
  const media = await entryData("media");
  let images = 0;
  if (media) { const m = isZstd(media) ? unzstd(media) : media; images = m[0] === 0x7b ? Object.keys(JSON.parse(new TextDecoder().decode(m))).length : mediaNames(m).length; }
  post({ type: "summary", name: root || f.name.replace(/\.apkg$/i, ""), cards: cards.length - unsupported, images, subdecks: used.size, groups: [...groups.values()].sort((a, b) => b.cards - a.cards), unsupported });
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp" };

async function doImport(groups: string[]) {
  const want = new Set(groups), recs: CardRec[] = [], used = new Set<string>();
  let order = 0;
  for (const c of cards) {
    const n = notes.get(c.nid); const kind = n && kinds.get(n.mid); if (!n || !kind) continue;
    const parts = deckNames.get(c.did) || ["Sem baralho"], path = root ? parts.slice(1) : parts, g = path[0] || parts[0];
    if (!want.has(g)) continue;
    for (const fld of n.flds) for (const m of fld.matchAll(/<img[^>]+src=["']?([^"' >]+)/gi)) used.add(decodeURIComponent(m[1]));
    recs.push({ id: deckId + ":" + c.id, deck: deckId, path, kind, fields: n.flds, ord: c.ord, due: order, ivl: 0, ease: 2.5, reps: 0, lapses: 0, step: 0, isNew: 1, order: order++ });
  }
  for (let i = 0; i < recs.length; i += 400) { await putMany("cards", recs.slice(i, i + 400)); post({ type: "progress", phase: "cards", n: Math.min(recs.length, i + 400), total: recs.length }); }
  // imagens: só as usadas pelos cards importados
  const media = await entryData("media");
  let copied = 0;
  if (media) {
    const m = isZstd(media) ? unzstd(media) : media;
    const map: [string, string][] = m[0] === 0x7b ? Object.entries(JSON.parse(new TextDecoder().decode(m))).map(([k, v]) => [k, String(v)]) : mediaNames(m).map((nm, i) => [String(i), nm]);
    const todo = map.filter(([, nm]) => used.has(nm));
    let batch: [string, Blob][] = [];
    for (const [zipName, nm] of todo) {
      let v = await entryData(zipName); if (!v) continue;
      if (isZstd(v)) v = unzstd(v);
      const ext = nm.split(".").pop()!.toLowerCase();
      batch.push([deckId + "/" + nm, new Blob([v as BlobPart], { type: MIME[ext] || "application/octet-stream" })]);
      copied++;
      if (batch.length >= 25) { await putMedia(batch); batch = []; post({ type: "progress", phase: "images", n: copied, total: todo.length }); }
    }
    if (batch.length) await putMedia(batch);
    post({ type: "progress", phase: "images", n: copied, total: todo.length });
  }
  const deck: DeckRec = { id: deckId, name: root || file.name.replace(/\.apkg$/i, ""), file: file.name, importedAt: Date.now(), cards: recs.length, images: copied, groups };
  await putMany("decks", [deck]);
  db?.close(); db = null;
  post({ type: "done", cards: recs.length, images: copied });
}

self.onmessage = async (e: MessageEvent<In>) => {
  try {
    if (e.data.type === "open") await open(e.data.file, e.data.deck);
    else await doImport(e.data.groups);
  } catch (err) {
    const msg = err instanceof Error && !/^(zip|zip64)$/.test(err.message) ? err.message : "Não deu para ler este arquivo. Exporte de novo pelo Anki, em Arquivo › Exportar, no formato .apkg.";
    post({ type: "error", message: msg });
  }
};
