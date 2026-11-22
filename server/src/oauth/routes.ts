/* Servidor de autorização OAuth 2.1 e metadados do recurso protegido, conforme a especificação de autorização do MCP
   (2026-07-28): RFC 9728, RFC 8414, RFC 7591 + documento de metadados do cliente, PKCE S256, RFC 8707 e RFC 9207.
   O consentimento acontece no app (/conectar), com a sessão da pessoa; aqui só se valida e troca código por token. */
import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { q, tx } from "../db";
import { env } from "../env";
import { body, clientIp, hit, requireUser, HttpError } from "../http";
import type { AppEnv } from "../http";
import { redirectAllowed, registerClient, resolveClient } from "./clients";
import type { Client } from "./clients";
import { CODE_TTL_MS, SCOPE, familyOfCode, issueTokens, randomToken, revokeFamily, sha256 } from "./tokens";

const r = new Hono<AppEnv>();

/** origem do servidor: é o identificador do emissor (`iss`) e tem de bater exatamente com os metadados */
const issuer = () => env.publicUrl;

export const openCors = cors({
  origin: "*", allowMethods: ["GET", "POST", "DELETE", "OPTIONS"], maxAge: 86400,
  allowHeaders: ["Authorization", "Content-Type", "Accept", "Mcp-Protocol-Version", "Mcp-Session-Id", "Mcp-Method", "Mcp-Name", "Last-Event-ID"],
  exposeHeaders: ["WWW-Authenticate", "Mcp-Session-Id", "Mcp-Protocol-Version"],
});
for (const p of ["/.well-known/*", "/oauth/register", "/oauth/token", "/oauth/revoke"]) r.use(p, openCors);

/* ---------- descoberta ---------- */
const resourceMetadata = (resource: string) => ({
  resource, authorization_servers: [issuer()], scopes_supported: [SCOPE], bearer_methods_supported: ["header"],
  resource_name: "Conduta Med", resource_documentation: `${env.publicUrl}/plugin`,
});
r.get("/.well-known/oauth-protected-resource/mcp", (c) => c.json(resourceMetadata(`${env.publicUrl}/mcp`)));
r.get("/.well-known/oauth-protected-resource", (c) => c.json(resourceMetadata(env.publicUrl)));
r.get("/.well-known/oauth-authorization-server", (c) => c.json({
  issuer: issuer(),
  authorization_endpoint: `${env.publicUrl}/oauth/authorize`,
  token_endpoint: `${env.publicUrl}/oauth/token`,
  registration_endpoint: `${env.publicUrl}/oauth/register`,
  revocation_endpoint: `${env.publicUrl}/oauth/revoke`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  revocation_endpoint_auth_methods_supported: ["none"],
  // offline_access só aqui, nunca nos metadados do recurso: o ChatGPT procura esse nome para pedir refresh token
  scopes_supported: [SCOPE, "offline_access"],
  client_id_metadata_document_supported: true,
  authorization_response_iss_parameter_supported: true,
  service_documentation: `${env.publicUrl}/plugin`,
}));

/* ---------- registro dinâmico ---------- */
r.post("/oauth/register", async (c) => {
  // limites folgados: o registro e a troca de token vêm da nuvem de cada IA, com muita gente saindo do mesmo endereço
  hit(`oauth-reg:${clientIp(c)}`, 300, 3_600_000);
  let meta: Record<string, unknown>;
  try { meta = await c.req.json(); } catch { return c.json({ error: "invalid_client_metadata", error_description: "JSON inválido." }, 400); }
  const client = await registerClient(meta);
  if (!client) return c.json({ error: "invalid_redirect_uri", error_description: "redirect_uris precisa ter endereços https (http só em localhost), sem fragmento." }, 400);
  return c.json({
    client_id: client.clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: client.name, redirect_uris: client.redirectUris,
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope: SCOPE,
  }, 201, { "Cache-Control": "no-store" });
});

/* ---------- validação comum da autorização ---------- */
type AuthParams = { client_id?: string; redirect_uri?: string; response_type?: string; code_challenge?: string; code_challenge_method?: string; state?: string; scope?: string; resource?: string };
const CHALLENGE = /^[A-Za-z0-9._~-]{43,128}$/;

const canon = (u: string) => { try { const p = new URL(u); return `${p.protocol}//${p.host.toLowerCase()}${p.pathname.replace(/\/$/, "")}${p.search}`; } catch { return ""; } };
/** o recurso tem de ser este servidor: é o que garante que o token foi emitido para ele (RFC 8707) */
const validResource = (res: string) => [`${env.publicUrl}/mcp`, env.publicUrl].some((x) => canon(x) === canon(res));
const grantedScope = () => SCOPE;

function paramProblem(p: AuthParams): { error: string; description: string } | null {
  if (p.response_type !== "code") return { error: "unsupported_response_type", description: "Só response_type=code." };
  if (!p.code_challenge || !CHALLENGE.test(p.code_challenge)) return { error: "invalid_request", description: "Falta code_challenge (PKCE)." };
  if (p.code_challenge_method !== "S256") return { error: "invalid_request", description: "Só code_challenge_method=S256." };
  if (p.resource && !validResource(p.resource)) return { error: "invalid_target", description: "Recurso desconhecido." };
  return null;
}
function withParams(uri: string, params: Record<string, string | undefined>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  u.searchParams.set("iss", issuer());
  return u.toString();
}
/** cliente e redirecionamento conferem? Se não, nunca redireciona: a resposta é erro direto, para não virar um redirecionamento aberto */
async function checkClient(p: AuthParams): Promise<{ client: Client } | { problem: string }> {
  const client = await resolveClient(p.client_id);
  if (!client) return { problem: "Cliente desconhecido. Remova e adicione o conector de novo." };
  if (!p.redirect_uri || !redirectAllowed(client, p.redirect_uri)) return { problem: "Endereço de retorno diferente do registrado." };
  return { client };
}

r.get("/oauth/authorize", async (c) => {
  hit(`oauth-authz:${clientIp(c)}`, 120, 60_000);
  const p = c.req.query() as AuthParams;
  const ck = await checkClient(p);
  if ("problem" in ck) return c.json({ error: "invalid_request", error_description: ck.problem }, 400);
  const bad = paramProblem(p);
  if (bad) return c.redirect(withParams(p.redirect_uri!, { error: bad.error, error_description: bad.description, state: p.state }));
  return c.redirect(`${env.publicUrl}/conectar?${new URLSearchParams(c.req.query())}`);
});

/* ---------- tela de consentimento ---------- */
const AuthBody = z.object({
  client_id: z.string().max(2048), redirect_uri: z.string().max(2048), response_type: z.string().optional(), code_challenge: z.string().optional(), code_challenge_method: z.string().optional(),
  state: z.string().max(2048).optional(), scope: z.string().max(512).optional(), resource: z.string().max(2048).optional(),
});
const oauthInvalid = (m: string) => new HttpError("invalido", m);

r.get("/api/oauth/request", async (c) => {
  requireUser(c);
  const p = c.req.query() as AuthParams;
  const ck = await checkClient(p);
  if ("problem" in ck) throw oauthInvalid(ck.problem);
  const bad = paramProblem({ response_type: "code", ...p });
  if (bad) throw oauthInvalid(bad.description);
  return c.json({ clientName: ck.client.name, redirectUri: p.redirect_uri });
});

r.post("/api/oauth/approve", async (c) => {
  const user = requireUser(c);
  const p = await body(c, AuthBody);
  const ck = await checkClient(p);
  if ("problem" in ck) throw oauthInvalid(ck.problem);
  const bad = paramProblem({ response_type: "code", ...p });
  if (bad) throw oauthInvalid(bad.description);
  const code = randomToken("cdo_");
  await q(
    `INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + ($8 || ' milliseconds')::interval)`,
    [sha256(code), ck.client.clientId, user.id, p.redirect_uri, p.code_challenge, grantedScope(), p.resource ?? null, String(CODE_TTL_MS)],
  );
  return c.json({ redirect: withParams(p.redirect_uri, { code, state: p.state }) });
});

r.post("/api/oauth/deny", async (c) => {
  requireUser(c);
  const p = await body(c, AuthBody);
  const ck = await checkClient(p);
  if ("problem" in ck) throw oauthInvalid(ck.problem);
  return c.json({ redirect: withParams(p.redirect_uri, { error: "access_denied", error_description: "A pessoa não autorizou.", state: p.state }) });
});

/* ---------- token ---------- */
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };
const tokenError = (c: Context<AppEnv>, error: string, description: string, status: 400 | 401 = 400) => c.json({ error, error_description: description }, status, NO_STORE);

/** o corpo do token é form-urlencoded; alguns clientes mandam o client_id no Basic em vez do corpo */
async function formOf(c: Context<AppEnv>): Promise<Record<string, string>> {
  const ct = c.req.header("content-type") || "";
  if (!ct.includes("application/x-www-form-urlencoded")) return {};
  const form = Object.fromEntries(new URLSearchParams(await c.req.text()));
  if (!form.client_id) {
    const b = /^Basic\s+(.+)$/i.exec(c.req.header("authorization") || "");
    if (b) { try { form.client_id = decodeURIComponent(Buffer.from(b[1], "base64").toString().split(":")[0]); } catch { /* sem client_id cai no erro normal */ } }
  }
  return form;
}
const pkceOk = (verifier: string, challenge: string) => {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const a = Buffer.from(createHash("sha256").update(verifier).digest("base64url")), b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
};

type Issue = { tokens: Awaited<ReturnType<typeof issueTokens>> } | { error: string; description: string };

async function exchangeCode(f: Record<string, string>): Promise<Issue> {
  const { code, client_id, redirect_uri, code_verifier, resource } = f;
  if (!code || !client_id || !redirect_uri || !code_verifier) return { error: "invalid_request", description: "Faltam parâmetros." };
  const hash = sha256(code);
  return tx(async (db) => {
    const { rows: [row] } = await db.query<{ client_id: string; user_id: string; redirect_uri: string; code_challenge: string; scope: string; resource: string | null; expired: boolean; used_at: Date | null; client_name: string }>(
      `SELECT k.client_id, k.user_id, k.redirect_uri, k.code_challenge, k.scope, k.resource, k.expires_at < now() AS expired, k.used_at, c.client_name
       FROM oauth_codes k JOIN oauth_clients c USING (client_id) WHERE k.code_hash = $1 FOR UPDATE OF k`, [hash]);
    const invalid = { error: "invalid_grant", description: "Código inválido, vencido ou já usado." };
    if (!row) return invalid;
    const family = familyOfCode(hash);
    // código usado de novo: alguém pode ter interceptado; derruba o que saiu dele
    if (row.used_at) { await revokeFamily(db, family); return invalid; }
    if (row.expired || row.client_id !== client_id || row.redirect_uri !== redirect_uri || !pkceOk(code_verifier, row.code_challenge)) return invalid;
    if (resource && (!validResource(resource) || (row.resource && canon(row.resource) !== canon(resource)))) return { error: "invalid_target", description: "O recurso não é o mesmo da autorização." };
    await db.query("UPDATE oauth_codes SET used_at = now() WHERE code_hash = $1", [hash]);
    return { tokens: await issueTokens(db, { userId: row.user_id, clientId: row.client_id, label: row.client_name, scope: row.scope || SCOPE, family }) };
  });
}

async function refresh(f: Record<string, string>): Promise<Issue> {
  const { refresh_token, client_id, resource } = f;
  if (!refresh_token || !client_id) return { error: "invalid_request", description: "Faltam parâmetros." };
  if (resource && !validResource(resource)) return { error: "invalid_target", description: "Recurso desconhecido." };
  return tx(async (db) => {
    const { rows: [row] } = await db.query<{ id: string; user_id: string; client_id: string; label: string; scope: string; family: string; revoked: boolean; expired: boolean }>(
      `SELECT id, user_id, client_id, label, scope, family, revoked_at IS NOT NULL AS revoked, expires_at < now() AS expired
       FROM mcp_tokens WHERE token_hash = $1 AND kind = 'refresh' FOR UPDATE`, [sha256(refresh_token)]);
    const invalid = { error: "invalid_grant", description: "Refresh token inválido. Conecte de novo." };
    if (!row || row.client_id !== client_id) return invalid;
    // reuso de um refresh já trocado: a família inteira cai
    if (row.revoked) { await revokeFamily(db, row.family); return invalid; }
    if (row.expired) return invalid;
    await db.query("UPDATE mcp_tokens SET revoked_at = now() WHERE id = $1", [row.id]);
    return { tokens: await issueTokens(db, { userId: row.user_id, clientId: row.client_id, label: row.label, scope: row.scope || SCOPE, family: row.family }) };
  });
}

r.post("/oauth/token", async (c) => {
  hit(`oauth-token:${clientIp(c)}`, 600, 60_000);
  const f = await formOf(c);
  if (!f.grant_type) return tokenError(c, "invalid_request", "Use application/x-www-form-urlencoded com grant_type.");
  const res = f.grant_type === "authorization_code" ? await exchangeCode(f) : f.grant_type === "refresh_token" ? await refresh(f) : ({ error: "unsupported_grant_type", description: "Só authorization_code e refresh_token." } as Issue);
  if ("error" in res) return tokenError(c, res.error, res.description);
  return c.json(res.tokens, 200, NO_STORE);
});

/* ---------- revogação (RFC 7009): responde 200 mesmo para token desconhecido ---------- */
r.post("/oauth/revoke", async (c) => {
  hit(`oauth-revoke:${clientIp(c)}`, 600, 60_000);
  const f = await formOf(c);
  if (!f.token) return tokenError(c, "invalid_request", "Falta o token.");
  await tx(async (db) => {
    const { rows: [row] } = await db.query<{ id: string; kind: string; family: string; client_id: string | null }>("SELECT id, kind, family, client_id FROM mcp_tokens WHERE token_hash = $1 AND kind IN ('access','refresh')", [sha256(f.token)]);
    if (!row || (f.client_id && row.client_id !== f.client_id)) return;
    if (row.kind === "refresh") await revokeFamily(db, row.family);
    else await db.query("UPDATE mcp_tokens SET revoked_at = now() WHERE id = $1", [row.id]);
  });
  return c.body(null, 200, NO_STORE);
});

export default r;
