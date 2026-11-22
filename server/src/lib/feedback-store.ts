/* Sugestões, problemas e pedidos de senha que chegam ao criador. Mesmo caminho para o app e para o plugin. */
import { one, q } from "../db";
import type { Db } from "../db";
import { invalid, ms } from "../http";
import { jsonForDb, jsonSize, noNul } from "./validate";

export type FeedbackKind = "sugestao" | "prova" | "problema" | "senha" | "outro";
export type FeedbackRow = {
  id: string; user_id: string | null; kind: FeedbackKind; title: string; body: string; source: "app" | "plugin"; status: "novo" | "lendo" | "feito" | "recusado";
  reply: string | null; replied_at: Date | null; meta: Record<string, unknown>; created_at: Date;
};
export type NewFeedback = { kind: FeedbackKind; title?: string; body: string; meta?: Record<string, unknown> };

const KINDS = new Set<string>(["sugestao", "prova", "problema", "senha", "outro"]);

export const feedbackItem = (r: FeedbackRow) => ({
  id: r.id, kind: r.kind, title: r.title, body: r.body, source: r.source, status: r.status, reply: r.reply, repliedAt: ms(r.replied_at), createdAt: ms(r.created_at)!,
});

export async function createFeedback(userId: string | null, f: NewFeedback, source: "app" | "plugin" = "app", db?: Db) {
  const body = noNul(String(f.body ?? "")).trim(), title = noNul(String(f.title ?? "")).trim().slice(0, 200), meta = f.meta ?? {};
  if (!KINDS.has(f.kind)) throw invalid("Escolha o tipo da mensagem.");
  if (!body) throw invalid("Escreva a mensagem.");
  if (body.length > 8000) throw invalid("A mensagem pode ter até 8.000 caracteres.");
  if (jsonSize(meta) > 16_384) throw invalid("Os dados anexados são grandes demais.");
  const r = await one<FeedbackRow>(
    "INSERT INTO feedback (user_id, kind, title, body, source, meta) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    [userId, f.kind, title, body, source, jsonForDb(meta)], db,
  );
  return feedbackItem(r!);
}

export async function listFeedback(userId: string) {
  return (await q<FeedbackRow>("SELECT * FROM feedback WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200", [userId])).map(feedbackItem);
}
