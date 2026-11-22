/* Painel do admin: as pessoas. Lista com o essencial numa consulta só; o detalhe junta uso, sequência de telas, suporte,
   espaço por baralho e crédito de IA. A senha nunca aparece: o admin gera um link ou manda um código. */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { one, q, tx } from "../db";
import { env } from "../env";
import { HttpError, invalid, ms, notFound, requireAdmin } from "../http";
import type { AppEnv } from "../http";
import { feedbackItem } from "../lib/feedback-store";
import type { FeedbackRow } from "../lib/feedback-store";
import { mailReady } from "../lib/mail";
import { assertHandle, suggestHandle } from "../lib/handles";
import { hashPassword } from "../lib/password";
import { jsonBody, pgCode, pgConstraint, uuidOr404 } from "../lib/validate";
import { creditOf, monthKey } from "../ia/credit";
import { issueResetCode, sha256, zEmail, zName } from "./auth";

const r = new Hono<AppEnv>();
const PAGE = 50;
const SORT: Record<string, string> = {
  recente: "last_seen DESC NULLS LAST", novos: "u.created_at DESC", ativos: "ms30 DESC", espaco: "(COALESCE(st.records_bytes, 0) + files_bytes) DESC", ia: "ia_usd DESC", questoes: "u.total_questions DESC", nome: "u.name",
};

r.get("/admin/users", async (c) => {
  requireAdmin(c);
  const search = c.req.query("q")?.trim() || null;
  const sort = SORT[c.req.query("ordem") || "recente"] || SORT.recente;
  const offset = Math.max(0, Number(c.req.query("de")) || 0);
  const rows = await q<any>(
    `SELECT u.id, u.handle, u.name, u.email, u.role, u.avatar_url, u.faculdade, u.semestre, u.formado, u.cidade, u.visibility, u.created_at, u.total_questions, u.total_correct, u.total_cards, u.shared_mode,
       COALESCE(st.records_bytes, 0) AS records_bytes, x.*
     FROM users u
     LEFT JOIN user_storage st ON st.user_id = u.id
     CROSS JOIN LATERAL (SELECT
       (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen,
       COALESCE((SELECT sum(d.ms) FROM usage_days d WHERE d.user_id = u.id AND d.day > current_date - 30), 0) AS ms30,
       COALESCE((SELECT sum(up.bytes) FROM uploads up WHERE up.user_id = u.id), 0) AS files_bytes,
       COALESCE((SELECT sum(a.cost_usd) FROM ai_runs a WHERE a.user_id = u.id AND a.created_at >= date_trunc('month', now())), 0) AS ia_usd,
       (SELECT count(*) FROM mcp_tokens t WHERE t.user_id = u.id AND t.kind IN ('refresh','pessoal') AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now())) AS plugin,
       (SELECT count(*) FROM feedback f WHERE f.user_id = u.id AND f.status = 'novo') AS abertos
     ) x
     WHERE ($1::text IS NULL OR f_unaccent(lower(u.name || ' ' || u.handle || ' ' || u.email)) LIKE '%' || f_unaccent(lower($1)) || '%')
     ORDER BY ${sort} LIMIT ${PAGE + 1} OFFSET $2`,
    [search, offset],
  );
  const total = await one<{ n: number }>("SELECT count(*) AS n FROM users");
  return c.json({
    total: total!.n, more: rows.length > PAGE,
    items: rows.slice(0, PAGE).map((u) => ({
      id: u.id, handle: u.handle, name: u.name, email: u.email, role: u.role, avatarUrl: u.avatar_url, faculdade: u.faculdade, semestre: u.semestre, createdAt: ms(u.created_at)!, lastSeen: ms(u.last_seen),
      questions: u.total_questions, correct: u.total_correct, cards: u.total_cards, sharedMode: u.shared_mode, ms30: Number(u.ms30), bytes: Number(u.records_bytes) + Number(u.files_bytes), filesBytes: Number(u.files_bytes), iaUsd: Number(u.ia_usd), plugin: Number(u.plugin) > 0, abertos: Number(u.abertos),
    })),
  });
});

/** o admin cria a conta e manda o link: a senha é sorteada e ninguém a conhece; a pessoa cria a dela pelo link, que vale 7 dias */
r.post("/admin/users", async (c) => {
  requireAdmin(c);
  const b = await jsonBody(c, z.object({ name: zName, email: zEmail, handle: z.string().optional() }));
  const asked = b.handle?.trim() ? assertHandle(b.handle) : null;
  const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
  const token = randomBytes(32).toString("base64url");
  let handle = asked ?? (await suggestHandle(b.name));
  for (let tries = 0; ; tries++) {
    try {
      const user = await tx(async (db) => {
        const u = await one<{ id: string; name: string; email: string; handle: string }>(
          "INSERT INTO users (email, password_hash, name, handle, role) VALUES ($1, $2, $3, $4, 'user') RETURNING id, name, email, handle", [b.email, passwordHash, b.name, handle], db,
        );
        await db.query("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')", [sha256(token), u!.id]);
        return u!;
      });
      return c.json({ user, url: `${env.publicUrl}/entrar?redefinir=${token}&nova=1` });
    } catch (e) {
      if (pgCode(e) !== "23505") throw e;
      if (pgConstraint(e) === "users_email_key") throw new HttpError("conflito", "Já existe uma conta com este e-mail.");
      if (asked) throw new HttpError("conflito", "Este @ já está em uso. Escolha outro.");
      if (tries >= 3) throw e;
      handle = (await suggestHandle(b.name)).slice(0, 20) + Math.floor(1000 + Math.random() * 9000);
    }
  }
});

r.get("/admin/users/:id", async (c) => {
  requireAdmin(c);
  const id = uuidOr404(c.req.param("id"));
  const u = await one<any>("SELECT * FROM users WHERE id = $1", [id]);
  if (!u) throw notFound("Não encontramos essa pessoa.");
  const [days, events, support, flags, files, records, decks, published, subs, media, mcpDays, mcpTools, credit, aiu, runs, sessions] = await Promise.all([
    q<any>(`SELECT g.day::date AS day, COALESCE(d.ms, 0) AS ms, COALESCE(d.screens, 0) AS screens, COALESCE(s.questions, 0) AS questions, COALESCE(s.cards, 0) AS cards
            FROM generate_series(current_date - 59, current_date, interval '1 day') g(day)
            LEFT JOIN usage_days d ON d.user_id = $1 AND d.day = g.day::date LEFT JOIN user_days s ON s.user_id = $1 AND s.day = g.day::date ORDER BY 1`, [id]),
    q<any>("SELECT visit, path, at, ms FROM usage_events WHERE user_id = $1 ORDER BY at DESC LIMIT 400", [id]),
    q<FeedbackRow>("SELECT * FROM feedback WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [id]),
    q<any>("SELECT qid, reason, note, status, created_at FROM question_flags WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30", [id]),
    q<any>("SELECT kind, count(*) AS n, sum(bytes) AS bytes FROM uploads WHERE user_id = $1 GROUP BY kind", [id]),
    q<any>("SELECT coll, count(*) AS n, sum(pg_column_size(data)) AS bytes FROM user_records WHERE user_id = $1 AND NOT deleted GROUP BY coll ORDER BY 3 DESC", [id]),
    q<any>(`SELECT d.id, d.data->>'name' AS name, COALESCE(c.n, 0) AS cards, COALESCE(c.bytes, 0) AS bytes
            FROM user_records d LEFT JOIN (SELECT data->>'deck' AS deck, count(*) AS n, sum(pg_column_size(data)) AS bytes FROM user_records WHERE user_id = $1 AND coll = 'fc_card' AND NOT deleted GROUP BY 1) c ON c.deck = d.id
            WHERE d.user_id = $1 AND d.coll = 'fc_deck' AND NOT d.deleted ORDER BY bytes DESC`, [id]),
    q<any>("SELECT local_deck, name, visibility, version, cards_count, subscribers FROM shared_decks WHERE owner_id = $1 AND removed_at IS NULL", [id]),
    q<any>(`SELECT s.local_deck, d.name, o.handle, o.id AS owner FROM deck_subscriptions s JOIN shared_decks d ON d.id = s.deck_id JOIN users o ON o.id = d.owner_id WHERE s.user_id = $1`, [id]),
    // imagens e áudios de cada baralho: quanto conta para a pessoa (só o que ela enviou primeiro) e o tamanho real
    q<any>(`SELECT split_part(r.id, '/', 1) AS deck, count(*) AS n, COALESCE(sum(up.bytes), 0) AS counted, COALESCE(sum(GREATEST(up.bytes, a.bytes)), 0) AS real
            FROM user_records r LEFT JOIN uploads up ON up.user_id = $1 AND up.hash = r.data->>'hash'
            LEFT JOIN LATERAL (SELECT max(x.bytes) AS bytes FROM uploads x WHERE x.hash = r.data->>'hash') a ON true
            WHERE r.user_id = $1 AND r.coll = 'fc_media' AND NOT r.deleted GROUP BY 1`, [id]),
    q<any>("SELECT at::date AS day, count(*) AS n FROM mcp_audit WHERE user_id = $1 AND at > now() - interval '30 days' GROUP BY 1 ORDER BY 1", [id]),
    q<any>("SELECT tool, count(*) AS n, max(at) AS last, count(*) FILTER (WHERE NOT ok) AS failed FROM mcp_audit WHERE user_id = $1 AND at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 12", [id]),
    creditOf(id),
    one<any>("SELECT monthly_usd, extra_usd, extra_month, fc_mode FROM ai_user WHERE user_id = $1", [id]),
    q<any>("SELECT id, kind, trigger, status, model, cost_usd, tokens_in, tokens_out, created_at, source FROM ai_runs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20", [id]),
    q<any>("SELECT last_seen_at, user_agent, created_at FROM sessions WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 5", [id]),
  ]);
  const visits = new Map<string, { visit: string; at: number; end: number; ms: number; screens: { path: string; at: number; ms: number }[] }>();
  for (const e of [...events].reverse()) {
    const at = ms(e.at)!, v = visits.get(e.visit) || { visit: e.visit as string, at, end: at, ms: 0, screens: [] as { path: string; at: number; ms: number }[] };
    v.screens.push({ path: e.path, at, ms: e.ms }); v.ms += e.ms; v.end = at + e.ms;
    visits.set(e.visit, v);
  }
  const pubBy = new Map(published.map((p) => [p.local_deck, p])), subBy = new Map(subs.map((s) => [s.local_deck, s])), mediaBy = new Map(media.map((m) => [m.deck, m]));
  return c.json({
    user: {
      id: u.id, handle: u.handle, name: u.name, email: u.email, role: u.role, avatarUrl: u.avatar_url, bio: u.bio, faculdade: u.faculdade, semestre: u.semestre, formado: u.formado, cidade: u.cidade, visibility: u.visibility, createdAt: ms(u.created_at)!,
      questions: u.total_questions, correct: u.total_correct, cards: u.total_cards, sharedMode: u.shared_mode,
    },
    sessions: sessions.map((s) => ({ lastSeen: ms(s.last_seen_at), device: s.user_agent, since: ms(s.created_at) })),
    days: days.map((d) => ({ day: new Date(d.day).toISOString().slice(0, 10), ms: Number(d.ms), screens: d.screens, questions: d.questions, cards: d.cards })),
    visits: [...visits.values()].sort((a, b) => b.at - a.at).slice(0, 25),
    support: support.map((f) => ({ ...feedbackItem(f), meta: f.meta })),
    flags: flags.map((f) => ({ qid: f.qid, reason: f.reason, note: f.note, status: f.status, createdAt: ms(f.created_at)! })),
    storage: {
      files: files.map((f) => ({ kind: f.kind, n: f.n, bytes: Number(f.bytes) })),
      records: records.map((x) => ({ coll: x.coll, n: x.n, bytes: Number(x.bytes) })),
      decks: decks.map((d) => {
        const p = pubBy.get(d.id), s = subBy.get(d.id), m = mediaBy.get(d.id);
        return { id: d.id, name: d.name, cards: Number(d.cards), textBytes: Number(d.bytes), mediaFiles: m ? Number(m.n) : 0, mediaCounted: m ? Number(m.counted) : 0, mediaReal: m ? Number(m.real) : 0,
          published: p ? { visibility: p.visibility, version: p.version, subscribers: p.subscribers, cards: p.cards_count } : null, from: s ? { name: s.name, handle: s.handle } : null };
      }),
    },
    plugin: { days: mcpDays.map((d) => ({ day: new Date(d.day).toISOString().slice(0, 10), n: d.n })), tools: mcpTools.map((t) => ({ tool: t.tool, n: t.n, failed: t.failed, last: ms(t.last) })) },
    ia: {
      limit: credit.limit, spent: credit.spent, reserved: credit.reserved, runsCount: credit.runs, monthlyUsd: aiu?.monthly_usd != null ? Number(aiu.monthly_usd) : null, extraUsd: aiu?.extra_month === monthKey() ? Number(aiu.extra_usd) : 0, fcMode: aiu?.fc_mode || "manual",
      runs: runs.map((x) => ({ id: x.id, kind: x.kind, trigger: x.trigger, status: x.status, model: x.model, costUsd: Number(x.cost_usd), tokensIn: x.tokens_in, tokensOut: x.tokens_out, createdAt: ms(x.created_at)!, title: x.source?.title || null })),
    },
    mail: await mailReady(),
  });
});

r.post("/admin/users/:id/reset-link", async (c) => {
  requireAdmin(c);
  const id = uuidOr404(c.req.param("id"));
  if (!(await one("SELECT 1 FROM users WHERE id = $1", [id]))) throw notFound("Não encontramos essa pessoa.");
  const token = randomBytes(32).toString("base64url");
  await tx(async (db) => {
    await db.query("DELETE FROM password_resets WHERE user_id = $1", [id]);
    await db.query("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '24 hours')", [sha256(token), id]);
  });
  return c.json({ url: `${env.publicUrl}/entrar?redefinir=${token}` });
});

r.post("/admin/users/:id/send-code", async (c) => {
  requireAdmin(c);
  const id = uuidOr404(c.req.param("id"));
  const u = await one<{ id: string; email: string; name: string }>("SELECT id, email, name FROM users WHERE id = $1", [id]);
  if (!u) throw notFound("Não encontramos essa pessoa.");
  if (!(await mailReady())) throw invalid("O envio de e-mail ainda não está configurado.");
  try { await issueResetCode(u); } catch (e) { throw invalid(`O e-mail não saiu: ${(e as Error).message}`.slice(0, 300)); }
  return c.body(null, 204);
});

r.post("/admin/users/:id/logout", async (c) => {
  requireAdmin(c);
  await q("DELETE FROM sessions WHERE user_id = $1", [uuidOr404(c.req.param("id"))]);
  return c.body(null, 204);
});

r.patch("/admin/users/:id/ia", async (c) => {
  requireAdmin(c);
  const id = uuidOr404(c.req.param("id"));
  const b = await jsonBody(c, z.object({ monthlyUsd: z.number().min(0).max(1000).nullable().optional(), extraUsd: z.number().min(0).max(1000).optional() }));
  await q(
    `INSERT INTO ai_user (user_id, monthly_usd, extra_usd, extra_month) VALUES ($1, $2, COALESCE($3, 0), CASE WHEN $3::numeric IS NULL THEN NULL ELSE $5 END)
     ON CONFLICT (user_id) DO UPDATE SET monthly_usd = CASE WHEN $4 THEN $2 ELSE ai_user.monthly_usd END,
       extra_usd = COALESCE($3, ai_user.extra_usd), extra_month = CASE WHEN $3::numeric IS NULL THEN ai_user.extra_month ELSE $5 END, updated_at = now()`,
    [id, b.monthlyUsd ?? null, b.extraUsd ?? null, b.monthlyUsd !== undefined, monthKey()],
  );
  return c.body(null, 204);
});

export default r;
