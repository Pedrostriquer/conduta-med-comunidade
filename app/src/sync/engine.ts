/* O motor de sincronização. O app segue lendo e gravando no navegador (localStorage e IndexedDB), que continua sendo o que
   as telas usam, e este módulo espelha no servidor. Sem rede, nada muda para a pessoa: a fila espera.

   - Saída: os estados são imutáveis, então comparar referências diz o que mudou; o que mudou entra numa fila de CHAVES
     (`coll:id`, guardada no IndexedDB `conduta-sync`). O conteúdo é lido na hora de enviar: sempre vai a versão mais nova,
     e uma importação de dezenas de milhares de cards não ocupa a memória nem o disco duas vezes.
   - Entrada: `pull` a partir de um cursor por pessoa, ao entrar, ao voltar para a aba e a cada 30 s com a aba visível.
     Aplica dentro de `quietly`, sem eco. Última escrita ganha pelo `at`.
   - Dono dos dados: `conduta-owner`. Outra conta no mesmo navegador apaga tudo daqui antes de entrar. Sem dono (primeira vez,
     ou quem fez as 3 questões antes de criar conta), o que já existe aqui é adotado pela conta. */
import { create } from "zustand";
import { closeDb, applyLogs, cardIds, deleteCards, deleteDeck, deleteMedia, getLocalMedia, logIds, mediaKeys, putMany, putMedia, readMany, setSyncHooks, allDecks } from "../features/flashcards/db";
import type { CardRec, DeckRec, RevLog } from "../features/flashcards/db";
import { defaults as presetDefaults, DEFAULT_ID, useFc } from "../features/flashcards/config";
import { useDeckStore } from "../features/flashcards/decks";
import { useDrafts } from "../features/flashcards/drafts";
import type { Draft } from "../features/flashcards/drafts";
import { useAuth } from "../state/auth";
import { useCardsDone, useGoals } from "../state/goals";
import { usePrefs } from "../state/prefs";
import { isQuiet, quietly } from "../state/quiet";
import { DEFAULT_SETTINGS, useStore } from "../state/store";
import type { Attempt, Note, Plan, Review, Session, Settings } from "../state/store";
import { closeSyncDb, mediaGet, mediaGetMany, mediaIndexKeys, mediaWrite, outboxAll, outboxWrite, queueAll, queueWrite } from "./idb";
import type { MediaRef, OutRow } from "./idb";
import { cleanCardHtml } from "../features/flashcards/clean";
import { useTreino } from "../features/treino/estado";
import type { Dia as TreinoDia, Registro as TreinoRegistro } from "../features/treino/estado";

export type Coll = "settings" | "session" | "attempt" | "plan" | "saved" | "qnote" | "qtag" | "review" | "meta" | "goals" | "prefs" | "study" | "fc_deck" | "fc_card" | "fc_revlog" | "fc_config" | "fc_draft" | "fc_media" | "treino";

const OWNER = "conduta-owner";
const cursorKey = (uid: string) => "conduta-sync-cursor:" + uid;
const adoptKey = (uid: string) => "conduta-sync-adotar:" + uid;
const noticedKey = (uid: string) => "conduta-sync-avisados:" + uid;

const DELAY = 3_000, MAX_WAIT = 15_000;
/** o cronômetro da sessão muda a cada segundo: agrupa por 10 s; as opções dos baralhos mudam a cada card revisado */
const SLOW: Partial<Record<Coll, number>> = { session: 10_000, fc_config: 10_000 };
const MAX_BATCH = 500, MAX_BYTES = 6_000_000, MAX_RECORD = 250_000, KEEPALIVE_BYTES = 60_000;
const POLL = 30_000, FOCUS_GAP = 5_000, BACKOFF_MAX = 300_000;

const IDB_COLLS = new Set<string>(["fc_deck", "fc_card", "fc_revlog", "fc_media"]);

/* ---------- estado visível ---------- */
export type SyncState = "ocioso" | "enviando" | "sem_conexao" | "erro";
export type SyncStatus = { state: SyncState; lastAt: number | null; pending: number; ready: boolean };
const useStatus = create<SyncStatus>()(() => ({ state: "ocioso", lastAt: null, pending: 0, ready: false }));
export const useSyncStatus = <T = SyncStatus>(sel?: (s: SyncStatus) => T) => useStatus(sel ?? ((s) => s as unknown as T));

/** a frase de uma linha: "Sincronizado às 14:32", "Enviando…", "Sem conexão…" */
export function syncLabel(s: SyncStatus) {
  if (s.state === "sem_conexao") return s.pending ? "Sem conexão: o que você fez fica guardado aqui e vai quando a internet voltar" : "Sem conexão";
  if (s.state === "enviando") return s.pending > 50 ? `Enviando… faltam ${s.pending.toLocaleString("pt-BR")} itens` : "Enviando…";
  if (s.state === "erro") return "Não conseguimos sincronizar agora. Tentamos de novo sozinhos.";
  if (s.pending) return "Sincronizando…";
  if (s.lastAt) return "Sincronizado às " + new Date(s.lastAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return "Sincronizando…";
}

/* ---------- avisos do que a IA fez ---------- */
export type SyncNotice = { id: number; text: string; to?: string };
export const useSyncNotices = create<{ items: SyncNotice[] }>()(() => ({ items: [] }));
export const clearNotice = (id: number) => useSyncNotices.setState((s) => ({ items: s.items.filter((n) => n.id !== id) }));

/* ---------- utilidades ---------- */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const plain = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== "function"));
const attemptId = (a: Attempt) => `${a.sid}:${a.qid}:${a.at}`;
const encoder = new TextEncoder();

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/* ---------- fila de saída ---------- */
type Entry = OutRow & { first: number; last: number };
const mem = new Map<string, Entry>();
const unsaved = new Set<string>(), removed = new Set<string>();
/** a versão mais nova que este aparelho conhece de cada chave (enviada ou recebida). O que voltar do servidor igual ou mais
    velho é eco; e uma mudança daqui vale sempre mais que ela, mesmo com o relógio do aparelho atrasado */
const known = new Map<string, number>();
let saveTimer = 0, tickQueued = false;
let idbOk = true;

const setPending = () => { if (useStatus.getState().pending !== mem.size) useStatus.setState({ pending: mem.size }); };

function mark(c: Coll, id: string, fixedAt?: number) {
  if (!uid) return;
  const key = c + ":" + id, now = Date.now(), cur = mem.get(key);
  const at = fixedAt ?? Math.max(now, (known.get(key) ?? 0) + 1);
  mem.set(key, { key, c, id, at, first: cur?.first || now, last: now });
  unsaved.add(key); removed.delete(key);
  if (!saveTimer) saveTimer = window.setTimeout(saveOutbox, 200);
  // uma importação marca milhares de uma vez: o relógio e o contador são atualizados uma vez só
  if (!tickQueued) {
    tickQueued = true;
    setTimeout(() => { tickQueued = false; setPending(); scheduleNext(); }, 30);
  }
}
function saveOutbox() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
  const put: OutRow[] = [];
  unsaved.forEach((k) => { const e = mem.get(k); if (e) put.push({ key: e.key, c: e.c, id: e.id, at: e.at }); });
  const del = [...removed];
  unsaved.clear(); removed.clear();
  if (!idbOk) return Promise.resolve();
  return outboxWrite(put, del).catch(() => { idbOk = false; });
}
function forget(key: string) { if (mem.delete(key)) { unsaved.delete(key); removed.add(key); } }

const dueOf = (e: Entry) => { const d = SLOW[e.c as Coll] ?? DELAY; return Math.min(e.first + Math.max(MAX_WAIT, d), e.last + d); };

/* ---------- ler o valor atual de um registro ---------- */
let attemptCache: { of: Attempt[]; map: Map<string, Attempt> } | null = null;
const attemptMap = () => {
  const all = useStore.getState().attempts;
  if (attemptCache?.of !== all) attemptCache = { of: all, map: new Map(all.map((a) => [attemptId(a), a])) };
  return attemptCache.map;
};

/** o que está no localStorage dá para ler sem esperar. `undefined`: o registro não existe mais, vai como apagado */
function readLocal(c: string, id: string): unknown {
  const st = useStore.getState();
  switch (c) {
    case "settings": return st.settings;
    case "session": return st.sessions[id];
    case "attempt": return attemptMap().get(id);
    case "plan": return st.plan ?? undefined;
    case "saved": return st.saved[id] != null ? { at: st.saved[id] } : undefined;
    case "qnote": return st.notes[id];
    case "qtag": return st.qtags[id];
    case "review": return st.reviews[id];
    case "meta": return { onboarded: st.onboarded, celebrated: st.celebrated };
    case "goals": return plain(useGoals.getState());
    case "prefs": return { tema: usePrefs.getState().tema };
    case "study": return useAuth.getState().profile ?? undefined;
    case "fc_config": return plain(useFc.getState());
    case "fc_draft": return useDrafts.getState().drafts.find((d) => d.id === id);
    case "treino": { const t = useTreino.getState(); return id === "dia" ? { dia: t.dia, sequencia: t.sequencia } : t.itens[id]; }
    default: return undefined;
  }
}

type Item = { entry: Entry; last: number; json: string; bytes: number };
function toItem(e: Entry, data: unknown): Item | null {
  const json = JSON.stringify(data === undefined ? { c: e.c, id: e.id, deleted: true, at: e.at } : { c: e.c, id: e.id, data, at: e.at });
  const bytes = encoder.encode(json).length;
  if (bytes > MAX_RECORD) {
    console.warn("[sync] registro grande demais, fica só neste aparelho:", e.key, bytes);
    forget(e.key);
    return null;
  }
  return { entry: e, last: e.last, json, bytes };
}

/** monta um lote: até 500 registros e 6 MB */
async function buildBatch(entries: Entry[]): Promise<Item[]> {
  const ofColl = (c: string) => entries.filter((e) => e.c === c).map((e) => e.id);
  const [decks, cards, logs, media] = await Promise.all([
    readMany<DeckRec>("decks", ofColl("fc_deck")), readMany<CardRec>("cards", ofColl("fc_card")),
    readMany<RevLog>("revlog", ofColl("fc_revlog")), mediaGetMany(ofColl("fc_media")),
  ]);
  const out: Item[] = [];
  let total = 0;
  for (const e of entries) {
    const data = e.c === "fc_deck" ? decks.get(e.id) : e.c === "fc_card" ? stripQueue(cards.get(e.id)) : e.c === "fc_revlog" ? logs.get(e.id) : e.c === "fc_media" ? media.get(e.id) : readLocal(e.c, e.id);
    const it = toItem(e, data);
    if (!it) continue;
    if (total + it.bytes > MAX_BYTES && out.length) break;
    out.push(it); total += it.bytes;
  }
  return out;
}
/** a fila calculada de cada card (`q`) é refeita em quem recebe */
const stripQueue = (c: CardRec | undefined) => { if (!c) return c; const { q: _q, ...rest } = c; return rest; };

class AuthLost extends Error {}
class Offline extends Error {}
class Retry extends Error {}

function confirmSent(items: Item[]) {
  for (const it of items) {
    known.set(it.entry.key, Math.max(it.entry.at, known.get(it.entry.key) ?? 0));
    if (mem.get(it.entry.key)?.last === it.last) forget(it.entry.key);
  }
  setPending();
}

async function postItems(items: Item[], keepalive = false) {
  return fetch("/api/sync/push", {
    method: "POST", credentials: "same-origin", keepalive,
    headers: { "Content-Type": "application/json" },
    body: '{"changes":[' + items.map((i) => i.json).join(",") + "]}",
  });
}

async function sendBatch(items: Item[]): Promise<void> {
  let res: Response;
  try { res = await postItems(items); } catch { throw new Offline(); }
  if (res.status === 401) throw new AuthLost();
  if (res.status === 400 || res.status === 413) {
    // um registro recusado não pode travar a fila inteira: divide até achar qual é
    if (items.length === 1) {
      console.warn("[sync] o servidor recusou o registro:", items[0].entry.key, await res.text().catch(() => ""));
      forget(items[0].entry.key); setPending();
      return;
    }
    const mid = Math.ceil(items.length / 2);
    await sendBatch(items.slice(0, mid));
    await sendBatch(items.slice(mid));
    return;
  }
  if (!res.ok) throw new Retry(String(res.status));
  confirmSent(items);
}

async function pushDue(all: boolean) {
  await saveOutbox();
  for (;;) {
    const now = Date.now(), ready: Entry[] = [];
    for (const e of mem.values()) {
      if (all || dueOf(e) <= now) { ready.push(e); if (ready.length >= MAX_BATCH) break; }
    }
    if (!ready.length) return;
    if (useStatus.getState().state !== "enviando") useStatus.setState({ state: "enviando" });
    const batch = await buildBatch(ready);
    if (batch.length) await sendBatch(batch);
    await saveOutbox();
    // uma importação grande vai aos poucos, sem ocupar a tela nem o servidor
    if (mem.size > MAX_BATCH) await sleep(60);
  }
}

/* ---------- ao fechar ou esconder a aba ---------- */
function beacon() {
  void saveOutbox();
  const items: Item[] = [];
  let bytes = 0, hasIdb = false;
  for (const e of mem.values()) {
    if (IDB_COLLS.has(e.c)) { hasIdb = true; continue; }
    const it = toItem(e, readLocal(e.c, e.id));
    if (!it) continue;
    if (bytes + it.bytes > KEEPALIVE_BYTES) break;
    items.push(it); bytes += it.bytes;
  }
  if (items.length) postItems(items, true).then((r) => { if (r.ok) confirmSent(items); }).catch(() => { /* fica na fila */ });
  if (hasIdb) kick({ all: true });
}

/* ---------- entrada ---------- */
type Incoming = { c: Coll; id: string; data: any; deleted: boolean; at: number; origin: "app" | "ia"; seq: number };

const applied = { fc: false };

async function applyChanges(changes: Incoming[], first: boolean) {
  const uidNow = uid!;
  const st = useStore.getState();
  let sessions = st.sessions, attempts = st.attempts, saved = st.saved, notes = st.notes, reviews = st.reviews, qtags = st.qtags;
  const patch: Record<string, unknown> = {};
  const addAttempts: Attempt[] = [], dropAttempts = new Set<string>();
  const cards: CardRec[] = [], cardsGone: string[] = [], decks: DeckRec[] = [], decksGone: string[] = [], logs: RevLog[] = [], logsGone: string[] = [];
  const mediaPut: [string, MediaRef][] = [], mediaGone: string[] = [];
  let drafts: Draft[] | null = null;
  const editDrafts = () => (drafts ||= [...useDrafts.getState().drafts]);
  const seenIa: Incoming[] = [];
  const noticed = Number(localStorage.getItem(noticedKey(uidNow)) || 0);
  let topSeq = noticed;
  const existedDeck = new Set<string>();

  for (const ch of changes) {
    const key = ch.c + ":" + ch.id, at = Number(ch.at), seq = Number(ch.seq);
    if (ch.origin === "ia" && !ch.deleted && !first && seq > noticed) seenIa.push(ch);
    if (seq > topSeq) topSeq = seq;
    const pending = mem.get(key);
    if (pending && pending.at >= at) continue; // o que está aqui é mais novo: vai vencer lá
    if ((known.get(key) ?? -1) >= at) continue; // eco do que este aparelho mandou, ou versão mais velha
    known.set(key, at);
    if (pending) forget(key);
    const d = ch.data;
    switch (ch.c) {
      case "settings":
        if (!ch.deleted && d) patch.settings = { ...DEFAULT_SETTINGS, ...d, leitura: { ...DEFAULT_SETTINGS.leitura, ...(d.leitura || {}) } } as Settings;
        break;
      case "session":
        if (ch.deleted ? !sessions[ch.id] : same(st.sessions[ch.id], d)) break;
        if (sessions === st.sessions) sessions = { ...sessions };
        if (ch.deleted) delete sessions[ch.id]; else sessions[ch.id] = normalizeSession(ch.id, d, at);
        break;
      case "attempt":
        if (ch.deleted) dropAttempts.add(ch.id);
        else if (d) addAttempts.push(d as Attempt);
        break;
      case "plan":
        patch.plan = ch.deleted || !d ? null : ({ ajustes: {}, resolvidoAte: null, criadoEm: at, simulado: { freq: "nenhum", dia: 6 }, ...d } as Plan);
        break;
      case "saved":
        if (saved === st.saved) saved = { ...saved };
        if (ch.deleted) delete saved[ch.id]; else saved[ch.id] = d?.at ?? at;
        break;
      case "qnote":
        if (notes === st.notes) notes = { ...notes };
        if (ch.deleted) delete notes[ch.id]; else notes[ch.id] = d as Note;
        break;
      case "qtag":
        if (qtags === st.qtags) qtags = { ...qtags };
        if (ch.deleted) delete qtags[ch.id]; else qtags[ch.id] = d as { tags: string[]; at: number };
        break;
      case "review":
        if (reviews === st.reviews) reviews = { ...reviews };
        if (ch.deleted) delete reviews[ch.id]; else reviews[ch.id] = d as Review;
        break;
      case "meta":
        if (!ch.deleted && d) { patch.onboarded = !!d.onboarded; patch.celebrated = d.celebrated || {}; }
        break;
      case "goals":
        if (!ch.deleted && d) quietly(() => useGoals.setState((s) => ({ ...d, minimo: { ...s.minimo, ...(d.minimo || {}) } })));
        break;
      case "prefs":
        if (!ch.deleted && d?.tema) quietly(() => usePrefs.setState({ tema: d.tema }));
        break;
      case "study":
        quietly(() => useAuth.setState({ profile: ch.deleted ? null : d }));
        break;
      case "treino":
        // o progresso do treino de digitar: um registro por item e o "do dia"
        quietly(() => useTreino.setState((s) => {
          if (ch.id === "dia") return ch.deleted || !d ? {} : { dia: (d.dia as TreinoDia | null) ?? null, sequencia: Number(d.sequencia) || 0, diaEm: ch.at };
          const itens = { ...s.itens };
          if (ch.deleted || !d) delete itens[ch.id]; else itens[ch.id] = d as TreinoRegistro;
          return { itens };
        }));
        break;
      case "fc_config":
        if (!ch.deleted && d) quietly(() => useFc.setState({
          ...d,
          presets: Object.fromEntries(Object.entries({ [DEFAULT_ID]: presetDefaults(), ...(d.presets || {}) }).map(([k, v]) => [k, { ...presetDefaults(k, (v as { name: string }).name), ...(v as object) }])),
          paused: d.paused || {}, deckLimits: d.deckLimits || {}, deckPreset: d.deckPreset || {}, today: d.today || {},
        }));
        break;
      case "fc_draft": {
        const list = editDrafts(), i = list.findIndex((x) => x.id === ch.id);
        if (ch.deleted) { if (i >= 0) list.splice(i, 1); }
        else if (i >= 0) list[i] = { ...d, id: ch.id };
        else list.unshift({ origin: "ia", at, front: "", back: "", ...d, id: ch.id });
        break;
      }
      case "fc_deck":
        if (ch.deleted) decksGone.push(ch.id);
        else decks.push({ file: "", importedAt: at, cards: 0, images: 0, groups: [], ...d, id: ch.id });
        break;
      case "fc_card":
        if (ch.deleted) cardsGone.push(ch.id);
        else {
          const card = { path: [], kind: "basic", fields: [], ord: 0, due: at, ivl: 0, ease: 2.5, reps: 0, lapses: 0, step: 0, isNew: 1, order: at, ...d, id: ch.id };
          // baralho de outra pessoa: o texto veio do servidor e pode ter HTML que ela escreveu
          if (card.src?.shared) card.fields = card.fields.map(cleanCardHtml);
          cards.push(card);
        }
        break;
      case "fc_revlog":
        if (ch.deleted) logsGone.push(ch.id); else logs.push({ ...d, id: ch.id });
        break;
      case "fc_media":
        if (ch.deleted) mediaGone.push(ch.id); else if (d?.hash) mediaPut.push([ch.id, d as MediaRef]);
        break;
    }
  }

  if (addAttempts.length || dropAttempts.size) {
    const have = new Set(attempts.map(attemptId));
    const fresh = addAttempts.filter((a) => !have.has(attemptId(a)));
    attempts = attempts.filter((a) => !dropAttempts.has(attemptId(a)));
    if (fresh.length) attempts = [...attempts, ...fresh].sort((a, b) => a.at - b.at);
  }
  if (sessions !== st.sessions) patch.sessions = sessions;
  if (attempts !== st.attempts) patch.attempts = attempts;
  if (saved !== st.saved) patch.saved = saved;
  if (notes !== st.notes) patch.notes = notes;
  if (reviews !== st.reviews) patch.reviews = reviews;
  if (qtags !== st.qtags) patch.qtags = qtags;
  if (Object.keys(patch).length) quietly(() => useStore.setState(patch));
  if (drafts) { const list = drafts as Draft[]; quietly(() => useDrafts.setState({ drafts: list })); }

  // o que mora no IndexedDB
  if (seenIa.some((c) => c.c === "fc_deck")) (await allDecks()).forEach((d) => existedDeck.add(d.id));
  if (decks.length) await putMany("decks", decks, true);
  for (const id of decksGone) await deleteDeck(id, true);
  if (cards.length) await putMany("cards", cards, true);
  if (cardsGone.length) await deleteCards(cardsGone, true);
  if (logs.length || logsGone.length) await applyLogs(logs, logsGone);
  if (mediaPut.length || mediaGone.length) {
    await mediaWrite(mediaPut, mediaGone);
    if (mediaGone.length) await deleteMedia(mediaGone);
  }
  if (decks.length || decksGone.length || cards.length || cardsGone.length || logs.length || logsGone.length) applied.fc = true;

  if (seenIa.length) noticesFor(seenIa, st, existedDeck);
  if (topSeq > noticed) localStorage.setItem(noticedKey(uidNow), String(topSeq));
}

function normalizeSession(id: string, d: Partial<Session>, at: number): Session {
  return {
    kind: "lista", title: "Lista", qids: [], feedback: useStore.getState().settings.feedbackLista, createdAt: at, limitSec: null, answers: {}, marked: {},
    cur: 0, elapsedMs: 0, status: "ativa", source: { type: "ia" }, ...d, id,
  } as Session;
}

let noticeSeq = 0;
/** um aviso só, por sincronização: vários do mesmo tipo viram uma parte da frase, e o link leva ao que mudou */
function noticesFor(list: Incoming[], before: ReturnType<typeof useStore.getState>, existedDeck: Set<string>) {
  const of = (c: Coll) => list.filter((x) => x.c === c);
  const n = (k: number, one: string, many: string) => (k === 1 ? `1 ${one}` : `${k.toLocaleString("pt-BR")} ${many}`);
  const parts: { text: string; to: string }[] = [];
  const decks = of("fc_deck");
  const inDeck = (id: string) => of("fc_card").filter((c) => c.data?.deck === id).length;
  if (decks.length === 1) {
    const d = decks[0], k = inDeck(d.id), name = d.data?.name || "";
    parts.push({
      text: existedDeck.has(d.id) ? (k ? `criou ${n(k, "card", "cards")} no baralho ${name}` : `atualizou o baralho ${name}`) : `criou o baralho ${name}${k ? ` com ${n(k, "card", "cards")}` : ""}`,
      to: "/flashcards/baralho/" + encodeURIComponent(d.id),
    });
  } else if (decks.length) parts.push({ text: `mexeu em ${decks.length} baralhos`, to: "/flashcards" });
  const deckIds = new Set(decks.map((d) => d.id));
  const boosted = of("fc_card").filter((c) => c.data?.boost);
  if (boosted.length) parts.push({ text: `separou ${n(boosted.length, "card", "cards")} para a sua próxima revisão`, to: "/analises/" + boosted[0].data.boost });
  const cards = of("fc_card").filter((c) => !deckIds.has(c.data?.deck) && !c.data?.boost);
  if (cards.length) {
    const homes = new Set(cards.map((c) => c.data?.deck));
    parts.push({ text: `criou ${n(cards.length, "card", "cards")}`, to: homes.size === 1 ? "/flashcards/baralho/" + encodeURIComponent([...homes][0]) : "/flashcards" });
  }
  const sessions = of("session");
  if (sessions.length === 1) {
    const s = sessions[0];
    parts.push({ text: `${before.sessions[s.id] ? "atualizou" : "montou"} a lista ${s.data?.title || ""}`.trim(), to: "/sessao/" + s.id });
  } else if (sessions.length) parts.push({ text: `montou ${sessions.length} listas`, to: "/questoes" });
  if (of("plan").length) parts.push({ text: "atualizou o cronograma", to: "/cronograma" });
  else if (of("goals").length) parts.push({ text: "ajustou suas metas", to: "/cronograma/metas" });
  const drafts = of("fc_draft");
  if (drafts.length) parts.push({ text: `deixou ${n(drafts.length, "rascunho de card", "rascunhos de cards")} para você revisar`, to: "/flashcards/ia" });
  const tags = of("qtag");
  if (tags.length) parts.push({ text: `etiquetou ${n(tags.length, "questão", "questões")}`, to: "/questoes/salvas" });
  const marks = [...of("saved"), ...of("qnote")];
  if (marks.length) parts.push({ text: `salvou ${n(marks.length, "questão", "questões")}`, to: "/questoes/salvas" });
  if (of("settings").length || of("prefs").length) parts.push({ text: "mudou seus ajustes", to: "/perfil/ajustes" });
  if (of("fc_config").length) parts.push({ text: "mudou as opções de um baralho", to: "/flashcards" });
  if (!parts.length) return;
  const last = parts[parts.length - 1].text, head = parts.slice(0, -1).map((p) => p.text).join(", ");
  const text = `Sua IA ${head ? head + " e " : ""}${last}`;
  useSyncNotices.setState((s) => ({ items: [...s.items, { id: ++noticeSeq, text, to: parts.length === 1 ? parts[0].to : "/plugin/atividade" }] }));
}

async function pullAll() {
  const u = uid!;
  let cursor = Number(localStorage.getItem(cursorKey(u)) || 0);
  const adopting = !!localStorage.getItem(adoptKey(u));
  if (adopting) cursor = 0; // precisa saber tudo que o servidor já tem antes de adotar o que está aqui
  const first = cursor === 0;
  const serverKeys = new Set<string>();
  for (;;) {
    let res: Response;
    try { res = await fetch(`/api/sync/pull?since=${cursor}&limit=1000`, { credentials: "same-origin" }); } catch { throw new Offline(); }
    if (res.status === 401) throw new AuthLost();
    if (!res.ok) throw new Retry(String(res.status));
    const page = await res.json() as { changes: Incoming[]; cursor: number; more: boolean };
    if (uid !== u) return; // saiu no meio
    pulledSomething = true;
    if (adopting) for (const c of page.changes) serverKeys.add(c.c + ":" + c.id);
    await applyChanges(page.changes, first);
    cursor = Number(page.cursor);
    localStorage.setItem(cursorKey(u), String(cursor));
    if (!page.more) break;
    await sleep(0);
  }
  if (applied.fc) {
    applied.fc = false;
    void useDeckStore.getState().refresh();
    void useCardsDone.getState().refresh();
  }
  if (adopting) {
    await adoptLocal(serverKeys);
    localStorage.removeItem(adoptKey(u));
  }
}

/** o que já estava neste navegador e o servidor ainda não tem: entra na fila */
async function adoptLocal(server: Set<string>) {
  const add = (c: Coll, id: string, at?: number) => { if (!server.has(c + ":" + id)) mark(c, id, at); };
  const st = useStore.getState();
  if (!same(st.settings, DEFAULT_SETTINGS)) add("settings", "main");
  Object.values(st.sessions).forEach((s) => add("session", s.id, s.finishedAt || s.createdAt));
  st.attempts.forEach((a) => add("attempt", attemptId(a), a.at));
  if (st.plan) add("plan", "main", st.plan.criadoEm);
  Object.entries(st.saved).forEach(([q, at]) => add("saved", q, at));
  Object.entries(st.notes).forEach(([q, n]) => add("qnote", q, n.at));
  Object.entries(st.reviews).forEach(([q, r]) => add("review", q, r.at));
  Object.entries(st.qtags).forEach(([q, t]) => add("qtag", q, t.at));
  if (st.onboarded || Object.keys(st.celebrated).length) add("meta", "main");
  const g = useGoals.getState();
  if (Object.keys(g.prefs).length || Object.keys(g.proporcoes).length || g.eventos.length || Object.keys(g.regras).length || Object.keys(g.cardGoals).length || Object.keys(g.plantao).length || Object.keys(g.fechados).length || Object.keys(g.marcos).length || g.passosOk || g.minimo.questoes !== 10 || g.minimo.cards !== 20) add("goals", "main");
  if (usePrefs.getState().tema !== "sistema") add("prefs", "main");
  if (useAuth.getState().profile) add("study", "main");
  const tr = useTreino.getState();
  Object.entries(tr.itens).forEach(([k, r]) => add("treino", k, r.ultima));
  if (tr.dia) add("treino", "dia", tr.diaEm || undefined);
  const fc = useFc.getState();
  if (Object.keys(fc.presets).length > 1 || !same(fc.presets[DEFAULT_ID], presetDefaults()) || Object.keys(fc.deckPreset).length || Object.keys(fc.paused).length || Object.keys(fc.deckLimits).length || Object.keys(fc.today).length) add("fc_config", "main");
  useDrafts.getState().drafts.forEach((d) => add("fc_draft", d.id, d.at));
  try {
    (await allDecks()).forEach((d) => add("fc_deck", d.id, d.importedAt));
    (await cardIds()).forEach((id) => add("fc_card", id));
    (await logIds()).forEach((id) => add("fc_revlog", id));
    const local = await mediaKeys();
    const known = new Set(await mediaIndexKeys());
    queueMedia(local.filter((k) => !known.has(k) && !server.has("fc_media:" + k)));
  } catch { /* sem IndexedDB: nada de flashcards para adotar */ }
}

/* ---------- o laço ---------- */
let uid: string | null = null;
let running = false;
let want: { all?: boolean; pull?: boolean } | null = null;
let wantAfterRetry: { all?: boolean; pull?: boolean } | null = null;
let timer = 0, pollTimer = 0;
let retryAt = 0, backoff = 0;
let lastPull = 0;
let pulledSomething = false;

function kick(o: { all?: boolean; pull?: boolean } = {}) {
  want = { all: want?.all || o.all, pull: want?.pull || o.pull };
  if (!running) void run();
}

async function run() {
  running = true;
  while (want && uid) {
    const o = want; want = null;
    try {
      if (!navigator.onLine) throw new Offline();
      await pushDue(!!o.all);
      if (o.pull) { await pullAll(); lastPull = Date.now(); }
      backoff = 0; retryAt = 0;
      useStatus.setState({ state: "ocioso", lastAt: Date.now(), ready: true });
      setPending();
    } catch (e) {
      if (e instanceof AuthLost) {
        // a sessão acabou (trocou a senha em outro aparelho, por exemplo): a fila fica guardada para a próxima entrada
        useStatus.setState({ state: "erro", ready: true });
        useAuth.getState().refreshMe().catch(() => { /* sem resposta: a próxima tentativa decide */ });
        break;
      }
      backoff = Math.min(BACKOFF_MAX, backoff ? backoff * 2 : 2_000);
      retryAt = Date.now() + backoff + Math.random() * 500;
      if (!(e instanceof Offline) && !(e instanceof Retry)) console.warn("[sync]", e);
      useStatus.setState({ state: e instanceof Offline ? "sem_conexao" : "erro", ready: true });
      setPending();
      if (o.pull || o.all) wantAfterRetry = { all: o.all, pull: o.pull };
      break;
    }
  }
  running = false;
  scheduleNext();
}

function scheduleNext() {
  if (timer) { clearTimeout(timer); timer = 0; }
  if (!uid || running) return;
  const now = Date.now();
  let next = Infinity;
  if (wantAfterRetry) next = retryAt;
  for (const e of mem.values()) { next = Math.min(next, dueOf(e)); if (next <= now) break; }
  if (next === Infinity) return;
  timer = window.setTimeout(() => {
    timer = 0;
    const again = wantAfterRetry; wantAfterRetry = null;
    kick(again || {});
  }, Math.max(250, Math.max(next, retryAt) - now));
}

/** sincroniza agora: envia tudo e recebe, ignorando a espera */
/** traz agora o que o servidor acabou de gravar (assinar um baralho) e espera terminar. Sem rede, chega na próxima sincronização. */
export async function pullNow() {
  if (!uid) return;
  try { await pullAll(); } catch { syncNow(); }
}

/** o servidor já tem este arquivo? Devolve o endereço sem precisar enviar */
export async function reuseMedia(hash: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/fc-media/${hash}/reuse`, { method: "POST", credentials: "same-origin" });
    return res.ok ? ((await res.json()).url as string) : null;
  } catch { return null; }
}

export function syncNow() {
  retryAt = 0; backoff = 0; wantAfterRetry = null;
  kick({ all: true, pull: true });
}

/* ---------- observar os estados ---------- */
function diffRecord<V>(c: Coll, next: Record<string, V>, prev: Record<string, V>, atOf?: (v: V) => number) {
  if (next === prev) return;
  for (const id in next) if (next[id] !== prev[id]) mark(c, id, atOf ? atOf(next[id]) : undefined);
  for (const id in prev) if (!(id in next)) mark(c, id);
}

function observe(): () => void {
  const offs: (() => void)[] = [];
  offs.push(useStore.subscribe((s, p) => {
    if (isQuiet() || s.demo || p.demo) return;
    if (s.settings !== p.settings) mark("settings", "main");
    diffRecord("session", s.sessions, p.sessions);
    if (s.attempts !== p.attempts) {
      const n = p.attempts.length;
      if (s.attempts.length >= n && (n === 0 || s.attempts[n - 1] === p.attempts[n - 1])) s.attempts.slice(n).forEach((a) => mark("attempt", attemptId(a), a.at));
      else {
        const was = new Set(p.attempts.map(attemptId)), is = new Set(s.attempts.map(attemptId));
        s.attempts.forEach((a) => { if (!was.has(attemptId(a))) mark("attempt", attemptId(a), a.at); });
        p.attempts.forEach((a) => { if (!is.has(attemptId(a))) mark("attempt", attemptId(a)); });
      }
    }
    if (s.plan !== p.plan) mark("plan", "main");
    if (s.saved !== p.saved) diffRecord("saved", s.saved, p.saved, (at) => at);
    diffRecord("qnote", s.notes, p.notes);
    diffRecord("qtag", s.qtags, p.qtags);
    diffRecord("review", s.reviews, p.reviews);
    if (s.onboarded !== p.onboarded || s.celebrated !== p.celebrated) mark("meta", "main");
  }));
  offs.push(useGoals.subscribe((s, p) => {
    if (isQuiet()) return;
    if (s.prefs !== p.prefs || s.proporcoes !== p.proporcoes || s.eventos !== p.eventos || s.regras !== p.regras || s.cardGoals !== p.cardGoals || s.minimo !== p.minimo || s.plantao !== p.plantao || s.fechados !== p.fechados || s.marcos !== p.marcos || s.passosOk !== p.passosOk || s.desde !== p.desde) mark("goals", "main");
  }));
  offs.push(usePrefs.subscribe((s, p) => { if (!isQuiet() && s.tema !== p.tema) mark("prefs", "main"); }));
  offs.push(useTreino.subscribe((s, p) => {
    if (isQuiet() || useStore.getState().demo) return;
    diffRecord("treino", s.itens, p.itens, (r) => r.ultima);
    if (s.dia !== p.dia || s.sequencia !== p.sequencia) mark("treino", "dia", s.diaEm || undefined);
  }));
  offs.push(useAuth.subscribe((s, p) => { if (!isQuiet() && s.profile !== p.profile) mark("study", "main"); }));
  offs.push(useFc.subscribe((s, p) => {
    if (isQuiet()) return;
    if (s.presets !== p.presets || s.deckPreset !== p.deckPreset || s.paused !== p.paused || s.deckLimits !== p.deckLimits || s.today !== p.today) mark("fc_config", "main");
  }));
  offs.push(useDrafts.subscribe((s, p) => {
    if (isQuiet() || s.drafts === p.drafts) return;
    const was = new Map(p.drafts.map((d) => [d.id, d]));
    for (const d of s.drafts) { if (was.get(d.id) !== d) mark("fc_draft", d.id); was.delete(d.id); }
    for (const id of was.keys()) mark("fc_draft", id);
  }));
  setSyncHooks({
    dirty: (c, ids) => ids.forEach((id) => mark(c, id)),
    mediaAdded: (keys) => queueMedia(keys),
    mediaRemoved: (keys) => {
      keys.forEach((k) => { mediaQueue.delete(k); mark("fc_media", k); });
      void mediaWrite([], keys).catch(() => {}); void queueWrite([], keys).catch(() => {});
    },
    fetchMedia: downloadMedia,
  });
  offs.push(() => setSyncHooks({ fetchMedia: downloadMedia }));

  const onVisible = () => {
    if (document.visibilityState === "hidden") { beacon(); return; }
    if (Date.now() - lastPull > FOCUS_GAP) kick({ pull: true });
  };
  const onOnline = () => { useStatus.setState({ state: "ocioso" }); syncNow(); pumpMedia(); };
  const onOffline = () => useStatus.setState({ state: "sem_conexao" });
  const onStorage = (e: StorageEvent) => { if (e.key === OWNER && e.newValue !== uid) location.reload(); };
  document.addEventListener("visibilitychange", onVisible);
  addEventListener("focus", onVisible);
  addEventListener("pagehide", beacon);
  addEventListener("online", onOnline);
  addEventListener("offline", onOffline);
  addEventListener("storage", onStorage);
  pollTimer = window.setInterval(() => { if (document.visibilityState === "visible") kick({ pull: true }); }, POLL);
  offs.push(() => {
    document.removeEventListener("visibilitychange", onVisible);
    removeEventListener("focus", onVisible);
    removeEventListener("pagehide", beacon);
    removeEventListener("online", onOnline);
    removeEventListener("offline", onOffline);
    removeEventListener("storage", onStorage);
    clearInterval(pollTimer);
  });
  return () => offs.forEach((f) => f());
}

/* ---------- começar e parar ---------- */
let unobserve: (() => void) | null = null;

/** outra conta entrou neste navegador? Apaga o que é da anterior antes de qualquer coisa e recarrega limpo */
export async function guardOwner(id: string): Promise<boolean> {
  const owner = localStorage.getItem(OWNER);
  if (!owner || owner === id) return true;
  await wipeLocal();
  localStorage.setItem(OWNER, id);
  freezeStorage();
  location.reload();
  return false;
}

/** começa a espelhar para esta pessoa */
export async function startSync(id: string) {
  if (uid === id) return;
  if (uid) stopSync();
  if (!localStorage.getItem(OWNER)) {
    localStorage.setItem(adoptKey(id), "1");
    // os dados de exemplo (só em desenvolvimento) não viram dados da conta
    if (useStore.getState().demo) quietly(() => useStore.getState().resetAll());
  }
  localStorage.setItem(OWNER, id);
  uid = id;
  useStatus.setState({ state: "ocioso", ready: false, lastAt: null, pending: 0 });
  unobserve = observe();
  // servidor mudo: a tela não fica esperando. Se as páginas estão chegando, espera, porque o "já fez as boas-vindas" pode vir no fim
  pulledSomething = false;
  setTimeout(() => { if (uid === id && !pulledSomething && !useStatus.getState().ready) useStatus.setState({ ready: true }); }, 10_000);
  try {
    const [rows, q] = await Promise.all([outboxAll(), queueAll()]);
    for (const r of rows) if (!mem.has(r.key)) mem.set(r.key, { ...r, first: 1, last: 1 });
    q.forEach((k) => mediaQueue.add(k));
    idbOk = true;
  } catch { idbOk = false; }
  if (uid !== id) return;
  setPending();
  kick({ pull: true, all: true });
  pumpMedia();
}

export function stopSync(keepQueue = true) {
  if (keepQueue && uid) void saveOutbox();
  unobserve?.(); unobserve = null;
  uid = null;
  if (timer) { clearTimeout(timer); timer = 0; }
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
  want = null; wantAfterRetry = null; retryAt = 0; backoff = 0;
  mem.clear(); unsaved.clear(); removed.clear(); known.clear(); mediaQueue.clear();
  useStatus.setState({ state: "ocioso", lastAt: null, pending: 0, ready: false });
}

/** antes de sair: tenta mandar o que falta. Devolve quantos itens não foram (sem rede, por exemplo) */
export async function flushBeforeLeaving(timeoutMs = 8_000) {
  if (!uid) return 0;
  retryAt = 0; backoff = 0;
  kick({ all: true });
  const end = Date.now() + timeoutMs;
  while (Date.now() < end && (mem.size || running) && navigator.onLine) {
    await sleep(150);
    if (!running && mem.size) { if (useStatus.getState().state !== "ocioso") break; kick({ all: true }); }
  }
  return mem.size;
}

const deleteIdb = (name: string) => new Promise<void>((res) => {
  try {
    const r = indexedDB.deleteDatabase(name);
    const t = setTimeout(res, 1_500); // outra aba segurando: segue, ela fecha ao receber o aviso
    r.onsuccess = r.onerror = () => { clearTimeout(t); res(); };
  } catch { res(); }
});

/** apaga tudo que o app guarda neste navegador */
export async function wipeLocal() {
  stopSync(false);
  await closeDb();
  await closeSyncDb();
  await Promise.all([deleteIdb("conduta-flashcards"), deleteIdb("conduta-sync")]);
  Object.keys(localStorage).filter((k) => k === "conduta" || k.startsWith("conduta-")).forEach((k) => localStorage.removeItem(k));
}
/** até recarregar, nada mais grava: um cronômetro atrasado não pode recriar os dados que acabaram de sair */
export function freezeStorage() {
  Storage.prototype.setItem = function noop() { /* a página vai recarregar */ };
}

/* ---------- imagens dos baralhos ---------- */
const mediaQueue = new Set<string>();
const uploaded = new Map<string, string>();
let pumping = false;
const MEDIA_LIMIT = 10_000_000;

function queueMedia(keys: string[]) {
  if (!keys.length) return;
  keys.forEach((k) => mediaQueue.add(k));
  void queueWrite(keys, []).catch(() => {});
  pumpMedia();
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function uploadOne(key: string): Promise<"ok" | "retry" | "stop"> {
  const blob = await getLocalMedia(key);
  if (!blob || blob.size > MEDIA_LIMIT) return "ok";
  const hash = hex(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  let url = uploaded.get(hash) ?? (await reuseMedia(hash)) ?? undefined;
  if (url) uploaded.set(hash, url);
  if (!url) {
    let res: Response;
    try {
      res = await fetch("/api/fc-media/" + hash, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
    } catch { return "stop"; }
    if (res.status === 401) return "stop";
    if (res.status === 429 || res.status >= 500 || res.status === 404) return "retry";
    if (!res.ok) { console.warn("[sync] imagem recusada:", key, res.status); return "ok"; }
    url = (await res.json()).url as string;
    uploaded.set(hash, url);
  }
  const ext = (url.split("/").pop() || "").split(".").pop() || "bin";
  await mediaWrite([[key, { hash, ext }]], []);
  mark("fc_media", key);
  return "ok";
}

/** três ao mesmo tempo, em segundo plano; a tela não espera */
function pumpMedia() {
  if (pumping || !uid || !mediaQueue.size) return;
  pumping = true;
  const worker = async (): Promise<void> => {
    for (;;) {
      if (!uid || !navigator.onLine) return;
      const key = mediaQueue.values().next().value as string | undefined;
      if (!key) return;
      mediaQueue.delete(key);
      let r: "ok" | "retry" | "stop";
      try { r = await uploadOne(key); } catch { r = "retry"; }
      if (r === "ok") void queueWrite([], [key]).catch(() => {});
      else { mediaQueue.add(key); return; } // sem rede, servidor com problema ou limite de espaço: tenta de novo daqui a pouco
    }
  };
  void Promise.all([worker(), worker(), worker()]).finally(() => {
    pumping = false;
    if (uid && mediaQueue.size && navigator.onLine) setTimeout(pumpMedia, 30_000);
  });
}

const downloading = new Map<string, Promise<Blob | undefined>>();
/** a imagem não está neste aparelho mas está no servidor: baixa e guarda */
function downloadMedia(key: string) {
  let p = downloading.get(key);
  if (!p) {
    p = (async () => {
      try {
        const ref = await mediaGet(key);
        if (!ref) return undefined;
        const res = await fetch(`/uploads/fc/${ref.hash}.${ref.ext}`);
        if (!res.ok) return undefined;
        const blob = await res.blob();
        await putMedia([[key, blob]], true);
        return blob;
      } catch { return undefined; }
      finally { downloading.delete(key); }
    })();
    downloading.set(key, p);
  }
  return p;
}

/** o Worker da importação gravou direto no IndexedDB: agora entra tudo na fila, sem carregar os cards na memória */
export async function trackImportedDeck(deck: string) {
  if (!uid) return;
  mark("fc_deck", deck);
  // aos poucos: dezenas de milhares de chaves não podem travar a tela
  const ids = await cardIds(deck);
  for (let i = 0; i < ids.length; i += 2000) {
    ids.slice(i, i + 2000).forEach((id) => mark("fc_card", id));
    await sleep(0);
  }
  queueMedia(await mediaKeys(deck));
}

export const pendingMedia = () => mediaQueue.size;

if (import.meta.env.DEV) {
  // para conferir à mão: quanto falta, importar sem o seletor de arquivos (ver importer.ts)
  (window as unknown as Record<string, unknown>).__condutaSync = { syncNow, trackImportedDeck, status: () => useStatus.getState() };
}
// em desenvolvimento: este módulo guarda a fila e quem está conectado; trocar por uma cópia nova deixaria o app sem sincronizar
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
