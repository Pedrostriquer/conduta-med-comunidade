/* O chat de IA, do lado da pessoa: se está disponível, as conversas, e a pergunta com a resposta saindo aos poucos. */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { one, q } from "../db";
import { clientIp, hit, HttpError, ms, notFound, requireUser } from "../http";
import type { AppEnv } from "../http";
import { jsonBody, uuidOr404, zText, zUuid } from "../lib/validate";
import { ask, chatBlock, display, sentToday, setupFor } from "../ia/chat";
import { creditOf, percentOf } from "../ia/credit";
import { modelLabel } from "../ia/providers";
import type { Block } from "../ia/providers";

const r = new Hono<AppEnv>();

r.get("/chat", async (c) => {
  const u = requireUser(c);
  const s = await setupFor(u.id), block = await chatBlock(u.id, s), cr = await creditOf(u.id);
  const chats = await q<{ id: string; title: string; updated_at: Date }>("SELECT id, title, updated_at FROM ai_chats WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50", [u.id]);
  return c.json({
    available: !block, reason: block?.code ?? null, message: block?.message ?? null,
    // a pessoa vê o nome do modelo e porcentagens; dólares e tokens ficam no painel do admin
    model: modelLabel(s.model),
    percentLeft: Math.max(0, 100 - percentOf(cr.spent + cr.reserved, cr.limit)), dailyLeft: Math.max(0, s.daily - (await sentToday(u.id))), daily: s.daily,
    chats: chats.map((x) => ({ id: x.id, title: x.title, updatedAt: ms(x.updated_at) })),
  });
});

r.get("/chat/:id", async (c) => {
  const u = requireUser(c), id = uuidOr404(c.req.param("id"));
  const chat = await one<{ id: string; title: string }>("SELECT id, title FROM ai_chats WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL", [id, u.id]);
  if (!chat) throw notFound("Não encontramos essa conversa.");
  const rows = await q<{ id: number; role: string; blocks: Block[]; created_at: Date }>("SELECT id, role, blocks, created_at FROM ai_chat_messages WHERE chat_id = $1 ORDER BY id", [id]);
  return c.json({ id: chat.id, title: chat.title, messages: display(rows) });
});

r.delete("/chat/:id", async (c) => {
  const u = requireUser(c);
  await q("UPDATE ai_chats SET deleted_at = now() WHERE id = $1 AND user_id = $2", [uuidOr404(c.req.param("id")), u.id]);
  return c.body(null, 204);
});

// a resposta sai em eventos (text/event-stream): inicio, texto, ferramenta, fim ou erro
r.post("/chat/mensagens", async (c) => {
  const u = requireUser(c);
  const b = await jsonBody(c, z.object({ chatId: zUuid.optional(), text: zText().min(1, "Escreva a sua pergunta.").max(4000, "A pergunta ficou longa demais.") }));
  hit(`chat:${u.id}`, 12, 60_000);
  // o que impede de começar volta como erro comum, antes de abrir o fluxo
  const block = await chatBlock(u.id, await setupFor(u.id));
  if (block) throw new HttpError("limite", block.message, { motivo: block.code });
  const ip = clientIp(c);
  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    let chain = Promise.resolve();
    const emit = (e: { type: string }) => { chain = chain.then(() => stream.writeSSE({ event: e.type, data: JSON.stringify(e) })).catch(() => {}); };
    try { await ask(u, { chatId: b.chatId, text: b.text, ip }, emit, abort.signal); }
    catch (e) { emit({ type: "erro", message: e instanceof HttpError ? e.message : "Algo deu errado do nosso lado. Tente de novo em instantes." } as never); }
    await chain;
  });
});

export default r;
