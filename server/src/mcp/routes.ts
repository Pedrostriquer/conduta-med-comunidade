/* Os dois endereços do plugin, em Streamable HTTP sem estado: um transporte e um McpServer novos a cada POST.
   /mcp: Bearer do OAuth ou token pessoal cdm_. /mcp/compartilhado: sem login; a sessão vem como argumento das ferramentas. */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import type { Context } from "hono";
import { env } from "../env";
import { clientIp } from "../http";
import type { AppEnv } from "../http";
import { openCors } from "../oauth/routes";
import { SCOPE, userOfBearer } from "../oauth/tokens";
import type { RequestCtx } from "./define";
import { buildServer } from "./server";

const r = new Hono<AppEnv>();
r.use("/mcp", openCors);
r.use("/mcp/compartilhado", openCors);

/** sem estado: com enableJsonResponse a resposta volta inteira e o servidor pode fechar junto */
async function handle(c: Context<AppEnv>, ctx: RequestCtx) {
  const server = buildServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(c.req.raw);
  } finally {
    void server.close().catch(() => {});
  }
}

const notAllowed = (c: Context<AppEnv>) => c.json({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST: este servidor não mantém conexão aberta." }, id: null }, 405, { Allow: "POST, OPTIONS" });
const challenge = (extra = "") => `Bearer resource_metadata="${env.publicUrl}/.well-known/oauth-protected-resource/mcp", scope="${SCOPE}"${extra}`;

r.post("/mcp", async (c) => {
  const m = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") || "");
  const auth = m ? await userOfBearer(m[1]) : null;
  if (!auth) {
    const extra = m ? ', error="invalid_token", error_description="Token inválido ou vencido"' : "";
    return c.json({ jsonrpc: "2.0", error: { code: -32001, message: "Entre na sua conta do Conduta Med para continuar." }, id: null }, 401, { "WWW-Authenticate": challenge(extra) });
  }
  return handle(c, { mode: "normal", ip: clientIp(c), user: auth.user });
});

// sem limite por IP aqui: Claude e ChatGPT chamam da nuvem deles, e todos os usuários sairiam do mesmo endereço
r.post("/mcp/compartilhado", (c) => handle(c, { mode: "compartilhado", ip: clientIp(c), user: null }));

for (const p of ["/mcp", "/mcp/compartilhado"]) { r.get(p, notAllowed); r.delete(p, notAllowed); }

export default r;
