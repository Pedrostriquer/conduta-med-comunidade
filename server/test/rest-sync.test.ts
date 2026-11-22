import { describe, expect, it } from "vitest";
import { pool } from "../src/db";
import { person, useDatabase } from "./rest-helpers";

useDatabase();

const NOW = 1_780_000_000_000; // 2026-05-28 20:26 UTC
const attempt = (qid: string, correct: boolean, at = NOW) => ({ c: "attempt", id: `s1:${qid}:${at}`, data: { qid, choice: "A", correct, at, ms: 1000, sid: "s1", kind: "lista" }, at });

const treino = { n: 2, ok: 3, err: 1, ultima: NOW, rever: NOW + 3 * 86_400_000, f: 2 };

describe("treino de digitar", () => {
  it("guarda o progresso por item e o do dia, e devolve em outro aparelho", async () => {
    const a = await person("Ana");
    const push = await a.post("/api/sync/push", { changes: [
      { c: "treino", id: "ossos-cranio/frontal", data: treino, at: NOW },
      { c: "treino", id: "dia", data: { dia: { data: "2026-05-28", conjunto: "ecg-1", quadros: ["certo", "viu", "errado", "certo", "certo"] }, sequencia: 4 }, at: NOW },
    ] });
    expect(push.json).toMatchObject({ applied: 2, ignored: 0 });
    const pull = (await a.get("/api/sync/pull")).json.changes;
    expect(pull.map((c: { c: string; id: string }) => c.c + ":" + c.id).sort()).toEqual(["treino:dia", "treino:ossos-cranio/frontal"]);
    expect(pull.find((c: { id: string }) => c.id === "ossos-cranio/frontal").data).toEqual(treino);
    // um registro mais antigo, vindo de outro aparelho, não passa por cima
    const velho = await a.post("/api/sync/push", { changes: [{ c: "treino", id: "ossos-cranio/frontal", data: { ...treino, n: 0 }, at: NOW - 1000 }] });
    expect(velho.json).toMatchObject({ applied: 0, ignored: 1 });
  });

  it("cada pessoa só vê o seu", async () => {
    const a = await person("Ana"), b = await person("Bia");
    await a.post("/api/sync/push", { changes: [{ c: "treino", id: "ecg/fa", data: treino, at: NOW }] });
    expect((await b.get("/api/sync/pull")).json.changes).toEqual([]);
  });

  it("recusa formato e item estranhos", async () => {
    const a = await person("Ana");
    const ruins = [
      { c: "treino", id: "ossos-cranio/frontal", data: { ...treino, n: -1 }, at: NOW },
      { c: "treino", id: "ossos-cranio/frontal", data: { ...treino, f: 3 }, at: NOW },
      { c: "treino", id: "ossos-cranio/frontal", data: { ...treino, nota: "x".repeat(50) }, at: NOW },
      { c: "treino", id: "ossos-cranio/frontal", data: { n: 1 }, at: NOW },
      { c: "treino", id: "Qualquer Coisa", data: treino, at: NOW },
      { c: "treino", id: "dia", data: { dia: { data: "ontem", conjunto: "ecg-1", quadros: [] }, sequencia: 1 }, at: NOW },
      { c: "treino", id: "dia", data: { dia: null, sequencia: 1, extra: true }, at: NOW },
    ];
    for (const ch of ruins) expect((await a.post("/api/sync/push", { changes: [ch] })).status, JSON.stringify(ch)).toBe(400);
    expect((await a.get("/api/sync/pull")).json.changes).toEqual([]);
    // apagar não precisa de dados
    expect((await a.post("/api/sync/push", { changes: [{ c: "treino", id: "ossos-cranio/frontal", deleted: true, at: NOW }] })).status).toBe(200);
  });

  it("não entra nas estatísticas de questões", async () => {
    const a = await person("Ana");
    await a.post("/api/sync/push", { changes: [{ c: "treino", id: "ecg/fa", data: treino, at: NOW }] });
    const u = await pool.query("SELECT total_questions, total_correct, total_cards FROM users ORDER BY created_at DESC LIMIT 1");
    expect(u.rows[0]).toMatchObject({ total_questions: 0, total_correct: 0, total_cards: 0 });
    expect((await pool.query("SELECT count(*)::int AS n FROM user_days")).rows[0].n).toBe(0);
  });
});

describe("sincronização", () => {
  it("exige login", async () => {
    const c = await person("X");
    await c.post("/api/auth/logout");
    expect((await c.post("/api/sync/push", { changes: [] })).status).toBe(401);
    expect((await c.get("/api/sync/pull")).status).toBe(401);
  });

  it("última escrita ganha por at, inclusive com empate e apagamento", async () => {
    const a = await person("Ana");
    const r1 = await a.post("/api/sync/push", { changes: [{ c: "settings", id: "main", data: { v: 2 }, at: 200 }] });
    expect(r1.json).toMatchObject({ applied: 1, ignored: 0 });
    const antigo = await a.post("/api/sync/push", { changes: [{ c: "settings", id: "main", data: { v: 1 }, at: 100 }] });
    expect(antigo.json).toMatchObject({ applied: 0, ignored: 1 });
    expect((await a.get("/api/sync/pull")).json.changes[0].data).toEqual({ v: 2 });
    const empate = await a.post("/api/sync/push", { changes: [{ c: "settings", id: "main", data: { v: 3 }, at: 200 }] });
    expect(empate.json.applied).toBe(1);
    await a.post("/api/sync/push", { changes: [{ c: "settings", id: "main", deleted: true, at: 300 }] });
    const pull = (await a.get("/api/sync/pull")).json.changes[0];
    expect(pull).toMatchObject({ c: "settings", id: "main", deleted: true, data: null, at: 300, origin: "app" });
    expect((await a.post("/api/sync/push", { changes: [{ c: "settings", id: "main", data: { v: 9 }, at: 250 }] })).json.ignored).toBe(1);
  });

  it("o cursor anda, pagina e nunca repete nem perde registro", async () => {
    const a = await person("Bia");
    const changes = Array.from({ length: 7 }, (_, i) => ({ c: "saved", id: `q${i}`, data: { at: i }, at: 1000 + i }));
    const push = await a.post("/api/sync/push", { changes });
    expect(push.json.applied).toBe(7);
    const p1 = (await a.get("/api/sync/pull?since=0&limit=3")).json;
    expect(p1.changes.map((x: any) => x.id)).toEqual(["q0", "q1", "q2"]);
    expect(p1.more).toBe(true);
    const p2 = (await a.get(`/api/sync/pull?since=${p1.cursor}&limit=3`)).json;
    expect(p2.changes.map((x: any) => x.id)).toEqual(["q3", "q4", "q5"]);
    const p3 = (await a.get(`/api/sync/pull?since=${p2.cursor}&limit=3`)).json;
    expect(p3.changes.map((x: any) => x.id)).toEqual(["q6"]);
    expect(p3.more).toBe(false);
    expect(p3.cursor).toBe(push.json.cursor);
    const p4 = (await a.get(`/api/sync/pull?since=${p3.cursor}`)).json;
    expect(p4).toMatchObject({ changes: [], more: false, cursor: p3.cursor });
    // regravar faz o registro voltar a aparecer depois do cursor
    await a.post("/api/sync/push", { changes: [{ c: "saved", id: "q1", data: { at: 9 }, at: 2000 }] });
    expect((await a.get(`/api/sync/pull?since=${p3.cursor}`)).json.changes.map((x: any) => x.id)).toEqual(["q1"]);
  });

  it("cada pessoa só vê os próprios registros", async () => {
    const a = await person("Caio"), b = await person("Duda");
    await a.post("/api/sync/push", { changes: [{ c: "saved", id: "q1", data: {}, at: 1 }] });
    expect((await b.get("/api/sync/pull")).json.changes).toEqual([]);
  });

  it("soma contadores e dias, e reenviar o mesmo attempt não conta duas vezes", async () => {
    const a = await person("Eva");
    await a.post("/api/sync/push", { changes: [attempt("q1", true), attempt("q2", false), { c: "fc_revlog", id: "r1", data: { at: NOW }, at: NOW }] });
    let me = (await a.get("/api/auth/me")).json.user;
    expect(me).toMatchObject({ totalQuestions: 2, totalCards: 1 });
    const repetido = await a.post("/api/sync/push", { changes: [attempt("q1", true), attempt("q2", false), { c: "fc_revlog", id: "r1", data: { at: NOW }, at: NOW }] });
    expect(repetido.json).toMatchObject({ applied: 3, ignored: 0 });
    me = (await a.get("/api/auth/me")).json.user;
    expect(me).toMatchObject({ totalQuestions: 2, totalCards: 1 });
    const u = (await pool.query("SELECT total_correct FROM users WHERE id = $1", [a.me.id])).rows[0];
    expect(u.total_correct).toBe(1);
    const d = (await pool.query("SELECT day::text AS day, questions, correct, cards FROM user_days WHERE user_id = $1", [a.me.id])).rows;
    expect(d).toEqual([{ day: "2026-05-28", questions: 2, correct: 1, cards: 1 }]);
  });

  it("apagar o histórico desconta dos números do perfil, uma vez só", async () => {
    const a = await person("Eva");
    const rev = { c: "fc_revlog", id: "r1", data: { at: NOW }, at: NOW };
    await a.post("/api/sync/push", { changes: [attempt("q1", true), attempt("q2", false), rev] });
    const apagar = [{ c: "attempt", id: attempt("q1", true).id, deleted: true, at: NOW + 1 }, { c: "fc_revlog", id: "r1", deleted: true, at: NOW + 1 }];
    for (let i = 0; i < 2; i++) await a.post("/api/sync/push", { changes: apagar });
    expect((await a.get("/api/auth/me")).json.user).toMatchObject({ totalQuestions: 1, totalCards: 0 });
    const u = (await pool.query("SELECT total_correct FROM users WHERE id = $1", [a.me.id])).rows[0];
    expect(u.total_correct).toBe(0);
    const d = (await pool.query("SELECT questions, correct, cards FROM user_days WHERE user_id = $1", [a.me.id])).rows;
    expect(d).toEqual([{ questions: 1, correct: 0, cards: 0 }]);
  });

  it("o dia usa o fuso de São Paulo", async () => {
    const a = await person("Fábio");
    const t = Date.UTC(2026, 4, 28, 2, 0); // 23h do dia 27 em São Paulo
    await a.post("/api/sync/push", { changes: [attempt("q1", true, t)] });
    expect((await pool.query("SELECT day::text AS day FROM user_days WHERE user_id = $1", [a.me.id])).rows[0].day).toBe("2026-05-27");
  });

  it("valida coleção, tamanho do registro, tamanho da chamada e quantidade de mudanças", async () => {
    const a = await person("Gil");
    const bad = await a.post("/api/sync/push", { changes: [{ c: "desconhecida", id: "x", data: {}, at: 1 }] });
    expect(bad.status).toBe(400);
    expect(bad.json.error.message).toMatch(/coleção/);
    const big = await a.post("/api/sync/push", { changes: [{ c: "qnote", id: "x", data: { t: "a".repeat(256 * 1024 + 1) }, at: 1 }] });
    expect(big.status).toBe(400);
    expect(big.json.error.message).toMatch(/256 KB/);
    const many = Array.from({ length: 501 }, (_, i) => ({ c: "saved", id: `q${i}`, data: {}, at: 1 }));
    expect((await a.post("/api/sync/push", { changes: many })).status).toBe(400);
    const huge = Array.from({ length: 40 }, (_, i) => ({ c: "qnote", id: `q${i}`, data: { t: "a".repeat(250 * 1024) }, at: 1 }));
    const r = await a.post("/api/sync/push", { changes: huge });
    expect(r.status).toBe(400);
    expect(r.json.error.message).toMatch(/8 MB/);
    expect((await a.post("/api/sync/push", { changes: [{ c: "saved", id: "x", data: {} }] })).status).toBe(400);
    expect((await a.post("/api/sync/push", { changes: [{ c: "saved", id: "x", data: { t: "a\u0000b" }, at: 1 }] })).status).toBe(400);
    expect((await a.get("/api/sync/pull")).json.changes).toEqual([]);
  });

  it("relógio adiantado no aparelho não trava o registro para sempre", async () => {
    const a = await person("Hugo");
    await a.post("/api/sync/push", { changes: [{ c: "settings", id: "main", data: { v: 1 }, at: Date.now() + 10 * 365 * 86_400_000 }] });
    const at = (await a.get("/api/sync/pull")).json.changes[0].at;
    expect(at).toBeLessThanOrEqual(Date.now() + 86_400_000);
  });

  it("escritas simultâneas não perdem registro no cursor", async () => {
    const a = await person("Iris");
    await Promise.all(Array.from({ length: 8 }, (_, i) => a.post("/api/sync/push", { changes: [{ c: "saved", id: `q${i}`, data: {}, at: 1 }] })));
    const p = (await a.get("/api/sync/pull")).json;
    expect(p.changes).toHaveLength(8);
    expect(new Set(p.changes.map((x: any) => x.seq)).size).toBe(8);
  });
});
