import type { Db } from "../db";
/* Cartão de baralho compartilhado: uma consulta só, com dono, relação e assinatura de quem vê. */
import { q } from "../db";
import { ms } from "../http";
import { canSee } from "./visibility";
import type { FollowStatus, ProfileLevel } from "./visibility";

export type DeckLevel = "publico" | "seguidores" | "link";
export type DeckRow = {
  id: string; owner_id: string; slug: string; name: string; description: string; tags: string[]; visibility: DeckLevel; version: number; cards_count: number; subscribers: number; updated_at: Date;
  local_deck: string; handle: string; owner_name: string; avatar_url: string | null; owner_visibility: ProfileLevel; status: FollowStatus; subscribed: boolean; sub_local_deck: string | null; seen_version: number | null;
};
// $1 é sempre quem está vendo
export const DECK_SELECT = `SELECT d.id, d.owner_id, d.local_deck, d.slug, d.name, d.description, d.tags, d.visibility, d.version, d.cards_count, d.subscribers, d.updated_at,
    u.handle, u.name AS owner_name, u.avatar_url, u.visibility AS owner_visibility, f.status, s.deck_id IS NOT NULL AS subscribed, s.local_deck AS sub_local_deck, s.seen_version
  FROM shared_decks d JOIN users u ON u.id = d.owner_id
  LEFT JOIN follows f ON f.follower_id = $1 AND f.followee_id = d.owner_id
  LEFT JOIN deck_subscriptions s ON s.deck_id = d.id AND s.user_id = $1`;

export const deckCard = (viewerId: string, r: DeckRow) => ({
  id: r.id, slug: r.slug, name: r.name, description: r.description, tags: r.tags, visibility: r.visibility, version: r.version, cardsCount: r.cards_count, subscribers: r.subscribers, updatedAt: ms(r.updated_at)!,
  owner: { handle: r.handle, name: r.owner_name, avatarUrl: r.avatar_url }, subscribed: r.subscribed, mine: r.owner_id === viewerId,
  // o baralho no app de quem publicou: só interessa a essa pessoa
  ...(r.owner_id === viewerId ? { localDeck: r.local_deck } : {}),
});
export const canSeeDeck = (viewerId: string, r: DeckRow) => canSee({ id: viewerId, status: r.status }, { id: r.owner_id, visibility: r.owner_visibility }, r.visibility);

/** os baralhos de uma pessoa na visão de quem pede: `link` só aparece em listagem para o próprio dono */
export async function decksOfUser(viewerId: string, ownerId: string) {
  const rows = await q<DeckRow>(`${DECK_SELECT} WHERE d.owner_id = $2 AND d.removed_at IS NULL ORDER BY d.updated_at DESC LIMIT 200`, [viewerId, ownerId]);
  return rows.filter((r) => viewerId === ownerId || (r.visibility !== "link" && canSeeDeck(viewerId, r))).map((r) => deckCard(viewerId, r));
}

/** assinar não reenvia nada: o baralho já está aqui. Copia os cards da versão publicada para os registros da pessoa, numa consulta só,
    e o app recebe pela sincronização. Assinar de novo atualiza o conteúdo e mantém o agendamento de quem já estudou. */
export async function copyDeckToUser(db: Db, o: { userId: string; local: string; slug: string; deckId: string; version: number; name: string }) {
  const at = Date.now();
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [o.userId]);
  const cards = await db.query<{ added: number; total: number }>(
    `WITH x AS (
       INSERT INTO user_records (user_id, coll, id, data, client_at)
       SELECT $1, 'fc_card', $2::text || ':s:' || (t.c->>'key'),
         jsonb_build_object('id', $2::text || ':s:' || (t.c->>'key'), 'deck', $2::text, 'path', t.c->'path', 'kind', t.c->'kind', 'fields', t.c->'fields', 'ord', t.c->'ord', 'tags', t.c->'tags',
           'due', $3::bigint + t.i, 'order', $3::bigint + t.i, 'ivl', 0, 'ease', 2.5, 'reps', 0, 'lapses', 0, 'step', 0, 'isNew', 1, 'src', jsonb_build_object('shared', $4::text)),
         $3::bigint
       FROM shared_deck_versions v, jsonb_array_elements(v.cards) WITH ORDINALITY AS t(c, i)
       WHERE v.deck_id = $5 AND v.version = $6
       ON CONFLICT (user_id, coll, id) DO UPDATE SET
         data = CASE WHEN user_records.deleted THEN EXCLUDED.data
                ELSE user_records.data || jsonb_build_object('path', EXCLUDED.data->'path', 'kind', EXCLUDED.data->'kind', 'fields', EXCLUDED.data->'fields', 'ord', EXCLUDED.data->'ord') END,
         deleted = false, client_at = greatest(user_records.client_at, EXCLUDED.client_at), seq = nextval('sync_seq')
       RETURNING (xmax = 0) AS inserted
     )
     SELECT count(*) FILTER (WHERE inserted)::int AS added, count(*)::int AS total FROM x`,
    [o.userId, o.local, at, o.slug, o.deckId, o.version],
  );
  await db.query(
    `INSERT INTO user_records (user_id, coll, id, data, client_at)
     SELECT $1, 'fc_media', $2::text || '/' || m.key, jsonb_build_object('hash', split_part(m.value, '.', 1), 'ext', split_part(m.value, '.', 2)), $3::bigint
     FROM shared_deck_versions v, jsonb_each_text(v.media) AS m
     WHERE v.deck_id = $4 AND v.version = $5
     ON CONFLICT (user_id, coll, id) DO UPDATE SET data = EXCLUDED.data, deleted = false, client_at = greatest(user_records.client_at, EXCLUDED.client_at), seq = nextval('sync_seq')`,
    [o.userId, o.local, at, o.deckId, o.version],
  );
  await db.query(
    `INSERT INTO user_records (user_id, coll, id, data, client_at)
     SELECT $1, 'fc_deck', $2::text,
       jsonb_build_object('id', $2::text, 'name', $6::text, 'file', '', 'importedAt', $3::bigint, 'cards', jsonb_array_length(v.cards),
         'images', (SELECT count(*) FROM jsonb_object_keys(v.media)),
         'groups', (SELECT coalesce(jsonb_agg(DISTINCT c->'path'->>0) FILTER (WHERE c->'path'->>0 IS NOT NULL), '[]'::jsonb) FROM jsonb_array_elements(v.cards) AS c)),
       $3::bigint
     FROM shared_deck_versions v WHERE v.deck_id = $4 AND v.version = $5
     ON CONFLICT (user_id, coll, id) DO UPDATE SET data = EXCLUDED.data, deleted = false, client_at = greatest(user_records.client_at, EXCLUDED.client_at), seq = nextval('sync_seq')`,
    [o.userId, o.local, at, o.deckId, o.version, o.name],
  );
  const { added = 0, total = 0 } = cards.rows[0] ?? {};
  return { added, total };
}
