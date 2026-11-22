/* O que se faz com uma pasta ou um documento. Tudo atualiza a tela na hora e volta atrás se o servidor recusar. */
import { useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { DocNode, Visibility } from "../../api/types";
import { useToast } from "../../ds/overlay";
import { docsApi } from "./api";
import { dropNodes, flushOpenDoc, loadTree, patchNode, putNode, useDocs, useFolders } from "./store";
import { descendantsOf, endPosition, indexTree, isInside, nodeTitle } from "./tree";

export const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

export function useDocActions() {
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const path = useRef(loc.pathname);
  path.current = loc.pathname;

  return useMemo(() => {
    const fail = (e: unknown) => toast({ text: (e as Error).message || "Não deu certo. Tente de novo.", icon: "alert" });
    const index = () => indexTree(useDocs.getState().nodes);

    const create = async (kind: DocNode["kind"], parentId: string | null = null) => {
      try {
        const body = kind === "pasta"
          ? { kind, parentId, title: "Nova pasta", position: endPosition(index(), parentId) }
          : { kind, parentId, position: endPosition(index(), parentId), content: EMPTY_DOC };
        const doc = await docsApi.create(body);
        putNode(doc);
        if (parentId) useFolders.getState().ensure([parentId]);
        if (kind === "doc") nav("/resumos/" + doc.id);
        return doc;
      } catch (e) { fail(e); return null; }
    };

    const rename = async (id: string, title: string) => {
      const before = useDocs.getState().nodes.find((n) => n.id === id);
      if (!before || before.title === title) return;
      patchNode(id, { title });
      try { await docsApi.patch(id, { title }); } catch (e) { patchNode(id, { title: before.title }); fail(e); }
    };

    const setIcon = async (id: string, icon: string | null) => {
      const before = useDocs.getState().nodes.find((n) => n.id === id);
      patchNode(id, { icon });
      try { await docsApi.patch(id, { icon }); } catch (e) { patchNode(id, { icon: before?.icon ?? null }); fail(e); }
    };

    const move = async (id: string, parentId: string | null, position: number, quiet = false) => {
      const before = useDocs.getState().nodes.find((n) => n.id === id);
      if (!before) return;
      patchNode(id, { parentId, position });
      if (parentId) useFolders.getState().ensure([parentId]);
      try {
        await docsApi.patch(id, { parentId, position });
        loadTree(); // quem compartilha pode ter mudado com a mudança de pasta
        if (!quiet && before.parentId !== parentId) {
          const dest = parentId ? index().byId.get(parentId) : null;
          toast({
            text: dest ? `Movido para ${nodeTitle(dest)}.` : "Movido para Resumos.", icon: "folder", action: "Desfazer", duration: 5000,
            onAction: () => { void move(id, before.parentId, before.position, true); },
          });
        }
      } catch (e) {
        patchNode(id, { parentId: before.parentId, position: before.position });
        fail(e);
      }
    };

    const duplicate = async (id: string) => {
      try {
        await flushOpenDoc();
        const doc = await docsApi.duplicate(id);
        await loadTree();
        toast({ text: `Cópia criada: ${nodeTitle(doc)}.`, icon: "copy" });
        return doc;
      } catch (e) { fail(e); return null; }
    };

    const remove = async (id: string) => {
      const ix = index(), node = ix.byId.get(id);
      if (!node) return;
      const opened = /^\/resumos\/([^/]+)/.exec(path.current)?.[1];
      const gone = [id, ...descendantsOf(ix, id)];
      try {
        await flushOpenDoc();
        await docsApi.remove(id);
      } catch (e) { fail(e); return; }
      dropNodes(gone);
      if (opened && ix.byId.has(opened) && isInside(ix, opened, id)) nav(node.parentId ? "/resumos/" + node.parentId : "/resumos", { replace: true });
      toast({
        text: `${nodeTitle(node)} foi para a lixeira.`, icon: "trash", action: "Desfazer", duration: 6000,
        onAction: () => { docsApi.restore(id).then(() => loadTree()).catch(fail); },
      });
    };

    const setVisibility = async (id: string, visibility: Visibility) => {
      const before = useDocs.getState().nodes.find((n) => n.id === id);
      patchNode(id, { visibility });
      try {
        await docsApi.patch(id, { visibility });
        await loadTree(); // o que está dentro da pasta muda junto
        return true;
      } catch (e) {
        if (before) patchNode(id, { visibility: before.visibility });
        fail(e);
        return false;
      }
    };

    return { create, rename, setIcon, move, duplicate, remove, setVisibility };
  }, [nav, toast]);
}
export type DocActions = ReturnType<typeof useDocActions>;
