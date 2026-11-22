/* Os painéis da seção (compartilhar, mover, ícone) e o renomear no lugar, ao alcance da árvore, da pasta e do editor. */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { DocNode } from "../../api/types";
import { useDocActions } from "./actions";
import type { DocActions } from "./actions";
import type { MenuItem } from "./Menu";
import { useDocs, useTreeIndex } from "./store";
import { between, endPosition } from "./tree";
import { IconSheet, MoveSheet, ShareSheet } from "./sheets";

type Ui = {
  acts: DocActions;
  renaming: string | null;
  startRename: (id: string) => void;
  stopRename: () => void;
  openShare: (id: string) => void;
  openMove: (id: string) => void;
  openIcon: (id: string) => void;
  /** o menu de uma pasta ou documento: o mesmo em todo lugar */
  menuFor: (n: DocNode) => MenuItem[];
};
const Ctx = createContext<Ui | null>(null);
export const useResumos = () => useContext(Ctx)!;

export function ResumosProvider({ children }: { children: ReactNode }) {
  const acts = useDocActions();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [share, setShare] = useState<string | null>(null);
  const [move, setMove] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const ix = useTreeIndex();

  const createInside = useCallback(async (kind: DocNode["kind"], parent: string | null) => {
    const doc = await acts.create(kind, parent);
    if (doc && kind === "pasta") setRenaming(doc.id);
  }, [acts]);

  const menuFor = useCallback((n: DocNode): MenuItem[] => [
    ...(n.kind === "pasta" ? [
      { label: "Novo resumo aqui", glyph: "doc-plus", onSelect: () => { void createInside("doc", n.id); } },
      { label: "Nova pasta aqui", glyph: "folder-plus", onSelect: () => { void createInside("pasta", n.id); } },
      "sep" as const,
    ] : []),
    { label: "Renomear", icon: "pencil", hint: "F2", onSelect: () => setRenaming(n.id) },
    { label: "Ícone", glyph: "smile", onSelect: () => setIcon(n.id) },
    { label: "Duplicar", icon: "copy", onSelect: () => { void acts.duplicate(n.id); } },
    { label: "Mover para…", glyph: "move", onSelect: () => setMove(n.id) },
    { label: "Compartilhar", icon: "share", onSelect: () => setShare(n.id) },
    "sep",
    { label: "Excluir", icon: "trash", danger: true, onSelect: () => { void acts.remove(n.id); } },
  ], [acts, createInside]);

  const value = useMemo<Ui>(() => ({
    acts, renaming, menuFor,
    startRename: setRenaming, stopRename: () => setRenaming(null),
    openShare: setShare, openMove: setMove, openIcon: setIcon,
  }), [acts, renaming, menuFor]);

  const moving = move ? ix.byId.get(move) : undefined;
  return (
    <Ctx.Provider value={value}>
      {children}
      <ShareSheet id={share} onClose={() => setShare(null)} onSwitch={setShare} />
      <MoveSheet node={moving} open={!!moving} onClose={() => setMove(null)} onPick={(parent) => {
        if (!moving) return;
        void acts.move(moving.id, parent, endPosition(ix, parent));
        setMove(null);
      }} />
      <IconSheet id={icon} onClose={() => setIcon(null)} />
    </Ctx.Provider>
  );
}

/** posição ao soltar: antes ou depois de um vizinho, ou no fim e no começo da pasta */
export function positionFor(id: string, parent: string | null, where: "end" | "start" | { before: string } | { after: string }) {
  const nodes = useDocs.getState().nodes;
  const sibs = nodes.filter((n) => n.parentId === parent && n.id !== id).sort((a, b) => a.position - b.position);
  if (where === "end") return sibs.length ? sibs[sibs.length - 1].position + 1 : 1;
  if (where === "start") return sibs.length ? sibs[0].position - 1 : 1;
  const ref = "before" in where ? where.before : where.after;
  const i = sibs.findIndex((n) => n.id === ref);
  if (i < 0) return sibs.length ? sibs[sibs.length - 1].position + 1 : 1;
  return "before" in where ? between(sibs[i - 1]?.position, sibs[i].position) : between(sibs[i].position, sibs[i + 1]?.position);
}

