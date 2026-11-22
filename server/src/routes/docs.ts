/* Resumos: a lógica da árvore está em lib/docs-store.ts, compartilhada com o plugin. Aqui ficam as rotas e o que é de outra pessoa. */
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { invalid, notFound, rateLimit, requireUser } from "../http";
import type { AppEnv } from "../http";
import { copyDocTo, createDoc, destroyDoc, duplicateDoc, getDoc, getVisibleDoc, listTrash, listTree, listVisibleTree, restoreDoc, searchDocs, trashDoc, updateDoc } from "../lib/docs-store";
import { jsonBody, noNul, uuidOr404, zUuid } from "../lib/validate";
import { ownerByHandle, viewerOf, visibleLevels } from "../lib/visibility";

// conteúdo até 2 MB, mais o texto corrido e a folga do JSON
const limit = bodyLimit({ maxSize: 5 * 1024 * 1024, onError: () => { throw invalid("Este resumo passou de 2 MB. Divida em mais de um."); } });
const zTitle = z.string().max(300, "O título pode ter até 300 caracteres.");
const zIcon = z.string().max(64).nullable();
const zPlain = z.string().max(4 * 1024 * 1024);
const zParent = zUuid.nullable();

const createSchema = z.object({ kind: z.enum(["pasta", "doc"]), parentId: zParent.optional(), title: zTitle.optional(), icon: zIcon.optional(), content: z.unknown().optional(), plain: zPlain.optional(), position: z.number().optional() });
const patchSchema = z.object({
  title: zTitle.optional(), icon: zIcon.optional(), content: z.unknown().optional(), plain: zPlain.optional(), parentId: zParent.optional(), position: z.number().optional(),
  visibility: z.enum(["privado", "seguidores", "publico"]).optional(), version: z.number().int().optional(),
});

const r = new Hono<AppEnv>();

r.get("/docs/tree", async (c) => c.json({ nodes: await listTree(requireUser(c).id) }));
r.get("/docs/trash", async (c) => c.json({ nodes: await listTrash(requireUser(c).id) }));

r.get("/docs/search", rateLimit("busca", 60, 60_000), async (c) => {
  const me = requireUser(c), text = noNul(c.req.query("q") || "").trim().slice(0, 200);
  if (text.length < 2) return c.json({ results: [] });
  return c.json({ results: await searchDocs(me.id, text) });
});

r.post("/docs", limit, async (c) => {
  const me = requireUser(c);
  const b = await jsonBody(c, createSchema);
  return c.json({ doc: await createDoc(me.id, b, "app") });
});

r.get("/docs/:id", async (c) => {
  const doc = await getDoc(requireUser(c).id, uuidOr404(c.req.param("id")));
  if (!doc) throw notFound("Não encontramos esse resumo.");
  return c.json({ doc });
});

r.patch("/docs/:id", limit, async (c) => {
  const me = requireUser(c), id = uuidOr404(c.req.param("id"));
  const b = await jsonBody(c, patchSchema);
  return c.json({ doc: await updateDoc(me.id, id, b) });
});

r.delete("/docs/:id", async (c) => {
  if (!(await trashDoc(requireUser(c).id, uuidOr404(c.req.param("id"))))) throw notFound("Não encontramos esse resumo.");
  return c.body(null, 204);
});

r.post("/docs/:id/restore", async (c) => {
  const doc = await restoreDoc(requireUser(c).id, uuidOr404(c.req.param("id")));
  if (!doc) throw notFound("Não encontramos esse item na lixeira.");
  return c.json({ doc });
});

r.delete("/docs/:id/forever", async (c) => {
  if (!(await destroyDoc(requireUser(c).id, uuidOr404(c.req.param("id"))))) throw notFound("Não encontramos esse item na lixeira.");
  return c.body(null, 204);
});

r.post("/docs/:id/duplicate", async (c) => {
  const doc = await duplicateDoc(requireUser(c).id, uuidOr404(c.req.param("id")));
  if (!doc) throw notFound("Não encontramos esse resumo.");
  return c.json({ doc });
});

/* ---------- resumos de outra pessoa ---------- */
r.get("/users/:handle/docs", async (c) => {
  const me = requireUser(c), o = await ownerByHandle(me.id, c.req.param("handle"));
  return c.json({ nodes: await listVisibleTree(o.id, visibleLevels(viewerOf(me.id, o), o)) });
});

r.get("/users/:handle/docs/:id", async (c) => {
  const me = requireUser(c), o = await ownerByHandle(me.id, c.req.param("handle"));
  const doc = await getVisibleDoc(o.id, uuidOr404(c.req.param("id")), visibleLevels(viewerOf(me.id, o), o));
  if (!doc) throw notFound("Não encontramos esse resumo.");
  return c.json({ doc });
});

r.post("/users/:handle/docs/:id/copy", async (c) => {
  const me = requireUser(c), o = await ownerByHandle(me.id, c.req.param("handle")), id = uuidOr404(c.req.param("id"));
  const b = c.req.header("content-type") ? await jsonBody(c, z.object({ parentId: zParent.optional() })) : { parentId: null };
  // visível aqui quer dizer visível com o que há dentro: a visibilidade da pasta vale para todos os filhos
  if (!(await getVisibleDoc(o.id, id, visibleLevels(viewerOf(me.id, o), o)))) throw notFound("Não encontramos esse resumo.");
  return c.json({ doc: await copyDocTo(o.id, id, me.id, b.parentId ?? null) });
});

export default r;
