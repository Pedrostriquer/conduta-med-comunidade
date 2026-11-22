import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "../src/db";
import { MAX_CODE_FAILS, MAX_IP_FAILS, newCode, resetSharedLimits } from "../src/mcp/shared";
import { person, useDatabase } from "./rest-helpers";
import { call, connectMcp, useServer } from "./mcp-helpers";

useDatabase();
useServer();
beforeEach(() => resetSharedLimits());

const entrar = async (usuario: string, codigo: string, headers: Record<string, string> = {}) => { const m = await connectMcp("/mcp/compartilhado", headers); const r = await call(m, "conduta_entrar", { usuario, codigo }); return { m, r }; };
const novaPessoa = async () => { const c = await person("Bia"); const code = (await c.get("/api/plugin/code")).json; return { c, code, handle: c.me.handle as string, id: c.me.id as string }; };
const WRONG = "AAAAAAAA";

describe("código de acesso", () => {
  it("tem 8 caracteres legíveis, vale 10 minutos e o mesmo volta até ser usado", async () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const { c, code, handle } = await novaPessoa();
    expect(code.handle).toBe(handle);
    expect(code.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(code.expiresAt - Date.now()).toBeLessThanOrEqual(600_000);
    expect(code.expiresAt - Date.now()).toBeGreaterThan(590_000);
    expect((await c.get("/api/plugin/code")).json.code).toBe(code.code);
    const rot = (await c.post("/api/plugin/code/rotate")).json;
    expect(rot.code).not.toBe(code.code);
    expect((await entrar(handle, code.code)).r.isError).toBe(true);
  });

  it("é de uso único: entra uma vez e o próximo GET gera outro", async () => {
    const { c, code, handle } = await novaPessoa();
    const { r, m } = await entrar("@" + handle.toUpperCase(), code.code.toLowerCase());
    expect(r.isError).toBe(false);
    expect(r.json.status).toBe("conectado");
    expect(r.json.sessao).toMatch(/^cds_/);
    const ini = await call(m, "conduta_inicio", { sessao: r.json.sessao });
    expect(ini.json.modo).toBe("compartilhado");
    expect(ini.json.regras.join(" ")).toContain("Nunca salve");
    expect((await pool.query("SELECT 1 FROM mcp_access_codes")).rowCount).toBe(0);
    expect((await entrar(handle, code.code)).r.isError).toBe(true);
    expect((await c.get("/api/plugin/code")).json.code).not.toBe(code.code);
  });

  it("código vencido não entra", async () => {
    const { code, handle } = await novaPessoa();
    await pool.query("UPDATE mcp_access_codes SET expires_at = now() - interval '1 second'");
    expect((await entrar(handle, code.code)).r.isError).toBe(true);
  });

  it("mensagem igual para usuário inexistente, código errado e modo desligado", async () => {
    const { c, handle } = await novaPessoa();
    const wrong = (await entrar(handle, WRONG)).r, ghost = (await entrar("ninguem.aqui", WRONG)).r;
    expect(wrong.isError && ghost.isError).toBe(true);
    expect(ghost.text).toBe(wrong.text);
    await c.patch("/api/plugin/settings", { sharedMode: false });
    expect((await entrar(handle, WRONG)).r.text).toBe(wrong.text);
    expect(wrong.text).not.toMatch(/existe/);
  });

  it(`${MAX_CODE_FAILS} erros travam a pessoa por 15 minutos, mesmo com o código certo`, async () => {
    const { code, handle } = await novaPessoa();
    for (let i = 0; i < MAX_CODE_FAILS; i++) expect((await entrar(handle, WRONG)).r.isError).toBe(true);
    const locked = (await entrar(handle, code.code)).r;
    expect(locked.isError).toBe(true);
    expect(locked.text).toContain("15 minutos");
    const { rows: [row] } = await pool.query("SELECT failures, EXTRACT(EPOCH FROM locked_until - now()) AS s FROM mcp_access_codes");
    expect(row.failures).toBe(MAX_CODE_FAILS);
    expect(Number(row.s)).toBeLessThanOrEqual(900);
    // passou a trava: o código certo entra
    await pool.query("UPDATE mcp_access_codes SET locked_until = now() - interval '1 second'");
    expect((await entrar(handle, code.code)).r.isError).toBe(false);
  });

  it("quem testa um usuário inexistente também vê a trava: não dá para descobrir quem existe", async () => {
    for (let i = 0; i < MAX_CODE_FAILS; i++) expect((await entrar("fantasma", WRONG)).r.text).not.toContain("15 minutos");
    expect((await entrar("fantasma", WRONG)).r.text).toContain("15 minutos");
  });

  it("o dono pode girar o código para sair da trava", async () => {
    const { c, handle } = await novaPessoa();
    for (let i = 0; i < MAX_CODE_FAILS; i++) await entrar(handle, WRONG);
    const rot = (await c.post("/api/plugin/code/rotate")).json;
    expect((await entrar(handle, rot.code)).r.isError).toBe(false);
  });

  it("erros demais do mesmo IP travam por uma hora", async () => {
    const ip = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < MAX_IP_FAILS; i++) await entrar(`alguem${i}`, WRONG, ip);
    const blocked = (await entrar("outro", WRONG, ip)).r;
    expect(blocked.text).toContain("uma hora");
    const { code, handle } = await novaPessoa();
    expect((await entrar(handle, code.code, ip)).r.text).toContain("uma hora");
    expect((await entrar(handle, code.code, { "x-forwarded-for": "203.0.113.10" })).r.isError).toBe(false);
  });

  it("modo desligado recusa até o código certo e encerra o que estava aberto", async () => {
    const a = await novaPessoa(), s = (await entrar(a.handle, a.code.code));
    const again = (await a.c.get("/api/plugin/code")).json;
    await a.c.patch("/api/plugin/settings", { sharedMode: false });
    expect((await pool.query("SELECT 1 FROM mcp_access_codes")).rowCount).toBe(0);
    expect((await entrar(a.handle, again.code)).r.isError).toBe(true);
    const r = await call(s.m, "conduta_inicio", { sessao: s.r.json.sessao });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("código novo");
  });
});

describe("sessão", () => {
  const entrou = async () => { const p = await novaPessoa(), { m, r } = await entrar(p.handle, p.code.code); return { ...p, m, sessao: r.json.sessao as string }; };

  it("toda ferramenta exige sessao e a sessão inválida pede código novo", async () => {
    const m = await connectMcp("/mcp/compartilhado");
    const { tools } = await m.listTools();
    const guia = tools.find((t) => t.name === "conduta_guia")!;
    expect(guia.inputSchema.required).toContain("sessao");
    expect(tools.find((t) => t.name === "conduta_entrar")!.inputSchema.required).not.toContain("sessao");
    expect((await call(m, "conduta_guia", {})).isError).toBe(true);
    const r = await call(m, "conduta_guia", { sessao: "cds_nao_existe_1234" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("código novo");
    expect(r.text).toContain("/plugin");
  });

  it("2 horas sem uso derrubam", async () => {
    const s = await entrou();
    expect((await call(s.m, "conduta_guia", { sessao: s.sessao })).isError).toBe(false);
    await pool.query("UPDATE mcp_shared_sessions SET last_used_at = now() - interval '1 hour 59 minutes'");
    expect((await call(s.m, "conduta_guia", { sessao: s.sessao })).isError).toBe(false);
    const { rows: [row] } = await pool.query("SELECT EXTRACT(EPOCH FROM now() - last_used_at) AS s FROM mcp_shared_sessions");
    expect(Number(row.s)).toBeLessThan(5);
    await pool.query("UPDATE mcp_shared_sessions SET last_used_at = now() - interval '2 hours 1 minute'");
    const r = await call(s.m, "conduta_guia", { sessao: s.sessao });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("código novo");
  });

  it("24 horas derrubam mesmo em uso", async () => {
    const s = await entrou();
    const { rows: [row] } = await pool.query("SELECT EXTRACT(EPOCH FROM expires_at - created_at) AS s FROM mcp_shared_sessions");
    expect(Number(row.s)).toBe(86_400);
    await pool.query("UPDATE mcp_shared_sessions SET expires_at = now() - interval '1 second', last_used_at = now()");
    expect((await call(s.m, "conduta_guia", { sessao: s.sessao })).isError).toBe(true);
  });

  it("sair encerra; o token só existe como hash; aparece no status até ser encerrada no app", async () => {
    const s = await entrou();
    const st = (await s.c.get("/api/plugin/status")).json;
    expect(st.sharedSessions).toHaveLength(1);
    expect(st.sharedMode).toBe(true);
    expect(st.sharedSessions[0].expiresAt).toBeGreaterThan(Date.now());
    expect(JSON.stringify((await pool.query("SELECT encode(token_hash, 'escape') AS h FROM mcp_shared_sessions")).rows)).not.toContain(s.sessao);
    expect((await s.c.del(`/api/plugin/shared-sessions/${st.sharedSessions[0].id}`)).status).toBe(204);
    expect((await call(s.m, "conduta_guia", { sessao: s.sessao })).isError).toBe(true);

    const code2 = (await s.c.get("/api/plugin/code")).json, { m, r } = await entrar(s.handle, code2.code);
    expect((await call(m, "conduta_sair", { sessao: r.json.sessao })).isError).toBe(false);
    expect((await call(m, "conduta_guia", { sessao: r.json.sessao })).isError).toBe(true);
    const audit = (await s.c.get("/api/plugin/activity")).json.items as { tool: string; mode: string; summary: string }[];
    expect(audit.some((x) => x.tool === "conduta_entrar" && x.mode === "compartilhado")).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(code2.code);
  });

  it("a confirmação fica presa à pessoa da sessão", async () => {
    const a = await entrou(), b = await entrou();
    const prev = await call(a.m, "conduta_enviar_sugestao", { sessao: a.sessao, tipo: "sugestao", texto: "Quero modo noturno" });
    expect(prev.json.status).toBe("aguardando_confirmacao");
    const other = await call(b.m, "conduta_enviar_sugestao", { sessao: b.sessao, tipo: "sugestao", texto: "Quero modo noturno", token_confirmacao: prev.json.token_confirmacao });
    expect(other.isError).toBe(true);
    const ok = await call(a.m, "conduta_enviar_sugestao", { sessao: a.sessao, tipo: "sugestao", texto: "Quero modo noturno", token_confirmacao: prev.json.token_confirmacao });
    expect(ok.isError).toBe(false);
  });
});
