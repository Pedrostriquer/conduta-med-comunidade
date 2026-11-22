/* Comunidade nas questões: comentários, curtidas, marcações e denúncias. `likes` e `replies` são mantidos em transação. */
import { Hono } from "hono";
import { z } from "zod";
import { hasQuestion } from "../bank";
import { one, q, tx } from "../db";
import { forbidden, invalid, ms, notFound, rateLimit, requireUser } from "../http";
import type { AppEnv } from "../http";
import { isUuid, jsonBody, uuidOr404, zText, zUuid } from "../lib/validate";

const PAGE = 30, MINUTE = 60_000, HOUR = 3_600_000;
const GONE = "(comentário apagado)";

type Row = {
  id: string; qid: string; parent_id: string | null; user_id: string; body: string; likes: number; replies: number; created_at: Date; created_txt: string; edited_at: Date | null;
  deleted_at: Date | null; hidden_at: Date | null; liked: boolean; handle: string; name: string; avatar_url: string | null; faculdade: string | null;
};
// $1 é sempre quem está vendo
const SELECT = `SELECT c.id, c.qid, c.parent_id, c.user_id, c.body, c.likes, c.replies, c.created_at, c.created_at::text AS created_txt, c.edited_at, c.deleted_at, c.hidden_at,
    l.user_id IS NOT NULL AS liked, u.handle, u.name, u.avatar_url, CASE WHEN u.show_faculdade THEN u.faculdade END AS faculdade
  FROM comments c JOIN users u ON u.id = c.user_id LEFT JOIN comment_likes l ON l.comment_id = c.id AND l.user_id = $1`;

function commentOf(viewerId: string, r: Row) {
  const gone = !!(r.deleted_at || r.hidden_at);
  return {
    id: r.id, qid: r.qid, parentId: r.parent_id, body: gone ? GONE : r.body, likes: r.likes, liked: !gone && r.liked, replies: r.replies, createdAt: ms(r.created_at)!, editedAt: gone ? null : ms(r.edited_at),
    mine: !gone && r.user_id === viewerId, deleted: gone,
    author: gone ? { handle: "", name: "", avatarUrl: null, faculdade: null } : { handle: r.handle, name: r.name, avatarUrl: r.avatar_url, faculdade: r.faculdade },
  };
}

const assertQuestion = (qid: string) => { if (!hasQuestion(qid)) throw notFound("Não encontramos essa questão."); };
const zBody = zText().min(1, "Escreva o comentário.").max(4000, "O comentário pode ter até 4.000 caracteres.");

/* cursor opaco: posição na ordenação (curtidas, data com microssegundos, id), em base64url */
const encodeCursor = (r: Row) => Buffer.from(JSON.stringify([r.likes, r.created_txt, r.id])).toString("base64url");
function decodeCursor(s: string): [number, string, string] {
  try {
    const v = JSON.parse(Buffer.from(s, "base64url").toString());
    if (Array.isArray(v) && Number.isInteger(v[0]) && typeof v[1] === "string" && !Number.isNaN(Date.parse(v[1])) && isUuid(String(v[2]))) return v as [number, string, string];
  } catch { /* cai no erro abaixo */ }
  throw invalid("Não entendemos a página pedida.");
}

const r = new Hono<AppEnv>();

// comentário apagado ou escondido com respostas continua na lista, como marcador sem autor
const LISTED = "((c.deleted_at IS NULL AND c.hidden_at IS NULL) OR c.replies > 0)";

r.get("/q/counters", async (c) => {
  requireUser(c);
  const ids = (c.req.query("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length > 200) throw invalid("Dá para pedir até 200 questões por vez.");
  const out: Record<string, { comments: number; flags: number }> = {};
  for (const id of ids) out[id] = { comments: 0, flags: 0 };
  const [comments, flags] = await Promise.all([
    q<{ qid: string; n: number }>("SELECT qid, count(*) AS n FROM comments WHERE qid = ANY($1) AND deleted_at IS NULL AND hidden_at IS NULL GROUP BY qid", [ids]),
    q<{ qid: string; n: number }>("SELECT qid, count(*) AS n FROM question_flags WHERE qid = ANY($1) AND status IN ('novo','visto') GROUP BY qid", [ids]),
  ]);
  for (const x of comments) out[x.qid].comments = x.n;
  for (const x of flags) out[x.qid].flags = x.n;
  return c.json(out);
});

r.get("/q/:qid/comments", async (c) => {
  const me = requireUser(c), qid = c.req.param("qid");
  assertQuestion(qid);
  const top = c.req.query("sort") === "top", cursor = c.req.query("cursor");
  const args: unknown[] = [me.id, qid];
  let after = "";
  if (cursor) {
    const [likes, created, id] = decodeCursor(cursor);
    args.push(created, id);
    if (top) { args.push(likes); after = `AND (c.likes, c.created_at, c.id) < ($5::int, $3::timestamptz, $4::uuid)`; }
    else after = `AND (c.created_at, c.id) < ($3::timestamptz, $4::uuid)`;
  }
  const order = top ? "c.likes DESC, c.created_at DESC, c.id DESC" : "c.created_at DESC, c.id DESC";
  const [rows, total] = await Promise.all([
    q<Row>(`${SELECT} WHERE c.qid = $2 AND c.parent_id IS NULL AND ${LISTED} ${after} ORDER BY ${order} LIMIT ${PAGE + 1}`, args),
    one<{ n: number }>(`SELECT count(*) AS n FROM comments c WHERE c.qid = $1 AND c.parent_id IS NULL AND ${LISTED}`, [qid]),
  ]);
  const more = rows.length > PAGE;
  if (more) rows.pop();
  return c.json({ comments: rows.map((x) => commentOf(me.id, x)), nextCursor: more ? encodeCursor(rows[rows.length - 1]) : null, total: total?.n ?? 0 });
});

r.get("/comments/:id/replies", async (c) => {
  const me = requireUser(c), id = uuidOr404(c.req.param("id"));
  if (!(await one("SELECT 1 FROM comments WHERE id = $1", [id]))) throw notFound("Não encontramos esse comentário.");
  const rows = await q<Row>(`${SELECT} WHERE c.parent_id = $2 AND c.deleted_at IS NULL AND c.hidden_at IS NULL ORDER BY c.created_at, c.id LIMIT 500`, [me.id, id]);
  return c.json({ comments: rows.map((x) => commentOf(me.id, x)) });
});

r.post("/q/:qid/comments", rateLimit("comentar", 10, MINUTE), async (c) => {
  const me = requireUser(c), qid = c.req.param("qid");
  assertQuestion(qid);
  const b = await jsonBody(c, z.object({ body: zBody, parentId: zUuid.nullable().optional() }));
  const id = await tx(async (db) => {
    let parentId: string | null = null;
    if (b.parentId) {
      const p = await one<{ id: string; qid: string; parent_id: string | null; deleted_at: Date | null; hidden_at: Date | null }>("SELECT id, qid, parent_id, deleted_at, hidden_at FROM comments WHERE id = $1 FOR UPDATE", [b.parentId], db);
      if (!p || p.qid !== qid || p.deleted_at || p.hidden_at) throw notFound("Esse comentário não existe mais.");
      // respostas têm um nível só: responder a uma resposta entra na mesma conversa
      parentId = p.parent_id ?? p.id;
      await db.query("UPDATE comments SET replies = replies + 1 WHERE id = $1", [parentId]);
    }
    const row = await one<{ id: string }>("INSERT INTO comments (qid, user_id, parent_id, body) VALUES ($1, $2, $3, $4) RETURNING id", [qid, me.id, parentId, b.body], db);
    return row!.id;
  });
  const row = await one<Row>(`${SELECT} WHERE c.id = $2`, [me.id, id]);
  return c.json({ comment: commentOf(me.id, row!) });
});

r.patch("/comments/:id", async (c) => {
  const me = requireUser(c), id = uuidOr404(c.req.param("id"));
  const b = await jsonBody(c, z.object({ body: zBody }));
  const cur = await one<{ user_id: string }>("SELECT user_id FROM comments WHERE id = $1 AND deleted_at IS NULL AND hidden_at IS NULL", [id]);
  if (!cur) throw notFound("Não encontramos esse comentário.");
  if (cur.user_id !== me.id) throw forbidden("Só quem escreveu pode editar.");
  await q("UPDATE comments SET body = $2, edited_at = now() WHERE id = $1", [id, b.body]);
  const row = await one<Row>(`${SELECT} WHERE c.id = $2`, [me.id, id]);
  return c.json({ comment: commentOf(me.id, row!) });
});

r.delete("/comments/:id", async (c) => {
  const me = requireUser(c), id = uuidOr404(c.req.param("id"));
  await tx(async (db) => {
    const cur = await one<{ user_id: string; parent_id: string | null; replies: number; hidden_at: Date | null }>("SELECT user_id, parent_id, replies, hidden_at FROM comments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [id], db);
    if (!cur) throw notFound("Não encontramos esse comentário.");
    if (cur.user_id !== me.id && me.role !== "admin") throw forbidden("Só quem escreveu pode apagar.");
    // com respostas vira marcador; sem respostas some, e pode levar junto um marcador que ficou vazio
    if (cur.replies > 0) { await db.query("UPDATE comments SET deleted_at = now() WHERE id = $1", [id]); return; }
    await db.query("DELETE FROM comments WHERE id = $1", [id]);
    if (cur.parent_id && !cur.hidden_at) {
      await db.query("UPDATE comments SET replies = replies - 1 WHERE id = $1", [cur.parent_id]);
      await db.query("DELETE FROM comments WHERE id = $1 AND deleted_at IS NOT NULL AND replies <= 0", [cur.parent_id]);
    }
  });
  return c.body(null, 204);
});

r.post("/comments/:id/like", async (c) => {
  const me = requireUser(c), id = uuidOr404(c.req.param("id"));
  const out = await tx(async (db) => {
    if (!(await one("SELECT 1 FROM comments WHERE id = $1 AND deleted_at IS NULL AND hidden_at IS NULL FOR UPDATE", [id], db))) throw notFound("Não encontramos esse comentário.");
    const removed = await db.query("DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2", [id, me.id]);
    if (!removed.rowCount) await db.query("INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2)", [id, me.id]);
    const row = await one<{ likes: number }>("UPDATE comments SET likes = likes + $2 WHERE id = $1 RETURNING likes", [id, removed.rowCount ? -1 : 1], db);
    return { likes: row!.likes, liked: !removed.rowCount };
  });
  return c.json(out);
});

/* ---------- marcar a questão ---------- */
const REASONS = ["desatualizada", "problema", "gabarito", "imagem", "outro"] as const;
type Reason = (typeof REASONS)[number];

// resolvida ou descartada pelo admin deixa de contar, e a pessoa pode marcar de novo
async function flagsOf(qid: string, userId: string) {
  const rows = await q<{ reason: Reason; n: number; mine: boolean }>(
    "SELECT reason, count(*) AS n, bool_or(user_id = $2) AS mine FROM question_flags WHERE qid = $1 AND status IN ('novo','visto') GROUP BY reason",
    [qid, userId],
  );
  const counts = Object.fromEntries(REASONS.map((x) => [x, 0])) as Record<Reason, number>;
  for (const x of rows) counts[x.reason] = x.n;
  return { counts, mine: rows.filter((x) => x.mine).map((x) => x.reason) };
}

r.get("/q/:qid/flags", async (c) => {
  const me = requireUser(c), qid = c.req.param("qid");
  assertQuestion(qid);
  return c.json(await flagsOf(qid, me.id));
});

r.post("/q/:qid/flags", rateLimit("marcar", 30, HOUR), async (c) => {
  const me = requireUser(c), qid = c.req.param("qid");
  assertQuestion(qid);
  const b = await jsonBody(c, z.object({ reason: z.enum(REASONS), note: zText().max(1000, "A observação pode ter até 1.000 caracteres.").optional() }));
  await q(
    `INSERT INTO question_flags (qid, user_id, reason, note) VALUES ($1, $2, $3, $4)
     ON CONFLICT (qid, user_id, reason) DO UPDATE SET note = EXCLUDED.note, status = 'novo', created_at = now()`,
    [qid, me.id, b.reason, b.note ?? ""],
  );
  return c.json(await flagsOf(qid, me.id));
});

r.delete("/q/:qid/flags/:reason", async (c) => {
  const me = requireUser(c), qid = c.req.param("qid");
  assertQuestion(qid);
  await q("DELETE FROM question_flags WHERE qid = $1 AND user_id = $2 AND reason = $3", [qid, me.id, c.req.param("reason")]);
  return c.json(await flagsOf(qid, me.id));
});

/* ---------- denúncias: o alvo é guardado sempre pelo uuid ---------- */
async function resolveTarget(kind: string, id: string) {
  const byUuid = isUuid(id);
  const sql: Record<string, string | null> = {
    comment: byUuid ? "SELECT id FROM comments WHERE id = $1" : null,
    doc: byUuid ? "SELECT id FROM docs WHERE id = $1" : null,
    user: byUuid ? "SELECT id FROM users WHERE id = $1" : "SELECT id FROM users WHERE lower(handle) = lower($1)",
    deck: byUuid ? "SELECT id FROM shared_decks WHERE id = $1" : "SELECT id FROM shared_decks WHERE slug = $1",
  };
  const s = sql[kind], row = s ? await one<{ id: string }>(s, [kind === "user" ? id.replace(/^@/, "") : id]) : null;
  if (!row) throw notFound("Não encontramos o que você quer denunciar.");
  return row.id;
}

r.post("/reports", rateLimit("denunciar", 30, HOUR), async (c) => {
  const me = requireUser(c);
  const b = await jsonBody(c, z.object({ targetKind: z.enum(["comment", "user", "doc", "deck"]), targetId: z.string().min(1).max(200), reason: zText().max(2000, "O motivo pode ter até 2.000 caracteres.").optional() }));
  const target = await resolveTarget(b.targetKind, b.targetId);
  await q("INSERT INTO reports (target_kind, target_id, user_id, reason) VALUES ($1, $2, $3, $4) ON CONFLICT (target_kind, target_id, user_id) DO NOTHING", [b.targetKind, target, me.id, b.reason ?? ""]);
  return c.body(null, 204);
});

export default r;
