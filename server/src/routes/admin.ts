/* Caixa do criador: tudo aqui exige papel de admin. Autor e texto do alvo vêm junto, sem consulta por item. */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { bank } from "../bank";
import { one, q, tx } from "../db";
import { env } from "../env";
import { invalid, ms, notFound, requireAdmin } from "../http";
import type { AppEnv } from "../http";
import { feedbackItem } from "../lib/feedback-store";
import type { FeedbackRow } from "../lib/feedback-store";
import { jsonBody, uuidOr404, zText } from "../lib/validate";
import { sha256 } from "./auth";

const LIST = 200;
const r = new Hono<AppEnv>();

r.get("/admin/inbox", async (c) => {
  requireAdmin(c);
  const status = c.req.query("status") || null;
  const [feedback, flags, reports, counts] = await Promise.all([
    q<FeedbackRow & { handle: string | null; author_name: string | null; email: string | null }>(
      `SELECT f.*, u.handle, u.name AS author_name, u.email FROM feedback f LEFT JOIN users u ON u.id = f.user_id
       WHERE $1::text IS NULL OR f.status = $1 ORDER BY f.created_at DESC LIMIT ${LIST}`,
      [status],
    ),
    q<{ qid: string; reason: string; note: string; status: string; created_at: Date; handle: string; name: string }>(
      `SELECT fl.qid, fl.reason, fl.note, fl.status, fl.created_at, u.handle, u.name FROM question_flags fl JOIN users u ON u.id = fl.user_id
       WHERE $1::text IS NULL OR fl.status = $1 ORDER BY fl.created_at DESC LIMIT ${LIST}`,
      [status],
    ),
    q<{ id: string; target_kind: string; target_id: string; reason: string; status: string; created_at: Date; handle: string; name: string; target_text: string | null; target_qid: string | null }>(
      `SELECT r.id, r.target_kind, r.target_id, r.reason, r.status, r.created_at, a.handle, a.name,
              CASE r.target_kind WHEN 'comment' THEN tc.body WHEN 'user' THEN '@' || tu.handle || ' (' || tu.name || ')' WHEN 'doc' THEN td.title WHEN 'deck' THEN ts.name END AS target_text, tc.qid AS target_qid
       FROM reports r JOIN users a ON a.id = r.user_id
       LEFT JOIN comments tc ON r.target_kind = 'comment' AND tc.id = r.target_id::uuid
       LEFT JOIN users tu ON r.target_kind = 'user' AND tu.id = r.target_id::uuid
       LEFT JOIN docs td ON r.target_kind = 'doc' AND td.id = r.target_id::uuid
       LEFT JOIN shared_decks ts ON r.target_kind = 'deck' AND ts.id = r.target_id::uuid
       WHERE $1::text IS NULL OR r.status = $1 ORDER BY r.created_at DESC LIMIT ${LIST}`,
      [status],
    ),
    one<{ feedback: number; flags: number; reports: number }>(
      `SELECT (SELECT count(*) FROM feedback WHERE status = 'novo') AS feedback, (SELECT count(*) FROM question_flags WHERE status = 'novo') AS flags, (SELECT count(*) FROM reports WHERE status = 'novo') AS reports`,
    ),
  ]);
  const { byId } = bank();
  return c.json({
    feedback: feedback.map((x) => ({ ...feedbackItem(x), meta: x.meta, author: x.handle ? { handle: x.handle, name: x.author_name, email: x.email } : null })),
    flags: flags.map((x) => {
      const q = byId.get(x.qid);
      return { qid: x.qid, reason: x.reason, note: x.note, status: x.status, createdAt: ms(x.created_at)!, author: { handle: x.handle, name: x.name }, target: q ? { prova: q.p, numero: q.n, texto: q.e.slice(0, 400) } : null };
    }),
    reports: reports.map((x) => ({ id: x.id, targetKind: x.target_kind, targetId: x.target_id, reason: x.reason, status: x.status, createdAt: ms(x.created_at)!, author: { handle: x.handle, name: x.name }, targetText: x.target_text, targetQid: x.target_qid })),
    counts,
  });
});

r.patch("/admin/feedback/:id", async (c) => {
  requireAdmin(c);
  const id = uuidOr404(c.req.param("id"));
  const b = await jsonBody(c, z.object({ status: z.enum(["novo", "lendo", "feito", "recusado"]).optional(), reply: zText().max(8000, "A resposta pode ter até 8.000 caracteres.").nullable().optional() }));
  const row = await one<FeedbackRow>(
    `UPDATE feedback SET status = COALESCE($2, status),
       reply = CASE WHEN $3 THEN $4 ELSE reply END, replied_at = CASE WHEN $3 THEN (CASE WHEN $4::text IS NULL THEN NULL ELSE now() END) ELSE replied_at END
     WHERE id = $1 RETURNING *`,
    [id, b.status ?? null, b.reply !== undefined, b.reply || null],
  );
  if (!row) throw notFound("Não encontramos essa mensagem.");
  return c.json({ item: feedbackItem(row) });
});

r.post("/admin/feedback/:id/reset-link", async (c) => {
  requireAdmin(c);
  const id = uuidOr404(c.req.param("id"));
  const f = await one<{ kind: string; user_id: string | null }>("SELECT kind, user_id FROM feedback WHERE id = $1", [id]);
  if (!f) throw notFound("Não encontramos essa mensagem.");
  if (f.kind !== "senha") throw invalid("Esta mensagem não é um pedido de nova senha.");
  if (!f.user_id) throw notFound("Essa conta não existe mais.");
  const token = randomBytes(32).toString("base64url");
  await tx(async (db) => {
    await db.query("DELETE FROM password_resets WHERE user_id = $1", [f.user_id]);
    await db.query("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '24 hours')", [sha256(token), f.user_id]);
    await db.query("UPDATE feedback SET status = 'feito' WHERE id = $1", [id]);
  });
  return c.json({ url: `${env.publicUrl}/entrar?redefinir=${token}` });
});

r.patch("/admin/flags", async (c) => {
  requireAdmin(c);
  const b = await jsonBody(c, z.object({ qid: z.string().min(1), reason: z.enum(["desatualizada", "problema", "gabarito", "imagem", "outro"]), status: z.enum(["novo", "visto", "resolvido", "descartado"]) }));
  await q("UPDATE question_flags SET status = $3 WHERE qid = $1 AND reason = $2", [b.qid, b.reason, b.status]);
  return c.body(null, 204);
});

r.patch("/admin/reports/:id", async (c) => {
  requireAdmin(c);
  const b = await jsonBody(c, z.object({ status: z.enum(["novo", "resolvido", "descartado"]) }));
  const rows = await q("UPDATE reports SET status = $2 WHERE id = $1 RETURNING id", [uuidOr404(c.req.param("id")), b.status]);
  if (!rows.length) throw notFound("Não encontramos essa denúncia.");
  return c.body(null, 204);
});

r.post("/admin/comments/:id/hide", async (c) => {
  requireAdmin(c);
  const id = uuidOr404(c.req.param("id"));
  const b = await jsonBody(c, z.object({ hidden: z.boolean() }));
  await tx(async (db) => {
    const cur = await one<{ parent_id: string | null; hidden_at: Date | null }>("SELECT parent_id, hidden_at FROM comments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [id], db);
    if (!cur) throw notFound("Não encontramos esse comentário.");
    if (!!cur.hidden_at === b.hidden) return;
    await db.query("UPDATE comments SET hidden_at = CASE WHEN $2 THEN now() END WHERE id = $1", [id, b.hidden]);
    // resposta escondida não conta na conversa
    if (cur.parent_id) await db.query("UPDATE comments SET replies = replies + $2 WHERE id = $1", [cur.parent_id, b.hidden ? -1 : 1]);
  });
  return c.body(null, 204);
});

r.get("/admin/overview", async (c) => {
  requireAdmin(c);
  const row = await one<{ users: number; active_week: number; comments: number; decks: number; docs: number; plugin_connections: number }>(
    `SELECT (SELECT count(*) FROM users) AS users,
       (SELECT count(DISTINCT user_id) FROM sessions WHERE last_seen_at > now() - interval '7 days') AS active_week,
       (SELECT count(*) FROM comments WHERE deleted_at IS NULL AND hidden_at IS NULL) AS comments,
       (SELECT count(*) FROM shared_decks WHERE removed_at IS NULL) AS decks,
       (SELECT count(*) FROM docs WHERE deleted_at IS NULL AND kind = 'doc') AS docs,
       (SELECT count(*) FROM mcp_tokens WHERE kind IN ('refresh','pessoal') AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())) AS plugin_connections`,
  );
  return c.json({ users: row!.users, activeWeek: row!.active_week, comments: row!.comments, decks: row!.decks, docs: row!.docs, pluginConnections: row!.plugin_connections });
});

export default r;
