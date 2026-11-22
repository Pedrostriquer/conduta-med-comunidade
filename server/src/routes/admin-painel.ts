/* Painel de administração separado (pasta admin/): o que faltava para monitorar de verdade. Tudo aqui é só leitura, exige
   papel de admin, tem página e teto de linhas, e filtra por período ou por pessoa usando índice (ver migrations/004).
   Nada daqui devolve senha, hash, token ou segredo: de token e sessão saem só rótulo, tipo e datas. */
import { Hono } from "hono";
import type { Context } from "hono";
import { one, q } from "../db";
import { ms, notFound, requireAdmin } from "../http";
import type { AppEnv } from "../http";
import { isUuid, likeAny, uuidOr404 } from "../lib/validate";

const r = new Hono<AppEnv>();
const TZ = "America/Sao_Paulo";
/** o dia de hoje em São Paulo, como o resto do servidor conta os dias */
const today = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const clamp = (v: unknown, def: number, min: number, max: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const page = (c: Context) => { const size = clamp(c.req.query("por"), 50, 1, 100), n = clamp(c.req.query("pagina"), 1, 1, 2000); return { size, n, offset: (n - 1) * size }; };
const oneOf = <T extends string>(v: string | undefined, list: readonly T[]): T | null => (list.includes(v as T) ? (v as T) : null);
const userFilter = (c: Context) => { const v = c.req.query("usuario"); if (!v) return null; if (!isUuid(v)) throw notFound("Não encontramos essa pessoa."); return v; };
const who = (x: { user_id?: string | null; handle?: string | null; name?: string | null }) => (x.handle ? { id: x.user_id ?? null, handle: x.handle, name: x.name ?? "" } : null);
const N = (v: unknown) => Number(v || 0);

/* ---------- visão geral ---------- */
r.get("/admin/painel/geral", async (c) => {
  requireAdmin(c);
  const dias = clamp(c.req.query("dias"), 30, 30, 180), t = today();
  const [tot, novas, ativas, storage, uploads, errors, lastError, inbox, series] = await Promise.all([
    one<any>(`SELECT count(*) AS users, COALESCE(sum(total_questions), 0) AS questions, COALESCE(sum(total_correct), 0) AS correct, COALESCE(sum(total_cards), 0) AS cards, count(*) FILTER (WHERE role = 'admin') AS admins FROM users`),
    one<any>(
      `SELECT count(*) FILTER (WHERE created_at >= ($1::date)::timestamp AT TIME ZONE '${TZ}') AS d1,
              count(*) FILTER (WHERE created_at >= ($1::date - 6)::timestamp AT TIME ZONE '${TZ}') AS d7, count(*) AS d30
       FROM users WHERE created_at >= ($1::date - 29)::timestamp AT TIME ZONE '${TZ}'`, [t]),
    // ativa no dia: abriu alguma tela ou respondeu questão ou revisou card
    one<any>(
      `SELECT count(DISTINCT user_id) FILTER (WHERE day = $1::date) AS d1, count(DISTINCT user_id) FILTER (WHERE day >= $1::date - 6) AS d7, count(DISTINCT user_id) AS d30
       FROM (SELECT user_id, day FROM usage_days WHERE day >= $1::date - 29 UNION ALL SELECT user_id, day FROM user_days WHERE day >= $1::date - 29) x`, [t]),
    one<any>("SELECT COALESCE(sum(records_bytes), 0) AS bytes FROM user_storage"),
    one<any>("SELECT COALESCE(sum(b), 0) AS bytes, count(*) AS files FROM (SELECT hash, max(bytes) AS b FROM uploads GROUP BY hash) x"),
    one<any>("SELECT count(*) FILTER (WHERE at >= now() - interval '24 hours') AS d1, count(*) AS d7 FROM server_errors WHERE at >= now() - interval '7 days'"),
    one<any>("SELECT at, method, path, message FROM server_errors ORDER BY at DESC LIMIT 1"),
    one<any>(
      `SELECT (SELECT count(*) FROM feedback WHERE status = 'novo' AND kind <> 'senha') AS feedback, (SELECT count(*) FROM feedback WHERE status = 'novo' AND kind = 'senha') AS senha,
              (SELECT count(*) FROM question_flags WHERE status = 'novo') AS flags, (SELECT count(*) FROM reports WHERE status = 'novo') AS reports`),
    q<any>(
      `SELECT to_char(g.day, 'YYYY-MM-DD') AS day, COALESCE(n.n, 0) AS novas, COALESCE(a.n, 0) AS ativas, COALESCE(s.questions, 0) AS questions, COALESCE(s.correct, 0) AS correct,
              COALESCE(s.cards, 0) AS cards, COALESCE(u.ms, 0) AS ms, COALESCE(u.screens, 0) AS screens, COALESCE(dc.n, 0) AS resumos
       FROM generate_series($1::date - ($2::int - 1), $1::date, interval '1 day') g(day)
       LEFT JOIN (SELECT (created_at AT TIME ZONE '${TZ}')::date AS day, count(*) AS n FROM users WHERE created_at >= ($1::date - $2::int)::timestamp GROUP BY 1) n ON n.day = g.day::date
       LEFT JOIN (SELECT day, count(DISTINCT user_id) AS n FROM (SELECT user_id, day FROM usage_days WHERE day > $1::date - $2::int UNION ALL SELECT user_id, day FROM user_days WHERE day > $1::date - $2::int) x GROUP BY day) a ON a.day = g.day::date
       LEFT JOIN (SELECT day, sum(questions) AS questions, sum(correct) AS correct, sum(cards) AS cards FROM user_days WHERE day > $1::date - $2::int GROUP BY day) s ON s.day = g.day::date
       LEFT JOIN (SELECT day, sum(ms) AS ms, sum(screens) AS screens FROM usage_days WHERE day > $1::date - $2::int GROUP BY day) u ON u.day = g.day::date
       LEFT JOIN (SELECT (created_at AT TIME ZONE '${TZ}')::date AS day, count(*) AS n FROM docs WHERE kind = 'doc' AND created_at >= ($1::date - $2::int)::timestamp GROUP BY 1) dc ON dc.day = g.day::date
       ORDER BY 1`, [t, dias]),
  ]);
  const content = await one<any>(
    `SELECT (SELECT count(*) FROM docs WHERE deleted_at IS NULL AND kind = 'doc') AS docs, (SELECT count(*) FROM shared_decks WHERE removed_at IS NULL) AS decks,
            (SELECT count(*) FROM comments WHERE deleted_at IS NULL AND hidden_at IS NULL) AS comments`);
  return c.json({
    today: t, dias,
    users: { total: N(tot?.users), admins: N(tot?.admins), new: { d1: N(novas?.d1), d7: N(novas?.d7), d30: N(novas?.d30) }, active: { d1: N(ativas?.d1), d7: N(ativas?.d7), d30: N(ativas?.d30) } },
    totals: { questions: N(tot?.questions), correct: N(tot?.correct), cards: N(tot?.cards), docs: N(content?.docs), decks: N(content?.decks), comments: N(content?.comments) },
    storage: { records: N(storage?.bytes), files: N(uploads?.bytes), fileCount: N(uploads?.files), total: N(storage?.bytes) + N(uploads?.bytes) },
    errors: { d1: N(errors?.d1), d7: N(errors?.d7), last: lastError ? { at: ms(lastError.at), method: lastError.method, path: lastError.path, message: lastError.message } : null },
    inbox: { feedback: N(inbox?.feedback), senha: N(inbox?.senha), flags: N(inbox?.flags), reports: N(inbox?.reports), total: N(inbox?.feedback) + N(inbox?.senha) + N(inbox?.flags) + N(inbox?.reports) },
    series: series.map((x) => ({ day: x.day, novas: N(x.novas), ativas: N(x.ativas), questions: N(x.questions), correct: N(x.correct), cards: N(x.cards), ms: N(x.ms), screens: N(x.screens), resumos: N(x.resumos) })),
  });
});

/* ---------- pessoas: lista com busca, filtros, ordem e página ---------- */
const USER_SORT: Record<string, string> = { nome: "lower(name)", criada: "created_at", acesso: "last_seen", questoes: "total_questions", espaco: "bytes", papel: "role" };

r.get("/admin/painel/usuarios", async (c) => {
  requireAdmin(c);
  const p = page(c);
  const search = c.req.query("q")?.trim().slice(0, 80) || null;
  const papel = oneOf(c.req.query("papel"), ["user", "admin"] as const);
  const situacao = oneOf(c.req.query("situacao"), ["ativos", "inativos"] as const);
  const atividade = oneOf(c.req.query("atividade"), ["com", "sem"] as const);
  const ordem = c.req.query("ordem") || "acesso", col = USER_SORT[ordem] || USER_SORT.acesso;
  const dir = c.req.query("dir") === "asc" ? "ASC" : "DESC";
  const rows = await q<any>(
    `WITH base AS (
       SELECT u.id, u.name, u.handle, u.email, u.role, u.avatar_url, u.faculdade, u.created_at, u.total_questions, u.total_correct, u.total_cards,
              GREATEST(ls.at, ev.at) AS last_seen, COALESCE(st.records_bytes, 0) + COALESCE(up.bytes, 0) AS bytes
       FROM users u
       LEFT JOIN user_storage st ON st.user_id = u.id
       LEFT JOIN LATERAL (SELECT max(s.last_seen_at) AS at FROM sessions s WHERE s.user_id = u.id) ls ON true
       LEFT JOIN LATERAL (SELECT e.at FROM usage_events e WHERE e.user_id = u.id ORDER BY e.at DESC LIMIT 1) ev ON true
       LEFT JOIN LATERAL (SELECT sum(x.bytes) AS bytes FROM uploads x WHERE x.user_id = u.id) up ON true
       WHERE ($1::text IS NULL OR f_unaccent(lower(u.name || ' ' || u.handle || ' ' || coalesce(u.faculdade, ''))) LIKE f_unaccent(lower($1)) OR lower(u.email) LIKE lower($1))
         AND ($2::text IS NULL OR u.role = $2)
         AND ($3::text IS NULL OR (u.total_questions + u.total_cards > 0) = ($3 = 'com'))
     )
     SELECT *, count(*) OVER () AS total FROM base
     WHERE ($4::text IS NULL OR COALESCE(last_seen > now() - interval '30 days', false) = ($4 = 'ativos'))
     ORDER BY ${col} ${dir} NULLS LAST, id LIMIT $5 OFFSET $6`,
    [search ? likeAny(search) : null, papel, atividade, situacao, p.size, p.offset],
  );
  return c.json({
    total: rows.length ? N(rows[0].total) : 0, page: p.n, size: p.size,
    items: rows.map((u) => ({
      id: u.id, name: u.name, handle: u.handle, email: u.email, role: u.role, avatarUrl: u.avatar_url, faculdade: u.faculdade, createdAt: ms(u.created_at)!, lastSeen: ms(u.last_seen),
      questions: u.total_questions, correct: u.total_correct, cards: u.total_cards, bytes: N(u.bytes),
    })),
  });
});

/* ---------- uma pessoa: o que /admin/users/:id não traz ---------- */
r.get("/admin/painel/usuarios/:id/extra", async (c) => {
  requireAdmin(c);
  const id = uuidOr404(c.req.param("id"), "Não encontramos essa pessoa.");
  if (!(await one("SELECT 1 FROM users WHERE id = $1", [id]))) throw notFound("Não encontramos essa pessoa.");
  const [sessions, tokens, shared, audit, ai, made, against, comments, commentCount, docs, sharedDocs, uploads, follows, subs] = await Promise.all([
    q<any>("SELECT user_agent, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY last_seen_at DESC LIMIT 30", [id]),
    q<any>(
      `SELECT t.id, t.kind, t.label, t.scope, cl.client_name, t.created_at, t.last_used_at, t.expires_at, t.revoked_at
       FROM mcp_tokens t LEFT JOIN oauth_clients cl ON cl.client_id = t.client_id WHERE t.user_id = $1 ORDER BY t.created_at DESC LIMIT 50`, [id]),
    q<any>("SELECT id, created_at, last_used_at, expires_at, ended_at FROM mcp_shared_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20", [id]),
    q<any>("SELECT id, tool, mode, writes, ok, ms, summary, at FROM mcp_audit WHERE user_id = $1 ORDER BY at DESC LIMIT 40", [id]),
    one<any>(
      `SELECT count(*) AS runs, count(*) FILTER (WHERE status = 'erro') AS failed, COALESCE(sum(tokens_in), 0) AS tin, COALESCE(sum(tokens_out), 0) AS tout, COALESCE(sum(cache_read), 0) AS cread, max(created_at) AS last
       FROM ai_runs WHERE user_id = $1 AND created_at >= now() - interval '30 days'`, [id]),
    q<any>(
      `SELECT r.id, r.target_kind, r.reason, r.status, r.created_at,
              CASE r.target_kind WHEN 'comment' THEN tc.body WHEN 'user' THEN '@' || tu.handle || ' (' || tu.name || ')' WHEN 'doc' THEN td.title WHEN 'deck' THEN ts.name END AS target_text
       FROM reports r
       LEFT JOIN comments tc ON r.target_kind = 'comment' AND tc.id::text = r.target_id
       LEFT JOIN users tu ON r.target_kind = 'user' AND tu.id::text = r.target_id
       LEFT JOIN docs td ON r.target_kind = 'doc' AND td.id::text = r.target_id
       LEFT JOIN shared_decks ts ON r.target_kind = 'deck' AND ts.id::text = r.target_id
       WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 30`, [id]),
    q<any>("SELECT r.id, r.reason, r.status, r.created_at, a.handle, a.name FROM reports r JOIN users a ON a.id = r.user_id WHERE r.target_kind = 'user' AND r.target_id = $1::text ORDER BY r.created_at DESC LIMIT 30", [id]),
    q<any>("SELECT id, qid, left(body, 240) AS body, likes, created_at, deleted_at IS NOT NULL AS deleted, hidden_at IS NOT NULL AS hidden FROM comments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10", [id]),
    one<any>("SELECT count(*) AS n FROM comments WHERE user_id = $1", [id]),
    one<any>(
      `SELECT count(*) FILTER (WHERE kind = 'doc') AS docs, count(*) FILTER (WHERE kind = 'pasta') AS folders, COALESCE(sum(octet_length(plain)), 0) AS bytes,
              count(*) FILTER (WHERE kind = 'doc' AND origin = 'ia') AS by_ai, max(updated_at) AS last
       FROM docs WHERE user_id = $1 AND deleted_at IS NULL`, [id]),
    // título só do que a pessoa escolheu compartilhar; o privado entra só na contagem
    q<any>("SELECT id, kind, title, visibility, octet_length(plain) AS bytes, updated_at FROM docs WHERE user_id = $1 AND visibility <> 'privado' AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20", [id]),
    q<any>("SELECT kind, ext, bytes, width, height, created_at FROM uploads WHERE user_id = $1 ORDER BY bytes DESC LIMIT 50", [id]),
    one<any>(
      `SELECT (SELECT count(*) FROM follows WHERE followee_id = $1 AND status = 'aceito') AS followers, (SELECT count(*) FROM follows WHERE follower_id = $1 AND status = 'aceito') AS following,
              (SELECT count(*) FROM follows WHERE followee_id = $1 AND status = 'pendente') AS pending`, [id]),
    one<any>("SELECT count(*) AS n FROM deck_subscriptions WHERE user_id = $1", [id]),
  ]);
  return c.json({
    sessions: sessions.map((s) => ({ device: s.user_agent, since: ms(s.created_at), lastSeen: ms(s.last_seen_at), expiresAt: ms(s.expires_at) })),
    mcp: {
      tokens: tokens.map((t) => ({ id: t.id, kind: t.kind, label: t.label, scope: t.scope, client: t.client_name, createdAt: ms(t.created_at), lastUsedAt: ms(t.last_used_at), expiresAt: ms(t.expires_at), revokedAt: ms(t.revoked_at) })),
      sharedSessions: shared.map((s) => ({ id: s.id, createdAt: ms(s.created_at), lastUsedAt: ms(s.last_used_at), expiresAt: ms(s.expires_at), endedAt: ms(s.ended_at) })),
      audit: audit.map((a) => ({ id: a.id, tool: a.tool, mode: a.mode, writes: a.writes, ok: a.ok, ms: a.ms, summary: a.summary, at: ms(a.at) })),
    },
    ia: { runs: N(ai?.runs), failed: N(ai?.failed), tokensIn: N(ai?.tin), tokensOut: N(ai?.tout), cacheRead: N(ai?.cread), last: ms(ai?.last) },
    reports: {
      made: made.map((x) => ({ id: x.id, targetKind: x.target_kind, reason: x.reason, status: x.status, createdAt: ms(x.created_at), targetText: x.target_text ? String(x.target_text).slice(0, 240) : null })),
      against: against.map((x) => ({ id: x.id, reason: x.reason, status: x.status, createdAt: ms(x.created_at), author: { handle: x.handle, name: x.name } })),
    },
    comments: { total: N(commentCount?.n), recent: comments.map((x) => ({ id: x.id, qid: x.qid, body: x.body, likes: x.likes, createdAt: ms(x.created_at), deleted: x.deleted, hidden: x.hidden })) },
    docs: {
      docs: N(docs?.docs), folders: N(docs?.folders), bytes: N(docs?.bytes), byAi: N(docs?.by_ai), last: ms(docs?.last),
      shared: sharedDocs.map((d) => ({ id: d.id, kind: d.kind, title: d.title, visibility: d.visibility, bytes: N(d.bytes), updatedAt: ms(d.updated_at) })),
    },
    uploads: uploads.map((f) => ({ kind: f.kind, ext: f.ext, bytes: N(f.bytes), width: f.width, height: f.height, createdAt: ms(f.created_at) })),
    people: { followers: N(follows?.followers), following: N(follows?.following), pending: N(follows?.pending), deckSubscriptions: N(subs?.n) },
  });
});

/* ---------- uso: telas abertas por função, por dia e por hora ---------- */
r.get("/admin/painel/uso", async (c) => {
  requireAdmin(c);
  // os eventos ficam 90 dias; o total por dia fica para sempre
  const dias = clamp(c.req.query("dias"), 30, 1, 90), t = today();
  const since = `($1::date - ($2::int - 1))::timestamp AT TIME ZONE '${TZ}'`;
  const [totals, byPath, byDay, byPathDay, hours, people] = await Promise.all([
    one<any>(`SELECT count(*) AS events, count(DISTINCT visit) AS visits, count(DISTINCT user_id) AS people, COALESCE(sum(ms), 0) AS ms FROM usage_events WHERE at >= ${since}`, [t, dias]),
    q<any>(`SELECT path, count(*) AS n, COALESCE(sum(ms), 0) AS ms, count(DISTINCT user_id) AS people, max(at) AS last FROM usage_events WHERE at >= ${since} GROUP BY path ORDER BY 2 DESC LIMIT 200`, [t, dias]),
    q<any>(
      `SELECT to_char(g.day, 'YYYY-MM-DD') AS day, COALESCE(d.screens, 0) AS screens, COALESCE(d.ms, 0) AS ms, COALESCE(d.people, 0) AS people
       FROM generate_series($1::date - ($2::int - 1), $1::date, interval '1 day') g(day)
       LEFT JOIN (SELECT day, sum(screens) AS screens, sum(ms) AS ms, count(*) AS people FROM usage_days WHERE day > $1::date - $2::int GROUP BY day) d ON d.day = g.day::date ORDER BY 1`, [t, dias]),
    q<any>(`SELECT path, to_char((at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS day, count(*) AS n FROM usage_events WHERE at >= ${since} GROUP BY 1, 2 ORDER BY 2 LIMIT 8000`, [t, dias]),
    q<any>(
      `SELECT extract(dow FROM at AT TIME ZONE '${TZ}')::int AS dow, extract(hour FROM at AT TIME ZONE '${TZ}')::int AS hour, count(*) AS n, count(DISTINCT user_id) AS people
       FROM usage_events WHERE at >= ${since} GROUP BY 1, 2`, [t, dias]),
    q<any>(
      `SELECT d.user_id, u.handle, u.name, sum(d.ms) AS ms, sum(d.screens) AS screens, count(*) AS days FROM usage_days d JOIN users u ON u.id = d.user_id
       WHERE d.day > $1::date - $2::int GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 20`, [t, dias]),
  ]);
  return c.json({
    dias, totals: { events: N(totals?.events), visits: N(totals?.visits), people: N(totals?.people), ms: N(totals?.ms) },
    byPath: byPath.map((x) => ({ path: x.path, n: N(x.n), ms: N(x.ms), people: N(x.people), last: ms(x.last) })),
    byDay: byDay.map((x) => ({ day: x.day, screens: N(x.screens), ms: N(x.ms), people: N(x.people) })),
    byPathDay: byPathDay.map((x) => ({ path: x.path, day: x.day, n: N(x.n) })),
    hours: hours.map((x) => ({ dow: x.dow, hour: x.hour, n: N(x.n), people: N(x.people) })),
    people: people.map((x) => ({ id: x.user_id, handle: x.handle, name: x.name, ms: N(x.ms), screens: N(x.screens), days: N(x.days) })),
  });
});

/* ---------- Sua IA / MCP ---------- */
const mcpWindow = (c: Context) => clamp(c.req.query("horas"), 168, 1, 720);

r.get("/admin/painel/mcp", async (c) => {
  requireAdmin(c);
  const horas = mcpWindow(c), since = new Date(Date.now() - horas * 3_600_000);
  const bucket = horas <= 168 ? "hour" : "day";
  const [tokens, issued, sharedNow, sharedIssued, totals, series, byTool, byUser, heavy] = await Promise.all([
    q<any>("SELECT kind, count(*) AS n, count(DISTINCT user_id) AS people FROM mcp_tokens WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) GROUP BY kind"),
    q<any>("SELECT kind, count(*) AS n FROM mcp_tokens WHERE created_at >= $1 GROUP BY kind", [since]),
    // uma sessão compartilhada vive no máximo 24 h: as abertas foram criadas nesse intervalo
    one<any>("SELECT count(*) AS n, count(DISTINCT user_id) AS people FROM mcp_shared_sessions WHERE created_at > now() - interval '25 hours' AND ended_at IS NULL AND expires_at > now()"),
    one<any>("SELECT count(*) AS n, count(DISTINCT user_id) AS people FROM mcp_shared_sessions WHERE created_at >= $1", [since]),
    one<any>(
      `SELECT count(*) AS calls, count(*) FILTER (WHERE NOT ok) AS failed, count(*) FILTER (WHERE writes) AS writes, count(DISTINCT user_id) AS people, COALESCE(avg(ms), 0) AS avg_ms, COALESCE(max(ms), 0) AS max_ms,
              count(*) FILTER (WHERE mode = 'compartilhado') AS shared
       FROM mcp_audit WHERE at >= $1`, [since]),
    q<any>(`SELECT date_trunc('${bucket}', at) AS at, count(*) AS n, count(*) FILTER (WHERE NOT ok) AS failed, count(DISTINCT user_id) AS people FROM mcp_audit WHERE at >= $1 GROUP BY 1 ORDER BY 1`, [since]),
    q<any>(
      `SELECT tool, count(*) AS n, count(*) FILTER (WHERE NOT ok) AS failed, bool_or(writes) AS writes, avg(ms) AS avg_ms, max(ms) AS max_ms, percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) AS p95, count(DISTINCT user_id) AS people, max(at) AS last
       FROM mcp_audit WHERE at >= $1 GROUP BY tool ORDER BY 2 DESC LIMIT 80`, [since]),
    q<any>(
      `SELECT m.user_id, u.handle, u.name, sum(m.n) AS calls, sum(m.failed) AS failed, max(m.n) AS peak, max(m.last) AS last FROM (
         SELECT user_id, date_trunc('hour', at) AS h, count(*) AS n, count(*) FILTER (WHERE NOT ok) AS failed, max(at) AS last FROM mcp_audit WHERE at >= $1 GROUP BY 1, 2
       ) m JOIN users u ON u.id = m.user_id GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 20`, [since]),
    q<any>("SELECT a.id, a.user_id, a.tool, a.mode, a.writes, a.ok, a.ms, a.summary, a.at, u.handle, u.name FROM mcp_audit a JOIN users u ON u.id = a.user_id WHERE a.at >= $1 ORDER BY a.ms DESC LIMIT 20", [since]),
  ]);
  const issuedBy = new Map(issued.map((x) => [x.kind, N(x.n)]));
  return c.json({
    horas, bucket,
    tokens: (["pessoal", "refresh", "access"] as const).map((kind) => { const x = tokens.find((y) => y.kind === kind); return { kind, active: N(x?.n), people: N(x?.people), issued: issuedBy.get(kind) || 0 }; }),
    shared: { open: N(sharedNow?.n), openPeople: N(sharedNow?.people), issued: N(sharedIssued?.n), people: N(sharedIssued?.people) },
    totals: { calls: N(totals?.calls), failed: N(totals?.failed), writes: N(totals?.writes), people: N(totals?.people), avgMs: Math.round(N(totals?.avg_ms)), maxMs: N(totals?.max_ms), shared: N(totals?.shared) },
    series: series.map((x) => ({ at: ms(x.at)!, n: N(x.n), failed: N(x.failed), people: N(x.people) })),
    byTool: byTool.map((x) => ({ tool: x.tool, n: N(x.n), failed: N(x.failed), writes: !!x.writes, avgMs: Math.round(N(x.avg_ms)), maxMs: N(x.max_ms), p95: Math.round(N(x.p95)), people: N(x.people), last: ms(x.last) })),
    byUser: byUser.map((x) => ({ id: x.user_id, handle: x.handle, name: x.name, calls: N(x.calls), failed: N(x.failed), peakPerHour: N(x.peak), last: ms(x.last) })),
    heaviest: heavy.map((a) => ({ id: a.id, tool: a.tool, mode: a.mode, writes: a.writes, ok: a.ok, ms: a.ms, summary: a.summary, at: ms(a.at), who: who(a) })),
  });
});

r.get("/admin/painel/mcp/auditoria", async (c) => {
  requireAdmin(c);
  const p = page(c), since = new Date(Date.now() - mcpWindow(c) * 3_600_000);
  const usuario = userFilter(c), tool = c.req.query("ferramenta")?.slice(0, 80) || null, falhas = c.req.query("falhas") === "1", modo = oneOf(c.req.query("modo"), ["normal", "compartilhado"] as const);
  const where = "a.at >= $1 AND ($2::uuid IS NULL OR a.user_id = $2) AND ($3::text IS NULL OR a.tool = $3) AND (NOT $4 OR NOT a.ok) AND ($5::text IS NULL OR a.mode = $5)";
  const args = [since, usuario, tool, falhas, modo];
  const [rows, total] = await Promise.all([
    q<any>(`SELECT a.id, a.user_id, a.tool, a.mode, a.writes, a.ok, a.ms, a.summary, a.at, u.handle, u.name FROM mcp_audit a JOIN users u ON u.id = a.user_id WHERE ${where} ORDER BY a.at DESC, a.id DESC LIMIT $6 OFFSET $7`, [...args, p.size, p.offset]),
    one<any>(`SELECT count(*) AS n FROM mcp_audit a WHERE ${where}`, args),
  ]);
  return c.json({ total: N(total?.n), page: p.n, size: p.size, items: rows.map((a) => ({ id: a.id, tool: a.tool, mode: a.mode, writes: a.writes, ok: a.ok, ms: a.ms, summary: a.summary, at: ms(a.at), who: who(a) })) });
});

r.get("/admin/painel/mcp/tokens", async (c) => {
  requireAdmin(c);
  const p = page(c), usuario = userFilter(c), tipo = oneOf(c.req.query("tipo"), ["pessoal", "refresh", "access"] as const), ativos = c.req.query("ativos") === "1";
  const rows = await q<any>(
    `SELECT t.id, t.user_id, t.kind, t.label, t.scope, cl.client_name, t.created_at, t.last_used_at, t.expires_at, t.revoked_at, u.handle, u.name
     FROM mcp_tokens t JOIN users u ON u.id = t.user_id LEFT JOIN oauth_clients cl ON cl.client_id = t.client_id
     WHERE ($1::uuid IS NULL OR t.user_id = $1) AND ($2::text IS NULL OR t.kind = $2) AND (NOT $3 OR (t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now())))
     ORDER BY t.created_at DESC LIMIT $4 OFFSET $5`,
    [usuario, tipo, ativos, p.size + 1, p.offset],
  );
  return c.json({
    page: p.n, size: p.size, more: rows.length > p.size,
    items: rows.slice(0, p.size).map((t) => ({ id: t.id, kind: t.kind, label: t.label, scope: t.scope, client: t.client_name, createdAt: ms(t.created_at), lastUsedAt: ms(t.last_used_at), expiresAt: ms(t.expires_at), revokedAt: ms(t.revoked_at), who: who(t) })),
  });
});

r.get("/admin/painel/mcp/sessoes", async (c) => {
  requireAdmin(c);
  const p = page(c), usuario = userFilter(c);
  const rows = await q<any>(
    `SELECT s.id, s.user_id, s.created_at, s.last_used_at, s.expires_at, s.ended_at, u.handle, u.name FROM mcp_shared_sessions s JOIN users u ON u.id = s.user_id
     WHERE ($1::uuid IS NULL OR s.user_id = $1) ORDER BY s.created_at DESC LIMIT $2 OFFSET $3`, [usuario, p.size + 1, p.offset]);
  return c.json({
    page: p.n, size: p.size, more: rows.length > p.size,
    items: rows.slice(0, p.size).map((s) => ({ id: s.id, createdAt: ms(s.created_at), lastUsedAt: ms(s.last_used_at), expiresAt: ms(s.expires_at), endedAt: ms(s.ended_at), who: who(s) })),
  });
});

/* ---------- IA dentro do app: sempre em tokens ---------- */
r.get("/admin/painel/ia", async (c) => {
  requireAdmin(c);
  const dias = clamp(c.req.query("dias"), 30, 1, 180), t = today();
  const since = `($1::date - ($2::int - 1))::timestamp AT TIME ZONE '${TZ}'`;
  const [totals, daily, byUser, byKind, byModel] = await Promise.all([
    one<any>(
      `SELECT count(*) AS runs, count(*) FILTER (WHERE status = 'erro') AS failed, count(*) FILTER (WHERE status = 'rodando') AS running, COALESCE(sum(tokens_in), 0) AS tin, COALESCE(sum(tokens_out), 0) AS tout,
              COALESCE(sum(cache_read), 0) AS cread, COALESCE(sum(cache_write), 0) AS cwrite, count(DISTINCT user_id) AS people, avg(ms) FILTER (WHERE status = 'feito') AS avg_ms
       FROM ai_runs WHERE created_at >= ${since}`, [t, dias]),
    q<any>(
      `SELECT to_char(g.day, 'YYYY-MM-DD') AS day, COALESCE(a.runs, 0) AS runs, COALESCE(a.failed, 0) AS failed, COALESCE(a.tin, 0) AS tin, COALESCE(a.tout, 0) AS tout, COALESCE(a.cread, 0) AS cread, COALESCE(a.people, 0) AS people
       FROM generate_series($1::date - ($2::int - 1), $1::date, interval '1 day') g(day)
       LEFT JOIN (SELECT (created_at AT TIME ZONE '${TZ}')::date AS day, count(*) AS runs, count(*) FILTER (WHERE status = 'erro') AS failed, sum(tokens_in) AS tin, sum(tokens_out) AS tout, sum(cache_read) AS cread, count(DISTINCT user_id) AS people
                  FROM ai_runs WHERE created_at >= ${since} GROUP BY 1) a ON a.day = g.day::date ORDER BY 1`, [t, dias]),
    q<any>(
      `SELECT a.user_id, u.handle, u.name, count(*) AS runs, count(*) FILTER (WHERE a.status = 'erro') AS failed, sum(a.tokens_in) AS tin, sum(a.tokens_out) AS tout, max(a.created_at) AS last
       FROM ai_runs a JOIN users u ON u.id = a.user_id WHERE a.created_at >= ${since} GROUP BY 1, 2, 3 ORDER BY sum(a.tokens_in) + sum(a.tokens_out) DESC LIMIT 30`, [t, dias]),
    q<any>(`SELECT kind, trigger, count(*) AS runs, sum(tokens_in) AS tin, sum(tokens_out) AS tout, avg(tokens_in) AS avg_in, avg(tokens_out) AS avg_out FROM ai_runs WHERE created_at >= ${since} GROUP BY 1, 2 ORDER BY 3 DESC`, [t, dias]),
    q<any>(`SELECT model, count(*) AS runs, sum(tokens_in) AS tin, sum(tokens_out) AS tout FROM ai_runs WHERE created_at >= ${since} GROUP BY 1 ORDER BY 2 DESC`, [t, dias]),
  ]);
  return c.json({
    dias,
    totals: { runs: N(totals?.runs), failed: N(totals?.failed), running: N(totals?.running), tokensIn: N(totals?.tin), tokensOut: N(totals?.tout), cacheRead: N(totals?.cread), cacheWrite: N(totals?.cwrite), people: N(totals?.people), avgMs: Math.round(N(totals?.avg_ms)) },
    daily: daily.map((x) => ({ day: x.day, runs: N(x.runs), failed: N(x.failed), tokensIn: N(x.tin), tokensOut: N(x.tout), cacheRead: N(x.cread), people: N(x.people) })),
    byUser: byUser.map((x) => ({ id: x.user_id, handle: x.handle, name: x.name, runs: N(x.runs), failed: N(x.failed), tokensIn: N(x.tin), tokensOut: N(x.tout), last: ms(x.last) })),
    byKind: byKind.map((x) => ({ kind: x.kind, trigger: x.trigger, runs: N(x.runs), tokensIn: N(x.tin), tokensOut: N(x.tout), avgIn: Math.round(N(x.avg_in)), avgOut: Math.round(N(x.avg_out)) })),
    byModel: byModel.map((x) => ({ model: x.model, runs: N(x.runs), tokensIn: N(x.tin), tokensOut: N(x.tout) })),
  });
});

r.get("/admin/painel/ia/execucoes", async (c) => {
  requireAdmin(c);
  const p = page(c), dias = clamp(c.req.query("dias"), 90, 1, 365), since = new Date(Date.now() - dias * 86_400_000);
  const usuario = userFilter(c), status = oneOf(c.req.query("status"), ["rodando", "feito", "erro"] as const), tipo = oneOf(c.req.query("tipo"), ["resultado", "flashcards", "teste"] as const);
  const rows = await q<any>(
    `SELECT a.id, a.user_id, a.kind, a.trigger, a.status, a.model, a.effort, a.est_in, a.est_out, a.tokens_in, a.tokens_out, a.cache_read, a.cache_write, a.ms, left(a.error, 300) AS error, a.created_at, a.source->>'title' AS title, a.parent, u.handle, u.name
     FROM ai_runs a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.created_at >= $1 AND ($2::uuid IS NULL OR a.user_id = $2) AND ($3::text IS NULL OR a.status = $3) AND ($4::text IS NULL OR a.kind = $4)
     ORDER BY a.created_at DESC LIMIT $5 OFFSET $6`,
    [since, usuario, status, tipo, p.size + 1, p.offset],
  );
  return c.json({
    page: p.n, size: p.size, more: rows.length > p.size,
    items: rows.slice(0, p.size).map((x) => ({
      id: x.id, kind: x.kind, trigger: x.trigger, status: x.status, model: x.model, effort: x.effort, estIn: x.est_in, estOut: x.est_out, tokensIn: x.tokens_in, tokensOut: x.tokens_out, cacheRead: x.cache_read, cacheWrite: x.cache_write,
      ms: x.ms, error: x.error, createdAt: ms(x.created_at)!, title: x.title, parent: x.parent, who: who(x),
    })),
  });
});

export default r;
