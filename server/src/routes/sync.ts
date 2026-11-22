/* Espelho do que o app guarda no navegador. A regra de escrita (última ganha, contadores) fica em `records.ts`. */
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { invalid, requireUser } from "../http";
import type { AppEnv } from "../http";
import { jsonBody, jsonForDb, jsonSize } from "../lib/validate";
import { applyChanges, COLLECTIONS, pullChanges } from "../records";

const MAX_RECORD = 256 * 1024, MAX_CALL = 8 * 1024 * 1024, MAX_CHANGES = 500;
/** relógio adiantado no aparelho não pode travar um registro para sempre */
const MAX_FUTURE = 86_400_000;

const pushSchema = z.object({
  changes: z.array(z.object({
    c: z.string(),
    id: z.string().min(1).max(512).regex(/^[^\u0000]*$/),
    data: z.unknown().optional(),
    deleted: z.boolean().optional(),
    at: z.number().min(0).max(8.64e15),
  })).max(MAX_CHANGES, `Dá para enviar até ${MAX_CHANGES} mudanças por vez.`),
});

/* O progresso do treino de digitar (ossos, músculos e ECG). Um registro por item, com id "<região>/<item>", e o registro
   "dia" com o "do dia". É a única coleção com formato conferido aqui: são números pequenos e nada além deles deve entrar.
   Não mexe nos contadores do perfil: o treino fica fora das estatísticas de questões. */
const MS = z.number().min(0).max(8.64e15);
const treinoItem = z.object({
  n: z.number().int().min(0).max(1000),
  ok: z.number().int().min(0).max(1_000_000),
  err: z.number().int().min(0).max(1_000_000),
  ultima: MS, rever: MS,
  f: z.union([z.literal(0), z.literal(1), z.literal(2)]),
}).strict();
const treinoDia = z.object({
  dia: z.object({
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    conjunto: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
    quadros: z.array(z.enum(["certo", "viu", "errado"])).max(10),
  }).strict().nullable(),
  sequencia: z.number().int().min(0).max(100_000),
}).strict();
const TREINO_ID = /^[a-z0-9-]{1,80}\/[a-z0-9-]{1,80}$/;
function checkTreino(id: string, data: unknown, deleted?: boolean) {
  if (id !== "dia" && !TREINO_ID.test(id)) throw invalid("O progresso do treino veio com um item que não reconhecemos.");
  if (deleted) return;
  if (!(id === "dia" ? treinoDia : treinoItem).safeParse(data).success) throw invalid("O progresso do treino veio em um formato que não reconhecemos.");
}

const r = new Hono<AppEnv>();

r.post("/sync/push", bodyLimit({ maxSize: MAX_CALL, onError: () => { throw invalid("Esta sincronização passou de 8 MB."); } }), async (c) => {
  const u = requireUser(c);
  const { changes } = await jsonBody(c, pushSchema);
  const latest = Date.now() + MAX_FUTURE;
  for (const ch of changes) {
    if (!COLLECTIONS.has(ch.c)) throw invalid(`Não conhecemos a coleção "${ch.c}".`);
    if (jsonSize(ch.data) > MAX_RECORD) throw invalid("Um dos registros passou de 256 KB.");
    jsonForDb(ch.data);
    if (ch.c === "treino") checkTreino(ch.id, ch.data, ch.deleted);
    ch.at = Math.min(ch.at, latest);
  }
  return c.json(await applyChanges(u.id, changes, "app"));
});

r.get("/sync/pull", async (c) => {
  const u = requireUser(c);
  const since = Math.max(0, Math.floor(Number(c.req.query("since")) || 0));
  const limit = Math.min(1000, Math.max(1, Math.floor(Number(c.req.query("limit")) || 1000)));
  return c.json(await pullChanges(u.id, since, limit));
});

export default r;
