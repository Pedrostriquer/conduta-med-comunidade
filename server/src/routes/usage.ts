/* O app avisa quais telas a pessoa abriu e por quanto tempo ficou nelas, de tempos em tempos. Só o endereço da tela (com os ids
   trocados por :id), nunca o que está nela. O admin vê isso; está dito nos Termos e em Ajustes. */
import { Hono } from "hono";
import { z } from "zod";
import { tx } from "../db";
import { hit } from "../http";
import type { AppEnv } from "../http";
import { jsonBody } from "../lib/validate";

const MAX_MS = 30 * 60_000, DAY = 86_400_000;
const schema = z.object({
  visit: z.string().regex(/^[\w-]{4,40}$/),
  events: z.array(z.object({ path: z.string().regex(/^\/[\w/:.-]{0,79}$/), at: z.number(), ms: z.number() })).max(50),
});
const dayOf = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);

const r = new Hono<AppEnv>();

r.post("/uso", async (c) => {
  const u = c.get("user");
  if (!u) return c.body(null, 204);
  const b = await jsonBody(c, schema);
  hit(`uso:${u.id}`, 240, 3_600_000);
  const now = Date.now();
  const rows = b.events.filter((e) => e.at <= now + 60_000 && e.at >= now - 2 * DAY).map((e) => ({ ...e, ms: Math.max(0, Math.min(MAX_MS, Math.round(e.ms))) }));
  if (!rows.length) return c.body(null, 204);
  const days = new Map<string, { ms: number; screens: number }>();
  for (const e of rows) { const d = days.get(dayOf(e.at)) || { ms: 0, screens: 0 }; d.ms += e.ms; d.screens++; days.set(dayOf(e.at), d); }
  await tx(async (db) => {
    await db.query(
      `INSERT INTO usage_events (user_id, visit, path, at, ms)
       SELECT $1, $2, x.path, to_timestamp(x.at / 1000.0), x.ms FROM jsonb_to_recordset($3::jsonb) AS x(path text, at bigint, ms int)`,
      [u.id, b.visit, JSON.stringify(rows)],
    );
    for (const [day, d] of days) {
      await db.query("INSERT INTO usage_days (user_id, day, ms, screens) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, day) DO UPDATE SET ms = usage_days.ms + $3, screens = usage_days.screens + $4", [u.id, day, d.ms, d.screens]);
    }
  });
  return c.body(null, 204);
});

export default r;
