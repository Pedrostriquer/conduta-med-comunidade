/* Baralhos compartilhados, de verdade: publicar um baralho seu, assinar o de outra pessoa e receber as versões novas sem
   perder o progresso. O id do card assinado guarda o `key` publicado (`<baralho>:s:<key>`): é por ele que a versão nova
   encontra o card e mantém o agendamento. Tudo é gravado pelas funções normais de db.ts, então a sincronização acompanha.
   Assinar não envia nada: o servidor já tem o baralho e copia os cards para a pessoa, que recebe pela sincronização.
   As imagens não são baixadas ao assinar: fica só a referência (fc_media) e cada uma chega quando o card aparece.
   O HTML que vem de outra pessoa nunca é confiável: passa por `cleanCardHtml` antes de ser guardado. */
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "../../api/client";
import type { SharedCard, SharedDeckCard } from "../../api/types";
import { mediaWrite } from "../../sync/idb";
import { presetFor } from "./config";
import { allDecks, deckCards, deleteCards, getMedia, isQa, putMany } from "./db";
import type { CardRec, DeckRec } from "./db";
import { useDeckStore } from "./decks";
import { ensureDeck } from "./make";
import { cleanCardHtml } from "./clean";
import { renderCard } from "./render";
import { pullNow, reuseMedia } from "../../sync/engine";

export { cleanCardHtml };

export type DeckVisibility = SharedDeckCard["visibility"];
export const VIS: Record<DeckVisibility, { label: string; hint: string; icon: string }> = {
  publico: { label: "Público", hint: "Aparece em Explorar, na busca de baralhos e no seu perfil.", icon: "globe" },
  seguidores: { label: "Só seguidores", hint: "Aparece no seu perfil só para quem você aceitou. Fora de Explorar.", icon: "users" },
  link: { label: "Só com o link", hint: "Não aparece em lugar nenhum. Só abre com o link, para quem tem conta.", icon: "lock" },
};

/** baralho assinado, como a API devolve */
export type SubDeck = SharedDeckCard & { localDeck: string; seenVersion: number };
/** o baralho local guarda o endereço de onde foi publicado: viaja pelo sync e serve para subir a versão de outro aparelho */
type PublishedRec = DeckRec & { published?: string };
export type DeckDraft = { name: string; description: string; tags: string[]; visibility: DeckVisibility };
export type MergeResult = { added: number; changed: number; removed: number; kept: number };

export const deckPath = (slug: string) => `/flashcards/compartilhados?baralho=${encodeURIComponent(slug)}`;
export const deckLink = (slug: string) => location.origin + deckPath(slug);
const SHARED_ID = ":s:";
const localIdFor = (slug: string) => "sub-" + slug;

export const isSubscribedDeck = (id: string) => id.startsWith("sub-");
export const publishedSlug = (d: DeckRec) => (d as PublishedRec).published;

/** frente e verso curtos para a prévia: sem imagem (o arquivo não está aqui) e com as lacunas à mostra */
export function previewOf(s: Pick<SharedCard, "kind" | "fields" | "ord">) {
  const fields = s.fields.map(cleanCardHtml);
  const r = renderCard({ id: "", deck: "", path: [], kind: s.kind, fields, ord: s.ord, due: 0, ivl: 0, ease: 0, reps: 0, lapses: 0, step: 0, isNew: 1, order: 0 });
  const noImg = (h: string) => h.replace(/<img\b[^>]*>/gi, '<span class="cm-imgph">imagem</span>');
  let front = r.front;
  r.slots.forEach((_, i) => { front = front.replace(`<span data-slot="${i}"></span>`, '<span class="cm-slot">[…]</span>'); });
  const back = r.answer || (r.slots.length ? r.slots.map((x) => x.answer).join(" · ") : "") || r.extra;
  return { front: noImg(front), back: noImg(back) };
}

/* ---------- publicar ---------- */
const MEDIA_RE = [/<img\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi, /<img\b[^>]*\bsrc\s*=\s*'([^']+)'/gi, /\[sound:([^\]]+)\]/g];
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export type Publication = { deck: DeckRec; cards: SharedCard[]; files: Map<string, string> };

/** o que vai ser público: o conteúdo dos cards e os arquivos usados. O agendamento, as bandeiras e o histórico ficam de fora */
export async function buildPublication(deck: DeckRec): Promise<Publication> {
  const recs = (await deckCards(deck.id)).sort((a, b) => a.order - b.order);
  const files = new Map<string, string>(); // arquivo → baralho onde ele está
  const cards: SharedCard[] = recs.map((c) => {
    for (const f of c.fields) for (const re of MEDIA_RE) {
      re.lastIndex = 0;
      for (let m = re.exec(f); m; m = re.exec(f)) if (!/^(blob:|data:|https?:)/i.test(m[1])) files.set(safeDecode(m[1]), c.media || c.deck);
    }
    return { key: c.id, kind: isQa(c.kind) ? "qa" as const : c.kind, fields: c.fields, ord: c.ord, path: c.path, tags: (c.tags || []).filter((t) => t !== "sanguessuga") };
  });
  return { deck, cards, files };
}

async function uploadFile(key: string): Promise<string | null> {
  const blob = await getMedia(key);
  if (!blob) return null;
  const hash = hex(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  const already = await reuseMedia(hash);
  if (already) return already.split("/").pop() || "";
  let res: Response;
  try { res = await fetch(`/api/fc-media/${hash}`, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob }); }
  catch { throw new ApiError(0, "sem_rede", "Sem conexão com o servidor. Confira a internet e tente de novo."); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code || "erro", data?.error?.message || "Não conseguimos enviar uma imagem do baralho.");
  return (String(data.url).split("/").pop() || "") as string;
}

/** envia as imagens e publica (ou sobe a versão, se este baralho já foi publicado). Só chamar depois de a pessoa confirmar. */
export async function publishDeck(p: Publication, draft: DeckDraft, note: string, onProgress?: (done: number, total: number) => void) {
  const entries = [...p.files], media: Record<string, string> = {};
  let done = 0, next = 0;
  const worker = async () => {
    while (next < entries.length) {
      const [file, deck] = entries[next++];
      const name = await uploadFile(`${deck}/${file}`);
      if (name) media[file] = name;
      onProgress?.(++done, entries.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const { deck } = await apiPost<{ deck: SharedDeckCard }>("/decks/publish", { localDeck: p.deck.id, ...draft, cards: p.cards, media, ...(note.trim() ? { note: note.trim() } : {}) });
  await putMany("decks", [{ ...p.deck, published: deck.slug } as PublishedRec]);
  useDeckStore.getState().refresh();
  return deck;
}

export const editPublished = (slug: string, patch: Partial<DeckDraft>) => apiPatch<{ deck: SharedDeckCard }>(`/decks/${encodeURIComponent(slug)}`, patch).then((r) => r.deck);
export const unpublish = (slug: string) => apiDelete(`/decks/${encodeURIComponent(slug)}`);

/* ---------- assinar e atualizar ---------- */
const sameList = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x, i) => x === b[i]);

function newCard(local: string, slug: string, s: SharedCard, fields: string[], order: number): CardRec {
  return {
    id: local + SHARED_ID + s.key, deck: local, path: s.path, kind: isQa(s.kind) ? "qa" : s.kind, fields, ord: s.ord, tags: s.tags,
    due: order, ivl: 0, ease: presetFor(local).startEase, reps: 0, lapses: 0, step: 0, isNew: 1, order, src: { shared: slug },
  };
}

/** traz uma versão publicada para o baralho local: mantém o agendamento dos cards que já existem, adiciona os novos e
    trata os removidos (sem estudo somem; com estudo ficam suspensos, com o histórico). Cards que a pessoa criou nele não mudam. */
async function mergeInto(local: string, name: string, slug: string, incoming: SharedCard[], media: Record<string, string>): Promise<MergeResult> {
  const rec = await ensureDeck(local, name);
  const existing = await deckCards(local);
  const prefix = local + SHARED_ID;
  const byId = new Map(existing.filter((c) => c.id.startsWith(prefix)).map((c) => [c.id, c]));
  const seen = new Set<string>(), rows: CardRec[] = [], base = Date.now();
  let added = 0, changed = 0, kept = 0;
  incoming.forEach((s, i) => {
    const id = prefix + s.key, cur = byId.get(id), fields = s.fields.map(cleanCardHtml);
    seen.add(id);
    if (!cur) { added++; rows.push(newCard(local, slug, s, fields, base + i)); return; }
    const same = cur.kind === s.kind && cur.ord === s.ord && sameList(cur.fields, fields) && sameList(cur.path, s.path);
    if (same && !cur.tags?.includes(GONE_TAG)) { kept++; return; }
    changed++;
    const next: CardRec = { ...cur, kind: isQa(s.kind) ? "qa" : s.kind, ord: s.ord, fields, path: s.path, tags: [...new Set([...(cur.tags || []).filter((t) => t !== GONE_TAG), ...s.tags])] };
    if (cur.tags?.includes(GONE_TAG)) delete next.suspended; // voltou numa versão nova
    rows.push(next);
  });
  const gone = [...byId.values()].filter((c) => !seen.has(c.id) && !c.tags?.includes(GONE_TAG));
  const drop = gone.filter((c) => c.isNew && !c.reps).map((c) => c.id);
  const hold = gone.filter((c) => !(c.isNew && !c.reps)).map((c): CardRec => ({ ...c, suspended: 1, tags: [...new Set([...(c.tags || []), GONE_TAG])] }));
  if (rows.length || hold.length) await putMany("cards", [...rows, ...hold]);
  if (drop.length) await deleteCards(drop);
  const total = existing.length + added - drop.length;
  const groups = [...new Set(incoming.map((s) => s.path[0]).filter(Boolean))];
  await putMany("decks", [{ ...rec, name, cards: total, images: Object.keys(media).length, groups }]);
  await rememberMedia(local, media);
  useDeckStore.getState().refresh();
  return { added, changed, removed: gone.length, kept };
}
const GONE_TAG = "removido-do-baralho";

/** guarda onde está cada imagem: o motor de sincronização baixa quando o card aparece, e o outro aparelho recebe a mesma lista */
async function rememberMedia(local: string, media: Record<string, string>) {
  const refs = Object.entries(media).map(([file, stored]): [string, { hash: string; ext: string }] => {
    const [hash, ext] = stored.split(".");
    return [`${local}/${file}`, { hash, ext }];
  });
  if (!refs.length) return;
  await mediaWrite(refs, []).catch(() => {});
  const at = Date.now();
  for (let i = 0; i < refs.length; i += 500) {
    await apiPost("/sync/push", { changes: refs.slice(i, i + 500).map(([id, data]) => ({ c: "fc_media", id, data, at })) }).catch(() => {});
  }
}

export async function subscribeDeck(d: Pick<SharedDeckCard, "slug">) {
  const local = localIdFor(d.slug);
  const r = await apiPost<{ deck: SharedDeckCard; version: number; added: number; total: number }>(`/decks/${encodeURIComponent(d.slug)}/subscribe`, { localDeck: local });
  await pullNow();
  return { deck: r.deck, local, added: r.added, total: r.total };
}

/** baixa a versão publicada para o seu baralho e marca como vista. Sem versão nova, não mexe em nada. */
export async function updateSubscription(d: SubDeck) {
  const slug = encodeURIComponent(d.slug);
  const u = await apiGet<{ version: number; cards: SharedCard[]; media: Record<string, string>; note: string }>(`/decks/${slug}/update?since=${d.seenVersion}`);
  if (u.version <= d.seenVersion || !u.cards.length) return { version: u.version, note: "", result: null };
  const result = await mergeInto(d.localDeck, d.name, d.slug, u.cards, u.media);
  await apiPost(`/decks/${slug}/seen`, { version: u.version });
  return { version: u.version, note: u.note, result };
}

/** a assinatura acaba; o baralho continua nos seus baralhos, com o seu progresso */
export const unsubscribeDeck = (slug: string) => apiDelete(`/decks/${encodeURIComponent(slug)}/subscribe`);

export async function hasLocalDeck(id: string) { return (await allDecks()).some((d) => d.id === id); }

export function mergeText(r: MergeResult) {
  const parts = [r.added ? `${r.added} ${r.added === 1 ? "novo" : "novos"}` : "", r.changed ? `${r.changed} ${r.changed === 1 ? "alterado" : "alterados"}` : "", r.removed ? `${r.removed} ${r.removed === 1 ? "removido" : "removidos"}` : ""].filter(Boolean);
  return parts.length ? `${parts.join(", ")}. Seu progresso foi mantido.` : "Nada mudou nos cards.";
}
