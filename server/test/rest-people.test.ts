import { describe, expect, it } from "vitest";
import { pool } from "../src/db";
import { canSee, visibleLevels } from "../src/lib/visibility";
import type { Level, ProfileLevel } from "../src/lib/visibility";
import { Client, docJson, follow, person, useDatabase } from "./rest-helpers";

useDatabase();

const CARDS = [{ key: "k1", kind: "basic", fields: ["frente", "verso"], ord: 0, path: [], tags: [] }];

/* a matriz inteira, célula por célula */
describe("canSee", () => {
  const dono = (visibility: ProfileLevel) => ({ id: "dono", visibility });
  const aceito = { id: "x", status: "aceito" as const }, pendente = { id: "x", status: "pendente" as const }, estranho = { id: "x", status: null };
  const cases: [ProfileLevel, Level, boolean, boolean, boolean][] = [
    // perfil,      item,          aceito, pendente, estranho
    ["privado", "publico", false, false, false],
    ["privado", "link", false, false, false],
    ["privado", "seguidores", false, false, false],
    ["privado", "privado", false, false, false],
    ["seguidores", "publico", true, true, true],
    ["seguidores", "link", true, true, true],
    ["seguidores", "seguidores", true, false, false],
    ["seguidores", "privado", false, false, false],
    ["publico", "publico", true, true, true],
    ["publico", "link", true, true, true],
    ["publico", "seguidores", true, false, false],
    ["publico", "privado", false, false, false],
  ];
  it.each(cases)("perfil %s, item %s", (perfil, nivel, a, p, e) => {
    expect(canSee(aceito, dono(perfil), nivel)).toBe(a);
    expect(canSee(pendente, dono(perfil), nivel)).toBe(p);
    expect(canSee(estranho, dono(perfil), nivel)).toBe(e);
    expect(canSee({ id: "dono", status: null }, dono(perfil), nivel)).toBe(true);
  });
  it("visibleLevels segue a mesma regra", () => {
    expect(visibleLevels(estranho, dono("seguidores"))).toEqual(["publico"]);
    expect(visibleLevels(aceito, dono("seguidores"))).toEqual(["seguidores", "publico"]);
    expect(visibleLevels(aceito, dono("privado"))).toEqual([]);
    expect(visibleLevels({ id: "dono", status: null }, dono("privado"))).toEqual(["privado", "seguidores", "publico"]);
  });
});

/** semeia conteúdo de todos os níveis numa conta */
async function seed(o: Client) {
  await o.post("/api/sync/push", { changes: [{ c: "plan", id: "main", data: { exame: "ENARE", banca: "EBSERH", data: "2027-01-01", inicio: "2026-01-01", dias: [1, 2], meta: 40, simulado: { freq: "semanal", dia: 6 }, ajustes: { x: 1 }, resolvidoAte: null, criadoEm: 123 }, at: 10 }, { c: "goals", id: "main", data: { prefs: { "123": { ritmo: "meta" }, "999": { ritmo: "dia" } } }, at: 20 }] });
  const publicoDoc = (await o.post("/api/docs", { kind: "doc", title: "Doc público", content: docJson("texto aberto") })).json.doc;
  await o.patch(`/api/docs/${publicoDoc.id}`, { visibility: "publico" });
  const segDoc = (await o.post("/api/docs", { kind: "doc", title: "Doc seguidores", content: docJson("texto seg") })).json.doc;
  await o.patch(`/api/docs/${segDoc.id}`, { visibility: "seguidores" });
  const privDoc = (await o.post("/api/docs", { kind: "doc", title: "Doc privado", content: docJson("segredo") })).json.doc;
  const publico = (await o.post("/api/decks/publish", { localDeck: "pub", name: "Baralho público", visibility: "publico", cards: CARDS })).json.deck;
  const seg = (await o.post("/api/decks/publish", { localDeck: "seg", name: "Baralho seguidores", visibility: "seguidores", cards: CARDS })).json.deck;
  const link = (await o.post("/api/decks/publish", { localDeck: "lnk", name: "Baralho link", visibility: "link", cards: CARDS })).json.deck;
  return { publicoDoc, segDoc, privDoc, publico, seg, link };
}

describe("perfil na matriz", () => {
  it("perfil seguidores: estranho e pendente veem trancado; só depois de aceito veem o resto", async () => {
    const o = await person("Olga", { handle: "olga" }, { visibility: "seguidores", bio: "minha bio", cidade: "Recife", faculdade: "UFPE", semestre: 5, sharePlan: "seguidores" });
    const s = await seed(o);
    const v = await person("Vera");

    const fechado = (await v.get("/api/users/olga")).json.profile;
    expect(fechado).toEqual({
      handle: "olga", name: "Olga", avatarUrl: null, faculdade: null, semestre: null, relation: "nenhuma", bio: "", cidade: null, formado: false, since: 0, visibility: "seguidores", locked: true,
      followsYou: false, followers: 0, following: 0, stats: null, decks: [], plan: null, docsCount: 0,
    });

    expect((await v.post("/api/users/olga/follow")).json).toEqual({ relation: "pendente" });
    const pendente = (await v.get("/api/users/olga")).json.profile;
    expect(pendente.locked).toBe(true);
    expect(pendente.relation).toBe("pendente");
    expect((await v.get("/api/users/olga/plan")).status).toBe(404);
    expect((await v.get(`/api/users/olga/docs/${s.segDoc.id}`)).status).toBe(404);
    expect((await v.get(`/api/decks/${s.seg.slug}`)).status).toBe(404);
    expect((await v.get("/api/users/olga/followers")).json.people).toEqual([]);

    // conteúdo público de quem tem perfil seguidores continua público por link direto
    expect((await v.get(`/api/users/olga/docs/${s.publicoDoc.id}`)).status).toBe(200);
    expect((await v.get(`/api/decks/${s.publico.slug}`)).status).toBe(200);
    expect((await v.get(`/api/decks/${s.link.slug}`)).status).toBe(200);
    expect((await v.get("/api/users/olga/docs")).json.nodes.map((n: any) => n.title)).toEqual(["Doc público"]);
    expect((await v.get("/api/users/olga/decks")).json.decks.map((d: any) => d.name)).toEqual(["Baralho público"]);

    expect((await o.post("/api/me/follow-requests/" + v.me.handle, { accept: true })).status).toBe(204);
    const aberto = (await v.get("/api/users/olga")).json.profile;
    expect(aberto).toMatchObject({ locked: false, relation: "seguindo", bio: "minha bio", cidade: "Recife", faculdade: "UFPE", semestre: 5, followers: 1, docsCount: 2 });
    expect(aberto.since).toBeGreaterThan(0);
    expect(aberto.decks.map((d: any) => d.name).sort()).toEqual(["Baralho público", "Baralho seguidores"]);
    expect(aberto.plan).toMatchObject({ exame: "ENARE", meta: 40, prefs: { ritmo: "meta" }, updatedAt: 20 });
    expect(aberto.plan.ajustes).toBeUndefined();
    expect((await v.get("/api/users/olga/plan")).json.plan.banca).toBe("EBSERH");
    expect((await v.get(`/api/users/olga/docs/${s.segDoc.id}`)).status).toBe(200);
    expect((await v.get(`/api/users/olga/docs/${s.privDoc.id}`)).status).toBe(404);
    expect((await v.get(`/api/decks/${s.seg.slug}`)).status).toBe(200);
    expect((await v.get("/api/users/olga/docs")).json.nodes.map((n: any) => n.title).sort()).toEqual(["Doc público", "Doc seguidores"]);
    expect((await v.get("/api/users/olga/followers")).json.people.map((p: any) => p.handle)).toEqual([v.me.handle]);

    // tirar dos seguidores tranca de novo
    expect((await o.del(`/api/me/followers/${v.me.handle}`)).status).toBe(204);
    expect((await v.get("/api/users/olga")).json.profile.locked).toBe(true);
  });

  it("perfil privado: 404 em tudo para os outros, mesmo item público e seguidor aceito; o dono vê tudo", async () => {
    const o = await person("Olga", { handle: "olga" }, { visibility: "publico" });
    const s = await seed(o);
    const v = await person("Vera"), seguidor = await person("Sara");
    await follow(seguidor, o);
    expect((await o.patch("/api/me", { visibility: "privado", sharePlan: "publico" })).status).toBe(200);
    for (const c of [v, seguidor]) {
      expect((await c.get("/api/users/olga")).status).toBe(404);
      expect((await c.post("/api/users/olga/follow")).status).toBe(404);
      expect((await c.get("/api/users/olga/plan")).status).toBe(404);
      expect((await c.get("/api/users/olga/decks")).status).toBe(404);
      expect((await c.get("/api/users/olga/docs")).status).toBe(404);
      expect((await c.get("/api/users/olga/followers")).status).toBe(404);
      expect((await c.get("/api/users/olga/following")).status).toBe(404);
      expect((await c.get(`/api/users/olga/docs/${s.publicoDoc.id}`)).status).toBe(404);
      expect((await c.post(`/api/users/olga/docs/${s.publicoDoc.id}/copy`, {})).status).toBe(404);
      expect((await c.get(`/api/decks/${s.publico.slug}`)).status).toBe(404);
      expect((await c.get(`/api/decks/${s.link.slug}`)).status).toBe(404);
      expect((await c.post(`/api/decks/${s.publico.slug}/subscribe`, { localDeck: "x" })).status).toBe(404);
      expect((await c.get("/api/users/search?q=olga")).json.people).toEqual([]);
      expect((await c.get("/api/decks")).json.decks).toEqual([]);
    }
    const eu = (await o.get("/api/users/olga")).json.profile;
    expect(eu).toMatchObject({ locked: false, relation: "eu", docsCount: 3 });
    expect(eu.decks).toHaveLength(3);
    expect(eu.plan.exame).toBe("ENARE");
    expect((await o.get(`/api/users/olga/docs/${s.privDoc.id}`)).status).toBe(200);
    // deixar de seguir continua possível, para quem seguia antes
    expect((await seguidor.del("/api/users/olga/follow")).json).toEqual({ relation: "nenhuma" });
  });

  it("perfil público: sem trancar; item seguidores só para quem foi aceito; item privado nunca", async () => {
    const o = await person("Olga", { handle: "olga" }, { visibility: "publico", sharePlan: "seguidores", bio: "aberta" });
    const s = await seed(o);
    const v = await person("Vera");
    const p = (await v.get("/api/users/olga")).json.profile;
    expect(p).toMatchObject({ locked: false, relation: "nenhuma", bio: "aberta", docsCount: 1, plan: null });
    expect(p.decks.map((d: any) => d.name)).toEqual(["Baralho público"]);
    expect((await v.get(`/api/users/olga/docs/${s.segDoc.id}`)).status).toBe(404);
    expect((await v.get(`/api/users/olga/docs/${s.privDoc.id}`)).status).toBe(404);
    await v.post("/api/users/olga/follow", {});
    await o.post("/api/me/follow-requests/" + (await v.get("/api/auth/me")).json.user.handle, { accept: true });
    const aceito = (await v.get("/api/users/olga")).json.profile;
    expect(aceito.decks.map((d: any) => d.name).sort()).toEqual(["Baralho público", "Baralho seguidores"]);
    expect(aceito.plan.exame).toBe("ENARE");
    expect((await v.get(`/api/users/olga/docs/${s.segDoc.id}`)).status).toBe(200);
    expect((await v.get(`/api/users/olga/docs/${s.privDoc.id}`)).status).toBe(404);
    await o.patch("/api/me", { sharePlan: "privado" });
    expect((await v.get("/api/users/olga")).json.profile.plan).toBeNull();
    expect((await v.get("/api/users/olga/plan")).status).toBe(404);
  });

  it("sem login, nada de ninguém", async () => {
    const o = await person("Olga", { handle: "olga" }, { visibility: "publico" });
    const s = await seed(o);
    const anon = new Client();
    for (const path of ["/api/users/olga", "/api/users/olga/plan", "/api/users/olga/decks", "/api/users/olga/docs", `/api/users/olga/docs/${s.publicoDoc.id}`, "/api/users/olga/followers", "/api/users/search?q=olga", "/api/decks", `/api/decks/${s.publico.slug}`, "/api/me/follow-requests"]) {
      const r = await anon.get(path);
      expect(r.status, path).toBe(401);
      expect(r.json.error.code).toBe("nao_autenticado");
    }
  });

  it("respeita show_stats, show_activity e show_faculdade", async () => {
    const o = await person("Olga", { handle: "olga" }, { visibility: "publico", faculdade: "UFPE", semestre: 3 });
    const at = Date.now();
    await o.post("/api/sync/push", { changes: [{ c: "attempt", id: "s:q:1", data: { correct: true, at }, at }, { c: "fc_revlog", id: "r1", data: { at }, at }] });
    const v = await person("Vera");
    let p = (await v.get("/api/users/olga")).json.profile;
    expect(p.stats).toMatchObject({ questions: 1, cards: 1 });
    expect(p.stats.days).toHaveLength(1);
    expect(p.stats.days[0].n).toBe(2);
    expect(p.stats.days[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.faculdade).toBe("UFPE");

    await o.patch("/api/me", { showActivity: false });
    p = (await v.get("/api/users/olga")).json.profile;
    expect(p.stats.days).toEqual([]);
    expect(p.stats.questions).toBe(1);

    await o.patch("/api/me", { showStats: false, showFaculdade: false });
    p = (await v.get("/api/users/olga")).json.profile;
    expect(p.stats).toBeNull();
    expect(p.faculdade).toBeNull();
    expect(p.semestre).toBeNull();

    const eu = (await o.get("/api/users/olga")).json.profile;
    expect(eu.stats.days).toHaveLength(1);
    expect(eu.faculdade).toBe("UFPE");
  });

  it("dias de atividade: só as últimas 26 semanas", async () => {
    const o = await person("Olga", { handle: "olga" }, { visibility: "publico" });
    await pool.query("INSERT INTO user_days (user_id, day, questions) VALUES ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date - 181, 1), ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date - 190, 1)", [o.me.id]);
    expect((await o.get("/api/users/olga")).json.profile.stats.days).toHaveLength(1);
  });
});

describe("busca", () => {
  it("ignora acento e caixa, pede 2 letras, exclui privado e mostra só nome e @ de perfil fechado", async () => {
    const v = await person("Vera");
    await person("João Conceição", { handle: "joao.c" }, { visibility: "publico", faculdade: "UFMG", semestre: 2 });
    await person("Joana Fechada", { handle: "joana.f" }, { visibility: "seguidores", faculdade: "UFRJ", semestre: 8 });
    await person("Joaquim Privado", { handle: "joaquim.p" }, { visibility: "privado" });
    const r = (await v.get("/api/users/search?q=JOA")).json.people;
    expect(r.map((p: any) => p.handle).sort()).toEqual(["joana.f", "joao.c"]);
    const fechada = r.find((p: any) => p.handle === "joana.f");
    expect(fechada).toEqual({ handle: "joana.f", name: "Joana Fechada", avatarUrl: null, faculdade: null, semestre: null, relation: "nenhuma" });
    expect((await v.get("/api/users/search?q=conceicao")).json.people.map((p: any) => p.handle)).toEqual(["joao.c"]);
    expect((await v.get("/api/users/search?q=CONCEIÇÃO")).json.people).toHaveLength(1);
    expect((await v.get("/api/users/search?q=j")).json.people).toEqual([]);
    expect((await v.get("/api/users/search?q=")).json.people).toEqual([]);
    // curinga do usuário não vira curinga no ILIKE
    expect((await v.get("/api/users/search?q=" + encodeURIComponent("%%"))).json.people).toEqual([]);
    expect((await v.get("/api/users/search?q=" + encodeURIComponent("jo_o"))).json.people).toEqual([]);
  });

  it("achar pela faculdade só funciona se a faculdade estiver visível", async () => {
    const v = await person("Vera");
    await person("Ana Aberta", {}, { visibility: "publico", faculdade: "UNIFESP" });
    await person("Ana Escondida", {}, { visibility: "publico", faculdade: "UNIFESP", showFaculdade: false });
    const fechada = await person("Ana Fechada", {}, { visibility: "seguidores", faculdade: "UNIFESP" });
    expect((await v.get("/api/users/search?q=unifesp")).json.people.map((p: any) => p.name)).toEqual(["Ana Aberta"]);
    await follow(v, fechada);
    expect((await v.get("/api/users/search?q=unifesp")).json.people.map((p: any) => p.name).sort()).toEqual(["Ana Aberta", "Ana Fechada"]);
  });

  it("usa o índice gin da busca", async () => {
    const plan = await pool.query(`SET LOCAL enable_seqscan = off; EXPLAIN SELECT 1 FROM users u WHERE f_unaccent(lower(u.name || ' ' || u.handle || ' ' || coalesce(u.faculdade,''))) ILIKE '%joao%'`) as any;
    expect(JSON.stringify(plan[1].rows)).toContain("users_search_idx");
  });

  it("limita a 60 buscas por minuto", async () => {
    const v = await person("Vera");
    for (let i = 0; i < 60; i++) expect((await v.get("/api/users/search?q=ab")).status).toBe(200);
    expect((await v.get("/api/users/search?q=ab")).status).toBe(429);
  });
});

describe("seguir", () => {
  it("sempre cria pendente, mesmo em perfil público; não gera nada de conteúdo; aceite e recusa em silêncio", async () => {
    const o = await person("Olga", { handle: "olga" }, { visibility: "publico" }), v = await person("Vera", { handle: "vera" }), w = await person("Wil", { handle: "wil" });
    expect((await v.post("/api/users/olga/follow")).json).toEqual({ relation: "pendente" });
    expect((await v.post("/api/users/olga/follow")).json).toEqual({ relation: "pendente" });
    await w.post("/api/users/olga/follow");
    const req = (await o.get("/api/me/follow-requests")).json.requests;
    expect(req.map((p: any) => p.handle).sort()).toEqual(["vera", "wil"]);
    expect(req[0].at).toBeTypeOf("number");

    expect((await o.post("/api/me/follow-requests/vera", { accept: true })).status).toBe(204);
    expect((await v.post("/api/users/olga/follow")).json).toEqual({ relation: "seguindo" });
    expect((await o.post("/api/me/follow-requests/wil", { accept: false })).status).toBe(204);
    expect((await w.get("/api/users/olga")).json.profile.relation).toBe("nenhuma");
    expect((await o.post("/api/me/follow-requests/wil", { accept: true })).status).toBe(404);
    expect((await o.get("/api/me/follow-requests")).json.requests).toEqual([]);

    const olgaVista = (await o.get("/api/users/vera")).json.profile;
    expect(olgaVista.followsYou).toBe(true);
    expect((await v.get("/api/users/vera")).json.profile.following).toBe(1);
    expect((await o.get("/api/users/olga/followers")).json.people.map((p: any) => p.handle)).toEqual(["vera"]);
    expect((await v.del("/api/users/olga/follow")).json).toEqual({ relation: "nenhuma" });
    expect((await o.get("/api/users/olga")).json.profile.followers).toBe(0);
    expect((await o.post("/api/users/olga/follow")).status).toBe(400);
    expect((await v.post("/api/users/ninguem/follow")).status).toBe(404);
  });

  it("listas de seguidores e seguindo: relação de quem vê, sem N+1, e privado só na lista da própria pessoa", async () => {
    const o = await person("Olga", { handle: "olga" }, { visibility: "publico" }), v = await person("Vera", { handle: "vera" }, { visibility: "publico", faculdade: "UERJ" });
    const priv = await person("Pri", { handle: "pri.x" }), fechado = await person("Fe", { handle: "fe.x" }, { faculdade: "UFF" }), eu = await person("Eu", { handle: "eu.mesma" });
    await follow(v, o); await follow(priv, o); await follow(fechado, o); await follow(eu, v);
    await priv.patch("/api/me", { visibility: "privado" });

    const queries: string[] = [];
    const original = pool.query.bind(pool);
    (pool as any).query = (...a: any[]) => { queries.push(String(a[0])); return (original as any)(...a); };
    const vista = (await eu.get("/api/users/olga/followers")).json.people;
    (pool as any).query = original;
    expect(queries.length).toBeLessThanOrEqual(3);
    expect(vista.map((p: any) => p.handle).sort()).toEqual(["fe.x", "vera"]);
    expect(vista.find((p: any) => p.handle === "vera")).toMatchObject({ relation: "seguindo", faculdade: "UERJ" });
    expect(vista.find((p: any) => p.handle === "fe.x")).toMatchObject({ relation: "nenhuma", faculdade: null });

    const minha = (await o.get("/api/users/olga/followers")).json.people;
    expect(minha.map((p: any) => p.handle).sort()).toEqual(["fe.x", "pri.x", "vera"]);
    expect(minha.find((p: any) => p.handle === "pri.x")).toMatchObject({ name: "Pri", faculdade: null, avatarUrl: null });
    expect((await eu.get("/api/users/vera/followers")).json.people.map((p: any) => p.relation)).toEqual(["eu"]);
    expect((await v.get("/api/users/eu.mesma/following")).status).toBe(200);
  });

  it("limita a 60 pedidos de seguir por hora", async () => {
    const v = await person("Vera");
    await person("Olga", { handle: "olga" });
    for (let i = 0; i < 60; i++) expect((await v.post("/api/users/olga/follow")).status).toBe(200);
    expect((await v.post("/api/users/olga/follow")).status).toBe(429);
  });
});
