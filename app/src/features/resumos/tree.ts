/* A árvore de pastas e documentos em forma de índice: filhos em ordem, caminho até a raiz, posição fracionária. */
import type { DocNode } from "../../api/types";

export type TreeIndex = { byId: Map<string, DocNode>; kids: Map<string | null, DocNode[]> };
export type Row = { node: DocNode; depth: number; hasKids: boolean; open: boolean };

export function indexTree(nodes: DocNode[]): TreeIndex {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = new Map<string | null, DocNode[]>();
  for (const n of nodes) {
    // pai fora da lista (na lixeira ou não compartilhado): o item aparece na raiz
    const p = n.parentId && byId.has(n.parentId) ? n.parentId : null;
    const list = kids.get(p);
    if (list) list.push(n); else kids.set(p, [n]);
  }
  for (const list of kids.values()) list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, "pt-BR"));
  return { byId, kids };
}

export const childrenOf = (ix: TreeIndex, id: string | null) => ix.kids.get(id) || [];

/** da raiz até o nó, inclusive */
export function pathOf(ix: TreeIndex, id: string): DocNode[] {
  const out: DocNode[] = [], seen = new Set<string>();
  let n = ix.byId.get(id);
  while (n && !seen.has(n.id)) {
    out.unshift(n); seen.add(n.id);
    n = n.parentId ? ix.byId.get(n.parentId) : undefined;
  }
  return out;
}

export function descendantsOf(ix: TreeIndex, id: string): string[] {
  const out: string[] = [], stack = [id];
  while (stack.length) {
    for (const k of childrenOf(ix, stack.pop()!)) { out.push(k.id); stack.push(k.id); }
  }
  return out;
}

export const isInside = (ix: TreeIndex, id: string, ancestor: string) => pathOf(ix, id).some((n) => n.id === ancestor);

/** a posição entre dois vizinhos: nunca renumera os outros */
export function between(a: number | undefined, b: number | undefined) {
  if (a == null && b == null) return 1;
  if (a == null) return b! - 1;
  if (b == null) return a + 1;
  return (a + b) / 2;
}

export function endPosition(ix: TreeIndex, parent: string | null) {
  const list = childrenOf(ix, parent);
  return list.length ? list[list.length - 1].position + 1 : 1;
}

export function flatten(ix: TreeIndex, open: Record<string, true>, parent: string | null = null, depth = 0, out: Row[] = []): Row[] {
  for (const node of childrenOf(ix, parent)) {
    const hasKids = childrenOf(ix, node.id).length > 0, isOpen = node.kind === "pasta" && !!open[node.id];
    out.push({ node, depth, hasKids, open: isOpen });
    if (isOpen) flatten(ix, open, node.id, depth + 1, out);
  }
  return out;
}

export const nodeTitle = (n: Pick<DocNode, "title" | "kind">) => n.title.trim() || (n.kind === "pasta" ? "Pasta sem nome" : "Sem título");

/** a pasta mais próxima acima que compartilha: é por causa dela que o item está visível */
export function sharingAncestor(ix: TreeIndex, id: string): DocNode | null {
  const up = pathOf(ix, id).slice(0, -1).reverse();
  return up.find((n) => n.visibility !== "privado") || null;
}
