import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../src/db";
import { setModelCaller } from "../src/ia/model";
import { resetCalibration } from "../src/ia/runs";
import { setMailer } from "../src/lib/mail";
import type { Outgoing } from "../src/lib/mail";
import { flushMinute, recordError } from "../src/lib/monitor";
import { clearSecretCache, getSecret } from "../src/lib/secrets";
import { clearSettingsCache } from "../src/lib/settings";
import { applyChanges } from "../src/records";
import { Client, person, useDatabase } from "./rest-helpers";

useDatabase();

const ID = "00000000-0000-4000-8000-000000000000";
const ROUTES: [string, string, unknown?][] = [
  ["GET", "/api/admin/users"], ["POST", "/api/admin/users", { name: "Nova", email: "nova@teste.com" }], ["GET", `/api/admin/users/${ID}`], ["POST", `/api/admin/users/${ID}/reset-link`, {}], ["POST", `/api/admin/users/${ID}/send-code`, {}], ["POST", `/api/admin/users/${ID}/logout`, {}], ["PATCH", `/api/admin/users/${ID}/ia`, { monthlyUsd: 1 }],
  ["GET", "/api/admin/servidor"], ["GET", "/api/admin/banco"], ["GET", "/api/admin/banco/questoes"], ["GET", "/api/admin/config"],
  ["PUT", "/api/admin/config/mail", { from: "a@b.com" }], ["DELETE", "/api/admin/config/mail"], ["POST", "/api/admin/config/mail/testar", {}], ["PUT", "/api/admin/config/anthropic", { key: "sk-ant-aaaaaaaaaaaaaaaaaaaaaaaa" }], ["DELETE", "/api/admin/config/anthropic"],
  ["GET", "/api/admin/ia"], ["PUT", "/api/admin/ia/config", { enabled: false }], ["POST", "/api/admin/ia/testar", {}], ["GET", `/api/admin/ia/runs/${ID}`], ["POST", `/api/admin/ia/runs/${ID}/rerun`, { model: "claude-haiku-5-5", effort: "low" }],
];
const admin = () => person("Quem Cuida", { email: "admin@teste.com" });

beforeEach(async () => { clearSettingsCache(); clearSecretCache(); resetCalibration(); await pool.query("TRUNCATE app_settings, app_secrets, ai_runs, server_minutes, server_busy, server_errors CASCADE"); });
afterEach(() => { setMailer(null); setModelCaller(null); });

describe("painel do admin", () => {
  it("barra quem não é admin e quem não entrou, em todas as rotas", async () => {
    const u = await person("Comum");
    for (const [m, path, b] of ROUTES) {
      expect((await u.req(m, path, b)).status, path).toBe(403);
      expect((await new Client().req(m, path, b)).status, path).toBe(401);
    }
  });

  it("lista as pessoas e busca sem acento", async () => {
    const a = await admin();
    await person("José Antônio");
    const all = await a.get("/api/admin/users");
    expect(all.json.total).toBe(2);
    expect(all.json.items[0]).toHaveProperty("bytes");
    const found = await a.get("/api/admin/users?q=" + encodeURIComponent("jose antonio"));
    expect(found.json.items).toHaveLength(1);
    expect(found.json.items[0].name).toBe("José Antônio");
    for (const ordem of ["recente", "novos", "ativos", "espaco", "ia", "questoes", "nome", "x'; DROP TABLE users"]) expect((await a.get("/api/admin/users?ordem=" + encodeURIComponent(ordem))).status, ordem).toBe(200);
  });

  it("registra as telas e mostra a sequência e o tempo no detalhe", async () => {
    const a = await admin(), u = await person("Ana");
    const now = Date.now();
    const r = await u.post("/api/uso", { visit: "visita-1", events: [{ path: "/", at: now - 60_000, ms: 20_000 }, { path: "/sessao/:id", at: now - 40_000, ms: 30_000 }, { path: "/resultado/:id", at: now - 10_000, ms: 5_000 }] });
    expect(r.status).toBe(204);
    expect((await new Client().post("/api/uso", { visit: "visita-1", events: [] })).status).toBe(204);
    expect((await u.post("/api/uso", { visit: "x y", events: [] })).status).toBe(400);
    expect((await u.post("/api/uso", { visit: "visita-2", events: [{ path: "javascript:alert(1)", at: now, ms: 1 }] })).status).toBe(400);
    const d = await a.get(`/api/admin/users/${u.me.id}`);
    expect(d.status).toBe(200);
    expect(d.json.visits[0].screens.map((s: { path: string }) => s.path)).toEqual(["/", "/sessao/:id", "/resultado/:id"]);
    expect(d.json.visits[0].ms).toBe(55_000);
    expect(d.json.days.reduce((s: number, x: { ms: number }) => s + x.ms, 0)).toBe(55_000);
    expect(d.json.user.email).toBe(u.me.email);
    expect(JSON.stringify(d.json)).not.toContain("password_hash");
  });

  it("mostra o espaço por baralho e o que está compartilhado", async () => {
    const a = await admin(), u = await person("Bia"), v = await person("Caio");
    await applyChanges(u.me.id, [
      { c: "fc_deck", id: "d1", data: { id: "d1", name: "GO", file: "", importedAt: 1, cards: 2, images: 0, groups: [] }, at: 1 },
      { c: "fc_card", id: "d1:1", data: { id: "d1:1", deck: "d1", fields: ["frente", "verso"], kind: "basic", path: [], ord: 0, due: 1, ivl: 0, ease: 2.5, reps: 0, lapses: 0, step: 0, isNew: 1, order: 1 }, at: 1 },
      { c: "fc_card", id: "d1:2", data: { id: "d1:2", deck: "d1", fields: ["frente 2", "verso"], kind: "basic", path: [], ord: 0, due: 2, ivl: 0, ease: 2.5, reps: 0, lapses: 0, step: 0, isNew: 1, order: 2 }, at: 1 },
    ]);
    const pub = await u.post("/api/decks/publish", { localDeck: "d1", name: "GO da Bia", description: "", tags: [], visibility: "publico", cards: [{ key: "1", fields: ["frente", "verso"], kind: "basic", path: [], ord: 0 }], media: {} });
    const d = await a.get(`/api/admin/users/${u.me.id}`);
    const deck = d.json.storage.decks.find((x: { id: string }) => x.id === "d1");
    expect(deck.cards).toBe(2);
    expect(deck.textBytes).toBeGreaterThan(0);
    if (pub.status === 200) expect(deck.published.visibility).toBe("publico");
    expect(v.me.id).toBeTruthy();
  });

  it("cria a conta de alguém e o link de 7 dias deixa a pessoa criar a senha e já entrar", async () => {
    const a = await admin();
    const r = await a.post("/api/admin/users", { name: "Fulano de Tal", email: "Fulano@Teste.com" });
    expect(r.status).toBe(200);
    expect(r.json.user).toEqual({ id: expect.any(String), name: "Fulano de Tal", email: "fulano@teste.com", handle: "fulano.de.tal" });
    expect(r.json.url).toMatch(/\/entrar\?redefinir=[\w-]+&nova=1$/);
    expect(r.text).not.toMatch(/argon2|password/);
    const row = (await pool.query("SELECT u.role, u.password_hash, p.expires_at - now() > interval '6 days 23 hours' AS longo, p.expires_at - now() <= interval '7 days' AS teto FROM users u JOIN password_resets p ON p.user_id = u.id WHERE u.id = $1", [r.json.user.id])).rows[0];
    expect(row).toMatchObject({ role: "user", longo: true, teto: true });
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    // quem criou continua sendo o admin: a sessão dele não muda
    expect((await a.get("/api/auth/me")).json.user.id).toBe(a.me.id);

    const nova = new Client(), token = new URL(r.json.url).searchParams.get("redefinir");
    const done = await nova.post("/api/auth/reset", { token, password: "senha-da-pessoa-1" });
    expect(done.status).toBe(200);
    expect(done.json.user).toMatchObject({ id: r.json.user.id, email: "fulano@teste.com", role: "user" });
    expect(done.cookie).toMatch(/^cd_sess=/);
    expect((await nova.get("/api/auth/me")).json.user.id).toBe(r.json.user.id);
    expect((await new Client().post("/api/auth/login", { login: "fulano@teste.com", password: "senha-da-pessoa-1" })).status).toBe(200);
    expect((await new Client().post("/api/auth/reset", { token, password: "outra-senha-boa-1" })).status).toBe(400);
  });

  it("ao criar conta, recusa e-mail ou @ repetido e dados inválidos; aceita o @ pedido", async () => {
    const a = await admin(), ja = await person("Já Tem", { email: "ja@teste.com", handle: "ja_tem" });
    const rep = await a.post("/api/admin/users", { name: "Outra", email: "JA@teste.com" });
    expect(rep.status).toBe(409);
    expect(rep.json.error.message).toBe("Já existe uma conta com este e-mail.");
    expect((await a.post("/api/admin/users", { name: "Outra", email: "outra@teste.com", handle: ja.me.handle })).status).toBe(409);
    expect((await a.post("/api/admin/users", { name: "", email: "outra@teste.com" })).status).toBe(400);
    expect((await a.post("/api/admin/users", { name: "Outra", email: "naoeemail" })).status).toBe(400);
    expect((await a.post("/api/admin/users", { name: "Outra", email: "outra@teste.com", handle: "admin" })).status).toBe(400);
    expect((await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n).toBe(2);
    const ok = await a.post("/api/admin/users", { name: "Outra", email: "outra@teste.com", handle: "@Outra_1" });
    expect(ok.json.user.handle).toBe("outra_1");
  });

  it("gera link de senha sem mostrar a senha e encerra as sessões", async () => {
    const a = await admin(), u = await person("Dani");
    const l = await a.post(`/api/admin/users/${u.me.id}/reset-link`);
    expect(l.json.url).toContain("/entrar?redefinir=");
    const token = new URL(l.json.url).searchParams.get("redefinir");
    expect((await new Client().post("/api/auth/reset", { token, password: "outra-senha-boa-1" })).status).toBe(200);
    expect((await u.get("/api/auth/me")).json.user).toBeNull();
    const again = await person("Edu");
    expect((await a.post(`/api/admin/users/${again.me.id}/logout`)).status).toBe(204);
    expect((await again.get("/api/auth/me")).json.user).toBeNull();
  });

  it("guarda a chave de API cifrada e nunca devolve o valor", async () => {
    const a = await admin();
    const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz";
    expect((await a.put("/api/admin/config/anthropic", { key: "chave-errada-aaaaaaaaaaaaaaaaaaaaaa" })).status).toBe(400);
    const r = await a.put("/api/admin/config/anthropic", { key });
    expect(r.status).toBe(200);
    expect(r.json.hint).toBe("sk-ant-…wxyz");
    const raw = await pool.query("SELECT ciphertext, hint FROM app_secrets WHERE name = 'anthropic'");
    expect(raw.rows[0].ciphertext.toString()).not.toContain("abcdefghij");
    clearSecretCache();
    expect(await getSecret("anthropic")).toBe(key);
    const cfg = await a.get("/api/admin/config");
    expect(JSON.stringify(cfg.json)).not.toContain("abcdefghij");
    expect(cfg.json.anthropic.set).toBe(true);
    expect((await a.del("/api/admin/config/anthropic")).status).toBe(204);
    expect((await a.get("/api/admin/config")).json.anthropic.set).toBe(false);
  });

  it("guarda a senha de app sem os espaços do Gmail", async () => {
    const a = await admin();
    expect((await a.put("/api/admin/config/mail", { from: "Pessoa@Gmail.com", password: "abcd efgh ijkl mnop" })).status).toBe(204);
    clearSecretCache();
    expect(await getSecret("mail_password")).toBe("abcdefghijklmnop");
    const cfg = await a.get("/api/admin/config");
    expect(cfg.json.mail.from).toBe("pessoa@gmail.com");
    expect(cfg.json.mail.ready).toBe(true);
    expect(JSON.stringify(cfg.json)).not.toContain("abcdefgh");
  });

  it("mostra a saúde do servidor, os picos e os erros", async () => {
    const a = await admin(), u = await person("Fê");
    for (let i = 0; i < 3; i++) await u.get("/api/auth/me");
    await flushMinute();
    recordError(new Error("deu ruim de propósito"));
    await new Promise((r) => setTimeout(r, 50));
    const s = await a.get("/api/admin/servidor?horas=6");
    expect(s.status).toBe(200);
    expect(s.json.totals.requests).toBeGreaterThan(2);
    expect(s.json.series.length).toBeGreaterThan(0);
    expect(s.json.errors[0].message).toBe("deu ruim de propósito");
    expect(s.json.disk.total).toBeGreaterThan(0);
    expect(s.json.sizes.db).toBeGreaterThan(0);
    expect(s.json.now.rssMb).toBeGreaterThan(0);
  });

  it("mostra quem fez muita coisa de uma vez pelo plugin", async () => {
    const a = await admin(), u = await person("Gabi");
    await pool.query("INSERT INTO mcp_audit (user_id, tool, mode) SELECT $1, 'conduta_buscar_questoes', 'normal' FROM generate_series(1, 40)", [u.me.id]);
    const s = await a.get("/api/admin/servidor");
    expect(s.json.mcpBusy[0].handle).toBe(u.me.handle);
    expect(s.json.mcpBusy[0].calls).toBe(40);
    expect(s.json.mcpBusy[0].peak).toBe(40);
  });

  it("troca o modelo e mostra o gasto e a projeção do mês", async () => {
    const a = await admin(), u = await person("Iris");
    await a.put("/api/admin/ia/config", { model: "claude-sonnet-5-5", effort: "medium", defaultUsd: 10 });
    expect((await a.put("/api/admin/ia/config", { model: "gpt" })).status).toBe(400);
    await pool.query("INSERT INTO ai_runs (user_id, kind, status, model, effort, cost_usd, tokens_in, tokens_out, est_in, est_out) VALUES ($1, 'resultado', 'feito', 'claude-sonnet-5-5', 'medium', 0.5, 1000, 500, 900, 400)", [u.me.id]);
    const d = await a.get("/api/admin/ia");
    expect(d.json.config.model).toBe("claude-sonnet-5-5");
    expect(d.json.month.spent).toBe(0.5);
    expect(d.json.month.projected).toBeGreaterThanOrEqual(0.5);
    expect(d.json.byModel[0].label).toBe("Sonnet 5.5");
    expect(d.json.users[0].limit).toBe(10);
    expect(d.json.runs[0].who.handle).toBe(u.me.handle);
  });

  it("roda de novo com outro modelo sem gastar o crédito da pessoa", async () => {
    const a = await admin(), u = await person("Jo");
    const reply = JSON.stringify({ resumo: "x", padroes_erro: [], padroes_acerto: [], comparacao: null, proximos_passos: [] });
    const models: string[] = [];
    setModelCaller(async (c) => { models.push(c.model); return { text: reply, usage: { in: 100, out: 50 }, stop: "end_turn" }; });
    const parent = await pool.query("INSERT INTO ai_runs (user_id, kind, status, model, effort, prompt, system) VALUES ($1, 'resultado', 'feito', 'claude-haiku-5-5', 'low', 'Q1 · x', 'sys') RETURNING id", [u.me.id]);
    const r = await a.post(`/api/admin/ia/runs/${parent.rows[0].id}/rerun`, { model: "claude-sonnet-5-5", effort: "medium" });
    expect(r.status).toBe(200);
    await new Promise((d) => setTimeout(d, 60));
    const run = await a.get(`/api/admin/ia/runs/${r.json.id}`);
    expect(run.json.status).toBe("feito");
    expect(run.json.charged).toBe(false);
    expect(run.json.parent).toBe(parent.rows[0].id);
    expect(models).toEqual(["claude-sonnet-5-5"]);
  });
});

describe("nova senha por código", () => {
  const box: Outgoing[] = [];
  const useMail = () => { box.length = 0; setMailer(async (m) => { box.push(m); }); };
  const codeOf = () => /\d{6}/.exec(box[box.length - 1].subject)![0];
  const flushMail = () => new Promise((r) => setTimeout(r, 40));

  it("manda o código e troca a senha, encerrando as sessões", async () => {
    useMail();
    const u = await person("Lia");
    const anon = new Client();
    expect((await anon.post("/api/auth/forgot", { email: u.me.email })).json).toEqual({ mode: "codigo" });
    await flushMail();
    expect(box[0].to).toBe(u.me.email);
    const code = codeOf();
    expect((await anon.post("/api/auth/reset-code", { email: u.me.email, code, password: "senha-nova-boa-1" })).status).toBe(204);
    expect((await u.get("/api/auth/me")).json.user).toBeNull();
    expect((await anon.post("/api/auth/login", { login: u.me.email, password: "senha-nova-boa-1" })).status).toBe(200);
    expect((await anon.post("/api/auth/reset-code", { email: u.me.email, code, password: "de-novo-boa-123" })).status).toBe(400);
  });

  it("responde igual para conta que não existe e não manda nada", async () => {
    useMail();
    expect((await new Client().post("/api/auth/forgot", { email: "ninguem@teste.com" })).json).toEqual({ mode: "codigo" });
    await flushMail();
    expect(box).toHaveLength(0);
  });

  it("cinco erros matam o código", async () => {
    useMail();
    const u = await person("Mel");
    await new Client().post("/api/auth/forgot", { email: u.me.email });
    await flushMail();
    const code = codeOf(), wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await new Client().post("/api/auth/reset-code", { email: u.me.email, code: wrong, password: "senha-nova-boa-1" })).status).toBe(400);
    const r = await new Client().post("/api/auth/reset-code", { email: u.me.email, code, password: "senha-nova-boa-1" });
    expect(r.status).toBe(400);
    expect(r.json.error.message).toContain("não vale mais");
  });

  it("envio que falha vira pedido na caixa do admin", async () => {
    setMailer(async () => { throw new Error("smtp fora"); });
    const a = await admin(), u = await person("Nina");
    await new Client().post("/api/auth/forgot", { email: u.me.email });
    await flushMail();
    const inbox = await a.get("/api/admin/inbox");
    expect(inbox.json.feedback.some((f: { kind: string; author: { handle: string } }) => f.kind === "senha" && f.author.handle === u.me.handle)).toBe(true);
  });

  it("o admin manda o código da tela da pessoa", async () => {
    useMail();
    const a = await admin(), u = await person("Olga");
    expect((await a.post(`/api/admin/users/${u.me.id}/send-code`)).status).toBe(204);
    expect(box[0].to).toBe(u.me.email);
    expect(box[0].text).not.toContain("senha-segura-123");
  });
});
