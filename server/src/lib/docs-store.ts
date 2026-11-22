/* Resumos: pastas dentro de pastas e documentos. Compartilhar uma pasta vale para tudo dentro dela, então a visibilidade
   efetiva é a mais aberta entre a do item e a dos ancestrais. Toda mudança na árvore de uma pessoa é serializada,
   para dois movimentos simultâneos não criarem um ciclo. */
import { randomUUID } from "node:crypto";
import { one, q, tx } from "../db";
import type { Db } from "../db";
import { HttpError, invalid, ms, notFound } from "../http";
import { jsonForDb, jsonSize, noNul } from "./validate";

export type DocLevel = "privado" | "seguidores" | "publico";
export type DocOrigin = "app" | "ia";
export type DocNode = { id: string; parentId: string | null; kind: "pasta" | "doc"; title: string; icon: string | null; position: number; visibility: DocLevel; sharedByParent: boolean; updatedAt: number; origin: DocOrigin };
export type Doc = DocNode & { content: unknown; version: number; createdAt: number };
export type NewDoc = { kind: "pasta" | "doc"; parentId?: string | null; title?: string; icon?: string | null; content?: unknown; plain?: string; position?: number };
export type DocPatch = { title?: string; icon?: string | null; content?: unknown; plain?: string; parentId?: string | null; position?: number; visibility?: DocLevel; version?: number };

export const MAX_CONTENT = 2 * 1024 * 1024;
/** to_tsvector tem teto de 1 MB: o texto da busca fica limitado bem abaixo disso */
const MAX_PLAIN = 300_000;
const MAX_TREE = 2000;
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

type NodeRow = { id: string; parent_id: string | null; kind: "pasta" | "doc"; title: string; icon: string | null; position: number; visibility: DocLevel; origin: DocOrigin; updated_at: Date; inherited: number; eff: number };
type DocRow = NodeRow & { content: unknown; version: number; created_at: Date };

const NODE_COLS = "n.id, n.parent_id, n.kind, n.title, n.icon, n.position, n.visibility, n.origin, n.updated_at";
const rank = (alias: string) => `(CASE ${alias}.visibility WHEN 'publico' THEN 2 WHEN 'seguidores' THEN 1 ELSE 0 END)`;
/** árvore viva da pessoa: `inherited` é o mais aberto entre os ancestrais e `eff` o mais aberto contando o item */
const TREE = `WITH RECURSIVE t AS (
    SELECT d.id, 0 AS inherited, ${rank("d")} AS eff FROM docs d WHERE d.user_id = $1 AND d.parent_id IS NULL AND d.deleted_at IS NULL
    UNION ALL
    SELECT d.id, t.eff, GREATEST(${rank("d")}, t.eff) FROM docs d JOIN t ON d.parent_id = t.id WHERE d.user_id = $1 AND d.deleted_at IS NULL
  )`;
const RANKS: Record<string, number> = { privado: 0, seguidores: 1, publico: 2 };
/** subárvore viva a partir de um item (o mesmo dono) */
const SUBTREE = `WITH RECURSIVE sub AS (
    SELECT d.id, d.parent_id FROM docs d WHERE d.id = $1 AND d.user_id = $2 AND d.deleted_at IS NULL
    UNION ALL
    SELECT d.id, d.parent_id FROM docs d JOIN sub ON d.parent_id = sub.id WHERE d.user_id = $2 AND d.deleted_at IS NULL
  )`;

const nodeOf = (r: NodeRow): DocNode => ({
  id: r.id, parentId: r.parent_id, kind: r.kind, title: r.title, icon: r.icon, position: r.position, visibility: r.visibility, sharedByParent: r.inherited > 0, updatedAt: ms(r.updated_at)!, origin: r.origin,
});
const docOf = (r: DocRow): Doc => ({ ...nodeOf(r), content: r.content, version: r.version, createdAt: ms(r.created_at)! });

const lockTree = (db: Db, userId: string) => db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 1))", [userId]);

/** texto corrido de um documento do editor; sem recursão, para JSON muito fundo não estourar a pilha */
export function plainOf(content: unknown): string {
  const out: string[] = [], stack: unknown[] = [content];
  while (stack.length) {
    const n = stack.pop();
    if (typeof n === "string") { out.push(n); continue; }
    if (!n || typeof n !== "object") continue;
    const node = n as { type?: unknown; text?: unknown; content?: unknown };
    if (typeof node.text === "string") out.push(node.text);
    if (node.type === "hardBreak") out.push("\n");
    if (Array.isArray(node.content)) { stack.push("\n"); for (let i = node.content.length - 1; i >= 0; i--) stack.push(node.content[i]); }
  }
  return out.join("").replace(/\s*\n\s*/g, "\n").trim();
}
const cleanPlain = (s: string) => noNul(s).slice(0, MAX_PLAIN);

function assertContent(content: unknown) {
  if (!content || typeof content !== "object" || (content as { type?: unknown }).type !== "doc") throw invalid("O conteúdo do resumo não é válido.");
  if (jsonSize(content) > MAX_CONTENT) throw invalid("Este resumo passou de 2 MB. Divida em mais de um.");
}
const cleanTitle = (s: string | undefined) => noNul(s ?? "").trim().slice(0, 300);
const cleanIcon = (s: string | null | undefined) => (s ? noNul(s).slice(0, 64) : null);
function assertPosition(p: number | undefined) { if (p !== undefined && !Number.isFinite(p)) throw invalid("Posição inválida."); }

async function assertFolder(db: Db, userId: string, id: string) {
  const p = await one<{ kind: string }>("SELECT kind FROM docs WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL", [id, userId], db);
  if (!p) throw notFound("Não encontramos essa pasta.");
  if (p.kind !== "pasta") throw invalid("Só dá para colocar itens dentro de uma pasta.");
}

/** item vivo, com os valores herdados dos ancestrais */
async function fetchDoc(db: Db | undefined, userId: string, id: string) {
  return one<DocRow>(
    `WITH RECURSIVE up AS (
       SELECT p.id, p.parent_id, p.visibility FROM docs p WHERE p.id = (SELECT parent_id FROM docs WHERE id = $2 AND user_id = $1)
       UNION
       SELECT p.id, p.parent_id, p.visibility FROM docs p JOIN up ON p.id = up.parent_id
     ), inh AS (SELECT COALESCE(max(${rank("up")}), 0) AS inherited FROM up)
     SELECT ${NODE_COLS}, n.content, n.version, n.created_at, inh.inherited, GREATEST(${rank("n")}, inh.inherited) AS eff
     FROM docs n, inh WHERE n.id = $2 AND n.user_id = $1 AND n.deleted_at IS NULL`,
    [userId, id], db,
  );
}

export async function getDoc(userId: string, id: string, db?: Db): Promise<Doc | null> {
  const r = await fetchDoc(db, userId, id);
  return r ? docOf(r) : null;
}

export async function listTree(userId: string): Promise<DocNode[]> {
  return (await q<NodeRow>(`${TREE} SELECT ${NODE_COLS}, t.inherited, t.eff FROM t JOIN docs n ON n.id = t.id ORDER BY n.position, n.created_at`, [userId])).map(nodeOf);
}

/** o que `levels` deixa ver da árvore de outra pessoa; o item visível cujo pai não é visível aparece na raiz */
export async function listVisibleTree(ownerId: string, levels: string[]): Promise<DocNode[]> {
  const rows = await q<NodeRow>(`${TREE} SELECT ${NODE_COLS}, t.inherited, t.eff FROM t JOIN docs n ON n.id = t.id WHERE t.eff = ANY($2) ORDER BY n.position, n.created_at`, [ownerId, levels.map((l) => RANKS[l])]);
  const seen = new Set(rows.map((r) => r.id));
  return rows.map((r) => ({ ...nodeOf(r), parentId: r.parent_id && seen.has(r.parent_id) ? r.parent_id : null }));
}
export async function countVisibleDocs(ownerId: string, levels: string[]) {
  const r = await one<{ n: number }>(`${TREE} SELECT count(*) AS n FROM t JOIN docs n ON n.id = t.id WHERE n.kind = 'doc' AND t.eff = ANY($2)`, [ownerId, levels.map((l) => RANKS[l])]);
  return r?.n ?? 0;
}
export async function getVisibleDoc(ownerId: string, id: string, levels: string[]): Promise<Doc | null> {
  const r = await fetchDoc(undefined, ownerId, id);
  if (!r || !levels.map((l) => RANKS[l]).includes(r.eff)) return null;
  return docOf(r);
}

export async function createDoc(userId: string, d: NewDoc, origin: DocOrigin = "app"): Promise<Doc> {
  if (d.kind !== "pasta" && d.kind !== "doc") throw invalid("Escolha entre pasta e documento.");
  assertPosition(d.position);
  const content = d.kind === "doc" ? d.content ?? EMPTY_DOC : null;
  if (content) assertContent(content);
  const plain = d.kind === "doc" ? cleanPlain(d.plain ?? plainOf(content)) : "";
  return tx(async (db) => {
    await lockTree(db, userId);
    if (d.parentId) await assertFolder(db, userId, d.parentId);
    const r = await one<{ id: string }>(
      `INSERT INTO docs (user_id, parent_id, kind, title, icon, content, plain, position, origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, (SELECT COALESCE(max(position), 0) + 1 FROM docs WHERE user_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL)), $9)
       RETURNING id`,
      [userId, d.parentId ?? null, d.kind, cleanTitle(d.title), cleanIcon(d.icon), content ? jsonForDb(content) : null, plain, d.position ?? null, origin], db,
    );
    return (await getDoc(userId, r!.id, db))!;
  });
}

export async function updateDoc(userId: string, id: string, p: DocPatch): Promise<Doc> {
  assertPosition(p.position);
  if (p.content !== undefined) assertContent(p.content);
  return tx(async (db) => {
    await lockTree(db, userId);
    const cur = await one<{ kind: string; version: number; parent_id: string | null }>("SELECT kind, version, parent_id FROM docs WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE", [id, userId], db);
    if (!cur) throw notFound("Não encontramos esse resumo.");
    if (p.content !== undefined && cur.kind === "pasta") throw invalid("Pasta não tem conteúdo.");
    if (p.content !== undefined && p.version !== undefined && p.version < cur.version) {
      throw new HttpError("conflito", "Este resumo mudou em outro lugar. Veja a versão mais nova antes de salvar.", { doc: await getDoc(userId, id, db) });
    }

    const args: unknown[] = [id, userId], sets: string[] = [];
    const set = (col: string, v: unknown) => { args.push(v); sets.push(`${col} = $${args.length}`); };
    if (p.title !== undefined) set("title", cleanTitle(p.title));
    if (p.icon !== undefined) set("icon", cleanIcon(p.icon));
    if (p.visibility !== undefined) set("visibility", p.visibility);
    if (p.position !== undefined) set("position", p.position);

    const moved = p.parentId !== undefined && p.parentId !== cur.parent_id;
    if (moved) {
      if (p.parentId) {
        await assertFolder(db, userId, p.parentId);
        const cycle = await one(
          `WITH RECURSIVE up AS (
             SELECT id, parent_id FROM docs WHERE id = $1 AND user_id = $3
             UNION
             SELECT d.id, d.parent_id FROM docs d JOIN up ON d.id = up.parent_id
           ) SELECT 1 FROM up WHERE id = $2`,
          [p.parentId, id, userId], db,
        );
        if (cycle) throw invalid("Não dá para mover uma pasta para dentro dela mesma.");
      }
      set("parent_id", p.parentId);
      if (p.position === undefined) {
        const n = args.length;
        sets.push(`position = (SELECT COALESCE(max(position), 0) + 1 FROM docs WHERE user_id = $2 AND parent_id IS NOT DISTINCT FROM $${n} AND deleted_at IS NULL)`);
      }
    }

    const metaChanged = sets.length > 0;
    let contentParam = 0;
    if (p.content !== undefined) {
      args.push(jsonForDb(p.content));
      contentParam = args.length;
      sets.push(`content = $${contentParam}::jsonb`, `version = version + CASE WHEN content IS DISTINCT FROM $${contentParam}::jsonb THEN 1 ELSE 0 END`);
      set("plain", cleanPlain(p.plain ?? plainOf(p.content)));
    } else if (p.plain !== undefined) {
      set("plain", cleanPlain(p.plain));
    }
    if (!sets.length) return (await getDoc(userId, id, db))!;
    // salvar de novo o mesmo conteúdo não conta como alteração
    sets.push(metaChanged || !contentParam ? "updated_at = now()" : `updated_at = CASE WHEN content IS DISTINCT FROM $${contentParam}::jsonb THEN now() ELSE updated_at END`);
    await db.query(`UPDATE docs SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2`, args);
    return (await getDoc(userId, id, db))!;
  });
}

/** lixeira: o item e o que há dentro ganham o mesmo deleted_at; o que já estava lá fica como estava */
export async function trashDoc(userId: string, id: string) {
  return tx(async (db) => {
    await lockTree(db, userId);
    const r = await db.query(`${SUBTREE} UPDATE docs SET deleted_at = now() WHERE id IN (SELECT id FROM sub)`, [id, userId]);
    return (r.rowCount ?? 0) > 0;
  });
}

/** só as raízes de cada coisa apagada: o conteúdo de uma pasta volta junto com ela */
export async function listTrash(userId: string): Promise<DocNode[]> {
  const rows = await q<NodeRow>(
    `SELECT ${NODE_COLS}, 0 AS inherited, ${rank("n")} AS eff FROM docs n LEFT JOIN docs p ON p.id = n.parent_id
     WHERE n.user_id = $1 AND n.deleted_at IS NOT NULL AND (p.id IS NULL OR p.deleted_at IS DISTINCT FROM n.deleted_at)
     ORDER BY n.deleted_at DESC LIMIT 500`,
    [userId],
  );
  return rows.map(nodeOf);
}

/** restaura o item e os que foram apagados com ele; se o pai continua na lixeira, volta para a raiz */
export async function restoreDoc(userId: string, id: string): Promise<Doc | null> {
  return tx(async (db) => {
    await lockTree(db, userId);
    const r = await db.query(
      `WITH RECURSIVE sub AS (
         SELECT id, deleted_at FROM docs WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL
         UNION ALL
         SELECT d.id, d.deleted_at FROM docs d JOIN sub ON d.parent_id = sub.id WHERE d.deleted_at = sub.deleted_at
       ) UPDATE docs SET deleted_at = NULL WHERE id IN (SELECT id FROM sub)`,
      [id, userId],
    );
    if (!r.rowCount) return null;
    await db.query(
      `UPDATE docs d SET parent_id = NULL FROM docs p WHERE d.id = $1 AND p.id = d.parent_id AND p.deleted_at IS NOT NULL`,
      [id],
    );
    return getDoc(userId, id, db);
  });
}

export async function destroyDoc(userId: string, id: string) {
  return tx(async (db) => {
    await lockTree(db, userId);
    const r = await db.query("DELETE FROM docs WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL", [id, userId]);
    return (r.rowCount ?? 0) > 0;
  });
}

/** copia uma subárvore numa transação; a cópia nasce privada, por segurança */
async function cloneTree(db: Db, ownerId: string, rootId: string, targetUser: string, targetParent: string | null, opts: { suffix: string; position: number | null }) {
  const rows = await q<{ id: string; parent_id: string | null }>(`${SUBTREE} SELECT id, parent_id FROM sub LIMIT ${MAX_TREE + 1}`, [rootId, ownerId], db);
  if (!rows.length) throw notFound("Não encontramos esse resumo.");
  if (rows.length > MAX_TREE) throw invalid(`Dá para copiar até ${MAX_TREE} itens de uma vez.`);
  const ids = new Map(rows.map((r) => [r.id, randomUUID()]));
  const oldIds = rows.map((r) => r.id), newIds = rows.map((r) => ids.get(r.id)!), parents = rows.map((r) => (r.id === rootId ? targetParent : ids.get(r.parent_id!)!));
  await db.query(
    `INSERT INTO docs (id, user_id, parent_id, kind, title, icon, content, plain, position, visibility, origin, copied_from)
     SELECT m.new_id, $1, m.new_parent, d.kind, CASE WHEN d.id = $2 THEN d.title || $3 ELSE d.title END, d.icon, d.content, d.plain,
            CASE WHEN d.id = $2 THEN COALESCE($4, (SELECT COALESCE(max(x.position), 0) + 1 FROM docs x WHERE x.user_id = $1 AND x.parent_id IS NOT DISTINCT FROM $8 AND x.deleted_at IS NULL)) ELSE d.position END,
            'privado', 'app', d.id
     FROM unnest($5::uuid[], $6::uuid[], $7::uuid[]) AS m(old_id, new_id, new_parent) JOIN docs d ON d.id = m.old_id`,
    [targetUser, rootId, opts.suffix, opts.position, oldIds, newIds, parents, targetParent],
  );
  return ids.get(rootId)!;
}

export async function duplicateDoc(userId: string, id: string): Promise<Doc | null> {
  return tx(async (db) => {
    await lockTree(db, userId);
    const src = await one<{ parent_id: string | null; position: number }>("SELECT parent_id, position FROM docs WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL", [id, userId], db);
    if (!src) return null;
    const newId = await cloneTree(db, userId, id, userId, src.parent_id, { suffix: " (cópia)", position: src.position + 0.5 });
    return getDoc(userId, newId, db);
  });
}

/** "copiar para os meus resumos" a partir do resumo de outra pessoa; quem chama já conferiu a visibilidade */
export async function copyDocTo(ownerId: string, id: string, targetUser: string, parentId: string | null): Promise<Doc> {
  return tx(async (db) => {
    await lockTree(db, targetUser);
    if (parentId) await assertFolder(db, targetUser, parentId);
    const newId = await cloneTree(db, ownerId, id, targetUser, parentId, { suffix: "", position: null });
    // quem copiou passa a referenciar as imagens: elas ficam mesmo se a conta original for apagada (sem contar na cota)
    await db.query(
      `INSERT INTO uploads (hash, user_id, kind, ext, bytes)
       SELECT DISTINCT m[1], $1::uuid, 'doc', 'webp', 0 FROM docs d, regexp_matches(d.content::text, '/uploads/doc/([0-9a-f]{64})\\.webp', 'g') m
       WHERE d.user_id = $1 AND d.copied_from IS NOT NULL AND d.deleted_at IS NULL
       ON CONFLICT DO NOTHING`,
      [targetUser],
    );
    return (await getDoc(targetUser, newId, db))!;
  });
}

export async function searchDocs(userId: string, text: string) {
  const rows = await q<NodeRow & { snippet: string }>(
    `${TREE}, hits AS (
       SELECT d.id, query FROM docs d, websearch_to_tsquery('portuguese', f_unaccent($2)) AS query
       WHERE d.user_id = $1 AND d.deleted_at IS NULL AND to_tsvector('portuguese', f_unaccent(d.title || ' ' || d.plain)) @@ query
       ORDER BY ts_rank(to_tsvector('portuguese', f_unaccent(d.title || ' ' || d.plain)), query) DESC, d.updated_at DESC LIMIT 30
     )
     SELECT ${NODE_COLS}, t.inherited, t.eff, ts_headline('conduta_pt', n.plain, hits.query, 'MaxWords=30, MinWords=12, MaxFragments=1, StartSel="", StopSel=""') AS snippet
     FROM hits JOIN t ON t.id = hits.id JOIN docs n ON n.id = hits.id`,
    [userId, text],
  );
  return rows.map((r) => ({ ...nodeOf(r), snippet: r.snippet }));
}
