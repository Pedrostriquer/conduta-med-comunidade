/* Mensagens da pessoa para o criador e as respostas dele. */
import { Hono } from "hono";
import { z } from "zod";
import { rateLimit, requireUser } from "../http";
import type { AppEnv } from "../http";
import { createFeedback, listFeedback } from "../lib/feedback-store";
import { jsonBody } from "../lib/validate";

const r = new Hono<AppEnv>();

r.post("/feedback", rateLimit("suporte", 30, 3_600_000), async (c) => {
  const me = requireUser(c);
  const b = await jsonBody(c, z.object({ kind: z.enum(["sugestao", "prova", "problema", "outro"]), title: z.string().optional(), body: z.string(), meta: z.record(z.string(), z.unknown()).optional() }));
  return c.json({ item: await createFeedback(me.id, b, "app") });
});

r.get("/feedback", async (c) => c.json({ items: await listFeedback(requireUser(c).id) }));

export default r;
