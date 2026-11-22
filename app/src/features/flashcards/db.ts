/* Flashcards importados ficam no IndexedDB do navegador: baralhos, cards (com o agendamento), imagens e o
   registro de cada revisão (para as estatísticas dos flashcards). Nada daqui entra nas estatísticas de questões.
   Este arquivo também roda no Web Worker da importação, por isso não importa nada de tela nem do motor de sincronização:
   o motor se registra em `setSyncHooks` e é avisado do que mudou. No Worker não há ganchos, e quem avisa é o importer.ts. */
import { dayKey } from "../../lib/format";

/** qa: Pergunta com <span class="cloze-question"> e Resposta com <span class="cloze-answer">;
    cloze: {{c1::...}} do Anki; basic: frente e verso */
export type CardKind = "qa" | "cloze" | "basic";
/** card de pergunta e resposta com lacunas. Baralhos importados antes de este tipo ganhar o nome "qa" têm outro valor gravado:
    tudo o que não é "cloze" nem "basic" é deste tipo. */
export const isQa = (kind: string) => kind !== "cloze" && kind !== "basic";
export type CardRec = {
  id: string;
  deck: string;
  /** caminho do sub-baralho, sem a raiz: Ginecologia e Obstetrícia › Obstetrícia › O Parto */
  path: string[];
  kind: CardKind;
  /** campos da nota, em HTML, como vieram do Anki */
  fields: string[];
  /** qual card da nota (lacuna c1, c2… ou frente/verso) */
  ord: number;
  /** agendamento */
  due: number; ivl: number; ease: number; reps: number; lapses: number; step: number; isNew: 0 | 1; introduced?: number; order: number;
  /** reaprendendo depois de errar uma revisão */
  relearn?: 1;
  /** bandeira do Anki (0 sem, 1 vermelha … 7 roxa), marcado, suspenso, enterrado até o fim de que dia */
  flag?: number; marked?: 1; suspended?: 1; buried?: string; tags?: string[];
  /** fila (calculada ao gravar): 0 novo, 1 aprendendo, 2 revisão, -1 suspenso, -2 enterrado */
  q?: number;
  /** cards criados no app (não vieram do .apkg) */
  own?: 1;
  /** baralho de onde vêm as imagens, quando o card mudou de baralho */
  media?: string;
  /** a análise com IA que trouxe este card para a frente da fila */
  boost?: string;
  /** de onde o card veio: questão do banco, gerado por IA, rascunho automático, colado de CSV, baralho assinado */
  src?: { q?: string; ai?: 1; auto?: 1; csv?: 1; shared?: string };
};
export type DeckRec = { id: string; name: string; file: string; importedAt: number; cards: number; images: number; groups: string[] };
export type Rate = "again" | "hard" | "good" | "easy";
/** uma avaliação: o tipo é o estado do card antes dela (novo, aprendendo, revisão, reaprendendo) */
export type RevLog = { id: string; card: string; deck: string; at: number; rate: Rate; kind: "new" | "learn" | "review" | "relearn"; ivl: number; lastIvl: number; ease: number; ms: number };

export function queueOf(c: CardRec): number {
  if (c.suspended) return -1;
  if (c.buried && c.buried >= dayKey()) return -2;
  if (c.isNew) return 0;
  return c.step > 0 ? 1 : 2;
}

const DB = "conduta-flashcards";
let dbp: Promise<IDBDatabase> | null = null;

/* ---------- ganchos da sincronização ---------- */
type SyncHooks = {
  /** estes registros mudaram ou sumiram */
  dirty?: (c: "fc_card" | "fc_deck" | "fc_revlog", ids: string[]) => void;
  /** imagens novas, para enviar */
  mediaAdded?: (keys: string[]) => void;
  mediaRemoved?: (keys: string[]) => void;
  /** a imagem não está neste aparelho: tenta baixar */
  fetchMedia?: (key: string) => Promise<Blob | undefined>;
};
let hooks: SyncHooks = {};
export const setSyncHooks = (h: SyncHooks) => { hooks = h; };

export function openDb() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 2);
      r.onupgradeneeded = (ev) => {
        const db = r.result, t = r.transaction!;
        if (ev.oldVersion < 1) {
          db.createObjectStore("decks", { keyPath: "id" });
          const c = db.createObjectStore("cards", { keyPath: "id" });
          c.createIndex("deck", "deck");
          c.createIndex("queue", ["deck", "isNew", "due"]);
          db.createObjectStore("media");
        }
        if (ev.oldVersion < 2) {
          // v2: fila por estado (para tirar suspensos e enterrados das contagens) e o registro das revisões
          const c = t.objectStore("cards");
          c.createIndex("q", ["deck", "q", "due"]);
          const log = db.createObjectStore("revlog", { keyPath: "id" });
          log.createIndex("deck", ["deck", "at"]);
          log.createIndex("at", "at");
          c.openCursor().onsuccess = (e) => {
            const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result; if (!cur) return;
            const v = cur.value as CardRec; v.q = queueOf(v); cur.update(v); cur.continue();
          };
        }
      };
      r.onsuccess = () => {
        // outra aba quer apagar o banco (saiu da conta): fecha aqui para não travar
        r.result.onversionchange = () => { r.result.close(); dbp = null; };
        res(r.result);
      };
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

/** fecha a conexão para o banco poder ser apagado */
export async function closeDb() {
  if (!dbp) return;
  try { (await dbp).close(); } catch { /* já estava fechado */ }
  dbp = null;
}

const done = (t: IDBTransaction) => new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** `quiet`: veio do servidor, não precisa voltar para ele */
export async function putMany(store: "cards" | "decks", rows: object[], quiet = false) {
  const db = await openDb(), t = db.transaction(store, "readwrite"), s = t.objectStore(store);
  rows.forEach((r) => s.put(store === "cards" ? { ...(r as CardRec), q: queueOf(r as CardRec) } : r));
  await done(t);
  if (!quiet) hooks.dirty?.(store === "cards" ? "fc_card" : "fc_deck", rows.map((r) => (r as { id: string }).id));
}
export async function putMedia(entries: [string, Blob][], quiet = false) {
  const db = await openDb(), t = db.transaction("media", "readwrite"), s = t.objectStore("media");
  entries.forEach(([k, v]) => s.put(v, k));
  await done(t);
  if (!quiet) hooks.mediaAdded?.(entries.map(([k]) => k));
}
/** a imagem deste aparelho, sem tentar baixar */
export async function getLocalMedia(key: string) {
  const db = await openDb();
  return req(db.transaction("media").objectStore("media").get(key)) as Promise<Blob | undefined>;
}
export async function getMedia(key: string) {
  const hit = await getLocalMedia(key);
  return hit ?? hooks.fetchMedia?.(key);
}
export async function deleteMedia(keys: string[]) {
  const db = await openDb(), t = db.transaction("media", "readwrite"), s = t.objectStore("media");
  keys.forEach((k) => s.delete(k));
  return done(t);
}
const mediaRange = (deck: string) => IDBKeyRange.bound(deck + "/", deck + "/\uffff");
/** as imagens guardadas neste aparelho, de um baralho ou de todos */
export async function mediaKeys(deck?: string) {
  const db = await openDb();
  return req(db.transaction("media").objectStore("media").getAllKeys(deck ? mediaRange(deck) : undefined)) as Promise<string[]>;
}
/** ids dos cards (de um baralho ou de todos), sem carregar o conteúdo: um baralho pode ter dezenas de milhares */
export async function cardIds(deck?: string) {
  const db = await openDb(), s = db.transaction("cards").objectStore("cards");
  return req(deck ? s.index("deck").getAllKeys(deck) : s.getAllKeys()) as Promise<string[]>;
}
export async function logIds() {
  const db = await openDb();
  return req(db.transaction("revlog").objectStore("revlog").getAllKeys()) as Promise<string[]>;
}
/** lê vários registros de uma vez, numa transação só */
export async function readMany<T>(store: "cards" | "decks" | "revlog", ids: string[]): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  if (!ids.length) return out;
  const db = await openDb(), s = db.transaction(store).objectStore(store);
  await Promise.all(ids.map(async (id) => { const v = await req(s.get(id)) as T | undefined; if (v !== undefined) out.set(id, v); }));
  return out;
}
export async function allDecks() {
  const db = await openDb();
  return req(db.transaction("decks").objectStore("decks").getAll()) as Promise<DeckRec[]>;
}
export async function deckCards(deck: string) {
  const db = await openDb();
  return req(db.transaction("cards").objectStore("cards").index("deck").getAll(deck)) as Promise<CardRec[]>;
}
export async function allCards() {
  const db = await openDb();
  return req(db.transaction("cards").objectStore("cards").getAll()) as Promise<CardRec[]>;
}
export async function putCard(c: CardRec) { return putMany("cards", [c]); }

export async function deleteCards(ids: string[], quiet = false) {
  const db = await openDb(), t = db.transaction("cards", "readwrite"), s = t.objectStore("cards");
  ids.forEach((id) => s.delete(id));
  await done(t);
  if (!quiet) hooks.dirty?.("fc_card", ids);
}

export async function deleteDeck(deck: string, quiet = false) {
  const db = await openDb();
  const keys = await req(db.transaction("cards").objectStore("cards").index("deck").getAllKeys(deck));
  const logs = await req(db.transaction("revlog").objectStore("revlog").index("deck").getAllKeys(IDBKeyRange.bound([deck, 0], [deck, Number.MAX_SAFE_INTEGER])));
  const media = await mediaKeys(deck);
  const t = db.transaction(["cards", "decks", "media", "revlog"], "readwrite");
  keys.forEach((k) => t.objectStore("cards").delete(k));
  logs.forEach((k) => t.objectStore("revlog").delete(k));
  t.objectStore("decks").delete(deck);
  t.objectStore("media").delete(mediaRange(deck));
  await done(t);
  if (quiet) return;
  hooks.dirty?.("fc_card", keys as string[]);
  hooks.dirty?.("fc_revlog", logs as string[]);
  hooks.dirty?.("fc_deck", [deck]);
  hooks.mediaRemoved?.(media);
}

/* ---------- registro das revisões ---------- */
export async function addLog(l: RevLog) {
  const db = await openDb(), t = db.transaction("revlog", "readwrite");
  t.objectStore("revlog").put(l);
  await done(t);
  hooks.dirty?.("fc_revlog", [l.id]);
}
export async function deleteLog(id: string) {
  const db = await openDb(), t = db.transaction("revlog", "readwrite");
  t.objectStore("revlog").delete(id);
  await done(t);
  hooks.dirty?.("fc_revlog", [id]);
}
/** o que veio do servidor */
export async function applyLogs(rows: RevLog[], gone: string[]) {
  const db = await openDb(), t = db.transaction("revlog", "readwrite"), s = t.objectStore("revlog");
  rows.forEach((r) => s.put(r));
  gone.forEach((id) => s.delete(id));
  return done(t);
}
export async function logs(deck?: string, since = 0) {
  const db = await openDb(), s = db.transaction("revlog").objectStore("revlog");
  return req(deck
    ? s.index("deck").getAll(IDBKeyRange.bound([deck, since], [deck, Number.MAX_SAFE_INTEGER]))
    : s.index("at").getAll(IDBKeyRange.lowerBound(since))) as Promise<RevLog[]>;
}

/** devolve ao dia de hoje os cards enterrados em dias que já passaram */
export async function unburyOld(deck: string) {
  const db = await openDb();
  const old = (await req(db.transaction("cards").objectStore("cards").index("q").getAll(IDBKeyRange.bound([deck, -2, 0], [deck, -2, Number.MAX_SAFE_INTEGER])))) as CardRec[];
  const stale = old.filter((c) => !c.buried || c.buried < dayKey());
  // só muda a fila calculada daqui: não vale uma ida ao servidor por dia e por baralho
  if (stale.length) await putMany("cards", stale.map((c) => { const n = { ...c }; delete n.buried; return n; }), true);
}

const range = (deck: string, q: number, until: number) => IDBKeyRange.bound([deck, q, 0], [deck, q, until]);

/** quantos novos existem, quantos aprendendo e quantas revisões vencem até `until` */
export async function counts(deck: string, until: number) {
  const db = await openDb(), ix = db.transaction("cards").objectStore("cards").index("q");
  const [fresh, learn, rev] = await Promise.all([
    req(ix.count(range(deck, 0, Number.MAX_SAFE_INTEGER))),
    req(ix.count(range(deck, 1, until))),
    req(ix.count(range(deck, 2, until))),
  ]);
  return { fresh, learn, rev };
}
/** quantos cards do baralho já saíram de novos (incluindo suspensos e enterrados que já foram vistos) */
export async function countSeen(deck: string) {
  const db = await openDb(), ix = db.transaction("cards").objectStore("cards").index("q");
  const [learn, rev, total, fresh] = await Promise.all([
    req(ix.count(range(deck, 1, Number.MAX_SAFE_INTEGER))),
    req(ix.count(range(deck, 2, Number.MAX_SAFE_INTEGER))),
    req(db.transaction("cards").objectStore("cards").index("deck").count(deck)),
    req(ix.count(range(deck, 0, Number.MAX_SAFE_INTEGER))),
  ]);
  return Math.max(learn + rev, total - fresh - 0);
}
/** a fila de hoje: aprendendo e revisões vencidas (até `revLimit`) e até `newLimit` novos, na ordem do baralho */
export async function queue(deck: string, until: number, newLimit: number, revLimit = Number.MAX_SAFE_INTEGER) {
  const db = await openDb(), ix = db.transaction("cards").objectStore("cards").index("q");
  const [learn, rev, fresh] = await Promise.all([
    req(ix.getAll(range(deck, 1, until))) as Promise<CardRec[]>,
    revLimit > 0 ? (req(ix.getAll(range(deck, 2, until), revLimit)) as Promise<CardRec[]>) : Promise.resolve([] as CardRec[]),
    newLimit > 0 ? (req(ix.getAll(range(deck, 0, Number.MAX_SAFE_INTEGER), newLimit)) as Promise<CardRec[]>) : Promise.resolve([] as CardRec[]),
  ]);
  return { learn, rev, fresh };
}
