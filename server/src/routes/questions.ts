/* Busca de questões. O navegador só tem o índice do banco (sem enunciado nem alternativas), então a busca por texto
   roda aqui, onde o banco inteiro já está em memória. Devolve só o trecho de cada questão encontrada. */
import { Hono } from "hono";
import { z } from "zod";
import { env } from "../env";
import { body, rateLimit, requireUser } from "../http";
import type { AppEnv } from "../http";
import { searchQuestions, snippet, terms } from "../lib/question-search";

const r = new Hono<AppEnv>();

const AREA = z.enum(["clinica", "cirurgia", "go", "pediatria", "preventiva"]);
const SearchBody = z.object({
  q: z.string().max(200).default(""),
  bancas: z.array(z.string().max(40)).max(40).optional(),
  anos: z.array(z.number().int()).max(40).optional(),
  areas: z.array(AREA).max(5).optional(),
  /** incluir as questões fora do padrão (sem vídeo, polêmicas): a preferência "Incluir questões sem vídeo e polêmicas" */
  todas: z.boolean().default(false),
  /** ids a deixar de fora: "só as que não fiz" manda as já respondidas */
  excluir: z.array(z.string().max(80)).max(40_000).optional(),
  offset: z.number().int().min(0).max(100_000).default(0),
  limit: z.number().int().min(1).max(50).default(20),
  /** tamanho do trecho devolvido de cada questão */
  trecho: z.number().int().min(60).max(400).default(260),
});

/** quantos ids vêm em `ids` para montar uma lista com o que foi encontrado */
const IDS = 50;

r.post("/questions/search", rateLimit("busca-questoes", 180, 60_000), async (c) => {
  // o modo de exemplo do app (desenvolvimento, sem conta) também busca; fora dele, só com conta
  if (!env.dev) requireUser(c);
  const b = await body(c, SearchBody);
  const ts = terms(b.q);
  const filtering = !!(b.bancas?.length || b.anos?.length || b.areas?.length || b.excluir?.length);
  if (!ts.length && !filtering) return c.json({ total: 0, offset: 0, hits: [], ids: [] });
  const found = searchQuestions(b.todas, b.q, { bancas: b.bancas, anos: b.anos, areas: b.areas, excluir: b.excluir });
  const hits = found.slice(b.offset, b.offset + b.limit).map(({ q, where }) => ({ id: q.id, where, text: snippet(where === "stem" ? q.e : q.a[where] ?? q.e, ts, b.trecho) }));
  c.header("Cache-Control", "no-store");
  return c.json({ total: found.length, offset: b.offset, hits, ids: found.slice(0, IDS).map((h) => h.q.id) });
});

export default r;
