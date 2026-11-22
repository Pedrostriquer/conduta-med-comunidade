/* Chamadas dos resumos: ver a seção Resumos e a seção Uploads de docs/CONTRATO-v3.md */
import { api, apiDelete, apiGet, apiPatch, apiPost } from "../../api/client";
import type { Doc, DocNode, Visibility } from "../../api/types";

export type DocPatch = { title?: string; icon?: string | null; content?: unknown; plain?: string; parentId?: string | null; position?: number; visibility?: Visibility; version?: number };
export type DocCreate = { kind: DocNode["kind"]; parentId?: string | null; title?: string; icon?: string | null; content?: unknown; plain?: string; position?: number };
export type SearchHit = DocNode & { snippet: string };
export type Uploaded = { url: string; width: number; height: number };

/** a versão mais recente que vimos de cada documento: renomear pela árvore não pode virar conflito no editor aberto */
export const liveVersion = new Map<string, number>();
const seen = (d: Doc) => { liveVersion.set(d.id, d.version); return d; };
const seg = encodeURIComponent;

export const docsApi = {
  tree: () => apiGet<{ nodes: DocNode[] }>("/docs/tree").then((r) => r.nodes),
  get: (id: string) => apiGet<{ doc: Doc }>(`/docs/${seg(id)}`).then((r) => seen(r.doc)),
  create: (b: DocCreate) => apiPost<{ doc: Doc }>("/docs", b).then((r) => seen(r.doc)),
  patch: (id: string, b: DocPatch) => apiPatch<{ doc: Doc }>(`/docs/${seg(id)}`, b).then((r) => seen(r.doc)),
  remove: (id: string) => apiDelete<void>(`/docs/${seg(id)}`),
  trash: () => apiGet<{ nodes: DocNode[] }>("/docs/trash").then((r) => r.nodes),
  restore: (id: string) => apiPost<{ doc: Doc }>(`/docs/${seg(id)}/restore`).then((r) => seen(r.doc)),
  forever: (id: string) => apiDelete<void>(`/docs/${seg(id)}/forever`),
  duplicate: (id: string) => apiPost<{ doc: Doc }>(`/docs/${seg(id)}/duplicate`).then((r) => seen(r.doc)),
  search: (q: string, signal?: AbortSignal) => apiGet<{ results: SearchHit[] }>(`/docs/search?q=${seg(q)}`, signal).then((r) => r.results),
  userTree: (handle: string) => apiGet<{ nodes: DocNode[] }>(`/users/${seg(handle)}/docs`).then((r) => r.nodes),
  userDoc: (handle: string, id: string) => apiGet<{ doc: Doc }>(`/users/${seg(handle)}/docs/${seg(id)}`).then((r) => r.doc),
  copy: (handle: string, id: string, parentId: string | null) => apiPost<{ doc: Doc }>(`/users/${seg(handle)}/docs/${seg(id)}/copy`, { parentId }).then((r) => seen(r.doc)),
  report: (id: string, reason: string) => apiPost<void>("/reports", { targetKind: "doc", targetId: id, reason }),
  uploadImage: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return api<Uploaded>("/uploads/image?kind=doc", { method: "POST", body });
  },
};
