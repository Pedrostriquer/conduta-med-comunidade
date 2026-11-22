import { describe, expect, it } from "vitest";
import { pool } from "../src/db";
import { Client, follow, person, useDatabase } from "./rest-helpers";

useDatabase();

const card = (key: string, text = key) => ({ key, kind: "basic", fields: [text, "verso"], ord: 0, path: ["Raiz"], tags: ["t"] });
const publish = (c: Client, over: Record<string, unknown> = {}) => c.post("/api/decks/publish", { localDeck: "local1", name: "Cardiologia Básica", description: "Para revisar", tags: ["cardio"], visibility: "publico", cards: [card("a"), card("b")], media: { "x.png": `${"a".repeat(64)}.png` }, note: "primeira", ...over });

describe("publicar", () => {
  it("cria com slug a partir do nome e o cartão do contrato", async () => {
    const a = await person("Ana", { handle: "ana.d" });
    const r = await publish(a);
    expect(r.status).toBe(200);
    expect(r.json.deck.slug).toMatch(/^cardiologia-basica-[a-f0-9]{6}$/);
    expect(r.json.deck).toMatchObject({ name: "Cardiologia Básica", description: "Para revisar", tags: ["cardio"], visibility: "publico", version: 1, cardsCount: 2, subscribers: 0, owner: { handle: "ana.d", name: "Ana", avatarUrl: null }, subscribed: false, mine: true });
    expect(r.json.deck.updatedAt).toBeTypeOf("number");
    expect((await publish(a, { localDeck: "l2", name: "!!!" })).json.deck.slug).toMatch(/^baralho-/);
  });

  it("publicar de novo sobe a versão, mantém o slug e guarda só as 5 últimas", async () => {
    const a = await person("Ana");
    const v1 = (await publish(a)).json.deck;
    for (let i = 2; i <= 7; i++) {
      const r = (await publish(a, { name: `Nome ${i}`, cards: [card("a", `v${i}`)], note: `n${i}` })).json.deck;
      expect(r).toMatchObject({ version: i, slug: v1.slug, id: v1.id, name: `Nome ${i}`, cardsCount: 1 });
    }
    const versions = (await pool.query("SELECT version FROM shared_deck_versions WHERE deck_id = $1 ORDER BY version", [v1.id])).rows.map((x) => x.version);
    expect(versions).toEqual([3, 4, 5, 6, 7]);
  });

  it("valida o corpo", async () => {
    const a = await person("Ana");
    expect((await publish(a, { cards: [] })).status).toBe(400);
    expect((await publish(a, { name: "  " })).status).toBe(400);
    expect((await publish(a, { visibility: "privado" })).status).toBe(400);
    expect((await publish(a, { media: { "x.png": "../../etc/passwd" } })).status).toBe(400);
    expect((await publish(a, { cards: [{ key: "a", kind: "outro", fields: [], ord: 0, path: [], tags: [] }] })).status).toBe(400);
    expect((await new Client().post("/api/decks/publish", {})).status).toBe(401);
  });
});

describe("listar e ver", () => {
  it("a vitrine só tem público, ordena e busca sem acento; link só com o endereço", async () => {
    const a = await person("Ana", {}, { visibility: "publico" }), b = await person("Bia"), v = await person("Vera");
    const p1 = (await publish(a, { localDeck: "1", name: "Coração em foco" })).json.deck;
    const p2 = (await publish(b, { localDeck: "2", name: "Rim", description: "nefro" })).json.deck;
    const seg = (await publish(a, { localDeck: "3", name: "Seg", visibility: "seguidores" })).json.deck;
    const link = (await publish(a, { localDeck: "4", name: "Por link", visibility: "link", cards: Array.from({ length: 8 }, (_, i) => card(`k${i}`)) })).json.deck;
    await v.post(`/api/decks/${p2.slug}/subscribe`, { localDeck: "minha" });
    const populares = (await v.get("/api/decks")).json.decks;
    expect(populares.map((d: any) => d.name)).toEqual(["Rim", "Coração em foco"]);
    expect(populares[0].subscribed).toBe(true);
    expect(populares[0].mine).toBe(false);
    const recentes = (await v.get("/api/decks?sort=recentes")).json.decks;
    expect(recentes.map((d: any) => d.name)).toEqual(["Rim", "Coração em foco"]);
    expect((await v.get("/api/decks?q=coracao")).json.decks.map((d: any) => d.id)).toEqual([p1.id]);
    expect((await v.get("/api/decks?q=NEFRO")).json.decks.map((d: any) => d.id)).toEqual([p2.id]);
    expect((await v.get("/api/decks?q=" + encodeURIComponent("%"))).json.decks).toEqual([]);

    const porLink = (await v.get(`/api/decks/${link.slug}`)).json;
    expect(porLink.deck.visibility).toBe("link");
    expect(porLink.sample).toHaveLength(5);
    expect(porLink.sample[0]).toEqual(card("k0"));
    expect((await v.get(`/api/users/${a.me.handle}/decks`)).json.decks.map((d: any) => d.name).sort()).toEqual(["Coração em foco"]);
    expect((await a.get("/api/decks/mine")).json.decks.map((d: any) => d.name).sort()).toEqual(["Coração em foco", "Por link", "Seg"]);
    expect((await a.get(`/api/users/${a.me.handle}/decks`)).json.decks).toHaveLength(3);
    expect((await v.get(`/api/decks/${seg.slug}`)).status).toBe(404); // nível seguidores: só quem foi aceito
    expect((await v.get("/api/decks/nao-existe")).status).toBe(404);
  });

  it("nível seguidores em perfil seguidores: só depois de aceito", async () => {
    const a = await person("Ana", {}, { visibility: "seguidores" }), v = await person("Vera");
    const seg = (await publish(a, { visibility: "seguidores" })).json.deck;
    expect((await v.get(`/api/decks/${seg.slug}`)).status).toBe(404);
    expect((await v.post(`/api/decks/${seg.slug}/subscribe`, { localDeck: "x" })).status).toBe(404);
    await v.post(`/api/users/${a.me.handle}/follow`);
    expect((await v.get(`/api/decks/${seg.slug}`)).status).toBe(404);
    await a.post(`/api/me/follow-requests/${v.me.handle}`, { accept: true });
    expect((await v.get(`/api/decks/${seg.slug}`)).status).toBe(200);
    expect((await v.get(`/api/users/${a.me.handle}/decks`)).json.decks).toHaveLength(1);
    expect((await v.get("/api/decks")).json.decks).toEqual([]);
  });

  it("só o dono muda, e despublicar tira de todo lugar", async () => {
    const a = await person("Ana"), b = await person("Bia");
    const d = (await publish(a)).json.deck;
    expect((await b.patch(`/api/decks/${d.slug}`, { name: "Roubado" })).status).toBe(403);
    expect((await b.del(`/api/decks/${d.slug}`)).status).toBe(403);
    const r = await a.patch(`/api/decks/${d.slug}`, { name: "Novo nome", tags: ["x"], visibility: "link" });
    expect(r.json.deck).toMatchObject({ name: "Novo nome", tags: ["x"], visibility: "link", version: 1, slug: d.slug });
    await a.patch(`/api/decks/${d.slug}`, { visibility: "publico" });
    await b.post(`/api/decks/${d.slug}/subscribe`, { localDeck: "x" });
    expect((await a.del(`/api/decks/${d.slug}`)).status).toBe(204);
    expect((await b.get(`/api/decks/${d.slug}`)).status).toBe(404);
    expect((await b.get("/api/decks")).json.decks).toEqual([]);
    expect((await a.get("/api/decks/mine")).json.decks).toEqual([]);
    expect((await b.get("/api/decks/subscribed")).json.decks).toEqual([]);
    // publicar de novo o mesmo baralho local traz de volta, com o mesmo endereço
    const volta = (await publish(a)).json.deck;
    expect(volta).toMatchObject({ slug: d.slug, version: 2 });
    expect((await b.get("/api/decks/subscribed")).json.decks).toHaveLength(1);
  });
});

describe("assinar", () => {
  it("assina, atualiza e mantém o contador; publicar sobe a versão e chega como atualização", async () => {
    const a = await person("Ana"), v = await person("Vera"), w = await person("Wil");
    const d = (await publish(a)).json.deck;
    expect((await a.post(`/api/decks/${d.slug}/subscribe`, { localDeck: "x" })).status).toBe(400);
    expect((await v.post(`/api/decks/${d.slug}/subscribe`, {})).status).toBe(400);

    const s = await v.post(`/api/decks/${d.slug}/subscribe`, { localDeck: "meu-local" });
    expect(s.status).toBe(200);
    expect(s.json).toMatchObject({ version: 1, added: 2, total: 2 });
    // assinar não reenvia nada: os registros já estão prontos para a sincronização
    const puxados = (await v.get("/api/sync/pull?since=0")).json.changes;
    const doCard = puxados.find((x: any) => x.id === "meu-local:s:a");
    expect(doCard).toMatchObject({ c: "fc_card", origin: "app", data: { id: "meu-local:s:a", deck: "meu-local", isNew: 1, reps: 0, ease: 2.5, fields: card("a").fields, src: { shared: d.slug } } });
    expect(puxados.find((x: any) => x.c === "fc_deck")).toMatchObject({ id: "meu-local", data: { name: d.name, cards: 2, images: 1 } });
    expect(puxados.find((x: any) => x.c === "fc_media")).toMatchObject({ id: "meu-local/x.png", data: { hash: "a".repeat(64), ext: "png" } });
    expect(s.json.deck).toMatchObject({ subscribers: 1, subscribed: true });
    // assinar de novo não conta duas vezes
    expect((await v.post(`/api/decks/${d.slug}/subscribe`, { localDeck: "outro-local" })).json.deck.subscribers).toBe(1);
    await w.post(`/api/decks/${d.slug}/subscribe`, { localDeck: "w" });
    const lista = (await v.get("/api/decks/subscribed")).json.decks;
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ slug: d.slug, localDeck: "outro-local", seenVersion: 1, subscribers: 2 });

    expect((await v.get(`/api/decks/${d.slug}/update?since=1`)).json).toEqual({ version: 1, cards: [], media: {}, note: "" });
    await publish(a, { cards: [card("a", "mudou"), card("c")], media: {}, note: "segunda" });
    const up = (await v.get(`/api/decks/${d.slug}/update?since=1`)).json;
    expect(up).toEqual({ version: 2, cards: [card("a", "mudou"), card("c")], media: {}, note: "segunda" });
    expect((await v.get("/api/decks/subscribed")).json.decks[0]).toMatchObject({ version: 2, seenVersion: 1 });
    expect((await v.post(`/api/decks/${d.slug}/seen`, { version: 2 })).status).toBe(204);
    expect((await v.get("/api/decks/subscribed")).json.decks[0].seenVersion).toBe(2);
    expect((await a.post(`/api/decks/${d.slug}/seen`, { version: 2 })).status).toBe(404);

    expect((await v.del(`/api/decks/${d.slug}/subscribe`)).status).toBe(204);
    expect((await v.del(`/api/decks/${d.slug}/subscribe`)).status).toBe(204);
    expect((await v.get(`/api/decks/${d.slug}`)).json.deck).toMatchObject({ subscribers: 1, subscribed: false });
    expect((await v.get("/api/decks/subscribed")).json.decks).toEqual([]);
  });

  it("assinante perde o acesso quando o baralho deixa de ser visível para ele, mas pode sair", async () => {
    const a = await person("Ana", {}, { visibility: "seguidores" }), v = await person("Vera");
    const d = (await publish(a, { visibility: "seguidores" })).json.deck;
    await follow(v, a);
    await v.post(`/api/decks/${d.slug}/subscribe`, { localDeck: "x" });
    await a.del(`/api/me/followers/${v.me.handle}`);
    expect((await v.get("/api/decks/subscribed")).json.decks).toEqual([]);
    expect((await v.get(`/api/decks/${d.slug}/update?since=0`)).status).toBe(404);
    expect((await v.del(`/api/decks/${d.slug}/subscribe`)).status).toBe(204);
    expect((await pool.query("SELECT subscribers FROM shared_decks")).rows[0].subscribers).toBe(0);
  });
});
