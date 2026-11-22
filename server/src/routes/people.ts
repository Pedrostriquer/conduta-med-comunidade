/* Pessoas: busca, perfil e o seguir, que sempre pede aceite. A regra de quem vê o quê está em lib/visibility.ts. */
import { Hono } from "hono";
import { z } from "zod";
import { one, q } from "../db";
import { invalid, ms, notFound, rateLimit, requireUser } from "../http";
import type { AppEnv } from "../http";
import { decksOfUser } from "../lib/decks-store";
import { countVisibleDocs } from "../lib/docs-store";
import { sharedPlan } from "../lib/plan-share";
import { jsonBody, likeAny, noNul } from "../lib/validate";
import { canSee, CARD_COLS, isLocked, ownerByHandle, personCard, relationOf, viewerOf, visibleLevels } from "../lib/visibility";
import type { CardRow, FollowStatus } from "../lib/visibility";

const MINUTE = 60_000, HOUR = 3_600_000;
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const FOLLOW_JOIN = "LEFT JOIN follows f ON f.follower_id = $1 AND f.followee_id = u.id";

const r = new Hono<AppEnv>();

r.get("/users/search", rateLimit("busca", 60, MINUTE), async (c) => {
  const me = requireUser(c), text = noNul(c.req.query("q") || "").trim().slice(0, 100);
  if ((text.match(/[\p{L}\p{N}]/gu) || []).length < 2) return c.json({ people: [] });
  const rows = await q<CardRow>(
    `SELECT ${CARD_COLS} FROM users u ${FOLLOW_JOIN}
     WHERE u.visibility <> 'privado' AND f_unaccent(lower(u.name || ' ' || u.handle || ' ' || coalesce(u.faculdade,''))) ILIKE f_unaccent(lower($2))
     ORDER BY similarity(f_unaccent(lower(u.name || ' ' || u.handle)), f_unaccent(lower($3))) DESC, u.name LIMIT 40`,
    [me.id, likeAny(text), text],
  );
  // quem achou pela faculdade não pode descobrir a faculdade que a pessoa escondeu
  const wanted = fold(text);
  const people = rows.map((x) => personCard(me.id, x)).filter((p) => fold(`${p.name} ${p.handle} ${p.faculdade ?? ""}`).includes(wanted));
  return c.json({ people: people.slice(0, 30) });
});

r.get("/users/:handle", async (c) => {
  const me = requireUser(c), o = await ownerByHandle(me.id, c.req.param("handle"));
  const v = viewerOf(me.id, o), self = me.id === o.id, card = personCard(me.id, o), followsYou = o.back === "aceito";
  if (isLocked(v, o)) {
    return c.json({ profile: { ...card, bio: "", cidade: null, formado: false, since: 0, visibility: o.visibility, locked: true, followsYou, followers: 0, following: 0, stats: null, decks: [], plan: null, docsCount: 0 } });
  }
  const showStats = self || o.show_stats, showDays = showStats && (self || o.show_activity);
  const [counts, days, decks, plan, docsCount] = await Promise.all([
    one<{ followers: number; following: number }>(
      "SELECT (SELECT count(*) FROM follows WHERE followee_id = $1 AND status = 'aceito') AS followers, (SELECT count(*) FROM follows WHERE follower_id = $1 AND status = 'aceito') AS following",
      [o.id],
    ),
    showDays
      ? q<{ day: string; n: number }>(
        `SELECT day::text AS day, questions + cards AS n FROM user_days
         WHERE user_id = $1 AND day >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 182 AND questions + cards > 0 ORDER BY day`,
        [o.id],
      )
      : Promise.resolve([]),
    decksOfUser(me.id, o.id),
    canSee(v, o, o.share_plan) ? sharedPlan(o.id) : Promise.resolve(null),
    countVisibleDocs(o.id, visibleLevels(v, o)),
  ]);
  return c.json({
    profile: {
      ...card, bio: o.bio, cidade: o.cidade, formado: (o.id === me.id || o.show_faculdade) && o.formado, since: ms(o.created_at)!, visibility: o.visibility, locked: false, followsYou, followers: counts!.followers, following: counts!.following,
      stats: showStats ? { questions: o.total_questions, cards: o.total_cards, days } : null, decks, plan, docsCount,
    },
  });
});

r.post("/users/:handle/follow", rateLimit("seguir", 60, HOUR), async (c) => {
  const me = requireUser(c), o = await ownerByHandle(me.id, c.req.param("handle"));
  if (o.id === me.id) throw invalid("Você não precisa seguir a si mesmo.");
  // sempre começa pendente; quem já é seguidor aceito continua como está
  const row = await one<{ status: FollowStatus }>(
    "INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT (follower_id, followee_id) DO UPDATE SET status = follows.status RETURNING status",
    [me.id, o.id],
  );
  return c.json({ relation: relationOf(me.id, o.id, row!.status) });
});

// sem passar pela checagem de perfil: dá para deixar de seguir quem virou privado depois
r.delete("/users/:handle/follow", async (c) => {
  const me = requireUser(c);
  await q("DELETE FROM follows WHERE follower_id = $1 AND followee_id = (SELECT id FROM users WHERE lower(handle) = lower($2))", [me.id, c.req.param("handle").replace(/^@/, "")]);
  return c.json({ relation: "nenhuma" as const });
});

r.get("/me/follow-requests", async (c) => {
  const me = requireUser(c);
  const rows = await q<CardRow & { at: Date }>(
    `SELECT ${CARD_COLS}, x.created_at AS at FROM follows x JOIN users u ON u.id = x.follower_id ${FOLLOW_JOIN}
     WHERE x.followee_id = $1 AND x.status = 'pendente' ORDER BY x.created_at DESC LIMIT 500`,
    [me.id],
  );
  return c.json({ requests: rows.map((x) => ({ ...personCard(me.id, x), at: ms(x.at)! })) });
});

r.post("/me/follow-requests/:handle", async (c) => {
  const me = requireUser(c);
  const b = await jsonBody(c, z.object({ accept: z.boolean() }));
  const who = c.req.param("handle").replace(/^@/, "");
  const sql = b.accept
    ? "UPDATE follows SET status = 'aceito', decided_at = now() WHERE followee_id = $1 AND status = 'pendente' AND follower_id = (SELECT id FROM users WHERE lower(handle) = lower($2))"
    : "DELETE FROM follows WHERE followee_id = $1 AND status = 'pendente' AND follower_id = (SELECT id FROM users WHERE lower(handle) = lower($2))";
  const res = await one<{ n: number }>(`WITH x AS (${sql} RETURNING 1) SELECT count(*) AS n FROM x`, [me.id, who]);
  if (!res?.n) throw notFound("Esse pedido não existe mais.");
  return c.body(null, 204);
});

r.delete("/me/followers/:handle", async (c) => {
  const me = requireUser(c);
  await q("DELETE FROM follows WHERE followee_id = $1 AND follower_id = (SELECT id FROM users WHERE lower(handle) = lower($2))", [me.id, c.req.param("handle").replace(/^@/, "")]);
  return c.body(null, 204);
});

async function listPeople(viewerId: string, handle: string, dir: "followers" | "following") {
  const o = await ownerByHandle(viewerId, handle);
  if (isLocked(viewerOf(viewerId, o), o)) return [];
  const on = dir === "followers" ? "x.follower_id = u.id AND x.followee_id = $2" : "x.followee_id = u.id AND x.follower_id = $2";
  // perfil privado só aparece na lista da própria pessoa, que precisa poder gerenciar quem a segue
  const rows = await q<CardRow>(
    `SELECT ${CARD_COLS} FROM follows x JOIN users u ON ${on} ${FOLLOW_JOIN}
     WHERE x.status = 'aceito' AND ($1::uuid = $2::uuid OR u.visibility <> 'privado' OR u.id = $1::uuid)
     ORDER BY x.decided_at DESC NULLS LAST LIMIT 500`,
    [viewerId, o.id],
  );
  return rows.map((x) => personCard(viewerId, x));
}
r.get("/users/:handle/followers", async (c) => c.json({ people: await listPeople(requireUser(c).id, c.req.param("handle"), "followers") }));
r.get("/users/:handle/following", async (c) => c.json({ people: await listPeople(requireUser(c).id, c.req.param("handle"), "following") }));

r.get("/users/:handle/plan", async (c) => {
  const me = requireUser(c), o = await ownerByHandle(me.id, c.req.param("handle"));
  const plan = canSee(viewerOf(me.id, o), o, o.share_plan) ? await sharedPlan(o.id) : null;
  if (!plan) throw notFound("Essa pessoa não compartilha o cronograma com você.");
  return c.json({ plan });
});

export default r;
