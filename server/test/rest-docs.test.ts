import { describe, expect, it } from "vitest";
import { pool } from "../src/db";
import { plainOf } from "../src/lib/docs-store";
import { Client, docJson, follow, person, useDatabase } from "./rest-helpers";

useDatabase();

const mk = async (c: Client, kind: "pasta" | "doc", title: string, parentId: string | null = null, content?: unknown) => (await c.post("/api/docs", { kind, title, parentId, content })).json.doc;
const titles = (nodes: any[]) => nodes.map((n) => n.title).sort();

describe("resumos: básico", () => {
  it("cria pasta e documento com o formato do contrato, e a árvore sem conteúdo", async () => {
    const a = await person("Ana");
    const p = await mk(a, "pasta", "Cardio");
    expect(p).toMatchObject({ kind: "pasta", title: "Cardio", parentId: null, visibility: "privado", sharedByParent: false, origin: "app", version: 1, content: null, position: 1 });
    expect(p.updatedAt).toBeTypeOf("number");
    expect(p.createdAt).toBeTypeOf("number");
    const d = await mk(a, "doc", "IC", p.id, docJson("Insuficiência cardíaca"));
    expect(d).toMatchObject({ parentId: p.id, position: 1, content: docJson("Insuficiência cardíaca") });
    const d2 = await mk(a, "doc", "Sem conteúdo", p.id);
    expect(d2.content.type).toBe("doc");
    expect(d2.position).toBe(2);
    const tree = (await a.get("/api/docs/tree")).json.nodes;
    expect(tree).toHaveLength(3);
    expect(tree[0].content).toBeUndefined();
    expect((await a.get(`/api/docs/${d.id}`)).json.doc.title).toBe("IC");
  });

  it("valida conteúdo, tamanho e pai; só o dono acessa", async () => {
    const a = await person("Ana"), b = await person("Bia");
    expect((await a.post("/api/docs", { kind: "outro" })).status).toBe(400);
    expect((await a.post("/api/docs", { kind: "doc", content: { type: "paragraph" } })).status).toBe(400);
    expect((await a.post("/api/docs", { kind: "doc", content: "texto" })).status).toBe(400);
    const grande = await a.post("/api/docs", { kind: "doc", content: { type: "doc", x: "a".repeat(2 * 1024 * 1024) } });
    expect(grande.status).toBe(400);
    expect(grande.json.error.message).toMatch(/2 MB/);
    const d = await mk(a, "doc", "Meu");
    expect((await a.post("/api/docs", { kind: "doc", parentId: d.id })).status).toBe(400);
    expect((await a.post("/api/docs", { kind: "doc", parentId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
    const pastaDela = await mk(b, "pasta", "Dela");
    expect((await a.post("/api/docs", { kind: "doc", parentId: pastaDela.id })).status).toBe(404);
    expect((await b.get(`/api/docs/${d.id}`)).status).toBe(404);
    expect((await b.patch(`/api/docs/${d.id}`, { title: "x" })).status).toBe(404);
    expect((await b.del(`/api/docs/${d.id}`)).status).toBe(404);
    expect((await a.get("/api/docs/nao-uuid")).status).toBe(404);
    expect((await new Client().get("/api/docs/tree")).status).toBe(401);
  });

  it("extrai o texto quando o cliente não manda e usa o do cliente quando manda", async () => {
    const a = await person("Ana");
    expect(plainOf({ type: "doc", content: [{ type: "heading", content: [{ type: "text", text: "Título" }] }, { type: "paragraph", content: [{ type: "text", text: "um " }, { type: "text", text: "dois", marks: [{ type: "bold" }] }, { type: "hardBreak" }, { type: "text", text: "três" }] }] })).toBe("Título\num dois\ntrês");
    const d = await mk(a, "doc", "X", null, docJson("palavra extraida"));
    expect((await pool.query("SELECT plain FROM docs WHERE id = $1", [d.id])).rows[0].plain).toBe("palavra extraida");
    await a.patch(`/api/docs/${d.id}`, { content: docJson("outra"), plain: "enviada pelo cliente" });
    expect((await pool.query("SELECT plain FROM docs WHERE id = $1", [d.id])).rows[0].plain).toBe("enviada pelo cliente");
  });
});

describe("resumos: versão", () => {
  it("version só sobe quando content muda, e version antiga dá 409 com a atual", async () => {
    const a = await person("Ana");
    const d = await mk(a, "doc", "V", null, docJson("v1"));
    expect(d.version).toBe(1);
    const titulo = (await a.patch(`/api/docs/${d.id}`, { title: "Novo" })).json.doc;
    expect(titulo.version).toBe(1);
    expect(titulo.title).toBe("Novo");
    expect((await a.patch(`/api/docs/${d.id}`, { icon: "🫀", position: 9, visibility: "publico" })).json.doc).toMatchObject({ version: 1, icon: "🫀", position: 9, visibility: "publico" });
    const mesmo = (await a.patch(`/api/docs/${d.id}`, { content: docJson("v1"), version: 1 })).json.doc;
    expect(mesmo.version).toBe(1);
    expect(mesmo.updatedAt).toBe((await a.get(`/api/docs/${d.id}`)).json.doc.updatedAt);
    const v2 = (await a.patch(`/api/docs/${d.id}`, { content: docJson("v2"), version: 1 })).json.doc;
    expect(v2.version).toBe(2);
    expect(v2.content).toEqual(docJson("v2"));

    const conflito = await a.patch(`/api/docs/${d.id}`, { content: docJson("velho"), version: 1 });
    expect(conflito.status).toBe(409);
    expect(conflito.json.error.code).toBe("conflito");
    expect(conflito.json.doc).toMatchObject({ id: d.id, version: 2, content: docJson("v2") });
    expect((await a.get(`/api/docs/${d.id}`)).json.doc.content).toEqual(docJson("v2"));
    // versão antiga sem content não atrapalha, e content sem version é a última escrita
    expect((await a.patch(`/api/docs/${d.id}`, { title: "T2", version: 1 })).status).toBe(200);
    expect((await a.patch(`/api/docs/${d.id}`, { content: docJson("v3") })).json.doc.version).toBe(3);
    const pasta = await mk(a, "pasta", "P");
    expect((await a.patch(`/api/docs/${pasta.id}`, { content: docJson("x") })).status).toBe(400);
  });
});

describe("resumos: mover", () => {
  it("move, recusa ciclo e item que não é pasta como destino", async () => {
    const a = await person("Ana");
    const p1 = await mk(a, "pasta", "P1"), p2 = await mk(a, "pasta", "P2", p1.id), p3 = await mk(a, "pasta", "P3", p2.id), d = await mk(a, "doc", "D", p3.id), solta = await mk(a, "pasta", "Solta");
    for (const destino of [p1.id, p2.id, p3.id]) {
      const r = await a.patch(`/api/docs/${p1.id}`, { parentId: destino });
      expect(r.status, destino).toBe(400);
      expect(r.json.error.code).toBe("invalido");
    }
    expect((await a.patch(`/api/docs/${p3.id}`, { parentId: d.id })).status).toBe(400);
    expect((await a.patch(`/api/docs/${p1.id}`, { parentId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
    const movido = await a.patch(`/api/docs/${p2.id}`, { parentId: solta.id });
    expect(movido.json.doc.parentId).toBe(solta.id);
    expect((await a.patch(`/api/docs/${p2.id}`, { parentId: null })).json.doc.parentId).toBeNull();
    // o que estava dentro segue junto
    expect((await a.get(`/api/docs/${d.id}`)).json.doc.parentId).toBe(p3.id);
    const b = await mk(a, "doc", "Vai pro fim"), x = await mk(a, "doc", "Já lá", solta.id);
    expect((await a.patch(`/api/docs/${b.id}`, { parentId: solta.id })).json.doc.position).toBe(x.position + 1);
    expect((await a.patch(`/api/docs/${b.id}`, { parentId: null, position: 0.5 })).json.doc.position).toBe(0.5);
  });

  it("dois movimentos simultâneos não criam ciclo", async () => {
    const a = await person("Ana");
    const p = await mk(a, "pasta", "P"), q = await mk(a, "pasta", "Q");
    const rs = await Promise.all([a.patch(`/api/docs/${p.id}`, { parentId: q.id }), a.patch(`/api/docs/${q.id}`, { parentId: p.id })]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 400]);
  });
});

describe("resumos: compartilhar", () => {
  it("sharedByParent vem da pasta, em qualquer profundidade e sem N+1", async () => {
    const a = await person("Ana");
    const p = await mk(a, "pasta", "P"), q = await mk(a, "pasta", "Q", p.id), d = await mk(a, "doc", "D", q.id);
    let t = (await a.get("/api/docs/tree")).json.nodes;
    expect(t.every((n: any) => !n.sharedByParent)).toBe(true);
    await a.patch(`/api/docs/${p.id}`, { visibility: "seguidores" });
    t = (await a.get("/api/docs/tree")).json.nodes;
    expect(t.find((n: any) => n.id === p.id).sharedByParent).toBe(false);
    expect(t.find((n: any) => n.id === q.id).sharedByParent).toBe(true);
    expect(t.find((n: any) => n.id === d.id)).toMatchObject({ sharedByParent: true, visibility: "privado" });
    expect((await a.get(`/api/docs/${d.id}`)).json.doc.sharedByParent).toBe(true);

    const queries: string[] = [];
    const original = pool.query.bind(pool);
    (pool as any).query = (...args: any[]) => { queries.push(String(args[0])); return (original as any)(...args); };
    await a.get("/api/docs/tree");
    (pool as any).query = original;
    expect(queries.length).toBeLessThanOrEqual(2);
  });

  it("outra pessoa vê a pasta com o que há dentro; item visível com pai oculto aparece na raiz", async () => {
    const o = await person("Olga", { handle: "olga" }, { visibility: "publico" }), v = await person("Vera");
    const compart = await mk(o, "pasta", "Compartilhada"), filho = await mk(o, "doc", "Filho", compart.id, docJson("conteúdo")), oculta = await mk(o, "pasta", "Oculta"), solto = await mk(o, "doc", "Solto", oculta.id);
    await o.patch(`/api/docs/${compart.id}`, { visibility: "publico" });
    await o.patch(`/api/docs/${solto.id}`, { visibility: "publico" });
    const nodes = (await v.get("/api/users/olga/docs")).json.nodes;
    expect(titles(nodes)).toEqual(["Compartilhada", "Filho", "Solto"]);
    expect(nodes.find((n: any) => n.title === "Solto").parentId).toBeNull();
    expect(nodes.find((n: any) => n.title === "Filho").parentId).toBe(compart.id);
    expect((await v.get(`/api/users/olga/docs/${filho.id}`)).json.doc).toMatchObject({ title: "Filho", sharedByParent: true, content: docJson("conteúdo") });
    expect((await v.get(`/api/users/olga/docs/${oculta.id}`)).status).toBe(404);
    expect((await v.get("/api/users/olga")).json.profile.docsCount).toBe(2);
  });

  it("copiar traz a árvore visível para os meus resumos, privada, com origem app", async () => {
    const o = await person("Olga", { handle: "olga" }, { visibility: "seguidores" }), v = await person("Vera");
    const p = await mk(o, "pasta", "Pasta dela"), d = await mk(o, "doc", "Doc dela", p.id, docJson("texto")), sub = await mk(o, "pasta", "Sub", p.id), d2 = await mk(o, "doc", "Doc 2", sub.id);
    await o.patch(`/api/docs/${p.id}`, { visibility: "seguidores" });
    expect((await v.post(`/api/users/olga/docs/${p.id}/copy`, {})).status).toBe(404);
    await follow(v, o);
    const destino = await mk(v, "pasta", "Copiados");
    const r = await v.post(`/api/users/olga/docs/${p.id}/copy`, { parentId: destino.id });
    expect(r.status).toBe(200);
    expect(r.json.doc).toMatchObject({ title: "Pasta dela", parentId: destino.id, visibility: "privado", version: 1 });
    expect(r.json.doc.id).not.toBe(p.id);
    const t = (await v.get("/api/docs/tree")).json.nodes;
    expect(titles(t)).toEqual(["Copiados", "Doc 2", "Doc dela", "Pasta dela", "Sub"]);
    const copiaSub = t.find((n: any) => n.title === "Sub"), copiaD2 = t.find((n: any) => n.title === "Doc 2");
    expect(copiaD2.parentId).toBe(copiaSub.id);
    expect(t.every((n: any) => n.visibility === "privado" && ![p.id, d.id, sub.id, d2.id].includes(n.id))).toBe(true);
    expect((await o.get("/api/docs/tree")).json.nodes).toHaveLength(4);
    expect((await v.post(`/api/users/olga/docs/${p.id}/copy`, { parentId: p.id })).status).toBe(404);
    // sem corpo vai para a raiz
    expect((await v.req("POST", `/api/users/olga/docs/${d.id}/copy`)).json.doc.parentId).toBeNull();
  });
});

describe("resumos: lixeira", () => {
  it("apaga com os descendentes, restaura os mesmos e preserva o que já estava na lixeira", async () => {
    const a = await person("Ana");
    const p = await mk(a, "pasta", "P"), q = await mk(a, "pasta", "Q", p.id), d = await mk(a, "doc", "D", q.id), antes = await mk(a, "doc", "Apagado antes", p.id), fora = await mk(a, "doc", "Fora");
    expect((await a.del(`/api/docs/${antes.id}`)).status).toBe(204);
    expect((await a.del(`/api/docs/${p.id}`)).status).toBe(204);
    expect(titles((await a.get("/api/docs/tree")).json.nodes)).toEqual(["Fora"]);
    expect((await a.get(`/api/docs/${d.id}`)).status).toBe(404);
    const stamp = (await pool.query("SELECT count(DISTINCT deleted_at) AS n FROM docs WHERE id = ANY($1)", [[p.id, q.id, d.id]])).rows[0].n;
    expect(stamp).toBe(1);
    expect(titles((await a.get("/api/docs/trash")).json.nodes)).toEqual(["Apagado antes", "P"]);
    expect((await a.del(`/api/docs/${p.id}`)).status).toBe(404);
    expect((await a.patch(`/api/docs/${fora.id}`, { parentId: p.id })).status).toBe(404);

    const r = await a.post(`/api/docs/${p.id}/restore`);
    expect(r.status).toBe(200);
    expect(r.json.doc.id).toBe(p.id);
    expect(titles((await a.get("/api/docs/tree")).json.nodes)).toEqual(["D", "Fora", "P", "Q"]);
    expect(titles((await a.get("/api/docs/trash")).json.nodes)).toEqual(["Apagado antes"]);
    expect((await a.post(`/api/docs/${p.id}/restore`)).status).toBe(404);

    // o pai já voltou: restaurar por último mantém o lugar
    expect((await a.post(`/api/docs/${antes.id}/restore`)).json.doc.parentId).toBe(p.id);
  });

  it("restaurar item cujo pai segue na lixeira leva para a raiz", async () => {
    const a = await person("Ana");
    const p = await mk(a, "pasta", "P"), d = await mk(a, "doc", "D", p.id);
    await a.del(`/api/docs/${d.id}`);
    await a.del(`/api/docs/${p.id}`);
    expect((await a.post(`/api/docs/${d.id}/restore`)).json.doc.parentId).toBeNull();
    expect((await a.get("/api/docs/tree")).json.nodes.map((n: any) => n.title)).toEqual(["D"]);
  });

  it("apagar de vez só funciona na lixeira e leva o que há dentro; lixeira não aparece para os outros", async () => {
    const o = await person("Olga", { handle: "olga" }, { visibility: "publico" }), v = await person("Vera");
    const p = await mk(o, "pasta", "P"), d = await mk(o, "doc", "D", p.id);
    await o.patch(`/api/docs/${p.id}`, { visibility: "publico" });
    expect((await v.get(`/api/users/olga/docs/${d.id}`)).status).toBe(200);
    expect((await o.del(`/api/docs/${p.id}/forever`)).status).toBe(404);
    await o.del(`/api/docs/${p.id}`);
    expect((await v.get(`/api/users/olga/docs/${d.id}`)).status).toBe(404);
    expect((await v.get("/api/users/olga/docs")).json.nodes).toEqual([]);
    expect((await v.get("/api/users/olga")).json.profile.docsCount).toBe(0);
    expect((await v.del(`/api/docs/${p.id}/forever`)).status).toBe(404);
    expect((await o.del(`/api/docs/${p.id}/forever`)).status).toBe(204);
    expect((await pool.query("SELECT count(*) AS n FROM docs")).rows[0].n).toBe(0);
    expect((await o.get("/api/docs/trash")).json.nodes).toEqual([]);
  });
});

describe("resumos: duplicar", () => {
  it("copia a árvore com ids novos, ao lado do original e privada", async () => {
    const a = await person("Ana");
    const p = await mk(a, "pasta", "P"), q = await mk(a, "pasta", "Q", p.id), d = await mk(a, "doc", "D", q.id, docJson("x"));
    await a.patch(`/api/docs/${p.id}`, { visibility: "publico" });
    const r = await a.post(`/api/docs/${p.id}/duplicate`);
    expect(r.status).toBe(200);
    expect(r.json.doc).toMatchObject({ title: "P (cópia)", parentId: null, visibility: "privado", position: p.position + 0.5 });
    const t = (await a.get("/api/docs/tree")).json.nodes;
    expect(t).toHaveLength(6);
    const novoQ = t.find((n: any) => n.title === "Q" && n.id !== q.id), novoD = t.find((n: any) => n.title === "D" && n.id !== d.id);
    expect(novoQ.parentId).toBe(r.json.doc.id);
    expect(novoD.parentId).toBe(novoQ.id);
    expect((await a.get(`/api/docs/${novoD.id}`)).json.doc.content).toEqual(docJson("x"));
    expect((await pool.query("SELECT copied_from FROM docs WHERE id = $1", [novoD.id])).rows[0].copied_from).toBe(d.id);
    const doc = await mk(a, "doc", "Solo", p.id);
    expect((await a.post(`/api/docs/${doc.id}/duplicate`)).json.doc.parentId).toBe(p.id);
    expect((await (await person("Bia")).post(`/api/docs/${p.id}/duplicate`)).status).toBe(404);
  });

  it("recusa copiar mais de 2000 itens", async () => {
    const a = await person("Ana");
    const p = await mk(a, "pasta", "P");
    await pool.query("INSERT INTO docs (user_id, parent_id, kind, title) SELECT $1, $2, 'doc', 'd' || i FROM generate_series(1, 2000) i", [a.me.id, p.id]);
    const r = await a.post(`/api/docs/${p.id}/duplicate`);
    expect(r.status).toBe(400);
    expect(r.json.error.message).toMatch(/2000/);
    expect((await pool.query("SELECT count(*) AS n FROM docs")).rows[0].n).toBe(2001);
  });
});

describe("resumos: busca", () => {
  it("acha por título e texto, sem acento, com trecho do texto original, e só nos meus", async () => {
    const a = await person("Ana"), b = await person("Bia");
    await mk(a, "doc", "Cardiologia", null, docJson("A insuficiência cardíaca descompensada pede diurético. Texto de preenchimento para o trecho."));
    await mk(a, "doc", "Renal", null, docJson("Glomerulonefrite aguda"));
    const lixo = await mk(a, "doc", "Apagado", null, docJson("insuficiência no lixo"));
    await a.del(`/api/docs/${lixo.id}`);
    await mk(b, "doc", "Dela", null, docJson("insuficiência dela"));

    const r = (await a.get("/api/docs/search?q=insuficiencia")).json.results;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ title: "Cardiologia", kind: "doc", sharedByParent: false });
    expect(r[0].snippet).toContain("insuficiência cardíaca");
    expect(r[0].snippet).not.toMatch(/<\/?b>/);
    expect((await a.get("/api/docs/search?q=CARDÍACA")).json.results).toHaveLength(1);
    expect((await a.get("/api/docs/search?q=renal")).json.results.map((x: any) => x.title)).toEqual(["Renal"]);
    expect((await a.get("/api/docs/search?q=inexistente")).json.results).toEqual([]);
    expect((await a.get("/api/docs/search?q=a")).json.results).toEqual([]);
    expect((await new Client().get("/api/docs/search?q=abc")).status).toBe(401);
  });

  it("usa o índice de texto", async () => {
    const a = await person("Ana");
    await pool.query("INSERT INTO docs (user_id, kind, title, plain) SELECT $1, 'doc', 'd' || i, 'texto de preenchimento ' || i FROM generate_series(1, 3000) i", [a.me.id]);
    await pool.query("ANALYZE docs");
    const plan = await pool.query(`EXPLAIN SELECT 1 FROM docs d, websearch_to_tsquery('portuguese', f_unaccent('raridade')) AS query WHERE d.user_id = '${a.me.id}' AND d.deleted_at IS NULL AND to_tsvector('portuguese', f_unaccent(d.title || ' ' || d.plain)) @@ query`);
    expect(JSON.stringify(plan.rows)).toContain("docs_search_idx");
  });
});

describe("resumos: helpers do plugin", () => {
  it("createDoc marca a origem e listTree devolve no formato do contrato", async () => {
    const { createDoc, getDoc, listTree } = await import("../src/lib/docs-store");
    const a = await person("Ana");
    const doc = await createDoc(a.me.id, { kind: "doc", title: "Da IA", content: docJson("x") }, "ia");
    expect(doc.origin).toBe("ia");
    expect((await listTree(a.me.id))[0]).toMatchObject({ id: doc.id, origin: "ia", sharedByParent: false });
    expect(await getDoc(a.me.id, doc.id)).toMatchObject({ title: "Da IA", version: 1 });
    expect(await getDoc((await person("Bia")).me.id, doc.id)).toBeNull();
  });
});
