/* O que toda rota usa: erros no formato do contrato, validação com Zod, usuário da sessão e limite de frequência. */
import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";
import { env } from "./env";

export type UserRow = {
  id: string; email: string; name: string; handle: string; role: "user" | "admin"; bio: string; faculdade: string | null; semestre: number | null;
  formado: boolean; cidade: string | null; avatar_url: string | null; visibility: "publico" | "seguidores" | "privado"; show_stats: boolean; show_faculdade: boolean;
  show_activity: boolean; share_plan: "privado" | "seguidores" | "publico"; total_questions: number; total_correct: number; total_cards: number; shared_mode: boolean;
  password_hash: string | null; created_at: Date;
};

export type AppEnv = { Variables: { user: UserRow | null } };

const STATUS = { nao_autenticado: 401, proibido: 403, nao_encontrado: 404, invalido: 400, conflito: 409, limite: 429 } as const;
export type ErrorCode = keyof typeof STATUS;

export class HttpError extends Error {
  status: number;
  constructor(public code: ErrorCode, message: string, public extra?: Record<string, unknown>) {
    super(message);
    this.status = STATUS[code];
  }
}
export const notFound = (m = "Não encontramos isso.") => new HttpError("nao_encontrado", m);
export const forbidden = (m = "Você não tem acesso a isso.") => new HttpError("proibido", m);
export const invalid = (m: string) => new HttpError("invalido", m);

/** corpo JSON validado; a mensagem do primeiro problema vai para o usuário */
export async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { throw invalid("Não entendemos o que foi enviado."); }
  return parse(schema, raw);
}
export function parse<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw invalid(i?.message && !/^(Invalid|Expected|Too|Required)/i.test(i.message) ? i.message : "Algum campo está faltando ou inválido.");
  }
  return r.data;
}

export function requireUser(c: Context<AppEnv>): UserRow {
  const u = c.get("user");
  if (!u) throw new HttpError("nao_autenticado", "Entre na sua conta para continuar.");
  return u;
}
export function requireAdmin(c: Context<AppEnv>): UserRow {
  const u = requireUser(c);
  if (u.role !== "admin") throw forbidden();
  return u;
}

/* ---------- limite de frequência em memória: janela deslizante simples por chave ---------- */
const hits = new Map<string, number[]>();
export function hit(key: string, max: number, windowMs: number) {
  const now = Date.now(), arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); throw new HttpError("limite", "Muitas tentativas. Espere um pouco e tente de novo."); }
  arr.push(now);
  hits.set(key, arr);
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 3_600_000) hits.delete(k); }, 600_000).unref();

export const clientIp = (c: Context) => c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";

/** middleware de limite: `name` separa as contas de cada rota; por usuário se houver, senão por IP */
export function rateLimit(name: string, max: number, windowMs: number): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const u = c.get("user");
    hit(`${name}:${u?.id || clientIp(c)}`, max, windowMs);
    await next();
  };
}

/** escrita de outra origem é recusada: proteção contra CSRF junto com SameSite=Lax */
export const sameOrigin: MiddlewareHandler = async (c, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
    const o = c.req.header("origin");
    if (o && o !== env.publicUrl && !env.extraOrigins.includes(o) && !(!env.prod && /^http:\/\/(([a-z0-9-]+\.)?localhost|127\.0\.0\.1):\d+$/.test(o))) throw forbidden("Origem não permitida.");
  }
  await next();
};

export const ms = (d: Date | null | undefined) => (d ? new Date(d).getTime() : null);

export function meOf(u: UserRow) {
  return {
    id: u.id, name: u.name, handle: u.handle, email: u.email, role: u.role, bio: u.bio, faculdade: u.faculdade, semestre: u.semestre, formado: u.formado, cidade: u.cidade,
    avatarUrl: u.avatar_url, visibility: u.visibility, showStats: u.show_stats, showFaculdade: u.show_faculdade, showActivity: u.show_activity, sharePlan: u.share_plan,
    totalQuestions: u.total_questions, totalCards: u.total_cards, sharedMode: u.shared_mode, createdAt: ms(u.created_at)!,
  };
}
