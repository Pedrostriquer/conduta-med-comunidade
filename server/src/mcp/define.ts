/* Como cada ferramenta é escrita e o que toda chamada passa: quem é a pessoa (OAuth ou sessão compartilhada), limite de
   120 chamadas por minuto, confirmação em dois passos das escritas, auditoria sem segurar a resposta e erros em português.
   As ferramentas ficam num registro comum: a página do plugin lista as mesmas que a IA enxerga. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { q } from "../db";
import { hit, HttpError } from "../http";
import type { UserRow } from "../http";
import { CONFIRM_MESSAGES, checkConfirm, signConfirm } from "./confirm";
import { SharedError, userOfSession } from "./shared";

/** "chat": a IA de dentro do app, que chama as mesmas ferramentas sem passar pelo MCP */
export type Mode = "normal" | "compartilhado" | "chat";
export type RequestCtx = { mode: Mode; ip: string; user: UserRow | null };
export type ToolCtx = RequestCtx & { user: UserRow };

/** erro para a IA ler e explicar à pessoa */
export class ToolError extends Error {}

export type ToolOut = { data: unknown; resumo?: string; text?: string };
export type Shape = z.ZodRawShape;
type Args<S extends Shape> = z.infer<z.ZodObject<S>>;

type Base<S extends Shape> = { name: string; title: string; group: string; summary: string; description: string; input: S };
type ReadDef<S extends Shape> = Base<S> & { kind: "read"; run: (a: Args<S>, c: ToolCtx) => Promise<ToolOut> | ToolOut };
type WriteDef<S extends Shape> = Base<S> & { kind: "write"; destructive?: boolean; preview: (a: Args<S>, c: ToolCtx) => Promise<string> | string; apply: (a: Args<S>, c: ToolCtx) => Promise<ToolOut> };
/** entrar e sair: não têm pessoa antes de rodar e não passam pela confirmação */
type SessionDef<S extends Shape> = Base<S> & { kind: "session"; run: (a: Args<S>, c: RequestCtx) => Promise<ToolOut & { userId?: string }> };

export type AnyTool = ReadDef<any> | WriteDef<any> | SessionDef<any>;

export const readTool = <S extends Shape>(d: Omit<ReadDef<S>, "kind">): AnyTool => ({ ...d, kind: "read" }) as AnyTool;
export const writeTool = <S extends Shape>(d: Omit<WriteDef<S>, "kind">): AnyTool => ({ ...d, kind: "write" }) as AnyTool;
export const sessionTool = <S extends Shape>(d: Omit<SessionDef<S>, "kind">): AnyTool => ({ ...d, kind: "session" }) as AnyTool;

const RATE_MAX = 120, RATE_WINDOW_MS = 60_000;
/** acima disso o resultado vai só em texto, para não gastar contexto duas vezes */
const STRUCTURED_MAX = 4000;

function audit(userId: string, tool: string, mode: Mode, writes: boolean, ok: boolean, ms: number, summary: string) {
  void q("INSERT INTO mcp_audit (user_id, tool, mode, writes, ok, ms, summary) VALUES ($1, $2, $3, $4, $5, $6, $7)", [userId, tool, mode, writes, ok, Math.round(ms), summary.slice(0, 240)]).catch((e) => console.error("auditoria:", e.message));
}

const asResult = (o: ToolOut) => {
  const text = o.text ?? JSON.stringify(o.data, null, 1);
  const structured = o.data && typeof o.data === "object" && !Array.isArray(o.data) && text.length <= STRUCTURED_MAX;
  return { content: [{ type: "text" as const, text }], ...(structured ? { structuredContent: o.data as Record<string, unknown> } : {}) };
};
const asError = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });

const SESSAO = z.string().min(10).describe("Token devolvido por conduta_entrar. Não mostre na conversa nem salve na memória.");
const TOKEN = z.string().optional().describe("Vazio na primeira chamada, que só devolve a prévia. Depois do sim da pessoa, repita os mesmos argumentos com este token.");

/** os campos que a IA preenche: os da ferramenta, mais o token de confirmação nas escritas e a sessão no modo compartilhado */
export const shapeOf = (ctx: RequestCtx, d: AnyTool): Shape =>
  ({ ...d.input, ...(d.kind === "write" ? { token_confirmacao: TOKEN } : {}), ...(ctx.mode === "compartilhado" && d.kind !== "session" ? { sessao: SESSAO } : {}) });

/** Roda uma ferramenta para quem está em `ctx`: limite por minuto, confirmação das escritas, auditoria e erro em português.
    É o mesmo caminho para o plugin (MCP) e para o chat do app. */
export function toolRunner(ctx: RequestCtx, d: AnyTool) {
  return async (raw: Record<string, unknown>) => {
    const started = Date.now();
    const { sessao, token_confirmacao, ...args } = raw as Record<string, unknown> & { sessao?: string; token_confirmacao?: string };
    let userId: string | null = ctx.user?.id ?? null, writes = false;
    const finish = (ok: boolean, summary: string) => { if (userId) audit(userId, d.name, ctx.mode, writes, ok, Date.now() - started, summary); };
    try {
      if (d.kind === "session") {
        const out = await d.run(raw as never, ctx);
        userId = out.userId ?? userId;
        finish(true, out.resumo ?? "");
        return asResult(out);
      }
      const user = ctx.mode === "compartilhado" ? await userOfSession(sessao as string) : ctx.user;
      if (!user) throw new ToolError("Conexão sem pessoa identificada. Reconecte o Conduta Med.");
      userId = user.id;
      hit(`mcp:${user.id}`, RATE_MAX, RATE_WINDOW_MS);
      const c: ToolCtx = { ...ctx, user };
      if (d.kind === "read") {
        const out = await d.run(args as never, c);
        finish(true, out.resumo ?? "");
        return asResult(out);
      }
      if (!token_confirmacao) {
        const previa = await d.preview(args as never, c);
        finish(true, "prévia");
        return asResult({
          data: {
            status: "aguardando_confirmacao", previa, token_confirmacao: signConfirm(user.id, d.name, args),
            instrucao: "Nada foi gravado. Mostre a prévia à pessoa com as suas palavras e pergunte se pode fazer. Só com um sim claro repita esta ferramenta com os mesmos argumentos e este token (vale 10 minutos).",
          },
        });
      }
      // o token só existe depois de uma prévia que passou na validação: com ele, é aplicar
      const problem = checkConfirm(token_confirmacao, user.id, d.name, args);
      if (problem) throw new ToolError(CONFIRM_MESSAGES[problem]);
      writes = true;
      const out = await d.apply(args as never, c);
      finish(true, out.resumo ?? "");
      return asResult(out);
    } catch (e) {
      writes = false;
      if (e instanceof ToolError || e instanceof SharedError || e instanceof HttpError) { finish(false, "erro"); return asError(e.message); }
      console.error(`ferramenta ${d.name}:`, e);
      finish(false, "erro interno");
      return asError("Algo deu errado do nosso lado. Tente de novo em instantes; se continuar, avise a pessoa e ofereça mandar o problema pelo conduta_enviar_sugestao.");
    }
  };
}

export function registerTool(server: McpServer, ctx: RequestCtx, d: AnyTool) {
  const write = d.kind === "write";
  const shape = shapeOf(ctx, d);
  const annotations = { title: d.title, readOnlyHint: d.kind === "read", destructiveHint: write ? !!d.destructive : false, idempotentHint: d.kind === "read", openWorldHint: false };
  const handler = toolRunner(ctx, d);

  // os tipos do SDK sobre esquemas genéricos estouram a profundidade do compilador: o molde acima já garante a forma
  (server as unknown as { registerTool: (n: string, cfg: unknown, h: unknown) => void }).registerTool(d.name, { title: d.title, description: d.description, inputSchema: z.strictObject(shape), annotations }, handler);
}
