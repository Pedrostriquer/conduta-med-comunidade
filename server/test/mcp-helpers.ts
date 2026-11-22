/* Base dos testes do plugin: a API num servidor local de verdade e o cliente MCP oficial do SDK. */
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHash, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll } from "vitest";
import { pool } from "../src/db";
import { app, Client } from "./rest-helpers";

// nos testes, o corpo das respostas é lido sem precisar de um molde para cada rota
declare global { interface Response { json(): Promise<any> } }

let server: ServerType;
export let baseUrl = "";

export function useServer() {
  beforeAll(async () => {
    await new Promise<void>((done) => { server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () => done()); });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise((done) => server.close(done)); });
}

export async function connectMcp(path: "/mcp" | "/mcp/compartilhado", headers: Record<string, string> = {}) {
  const client = new McpClient({ name: "teste", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(baseUrl + path), { requestInit: { headers } }));
  return client;
}

/** chama a ferramenta e devolve o JSON da resposta */
export async function call(client: McpClient, name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as { content: { type: string; text: string }[]; isError?: boolean; structuredContent?: any };
  const text = r.content[0]?.text ?? "";
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* texto puro */ }
  return { json, text, isError: !!r.isError, structured: r.structuredContent };
}

/** prévia e depois o "sim": devolve as duas respostas */
export async function confirm(client: McpClient, name: string, args: Record<string, unknown> = {}) {
  const prev = await call(client, name, args);
  if (prev.isError) throw new Error(`prévia de ${name} falhou: ${prev.text}`);
  const done = await call(client, name, { ...args, token_confirmacao: prev.json.token_confirmacao });
  return { prev, done };
}

/** um token pessoal para a pessoa: o caminho mais curto até o /mcp */
export async function personalToken(c: Client) {
  const r = await c.post("/api/plugin/tokens", { label: "teste" });
  if (r.status !== 200) throw new Error(`token falhou: ${r.text}`);
  return r.json.token as string;
}
export const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

export const records = (userId: string, coll: string) => pool.query<{ id: string; data: any; origin: string; client_at: number }>("SELECT id, data, origin, client_at FROM user_records WHERE user_id = $1 AND coll = $2 AND NOT deleted", [userId, coll]).then((r) => r.rows);

export function pkce() {
  const verifier = randomBytes(40).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
export const form = (o: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });
export const MCP_INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1" } } };
export const MCP_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };
