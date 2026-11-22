import { discoverAuthorizationServerMetadata, discoverOAuthProtectedResourceMetadata, exchangeAuthorization, refreshAuthorization, registerClient as sdkRegister, startAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isPrivateIp, redirectAllowed, validRedirect } from "../src/oauth/clients";
import { pool } from "../src/db";
import { app, person, useDatabase } from "./rest-helpers";
import type { Client } from "./rest-helpers";
import { form, MCP_HEADERS, MCP_INIT, pkce } from "./mcp-helpers";

useDatabase();
const PUBLIC = "http://localhost:5180", REDIRECT = "https://cliente.exemplo.com/callback";

const register = async (redirect_uris: string[] = [REDIRECT]) => (await app.request("/oauth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Minha IA", redirect_uris, grant_types: ["authorization_code", "refresh_token"], token_endpoint_auth_method: "none" }) }));
const mcpPost = (token?: string) => app.request("/mcp", { method: "POST", headers: { ...MCP_HEADERS, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(MCP_INIT) });

async function fullFlow(c: Client, opts: { resource?: string } = {}) {
  const client_id = (await (await register()).json()).client_id as string, { verifier, challenge } = pkce();
  const params = { client_id, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "abc", ...(opts.resource ? { resource: opts.resource } : {}) };
  const ok = await c.post("/api/oauth/approve", params);
  expect(ok.status).toBe(200);
  const code = new URL(ok.json.redirect).searchParams.get("code")!;
  const exchange = (verifierUsed = verifier) => app.request("/oauth/token", form({ grant_type: "authorization_code", code, client_id, redirect_uri: REDIRECT, code_verifier: verifierUsed, ...(opts.resource ? { resource: opts.resource } : {}) }));
  return { client_id, verifier, challenge, code, exchange, params };
}

describe("descoberta", () => {
  it("publica os metadados do recurso e do servidor de autorização, com CORS aberto", async () => {
    const r = await app.request("/.well-known/oauth-protected-resource/mcp", { headers: { origin: "https://claude.ai" } });
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    const prm = await r.json();
    expect(prm.resource).toBe(`${PUBLIC}/mcp`);
    expect(prm.authorization_servers).toEqual([PUBLIC]);
    // a especificação pede para não anunciar offline_access nos metadados do recurso
    expect(prm.scopes_supported).not.toContain("offline_access");
    expect((await (await app.request("/.well-known/oauth-protected-resource")).json()).resource).toBe(PUBLIC);

    const as = await (await app.request("/.well-known/oauth-authorization-server")).json();
    expect(as.issuer).toBe(PUBLIC);
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(as.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    expect(as.client_id_metadata_document_supported).toBe(true);
    expect(as.authorization_response_iss_parameter_supported).toBe(true);
    for (const k of ["authorization_endpoint", "token_endpoint", "registration_endpoint", "revocation_endpoint"]) expect(as[k]).toMatch(new RegExp(`^${PUBLIC}/oauth/`));
  });

  it("/mcp sem token responde 401 com WWW-Authenticate apontando os metadados", async () => {
    const r = await mcpPost();
    expect(r.status).toBe(401);
    const h = r.headers.get("www-authenticate")!;
    expect(h).toContain(`Bearer resource_metadata="${PUBLIC}/.well-known/oauth-protected-resource/mcp"`);
    expect(h).toContain('scope="conduta"');
    const bad = await mcpPost("cda_inexistente");
    expect(bad.status).toBe(401);
    expect(bad.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("OPTIONS responde ao navegador e expõe o WWW-Authenticate", async () => {
    const r = await app.request("/mcp", { method: "OPTIONS", headers: { origin: "https://exemplo.com", "access-control-request-method": "POST", "access-control-request-headers": "authorization,mcp-protocol-version" } });
    expect(r.status).toBeLessThan(300);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect((await mcpPost()).status).toBe(401);
    const preflight = await app.request("/mcp", { method: "POST", headers: { ...MCP_HEADERS, origin: "https://exemplo.com" }, body: "{}" });
    expect(preflight.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
  });
});

describe("registro de cliente", () => {
  it("registra cliente público, sem segredo", async () => {
    const r = await register(), j = await r.json();
    expect(r.status).toBe(201);
    expect(j.client_id).toBeTruthy();
    expect(j.client_secret).toBeUndefined();
    expect(j.token_endpoint_auth_method).toBe("none");
    expect(j.redirect_uris).toEqual([REDIRECT]);
  });
  it("recusa redirecionamento perigoso", async () => {
    for (const bad of ["javascript:alert(1)", "http://site.com/cb", "https://x.com/cb#frag", "nao-url", "data:text/html,oi"]) expect((await register([bad])).status).toBe(400);
    expect(validRedirect("http://127.0.0.1:3000/cb")).toBe(true);
    expect(validRedirect("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(true);
  });
  it("no loopback a porta pode variar; no resto, é exata", () => {
    const c = { clientId: "x", name: "x", redirectUris: ["http://127.0.0.1:3000/cb", REDIRECT] };
    expect(redirectAllowed(c, "http://127.0.0.1:54321/cb")).toBe(true);
    expect(redirectAllowed(c, "http://127.0.0.1:54321/outro")).toBe(false);
    expect(redirectAllowed(c, REDIRECT + "/mais")).toBe(false);
    expect(redirectAllowed(c, "https://cliente.exemplo.com:8443/callback")).toBe(false);
  });
});

describe("autorização", () => {
  it("valida e leva para /conectar com os mesmos parâmetros", async () => {
    const client_id = (await (await register()).json()).client_id, { challenge } = pkce();
    const q = new URLSearchParams({ client_id, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "xyz", resource: `${PUBLIC}/mcp` });
    const r = await app.request(`/oauth/authorize?${q}`);
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe(`${PUBLIC}/conectar`);
    expect(Object.fromEntries(loc.searchParams)).toEqual(Object.fromEntries(q));
  });
  it("cliente ou retorno errado nunca redireciona", async () => {
    const client_id = (await (await register()).json()).client_id, { challenge } = pkce();
    const base = { response_type: "code", code_challenge: challenge, code_challenge_method: "S256" };
    expect((await app.request(`/oauth/authorize?${new URLSearchParams({ ...base, client_id: "nao-existe", redirect_uri: REDIRECT })}`)).status).toBe(400);
    expect((await app.request(`/oauth/authorize?${new URLSearchParams({ ...base, client_id, redirect_uri: "https://malicioso.com/cb" })}`)).status).toBe(400);
  });
  it("sem PKCE S256 volta com erro e iss no retorno", async () => {
    const client_id = (await (await register()).json()).client_id;
    const r = await app.request(`/oauth/authorize?${new URLSearchParams({ client_id, redirect_uri: REDIRECT, response_type: "code", code_challenge: "abc", code_challenge_method: "plain", state: "s1" })}`);
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get("location")!);
    expect(loc.searchParams.get("error")).toBe("invalid_request");
    expect(loc.searchParams.get("state")).toBe("s1");
    expect(loc.searchParams.get("iss")).toBe(PUBLIC);
  });
  it("as rotas da tela exigem sessão", async () => {
    const r = await app.request("/api/oauth/request?client_id=x&redirect_uri=y");
    expect(r.status).toBe(401);
  });
  it("a tela recebe o nome do cliente; recusar volta com access_denied", async () => {
    const c = await person("Ana"), client_id = (await (await register()).json()).client_id, { challenge } = pkce();
    const params = { client_id, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "s2" };
    const got = await c.get(`/api/oauth/request?${new URLSearchParams(params)}`);
    expect(got.json).toEqual({ clientName: "Minha IA", redirectUri: REDIRECT });
    const no = await c.post("/api/oauth/deny", params), u = new URL(no.json.redirect);
    expect(u.searchParams.get("error")).toBe("access_denied");
    expect(u.searchParams.get("state")).toBe("s2");
    expect(u.searchParams.get("iss")).toBe(PUBLIC);
  });
});

describe("token", () => {
  it("fluxo completo: aprovação com sessão, PKCE, token, /mcp e refresh com rotação", async () => {
    const c = await person("Ana"), f = await fullFlow(c, { resource: `${PUBLIC}/mcp` });
    const ok = await c.post("/api/oauth/approve", f.params), u = new URL(ok.json.redirect);
    expect(u.searchParams.get("state")).toBe("abc");
    expect(u.searchParams.get("iss")).toBe(PUBLIC);

    expect((await (await f.exchange(pkce().verifier)).json()).error).toBe("invalid_grant");
    const r = await f.exchange(), tok = await r.json();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(tok).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "conduta" });
    expect((await mcpPost(tok.access_token)).status).toBe(200);
    // refresh não serve como credencial
    expect((await mcpPost(tok.refresh_token)).status).toBe(401);

    const again = await (await app.request("/oauth/token", form({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: f.client_id }))).json();
    expect(again.access_token).toBeTruthy();
    expect(again.refresh_token).not.toBe(tok.refresh_token);
    expect((await mcpPost(again.access_token)).status).toBe(200);

    // reusar o refresh antigo derruba a família inteira
    const reuse = await app.request("/oauth/token", form({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: f.client_id }));
    expect(reuse.status).toBe(400);
    expect((await reuse.json()).error).toBe("invalid_grant");
    expect((await mcpPost(again.access_token)).status).toBe(401);
    const newer = await app.request("/oauth/token", form({ grant_type: "refresh_token", refresh_token: again.refresh_token, client_id: f.client_id }));
    expect((await newer.json()).error).toBe("invalid_grant");
  });

  it("guarda só o hash, com as validades certas", async () => {
    const c = await person("Ana"), f = await fullFlow(c), tok = await (await f.exchange()).json();
    const rows = (await pool.query("SELECT kind, token_hash, (expires_at - now()) AS ttl, EXTRACT(EPOCH FROM expires_at - now()) AS s FROM mcp_tokens")).rows;
    expect(rows.map((x) => x.kind).sort()).toEqual(["access", "refresh"]);
    const dump = JSON.stringify(rows.map((x) => x.token_hash.toString("utf8") + x.token_hash.toString("base64")));
    expect(dump).not.toContain(tok.access_token);
    const s = Object.fromEntries(rows.map((x) => [x.kind, Number(x.s)]));
    expect(s.access).toBeGreaterThan(3500); expect(s.access).toBeLessThanOrEqual(3600);
    expect(s.refresh).toBeGreaterThan(89 * 86400); expect(s.refresh).toBeLessThanOrEqual(90 * 86400);
  });

  it("código é de uso único: reuso derruba o que saiu dele", async () => {
    const c = await person("Ana"), f = await fullFlow(c), tok = await (await f.exchange()).json();
    expect((await mcpPost(tok.access_token)).status).toBe(200);
    const twice = await f.exchange();
    expect((await twice.json()).error).toBe("invalid_grant");
    expect((await mcpPost(tok.access_token)).status).toBe(401);
  });

  it("código vence em 5 minutos", async () => {
    const c = await person("Ana"), f = await fullFlow(c);
    const { rows: [row] } = await pool.query("SELECT EXTRACT(EPOCH FROM expires_at - now()) AS s FROM oauth_codes");
    expect(Number(row.s)).toBeLessThanOrEqual(300);
    await pool.query("UPDATE oauth_codes SET expires_at = now() - interval '1 second'");
    expect((await (await f.exchange()).json()).error).toBe("invalid_grant");
  });

  it("recusa recurso de outro servidor (RFC 8707)", async () => {
    const c = await person("Ana"), client_id = (await (await register()).json()).client_id, { challenge } = pkce();
    const r = await c.post("/api/oauth/approve", { client_id, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", resource: "https://outro.com/mcp" });
    expect(r.status).toBe(400);
    const f = await fullFlow(c, { resource: `${PUBLIC}/mcp` });
    const bad = await app.request("/oauth/token", form({ grant_type: "authorization_code", code: f.code, client_id: f.client_id, redirect_uri: REDIRECT, code_verifier: f.verifier, resource: "https://outro.com/mcp" }));
    expect((await bad.json()).error).toBe("invalid_target");
    // aceita a variação com barra e com maiúsculas no host
    const f2 = await fullFlow(c, { resource: `${PUBLIC}/mcp/` });
    expect((await f2.exchange()).status).toBe(200);
    const f3 = await fullFlow(c, { resource: PUBLIC });
    expect((await f3.exchange()).status).toBe(200);
  });

  it("formato e grant errados dão o erro do OAuth", async () => {
    expect((await (await app.request("/oauth/token", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json()).error).toBe("invalid_request");
    expect((await (await app.request("/oauth/token", form({ grant_type: "client_credentials" }))).json()).error).toBe("unsupported_grant_type");
  });

  it("revogar: refresh derruba a família; desconhecido responde 200", async () => {
    const c = await person("Ana"), f = await fullFlow(c), tok = await (await f.exchange()).json();
    expect((await app.request("/oauth/revoke", form({ token: "nao-existe" }))).status).toBe(200);
    expect((await app.request("/oauth/revoke", form({ token: tok.refresh_token, client_id: f.client_id }))).status).toBe(200);
    expect((await mcpPost(tok.access_token)).status).toBe(401);
  });
});

describe("cliente OAuth oficial do SDK", () => {
  /** o endereço público é o do app; aqui as requisições caem direto na API */
  const fetchFn = ((url: string | URL, init?: RequestInit) => { const u = new URL(url); return app.request(u.pathname + u.search, init); }) as typeof fetch;

  it("descobre, registra, autoriza, troca e renova", async () => {
    const c = await person("Ana"), server = `${PUBLIC}/mcp`;
    const prm = await discoverOAuthProtectedResourceMetadata(server, undefined, fetchFn);
    expect(prm.resource).toBe(server);
    const meta = await discoverAuthorizationServerMetadata(prm.authorization_servers![0], { fetchFn });
    expect(meta?.issuer).toBe(PUBLIC);
    const info = await sdkRegister(PUBLIC, { metadata: meta, clientMetadata: { client_name: "SDK", redirect_uris: [REDIRECT], grant_types: ["authorization_code", "refresh_token"], token_endpoint_auth_method: "none" }, fetchFn });
    const { authorizationUrl, codeVerifier } = await startAuthorization(PUBLIC, { metadata: meta, clientInformation: info, redirectUrl: REDIRECT, scope: "conduta offline_access", state: "st", resource: new URL(server) });
    const go = await app.request(authorizationUrl.pathname + authorizationUrl.search);
    expect(new URL(go.headers.get("location")!).pathname).toBe("/conectar");
    const ok = await c.post("/api/oauth/approve", Object.fromEntries(authorizationUrl.searchParams));
    const back = new URL(ok.json.redirect);
    expect(back.searchParams.get("iss")).toBe(meta!.issuer);
    const tokens = await exchangeAuthorization(PUBLIC, { metadata: meta, clientInformation: info, authorizationCode: back.searchParams.get("code")!, codeVerifier, redirectUri: REDIRECT, resource: new URL(server), fetchFn });
    expect(tokens.scope).toBe("conduta");
    expect((await mcpPost(tokens.access_token)).status).toBe(200);
    const fresh = await refreshAuthorization(PUBLIC, { metadata: meta, clientInformation: info, refreshToken: tokens.refresh_token!, resource: new URL(server), fetchFn });
    expect((await mcpPost(fresh.access_token)).status).toBe(200);
    expect(fresh.refresh_token).not.toBe(tokens.refresh_token);
  });
});

describe("documento de metadados do cliente", () => {
  afterEach(() => vi.unstubAllGlobals());
  const DOC = "https://chatgpt.com/oauth/client.json", CB = "https://chatgpt.com/connector_platform_oauth_redirect";

  it("usa a URL como client_id quando o documento confere", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ client_id: DOC, client_name: "ChatGPT", redirect_uris: [CB], token_endpoint_auth_methods_supported: ["none", "private_key_jwt"] }), { headers: { "cache-control": "max-age=3600" } })));
    const c = await person("Ana"), { verifier, challenge } = pkce();
    const params = { client_id: DOC, redirect_uri: CB, response_type: "code", code_challenge: challenge, code_challenge_method: "S256" };
    expect((await c.get(`/api/oauth/request?${new URLSearchParams(params)}`)).json.clientName).toBe("ChatGPT");
    const ok = await c.post("/api/oauth/approve", params);
    const code = new URL(ok.json.redirect).searchParams.get("code")!;
    const t = await app.request("/oauth/token", form({ grant_type: "authorization_code", code, client_id: DOC, redirect_uri: CB, code_verifier: verifier }));
    expect(t.status).toBe(200);
  });
  it("documento com client_id diferente é recusado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ client_id: "https://outro.com/x.json", client_name: "Falso", redirect_uris: [REDIRECT] }))));
    const r = await app.request(`/oauth/authorize?${new URLSearchParams({ client_id: "https://falso.exemplo.com/c.json", redirect_uri: REDIRECT, response_type: "code", code_challenge: pkce().challenge, code_challenge_method: "S256" })}`);
    expect(r.status).toBe(400);
  });
  it("reconhece endereços da rede interna", () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "100.64.0.1"]) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700::1111", "172.32.0.1"]) expect(isPrivateIp(ip)).toBe(false);
  });
});
