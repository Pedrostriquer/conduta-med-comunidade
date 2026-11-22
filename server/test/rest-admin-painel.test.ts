/* Rotas só de leitura do painel de administração separado (pasta admin/): acesso, paginação, filtros e nada de segredo na resposta. */
import { describe, expect, it } from "vitest";
import { pool } from "../src/db";
import { Client, person, useDatabase } from "./rest-helpers";

useDatabase();

const ID = "00000000-0000-4000-8000-000000000000";
const ROUTES = [
  "/api/admin/painel/geral", "/api/admin/painel/usuarios", `/api/admin/painel/usuarios/${ID}/extra`, "/api/admin/painel/uso", "/api/admin/painel/mcp", "/api/admin/painel/mcp/auditoria",
  "/api/admin/painel/mcp/tokens", "/api/admin/painel/mcp/sessoes", "/api/admin/painel/ia", "/api/admin/painel/ia/execucoes",
];
const admin = () => person("Quem Cuida", { email: "admin@teste.com" });

async function seed(userId: string) {
  await pool.query("INSERT INTO mcp_tokens (user_id, kind, token_hash, label) VALUES ($1, 'pessoal', decode('aa01', 'hex'), 'Cursor'), ($1, 'refresh', decode('aa02', 'hex'), ''), ($1, 'access', decode('aa03', 'hex'), '')", [userId]);
  await pool.query("UPDATE mcp_tokens SET revoked_at = now() WHERE kind = 'access'");
  await pool.query("INSERT INTO mcp_shared_sessions (token_hash, user_id, expires_at) VALUES (decode('bb01', 'hex'), $1, now() + interval '2 hours')", [userId]);
  for (let i = 0; i < 7; i++) {
    await pool.query("INSERT INTO mcp_audit (user_id, tool, mode, writes, ok, ms, summary, at) VALUES ($1, $2, $3, $4, $5, $6, 'resumo', now() - ($7 || ' minutes')::interval)",
      [userId, i % 2 ? "conduta_buscar_questoes" : "conduta_criar_resumo", i === 6 ? "compartilhado" : "normal", i % 2 === 0, i !== 3, 100 * (i + 1), String(i * 50)]);
  }
  await pool.query(
    `INSERT INTO ai_runs (user_id, kind, status, model, effort, tokens_in, tokens_out, cache_read, cost_usd, source, prompt, ms)
     VALUES ($1, 'resultado', 'feito', 'claude-haiku-5-5', 'low', 30000, 9000, 500, 0.05, '{"title":"Simulado 1"}', 'texto secreto do prompt', 4200), ($1, 'flashcards', 'erro', 'claude-haiku-5-5', 'low', 100, 0, 0, 0, '{}', null, null)`, [userId]);
  await pool.query("INSERT INTO user_days (user_id, day, questions, correct, cards) VALUES ($1, (now() - interval '3 hours')::date, 40, 30, 12)", [userId]);
  await pool.query("UPDATE users SET total_questions = 40, total_correct = 30, total_cards = 12 WHERE id = $1", [userId]);
}

describe("painel separado do admin", () => {
  it("barra quem não é admin e quem não entrou, em todas as rotas", async () => {
    const u = await person("Comum");
    for (const path of ROUTES) {
      expect((await u.get(path)).status, path).toBe(403);
      expect((await new Client().get(path)).status, path).toBe(401);
    }
  });

  it("visão geral conta contas, atividade e pendências", async () => {
    const a = await admin(), u = await person("Marina Alves");
    await seed(u.me.id);
    await u.post("/api/uso", { visit: "visita-1", events: [{ path: "/", at: Date.now() - 60_000, ms: 30_000 }, { path: "/questoes", at: Date.now() - 20_000, ms: 10_000 }] });
    await u.post("/api/feedback", { kind: "sugestao", body: "Uma ideia" });
    const r = await a.get("/api/admin/painel/geral");
    expect(r.status).toBe(200);
    expect(r.json.users).toMatchObject({ total: 2, admins: 1, new: { d1: 2, d7: 2, d30: 2 } });
    expect(r.json.users.active.d1).toBe(1);
    expect(r.json.totals).toMatchObject({ questions: 40, cards: 12 });
    expect(r.json.series).toHaveLength(30);
    expect(r.json.series.at(-1)).toMatchObject({ novas: 2, ativas: 1, questions: 40, cards: 12, ms: 40_000, screens: 2 });
    expect(r.json.inbox.total).toBeGreaterThanOrEqual(0);
    expect((await a.get("/api/admin/painel/geral?dias=9999")).json.series).toHaveLength(180);
  });

  it("lista pessoas com busca, filtros, ordem e página", async () => {
    const a = await admin(), u = await person("José Antônio");
    await person("Bia Souza");
    await seed(u.me.id);
    const all = await a.get("/api/admin/painel/usuarios?ordem=nome&dir=asc");
    expect(all.json.total).toBe(3);
    expect(all.json.items.map((x: any) => x.name)).toEqual(["Bia Souza", "José Antônio", "Quem Cuida"]);
    expect((await a.get("/api/admin/painel/usuarios?q=jose%20antonio")).json.items.map((x: any) => x.name)).toEqual(["José Antônio"]);
    expect((await a.get("/api/admin/painel/usuarios?q=admin@teste")).json.total).toBe(1);
    expect((await a.get("/api/admin/painel/usuarios?q=100%25")).json.total).toBe(0);
    expect((await a.get("/api/admin/painel/usuarios?papel=admin")).json.items.map((x: any) => x.name)).toEqual(["Quem Cuida"]);
    expect((await a.get("/api/admin/painel/usuarios?atividade=com")).json.items.map((x: any) => x.name)).toEqual(["José Antônio"]);
    expect((await a.get("/api/admin/painel/usuarios?atividade=sem")).json.total).toBe(2);
    expect((await a.get("/api/admin/painel/usuarios?situacao=ativos")).json.total).toBe(3);
    expect((await a.get("/api/admin/painel/usuarios?situacao=inativos")).json.total).toBe(0);
    const p2 = await a.get("/api/admin/painel/usuarios?por=2&pagina=2&ordem=nome&dir=asc");
    expect(p2.json).toMatchObject({ total: 3, page: 2, size: 2 });
    expect(p2.json.items.map((x: any) => x.name)).toEqual(["Quem Cuida"]);
    expect((await a.get("/api/admin/painel/usuarios?ordem=questoes")).json.items[0].name).toBe("José Antônio");
    // ordem desconhecida não vira SQL
    expect((await a.get("/api/admin/painel/usuarios?ordem=id;drop%20table%20users")).status).toBe(200);
    expect(all.text).not.toMatch(/password|hash/i);
  });

  it("detalhe extra de uma pessoa, sem token nem hash", async () => {
    const a = await admin(), u = await person("Marina Alves");
    await seed(u.me.id);
    const r = await a.get(`/api/admin/painel/usuarios/${u.me.id}/extra`);
    expect(r.status).toBe(200);
    expect(r.json.sessions).toHaveLength(1);
    expect(r.json.mcp.tokens).toHaveLength(3);
    expect(r.json.mcp.sharedSessions).toHaveLength(1);
    expect(r.json.mcp.audit).toHaveLength(7);
    expect(r.json.ia).toMatchObject({ runs: 2, failed: 1, tokensIn: 30100, tokensOut: 9000 });
    expect(r.text).not.toMatch(/token_hash|tokenHash|password|texto secreto/i);
    expect((await a.get(`/api/admin/painel/usuarios/${ID}/extra`)).status).toBe(404);
    expect((await a.get("/api/admin/painel/usuarios/nada/extra")).status).toBe(404);
  });

  it("uso por função, por dia e por hora", async () => {
    const a = await admin(), u = await person("Marina Alves");
    await u.post("/api/uso", { visit: "visita-1", events: [{ path: "/", at: Date.now() - 60_000, ms: 30_000 }, { path: "/questoes", at: Date.now() - 20_000, ms: 10_000 }, { path: "/", at: Date.now() - 5_000, ms: 5_000 }] });
    const r = await a.get("/api/admin/painel/uso?dias=7");
    expect(r.status).toBe(200);
    expect(r.json.totals).toMatchObject({ events: 3, visits: 1, people: 1, ms: 45_000 });
    expect(r.json.byPath[0]).toMatchObject({ path: "/", n: 2, ms: 35_000, people: 1 });
    expect(r.json.byDay).toHaveLength(7);
    expect(r.json.byDay.at(-1)).toMatchObject({ screens: 3, people: 1 });
    expect(r.json.hours.reduce((s: number, h: any) => s + h.n, 0)).toBe(3);
    expect(r.json.people[0]).toMatchObject({ handle: u.me.handle, screens: 3 });
  });

  it("MCP: resumo, auditoria com filtros, tokens e sessões", async () => {
    const a = await admin(), u = await person("Marina Alves");
    await seed(u.me.id);
    const r = await a.get("/api/admin/painel/mcp?horas=24");
    expect(r.status).toBe(200);
    expect(r.json.totals).toMatchObject({ calls: 7, failed: 1, writes: 4, people: 1, shared: 1, maxMs: 700 });
    expect(r.json.tokens.find((t: any) => t.kind === "pessoal")).toMatchObject({ active: 1, issued: 1 });
    expect(r.json.tokens.find((t: any) => t.kind === "access")).toMatchObject({ active: 0, issued: 1 });
    expect(r.json.shared).toMatchObject({ open: 1, issued: 1 });
    expect(r.json.byTool).toHaveLength(2);
    expect(r.json.byUser[0]).toMatchObject({ handle: u.me.handle, calls: 7, failed: 1 });
    expect(r.json.heaviest[0]).toMatchObject({ ms: 700 });
    expect(r.json.series.reduce((s: number, p: any) => s + p.n, 0)).toBe(7);
    expect((await a.get("/api/admin/painel/mcp?horas=720")).json.bucket).toBe("day");

    const all = await a.get("/api/admin/painel/mcp/auditoria?por=3");
    expect(all.json).toMatchObject({ total: 7, page: 1, size: 3 });
    expect(all.json.items).toHaveLength(3);
    expect((await a.get("/api/admin/painel/mcp/auditoria?por=3&pagina=3")).json.items).toHaveLength(1);
    expect((await a.get("/api/admin/painel/mcp/auditoria?falhas=1")).json.total).toBe(1);
    expect((await a.get("/api/admin/painel/mcp/auditoria?ferramenta=conduta_criar_resumo")).json.total).toBe(4);
    expect((await a.get("/api/admin/painel/mcp/auditoria?modo=compartilhado")).json.total).toBe(1);
    expect((await a.get(`/api/admin/painel/mcp/auditoria?usuario=${u.me.id}`)).json.total).toBe(7);
    expect((await a.get(`/api/admin/painel/mcp/auditoria?usuario=${a.me.id}`)).json.total).toBe(0);
    expect((await a.get("/api/admin/painel/mcp/auditoria?usuario=x")).status).toBe(404);
    expect((await a.get("/api/admin/painel/mcp/auditoria?horas=1")).json.total).toBe(2);

    const tokens = await a.get("/api/admin/painel/mcp/tokens");
    expect(tokens.json.items).toHaveLength(3);
    expect(tokens.text).not.toMatch(/hash/i);
    expect((await a.get("/api/admin/painel/mcp/tokens?ativos=1")).json.items).toHaveLength(2);
    expect((await a.get("/api/admin/painel/mcp/tokens?tipo=pessoal")).json.items[0]).toMatchObject({ kind: "pessoal", label: "Cursor" });
    expect((await a.get("/api/admin/painel/mcp/tokens?por=2")).json).toMatchObject({ more: true });
    const sess = await a.get("/api/admin/painel/mcp/sessoes");
    expect(sess.json.items).toHaveLength(1);
    expect(sess.text).not.toMatch(/hash/i);
  });

  it("IA: tokens por dia e por pessoa, execuções com filtros, sem dinheiro nem prompt", async () => {
    const a = await admin(), u = await person("Marina Alves");
    await seed(u.me.id);
    const r = await a.get("/api/admin/painel/ia?dias=7");
    expect(r.status).toBe(200);
    expect(r.json.totals).toMatchObject({ runs: 2, failed: 1, tokensIn: 30100, tokensOut: 9000, cacheRead: 500, people: 1, avgMs: 4200 });
    expect(r.json.daily).toHaveLength(7);
    expect(r.json.daily.at(-1)).toMatchObject({ runs: 2, failed: 1, tokensIn: 30100 });
    expect(r.json.byUser[0]).toMatchObject({ handle: u.me.handle, runs: 2, tokensIn: 30100 });
    expect(r.text).not.toMatch(/usd/i);
    const runs = await a.get("/api/admin/painel/ia/execucoes");
    expect(runs.json.items).toHaveLength(2);
    expect(runs.text).not.toMatch(/usd|texto secreto/i);
    expect((await a.get("/api/admin/painel/ia/execucoes?status=erro")).json.items).toHaveLength(1);
    expect((await a.get("/api/admin/painel/ia/execucoes?tipo=resultado")).json.items[0]).toMatchObject({ title: "Simulado 1", tokensIn: 30000 });
    expect((await a.get("/api/admin/painel/ia/execucoes?por=1")).json).toMatchObject({ more: true });
    expect((await a.get(`/api/admin/painel/ia/execucoes?usuario=${a.me.id}`)).json.items).toHaveLength(0);
  });
});
