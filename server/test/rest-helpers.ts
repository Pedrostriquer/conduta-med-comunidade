/* Base dos testes de integração: a API inteira via `app.request`, com um cliente que guarda o cookie de cada pessoa. */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { migrate, pool } from "../src/db";

export const QID = "EXEMPLO-2026-Q001";
export const QID2 = "EXEMPLO-2026-Q002";

export const app = createApp();
const uniqueIp = () => `10.${randomBytes(3).join(".")}`;

export type Res = { status: number; json: any; cookie: string | null; text: string; headers: Headers };

/** uma pessoa: guarda o cookie entre as chamadas; cada chamada sai de um IP diferente, salvo se `ip` for fixado */
export class Client {
  cookie = "";
  me: any = null;
  constructor(public ip?: string) {}

  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
    const h: Record<string, string> = { "x-forwarded-for": this.ip ?? uniqueIp(), ...headers };
    if (this.cookie) h.cookie = this.cookie;
    const init: RequestInit = { method, headers: h };
    if (body instanceof FormData || body instanceof Uint8Array) init.body = body as RequestInit["body"];
    else if (body !== undefined) { init.body = JSON.stringify(body); h["content-type"] ??= "application/json"; }
    const res = await app.request(path, init);
    const set = res.headers.get("set-cookie");
    if (set) {
      const [pair] = set.split(";");
      this.cookie = /=;?$|=$/.test(pair) || /max-age=0/i.test(set) ? "" : pair;
    }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* resposta sem JSON */ }
    return { status: res.status, json, cookie: set, text, headers: res.headers };
  }
  get = (path: string, headers?: Record<string, string>) => this.req("GET", path, undefined, headers);
  post = (path: string, body: unknown = {}, headers?: Record<string, string>) => this.req("POST", path, body, headers);
  patch = (path: string, body: unknown = {}) => this.req("PATCH", path, body);
  put = (path: string, body: unknown, headers?: Record<string, string>) => this.req("PUT", path, body, headers);
  del = (path: string, body?: unknown) => this.req("DELETE", path, body);
}

let n = 0;
/** cria uma conta nova e já entra nela */
export async function person(name: string, extra: Record<string, unknown> = {}, patch: Record<string, unknown> = {}) {
  const c = new Client();
  n++;
  const res = await c.post("/api/auth/signup", { name, email: `p${n}-${randomBytes(3).toString("hex")}@teste.com`, password: "senha-segura-123", ...extra });
  if (res.status !== 200) throw new Error(`cadastro falhou: ${res.text}`);
  c.me = res.json.user;
  if (Object.keys(patch).length) {
    const p = await c.patch("/api/me", patch);
    if (p.status !== 200) throw new Error(`perfil falhou: ${p.text}`);
    c.me = p.json.user;
  }
  return c;
}

/** `a` segue `b` e `b` aceita */
export async function follow(a: Client, b: Client) {
  await a.post(`/api/users/${b.me.handle}/follow`);
  await b.post(`/api/me/follow-requests/${a.me.handle}`, { accept: true });
}

export const docJson = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

export function useDatabase() {
  beforeAll(async () => { await migrate(); });
  // um registro de auditoria do teste anterior ainda pode estar entrando (ele não segura a resposta): se cruzar com a limpeza, o banco
  // derruba um dos dois por travamento mútuo. É só tentar de novo.
  beforeEach(async () => {
    for (let i = 0; ; i++) {
      try { await pool.query("TRUNCATE users, feedback, oauth_clients RESTART IDENTITY CASCADE"); return; }
      catch (e) { if ((e as { code?: string }).code !== "40P01" || i >= 4) throw e; }
    }
  });
}
