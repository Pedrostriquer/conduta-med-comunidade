/* Quem pede autorização. Dois jeitos: registro dinâmico (RFC 7591, ainda o que muita IA usa; a especificação de
   2026-07-28 o marca como obsoleto, mas segue valendo) e documento de metadados do cliente (CIMD): o client_id é uma URL
   https que publica nome e redirecionamentos. O ChatGPT e o Claude preferem o segundo quando o servidor anuncia.
   Todo cliente é público: sem segredo, a proteção é o PKCE. */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { randomBytes } from "node:crypto";
import { one, q } from "../db";
import { env } from "../env";

export type Client = { clientId: string; name: string; redirectUris: string[] };
export type RegisterInput = { client_name?: unknown; redirect_uris?: unknown };

const NAME_MAX = 120;
const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "vbscript:", "file:", "about:", "blob:", "ftp:", "ws:", "wss:"]);
const isLoopbackHost = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";
const cleanName = (s: unknown) => (typeof s === "string" ? s.replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, NAME_MAX) : "") || "IA";

/** https; http só no próprio computador; apps nativos usam esquema próprio (cursor://...). Nunca fragmento. */
export function validRedirect(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 2048) return false;
  let p: URL;
  try { p = new URL(u); } catch { return false; }
  if (p.hash || BLOCKED_SCHEMES.has(p.protocol)) return false;
  return p.protocol !== "http:" || isLoopbackHost(p.hostname);
}

/** igual ao registrado. No loopback a porta pode variar a cada execução, como exigem a RFC 8252 e o OAuth 2.1. */
export function redirectAllowed(c: Client, uri: string) {
  if (c.redirectUris.includes(uri)) return true;
  let p: URL;
  try { p = new URL(uri); } catch { return false; }
  if (p.protocol !== "http:" || !isLoopbackHost(p.hostname) || p.hash) return false;
  return c.redirectUris.some((r) => { const x = new URL(r); return x.protocol === "http:" && x.hostname === p.hostname && x.pathname === p.pathname && x.search === p.search; });
}

export async function registerClient(meta: RegisterInput): Promise<Client | null> {
  const uris = meta.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 20 || !uris.every(validRedirect)) return null;
  const c: Client = { clientId: "cdc_" + randomBytes(18).toString("base64url"), name: cleanName(meta.client_name), redirectUris: uris as string[] };
  await q("INSERT INTO oauth_clients (client_id, client_name, redirect_uris) VALUES ($1, $2, $3)", [c.clientId, c.name, c.redirectUris]);
  return c;
}

/* ---------- documento de metadados do cliente ---------- */
const CIMD_TIMEOUT_MS = 5000, CIMD_MAX_BYTES = 64 * 1024, CIMD_MIN_CACHE_S = 300, CIMD_MAX_CACHE_S = 86_400;
const cache = new Map<string, { client: Client | null; until: number }>();

export function isMetadataUrl(id: string) {
  try {
    const u = new URL(id);
    return u.protocol === "https:" && u.pathname.length > 1 && !u.hash && !u.username && !u.password && !u.pathname.split("/").some((s) => s === "." || s === "..");
  } catch { return false; }
}

/** endereço da rede interna: o servidor não busca documentos ali */
export function isPrivateIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

async function fetchMetadata(id: string): Promise<{ client: Client; maxAge: number } | null> {
  const host = new URL(id).hostname;
  // em desenvolvimento e nos testes o nome pode não resolver; em produção, só endereço público
  if (env.prod && (await lookup(host, { all: true })).some((a) => isPrivateIp(a.address))) return null;
  const r = await fetch(id, { redirect: "error", signal: AbortSignal.timeout(CIMD_TIMEOUT_MS), headers: { accept: "application/json" } });
  if (!r.ok || Number(r.headers.get("content-length") || 0) > CIMD_MAX_BYTES) return null;
  const text = await r.text();
  if (text.length > CIMD_MAX_BYTES) return null;
  const doc = JSON.parse(text) as { client_id?: unknown; client_name?: unknown; redirect_uris?: unknown };
  if (doc.client_id !== id || typeof doc.client_name !== "string") return null;
  if (!Array.isArray(doc.redirect_uris) || !doc.redirect_uris.length || doc.redirect_uris.length > 50 || !doc.redirect_uris.every(validRedirect)) return null;
  const m = /max-age=(\d+)/.exec(r.headers.get("cache-control") || "");
  return { client: { clientId: id, name: cleanName(doc.client_name), redirectUris: doc.redirect_uris }, maxAge: m ? Number(m[1]) : 3600 };
}

async function metadataClient(id: string): Promise<Client | null> {
  const hit = cache.get(id);
  if (hit && hit.until > Date.now()) return hit.client;
  let got: Awaited<ReturnType<typeof fetchMetadata>> = null;
  try { got = await fetchMetadata(id); } catch { got = null; }
  if (!got) {
    // falhou mas já conhecíamos: mantém por um minuto em vez de derrubar quem está no meio da autorização
    cache.set(id, { client: hit?.client ?? null, until: Date.now() + 60_000 });
    return hit?.client ?? null;
  }
  const ttl = Math.min(CIMD_MAX_CACHE_S, Math.max(CIMD_MIN_CACHE_S, got.maxAge)) * 1000;
  cache.set(id, { client: got.client, until: Date.now() + ttl });
  await q(
    `INSERT INTO oauth_clients (client_id, client_name, redirect_uris) VALUES ($1, $2, $3)
     ON CONFLICT (client_id) DO UPDATE SET client_name = EXCLUDED.client_name, redirect_uris = EXCLUDED.redirect_uris`,
    [id, got.client.name, got.client.redirectUris],
  );
  return got.client;
}

/** o cliente pelo client_id: URL busca o documento; o resto vem do registro */
export async function resolveClient(id: string | undefined | null): Promise<Client | null> {
  if (!id || id.length > 2048) return null;
  if (isMetadataUrl(id)) return metadataClient(id);
  const r = await one<{ client_id: string; client_name: string; redirect_uris: string[] }>("SELECT client_id, client_name, redirect_uris FROM oauth_clients WHERE client_id = $1", [id]);
  return r ? { clientId: r.client_id, name: r.client_name, redirectUris: r.redirect_uris } : null;
}
