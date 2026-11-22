/* Ajudantes das rotas: corpo JSON com o tipo certo, parâmetros que viram uuid, tamanho de JSON e LIKE seguro. */
import type { Context } from "hono";
import { z } from "zod";
import { body, invalid, notFound } from "../http";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);
/** parâmetro de rota que não é uuid daria erro no Postgres: para quem pede, é só "não encontrado" */
export function uuidOr404(s: string, m?: string) { if (!isUuid(s)) throw notFound(m); return s; }
export const zUuid = z.string().regex(UUID, "Identificador inválido.");

/** o contrato exige Content-Type de JSON nas escritas com corpo */
export async function jsonBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  if (!/^application\/json\b/i.test(c.req.header("content-type") || "")) throw invalid("Envie os dados em JSON.");
  return body(c, schema);
}

/** o caractere nulo não cabe em text nem em jsonb no Postgres */
export const noNul = (s: string) => s.replace(/\u0000/g, "");
export const zText = () => z.string().overwrite(noNul).trim();

export const jsonSize = (v: unknown) => Buffer.byteLength(JSON.stringify(v) ?? "");
/** JSON pronto para gravar; recusa o que o jsonb não aceitaria */
export function jsonForDb(v: unknown) {
  const s = JSON.stringify(v ?? null);
  if (s.includes("\\u0000")) throw invalid("O conteúdo tem caracteres que não conseguimos guardar.");
  return s;
}

export const pgCode = (e: unknown) => (e as { code?: string } | null)?.code;
export const pgConstraint = (e: unknown) => (e as { constraint?: string } | null)?.constraint;

/** padrão de ILIKE "contém", com os curingas do usuário escapados */
export const likeAny = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;
