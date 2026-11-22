/* A própria conta: editar, apagar, exportar. E os números públicos da tela de entrar. */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import { z } from "zod";
import { bank } from "../bank";
import { q, tx } from "../db";
import { env } from "../env";
import { hit, invalid, meOf, requireUser } from "../http";
import type { AppEnv } from "../http";
import { checkPassword } from "../lib/password";
import { updateProfile } from "../lib/profile-store";
import { jsonBody } from "../lib/validate";

const r = new Hono<AppEnv>();

r.patch("/me", async (c) => {
  const u = requireUser(c);
  const patch = await jsonBody(c, z.looseObject({}));
  // sem verificação por e-mail, trocar o endereço abriria caminho para assumir outra conta
  if (patch.email !== undefined && String(patch.email).trim().toLowerCase() !== u.email.toLowerCase()) throw invalid("O e-mail da conta não muda por aqui. Fale com o suporte.");
  return c.json({ user: meOf(await updateProfile(u.id, patch)) });
});

r.delete("/me", async (c) => {
  const u = requireUser(c);
  const b = await jsonBody(c, z.object({ password: z.string().max(200) }));
  hit(`apagar-conta:${u.id}`, 10, 900_000);
  if (!(await checkPassword(u.password_hash, b.password))) throw invalid("A senha não confere.");
  // os arquivos saem com a conta, menos os que outra pessoa também referencia (cópia de resumo, baralho assinado)
  const files = await q<{ hash: string; kind: string; ext: string }>(
    "SELECT a.hash, a.kind, a.ext FROM uploads a WHERE a.user_id = $1 AND NOT EXISTS (SELECT 1 FROM uploads o WHERE o.hash = a.hash AND o.kind = a.kind AND o.user_id <> a.user_id)",
    [u.id],
  );
  await tx(async (db) => {
    // o ON DELETE CASCADE apaga as linhas, mas os contadores dos outros são mantidos à mão
    await db.query("UPDATE comments c SET likes = c.likes - 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.user_id = $1", [u.id]);
    // o gasto da IA fica na conta do mês, sem nada que era da pessoa
    await db.query("UPDATE ai_runs SET prompt = NULL, system = NULL, result = NULL, source = '{}', options = '{}' WHERE user_id = $1", [u.id]);
    await db.query(
      `UPDATE comments p SET replies = p.replies - x.n
       FROM (SELECT parent_id, count(*) AS n FROM comments WHERE user_id = $1 AND parent_id IS NOT NULL AND deleted_at IS NULL AND hidden_at IS NULL GROUP BY parent_id) x
       WHERE p.id = x.parent_id`,
      [u.id],
    );
    await db.query("UPDATE shared_decks d SET subscribers = d.subscribers - 1 FROM deck_subscriptions s WHERE s.deck_id = d.id AND s.user_id = $1", [u.id]);
    await db.query("DELETE FROM users WHERE id = $1", [u.id]);
    await db.query("DELETE FROM comments WHERE parent_id IS NULL AND deleted_at IS NOT NULL AND replies <= 0");
  });
  await Promise.all(files.map((f) => rm(join(env.uploadsDir, f.kind, `${f.hash}.${f.ext}`), { force: true }).catch(() => undefined)));
  deleteCookie(c, "cd_sess", { path: "/", secure: env.prod });
  return c.body(null, 204);
});

r.get("/me/export", async (c) => {
  const u = requireUser(c);
  const { password_hash: _hash, ...conta } = u;
  const [records, docs, comments, analises, uso, flags, feedback] = await Promise.all([
    q("SELECT coll, id, data, deleted, client_at, origin, seq FROM user_records WHERE user_id = $1 ORDER BY seq", [u.id]),
    q("SELECT id, parent_id, kind, title, icon, content, plain, position, visibility, version, origin, copied_from, created_at, updated_at, deleted_at FROM docs WHERE user_id = $1 ORDER BY created_at", [u.id]),
    q("SELECT id, qid, parent_id, body, likes, replies, created_at, edited_at, deleted_at FROM comments WHERE user_id = $1 ORDER BY created_at", [u.id]),
    q("SELECT kind, trigger, status, source, options, result, created_at FROM ai_runs WHERE user_id = $1 AND kind <> 'teste' ORDER BY created_at", [u.id]),
    q("SELECT visit, path, at, ms FROM usage_events WHERE user_id = $1 ORDER BY at", [u.id]),
    q("SELECT qid, reason, note, status, created_at FROM question_flags WHERE user_id = $1 ORDER BY created_at", [u.id]),
    q("SELECT id, kind, title, body, source, status, reply, replied_at, meta, created_at FROM feedback WHERE user_id = $1 ORDER BY created_at", [u.id]),
  ]);
  c.header("Content-Disposition", `attachment; filename="conduta-${u.handle}.json"`);
  return c.json({ exportedAt: Date.now(), user: conta, records, docs, comments, analises, uso, flags, feedback });
});

let stats: { questoes: number; provas: number; bancas: number } | null = null;
// só os números das questões válidas, que não mudam com o servidor no ar
r.get("/public/stats", (c) => {
  if (!stats) {
    const { all, examById } = bank(), ok = all.filter((x) => x.ok);
    stats = { questoes: ok.length, provas: new Set(ok.map((x) => x.p)).size, bancas: new Set(ok.map((x) => examById.get(x.p)?.banca).filter(Boolean)).size };
  }
  c.header("Cache-Control", "public, max-age=3600");
  return c.json(stats);
});

export default r;
