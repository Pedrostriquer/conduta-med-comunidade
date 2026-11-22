/* A árvore dos resumos em memória, as pastas abertas (guardadas no navegador) e o documento aberto no editor. */
import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Doc, DocNode } from "../../api/types";
import { docsApi } from "./api";
import { indexTree } from "./tree";

type DocsState = { nodes: DocNode[]; loaded: boolean; error: string | null };
export const useDocs = create<DocsState>()(() => ({ nodes: [], loaded: false, error: null }));

export function toNode(d: Doc | DocNode): DocNode {
  return { id: d.id, parentId: d.parentId, kind: d.kind, title: d.title, icon: d.icon, position: d.position, visibility: d.visibility, sharedByParent: d.sharedByParent, updatedAt: d.updatedAt, origin: d.origin };
}

/* quem está aberto no editor: duplicar, mover ou excluir primeiro guarda o que foi escrito */
let flushOpen: (() => Promise<void>) | null = null;
export const setOpenFlush = (f: (() => Promise<void>) | null) => { flushOpen = f; };
export const flushOpenDoc = () => flushOpen?.() ?? Promise.resolve();

let loading: Promise<void> | null = null;
export function loadTree() {
  if (loading) return loading;
  // o que está sendo escrito vai antes: a resposta nunca traz um título mais velho do que o da tela
  loading = (flushOpen?.() ?? Promise.resolve()).catch(() => undefined).then(() => docsApi.tree())
    .then((nodes) => useDocs.setState({ nodes, loaded: true, error: null }))
    .catch((e: Error) => useDocs.setState((s) => ({ loaded: s.loaded, error: e.message })))
    .finally(() => { loading = null; });
  return loading;
}

export function putNode(d: Doc | DocNode) {
  const n = toNode(d);
  useDocs.setState((s) => {
    const i = s.nodes.findIndex((x) => x.id === n.id);
    if (i < 0) return { nodes: [...s.nodes, n] };
    const nodes = s.nodes.slice(); nodes[i] = n;
    return { nodes };
  });
}
export function patchNode(id: string, p: Partial<DocNode>) {
  useDocs.setState((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...p } : n)) }));
}
export function dropNodes(ids: Iterable<string>) {
  const gone = new Set(ids);
  useDocs.setState((s) => ({ nodes: s.nodes.filter((n) => !gone.has(n.id)) }));
}

export function useTreeIndex() {
  const nodes = useDocs((s) => s.nodes);
  return useMemo(() => indexTree(nodes), [nodes]);
}

/* pastas abertas */
type FoldersState = { open: Record<string, true>; toggle: (id: string) => void; ensure: (ids: string[]) => void; close: (id: string) => void };
export const useFolders = create<FoldersState>()(persist((set) => ({
  open: {},
  toggle: (id) => set((s) => {
    const open = { ...s.open };
    if (open[id]) delete open[id]; else open[id] = true;
    return { open };
  }),
  ensure: (ids) => set((s) => (ids.every((i) => s.open[i]) ? s : { open: { ...s.open, ...Object.fromEntries(ids.map((i) => [i, true as const])) } })),
  close: (id) => set((s) => {
    if (!s.open[id]) return s;
    const open = { ...s.open };
    delete open[id];
    return { open };
  }),
}), { name: "conduta-resumos-pastas", version: 1 }));

