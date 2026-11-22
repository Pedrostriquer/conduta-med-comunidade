/* Baralhos compartilhados. O conteúdo fica em versões (as 5 últimas); `key` casa os cards, para atualizar sem perder o progresso. */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { one, q, tx } from "../db";
import { forbidden, hit, invalid, notFound, requireUser } from "../http";
import type { AppEnv } from "../http";
import { copyDeckToUser, canSeeDeck, DECK_SELECT, deckCard, decksOfUser } from "../lib/decks-store";
import type { DeckRow } from "../lib/decks-store";
import { jsonBody, jsonForDb, likeAny, noNul, zText } from "../lib/validate";
import { ownerByHandle } from "../lib/visibility";

const KEEP_VERSIONS = 5, MAX_CARDS = 200_000, SAMPLE = 5, LIST = 60;
const limit = bodyLimit({ maxSize: 200 * 1024 * 1024, onError: () => { throw invalid("Este baralho passou de 200 MB de texto."); } });

const zTags = z.array(zText().min(1).max(40)).max(30, "Use até 30 etiquetas.");
const zLevel = z.enum(["publico", "seguidores", "link"]);
const zName = zText().min(1, "Dê um nome ao baralho.").max(120, "O nome pode ter até 120 caracteres.");
const zDescription = zText().max(2000, "A descrição pode ter até 2.000 caracteres.");
const cardSchema = z.object({
  key: z.string().min(1).max(200),
  // "qa": pergunta e resposta com lacunas
  kind: z.enum(["basic", "cloze", "qa"]),
  fields: z.array(z.string()).max(20),
  ord: z.number().int(),
  path: z.array(z.string()).max(30),
  tags: z.array(z.string()).max(50),
});
// {nome do arquivo: hash.ext}: o binário já foi enviado em PUT /api/fc-media/:hash
const mediaSchema = z.record(z.string().max(300), z.string().regex(/^[a-f0-9]{64}\.[a-z0-9]{1,8}$/, "Algum arquivo do baralho não foi enviado direito."));
const publishSchema = z.object({
  localDeck: z.string().min(1).max(200).overwrite(noNul),
  name: zName,
  description: zDescription.default(""),
  tags: zTags.default([]),
  visibility: zLevel.default("publico"),
  cards: z.array(cardSchema).min(1, "O baralho está vazio.").max(MAX_CARDS, `Dá para publicar até ${MAX_CARDS} cards por baralho.`),
  media: mediaSchema.default({}),
  note: zText().max(1000, "A nota da versão pode ter até 1.000 caracteres.").default(""),
});

function slugOf(name: string) {
  const base = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "");
  const suffix = randomBytes(3).toString("hex");
  return base ? `${base}-${suffix}` : `baralho-${suffix}`;
}

async function deckBySlug(viewerId: string, slug: string) {
  return one<DeckRow>(`${DECK_SELECT} WHERE d.slug = $2 AND d.removed_at IS NULL`, [viewerId, slug]);
}
/** baralho que esta pessoa pode ver; o que ela não pode é como se não existisse */
async function visibleDeck(viewerId: string, slug: string) {
  const d = await deckBySlug(viewerId, slug);
  if (!d || !canSeeDeck(viewerId, d)) throw notFound("Não encontramos esse baralho.");
  return d;
}
async function ownDeck(viewerId: string, slug: string) {
  const d = await deckBySlug(viewerId, slug);
  if (!d) throw notFound("Não encontramos esse baralho.");
  if (d.owner_id !== viewerId) throw forbidden("Só quem publicou pode mudar este baralho.");
  return d;
}
const latest = (deckId: string, version: number) =>
  one<{ cards: unknown[]; media: Record<string, string>; note: string }>("SELECT cards, media, note FROM shared_deck_versions WHERE deck_id = $1 AND version = $2", [deckId, version]);

const r = new Hono<AppEnv>();

r.get("/decks", async (c) => {
  const me = requireUser(c), text = noNul(c.req.query("q") || "").trim().slice(0, 100);
  if (text) hit(`busca:${me.id}`, 60, 60_000);
  const order = c.req.query("sort") === "recentes" ? "d.updated_at DESC" : "d.subscribers DESC, d.updated_at DESC";
  const args: unknown[] = [me.id];
  let where = "";
  if (text) { args.push(likeAny(text)); where = "AND f_unaccent(lower(d.name || ' ' || d.description)) ILIKE f_unaccent(lower($2))"; }
  const rows = await q<DeckRow>(`${DECK_SELECT} WHERE d.visibility = 'publico' AND d.removed_at IS NULL AND u.visibility <> 'privado' ${where} ORDER BY ${order} LIMIT ${LIST}`, args);
  return c.json({ decks: rows.filter((x) => canSeeDeck(me.id, x)).map((x) => deckCard(me.id, x)) });
});

r.get("/decks/mine", async (c) => {
  const me = requireUser(c);
  return c.json({ decks: await decksOfUser(me.id, me.id) });
});

r.get("/decks/subscribed", async (c) => {
  const me = requireUser(c);
  const rows = await q<DeckRow>(`${DECK_SELECT} WHERE s.user_id = $1 AND d.removed_at IS NULL ORDER BY s.created_at DESC LIMIT 500`, [me.id]);
  return c.json({ decks: rows.filter((x) => canSeeDeck(me.id, x)).map((x) => ({ ...deckCard(me.id, x), localDeck: x.sub_local_deck!, seenVersion: x.seen_version! })) });
});

r.post("/decks/publish", limit, async (c) => {
  const me = requireUser(c);
  const b = await jsonBody(c, publishSchema);
  const cards = jsonForDb(b.cards), media = jsonForDb(b.media);
  const id = await tx(async (db) => {
    const d = await one<{ id: string; version: number }>(
      `INSERT INTO shared_decks (owner_id, local_deck, slug, name, description, tags, visibility, cards_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (owner_id, local_deck) DO UPDATE
         SET name = EXCLUDED.name, description = EXCLUDED.description, tags = EXCLUDED.tags, visibility = EXCLUDED.visibility, cards_count = EXCLUDED.cards_count,
             version = shared_decks.version + 1, updated_at = now(), removed_at = NULL
       RETURNING id, version`,
      [me.id, b.localDeck, slugOf(b.name), b.name, b.description, b.tags, b.visibility, b.cards.length], db,
    );
    await db.query("INSERT INTO shared_deck_versions (deck_id, version, cards, media, note) VALUES ($1, $2, $3, $4, $5)", [d!.id, d!.version, cards, media, b.note]);
    await db.query("DELETE FROM shared_deck_versions WHERE deck_id = $1 AND version <= $2", [d!.id, d!.version - KEEP_VERSIONS]);
    return d!.id;
  });
  const row = await one<DeckRow>(`${DECK_SELECT} WHERE d.id = $2`, [me.id, id]);
  return c.json({ deck: deckCard(me.id, row!) });
});

r.get("/decks/:slug", async (c) => {
  const me = requireUser(c), d = await visibleDeck(me.id, c.req.param("slug"));
  // só o começo do baralho, sem trazer o JSON inteiro para a memória
  const s = await one<{ sample: unknown[] }>(`SELECT jsonb_path_query_array(cards, '$[0 to ${SAMPLE - 1}]') AS sample FROM shared_deck_versions WHERE deck_id = $1 AND version = $2`, [d.id, d.version]);
  return c.json({ deck: deckCard(me.id, d), sample: s?.sample ?? [] });
});

r.patch("/decks/:slug", async (c) => {
  const me = requireUser(c), d = await ownDeck(me.id, c.req.param("slug"));
  const b = await jsonBody(c, z.object({ name: zName.optional(), description: zDescription.optional(), tags: zTags.optional(), visibility: zLevel.optional() }));
  await q(
    "UPDATE shared_decks SET name = COALESCE($2, name), description = COALESCE($3, description), tags = COALESCE($4, tags), visibility = COALESCE($5, visibility), updated_at = now() WHERE id = $1",
    [d.id, b.name ?? null, b.description ?? null, b.tags ?? null, b.visibility ?? null],
  );
  const row = await one<DeckRow>(`${DECK_SELECT} WHERE d.id = $2`, [me.id, d.id]);
  return c.json({ deck: deckCard(me.id, row!) });
});

r.delete("/decks/:slug", async (c) => {
  const me = requireUser(c), d = await ownDeck(me.id, c.req.param("slug"));
  await q("UPDATE shared_decks SET removed_at = now(), updated_at = now() WHERE id = $1", [d.id]);
  return c.body(null, 204);
});

/** quem assina passa a referenciar as mídias: elas ficam mesmo se a conta de quem publicou for apagada (sem contar na cota) */
const refMedia = (userId: string, media: unknown) => {
  const rows = Object.values((media || {}) as Record<string, string>).map((f) => /^([0-9a-f]{64})\.([a-z0-9]+)$/.exec(String(f))).filter((m): m is RegExpExecArray => !!m);
  if (!rows.length) return Promise.resolve();
  return q(
    `INSERT INTO uploads (hash, user_id, kind, ext, bytes) SELECT h, $1::uuid, 'fc', e, 0 FROM unnest($2::text[], $3::text[]) AS t(h, e) ON CONFLICT DO NOTHING`,
    [userId, rows.map((m) => m[1]), rows.map((m) => m[2])],
  ).then(() => undefined);
};

r.post("/decks/:slug/subscribe", async (c) => {
  const me = requireUser(c), d = await visibleDeck(me.id, c.req.param("slug"));
  if (d.owner_id === me.id) throw invalid("Este baralho já é seu.");
  const b = await jsonBody(c, z.object({ localDeck: z.string().min(1).max(200).overwrite(noNul) }));
  const copied = await tx(async (db) => {
    const sub = await one<{ inserted: boolean }>(
      `INSERT INTO deck_subscriptions (deck_id, user_id, local_deck, seen_version) VALUES ($1, $2, $3, $4)
       ON CONFLICT (deck_id, user_id) DO UPDATE SET local_deck = EXCLUDED.local_deck, seen_version = EXCLUDED.seen_version
       RETURNING (xmax = 0) AS inserted`,
      [d.id, me.id, b.localDeck, d.version], db,
    );
    if (sub!.inserted) await db.query("UPDATE shared_decks SET subscribers = subscribers + 1 WHERE id = $1", [d.id]);
    return copyDeckToUser(db, { userId: me.id, local: b.localDeck, slug: d.slug, deckId: d.id, version: d.version, name: d.name });
  });
  const [row, v] = await Promise.all([one<DeckRow>(`${DECK_SELECT} WHERE d.id = $2`, [me.id, d.id]), latest(d.id, d.version)]);
  await refMedia(me.id, v?.media);
  return c.json({ deck: deckCard(me.id, row!), version: d.version, ...copied });
});

// pelo slug e sem checar visibilidade: dá para sair de um baralho que deixou de estar visível
r.delete("/decks/:slug/subscribe", async (c) => {
  const me = requireUser(c), slug = c.req.param("slug");
  await tx(async (db) => {
    const gone = await one<{ deck_id: string }>("DELETE FROM deck_subscriptions WHERE user_id = $1 AND deck_id = (SELECT id FROM shared_decks WHERE slug = $2) RETURNING deck_id", [me.id, slug], db);
    if (gone) await db.query("UPDATE shared_decks SET subscribers = subscribers - 1 WHERE id = $1", [gone.deck_id]);
  });
  return c.body(null, 204);
});

r.get("/decks/:slug/update", async (c) => {
  const me = requireUser(c), d = await visibleDeck(me.id, c.req.param("slug"));
  if (Math.floor(Number(c.req.query("since")) || 0) >= d.version) return c.json({ version: d.version, cards: [], media: {}, note: "" });
  const v = await latest(d.id, d.version);
  await refMedia(me.id, v?.media);
  return c.json({ version: d.version, cards: v?.cards ?? [], media: v?.media ?? {}, note: v?.note ?? "" });
});

r.post("/decks/:slug/seen", async (c) => {
  const me = requireUser(c);
  const b = await jsonBody(c, z.object({ version: z.number().int().min(0) }));
  const rows = await q("UPDATE deck_subscriptions SET seen_version = $3 WHERE user_id = $1 AND deck_id = (SELECT id FROM shared_decks WHERE slug = $2) RETURNING deck_id", [me.id, c.req.param("slug"), b.version]);
  if (!rows.length) throw notFound("Você não assina esse baralho.");
  return c.body(null, 204);
});

r.get("/users/:handle/decks", async (c) => {
  const me = requireUser(c), o = await ownerByHandle(me.id, c.req.param("handle"));
  return c.json({ decks: await decksOfUser(me.id, o.id) });
});

export default r;
