/* A árvore do desktop: pastas dentro de pastas, arrastar para mover e reordenar, setas para navegar, busca no topo. */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import type { DocNode } from "../../api/types";
import { Icon } from "../../ds/Icon";
import { cx } from "../../lib/cx";
import { dur, ease } from "../../lib/motion";
import { Glyph } from "./glyphs";
import { anchorOf, Menu, pointAnchor } from "./Menu";
import type { Anchor } from "./Menu";
import { IaMark, NodeGlyph, RenameField, SharedMark } from "./parts";
import { SearchField, SearchResults, useDocSearch } from "./search";
import { useFolders, useTreeIndex } from "./store";
import { childrenOf, flatten, isInside, nodeTitle, pathOf } from "./tree";
import type { TreeIndex } from "./tree";
import { positionFor, useResumos } from "./ui";

export const ROW_H = 34;
type Where = "before" | "inside" | "after";
type Drop = { id: string; where: Where } | { id: "__end"; where: "after" } | null;

/** arrastar com o ponteiro: linha para "antes" e "depois", destaque para "dentro" */
function useTreeDrag(box: React.RefObject<HTMLDivElement | null>, ix: TreeIndex, open: Record<string, true>, onDrop: (id: string, drop: Exclude<Drop, null>) => void) {
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const live = useRef({ ix, open, onDrop });
  live.current = { ix, open, onDrop };
  const justDragged = useRef(false);

  const start = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || e.pointerType === "touch") return; // no toque, mover é pelo menu
    if ((e.target as HTMLElement).closest("button,input")) return;
    const sx = e.clientX, sy = e.clientY;
    let active = false, target: Drop = null, y = sy, raf = 0;
    let hoverFolder: string | null = null, hoverTimer = 0;

    const hover = (folder: string | null) => {
      if (folder === hoverFolder) return;
      hoverFolder = folder;
      window.clearTimeout(hoverTimer);
      if (folder) hoverTimer = window.setTimeout(() => useFolders.getState().ensure([folder]), 650);
    };
    const tick = () => {
      const el = box.current;
      if (el) {
        const r = el.getBoundingClientRect();
        if (y < r.top + 28) el.scrollTop -= 8;
        else if (y > r.bottom - 28) el.scrollTop += 8;
      }
      raf = requestAnimationFrame(tick);
    };
    const locate = (x: number, py: number): Drop => {
      const el = box.current; if (!el) return null;
      const r = el.getBoundingClientRect();
      if (x < r.left - 24 || x > r.right + 24 || py < r.top - 24 || py > r.bottom + 24) return null;
      const { ix } = live.current;
      const rows = [...el.querySelectorAll<HTMLElement>("[data-rowid]")];
      for (const row of rows) {
        const b = row.getBoundingClientRect();
        if (py < b.top || py >= b.bottom) continue;
        const rid = row.dataset.rowid!, node = ix.byId.get(rid);
        if (!node) return null;
        if (isInside(ix, rid, id)) return null; // não entra em si mesmo nem no que está dentro
        const f = (py - b.top) / b.height;
        if (node.kind === "pasta") return f < 0.25 ? { id: rid, where: "before" } : f > 0.75 ? { id: rid, where: "after" } : { id: rid, where: "inside" };
        return f < 0.5 ? { id: rid, where: "before" } : { id: rid, where: "after" };
      }
      return { id: "__end", where: "after" };
    };
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        active = true;
        document.body.classList.add("rs-dragging");
        getSelection()?.removeAllRanges();
        raf = requestAnimationFrame(tick);
      }
      ev.preventDefault();
      y = ev.clientY;
      target = locate(ev.clientX, ev.clientY);
      setDrag({ id, x: ev.clientX, y: ev.clientY });
      setDrop(target);
      hover(target && target.where === "inside" ? target.id : null);
    };
    const finish = (commit: boolean) => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", cancel);
      removeEventListener("keydown", key, true);
      cancelAnimationFrame(raf);
      window.clearTimeout(hoverTimer);
      document.body.classList.remove("rs-dragging");
      if (active) {
        justDragged.current = true;
        setTimeout(() => { justDragged.current = false; }, 0);
        setDrag(null); setDrop(null);
        if (commit && target) live.current.onDrop(id, target);
      }
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); finish(false); } };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", cancel);
    addEventListener("keydown", key, true);
  };
  return { drag, drop, start, justDragged };
}

export function TreePanel({ activeId, docOpen }: { activeId?: string; docOpen: boolean }) {
  const ix = useTreeIndex();
  const open = useFolders((s) => s.open);
  const toggle = useFolders((s) => s.toggle), ensure = useFolders((s) => s.ensure), closeFolder = useFolders((s) => s.close);
  const nav = useNavigate();
  const ui = useResumos();
  const search = useDocSearch();
  const rows = useMemo(() => flatten(ix, open), [ix, open]);
  const box = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ node: DocNode; anchor: Anchor } | null>(null);

  // abrir um documento abre as pastas acima dele
  const hasActive = activeId ? ix.byId.has(activeId) : false;
  useEffect(() => {
    if (!activeId || !hasActive) return;
    const up = pathOf(ix, activeId).slice(0, -1).map((n) => n.id);
    if (up.length) ensure(up);
    setFocus(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, hasActive]);

  const onDrop = (id: string, d: Exclude<Drop, null>) => {
    const dragged = ix.byId.get(id); if (!dragged) return;
    if (d.id === "__end") { void ui.acts.move(id, null, positionFor(id, null, "end")); return; }
    const t = ix.byId.get(d.id); if (!t) return;
    if (d.where === "inside") { void ui.acts.move(id, t.id, positionFor(id, t.id, "end")); return; }
    // "depois" de uma pasta aberta com itens cai como o primeiro dentro dela, onde a linha aparece
    if (d.where === "after" && t.kind === "pasta" && open[t.id] && childrenOf(ix, t.id).length) { void ui.acts.move(id, t.id, positionFor(id, t.id, "start")); return; }
    const parent = t.parentId && ix.byId.has(t.parentId) ? t.parentId : null;
    void ui.acts.move(id, parent, positionFor(id, parent, d.where === "before" ? { before: t.id } : { after: t.id }));
  };
  const dnd = useTreeDrag(box, ix, open, onDrop);

  const focusRow = (id: string) => {
    setFocus(id);
    const el = () => box.current?.querySelector<HTMLElement>(`[data-rowid="${CSS.escape(id)}"]`);
    // a linha pode estar entrando agora na lista
    if (el()) el()!.focus(); else setTimeout(() => el()?.focus(), 30);
  };
  const activate = (n: DocNode, viaKeyboard = false) => {
    if (n.kind === "doc") { nav("/resumos/" + n.id); return; }
    // sem documento aberto (ou pelo teclado), a pasta aparece à direita; lendo um documento, só abre e fecha a pasta
    if (!docOpen || viaKeyboard) nav("/resumos/" + n.id);
    if (viaKeyboard) ensure([n.id]); else toggle(n.id);
  };
  const key = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const i = rows.findIndex((r) => r.node.id === focus);
    const r = rows[i];
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); if (rows[i + 1]) focusRow(rows[i + 1].node.id); else if (i < 0 && rows[0]) focusRow(rows[0].node.id); break;
      case "ArrowUp": e.preventDefault(); if (i > 0) focusRow(rows[i - 1].node.id); break;
      case "Home": e.preventDefault(); if (rows[0]) focusRow(rows[0].node.id); break;
      case "End": e.preventDefault(); if (rows.length) focusRow(rows[rows.length - 1].node.id); break;
      case "ArrowRight":
        if (!r || r.node.kind !== "pasta") break;
        e.preventDefault();
        if (!r.open) ensure([r.node.id]); else if (r.hasKids) focusRow(rows[i + 1].node.id);
        break;
      case "ArrowLeft":
        if (!r) break;
        e.preventDefault();
        if (r.open) closeFolder(r.node.id);
        else if (r.node.parentId && ix.byId.has(r.node.parentId)) focusRow(r.node.parentId);
        break;
      case "Enter": if (r) { e.preventDefault(); activate(r.node, true); } break;
      case "F2": if (r) { e.preventDefault(); ui.startRename(r.node.id); } break;
      case "Delete": if (r && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void ui.acts.remove(r.node.id); } break;
    }
  };
  const newIn = async (kind: DocNode["kind"]) => {
    const doc = await ui.acts.create(kind, null);
    if (doc && kind === "pasta") { ui.startRename(doc.id); setFocus(doc.id); }
  };
  const tabStop = focus && rows.some((r) => r.node.id === focus) ? focus : rows[0]?.node.id;
  const dragged = dnd.drag ? ix.byId.get(dnd.drag.id) : null;

  return (
    <div className="rs-panel__in">
      <div className="rs-panel__top">
        <SearchField value={search.q} onChange={search.setQ} />
        <div className="rs-panel__new">
          <button type="button" className="rs-newbtn cd-hoverable" onClick={() => void newIn("doc")}><Glyph name="doc-plus" size={18} />Novo resumo</button>
          <button type="button" className="rs-newbtn cd-hoverable" onClick={() => void newIn("pasta")}><Glyph name="folder-plus" size={18} />Nova pasta</button>
        </div>
      </div>
      {search.active ? <div className="rs-panel__scroll"><SearchResults search={search} activeId={activeId} /></div> : (
        <div ref={box} className="rs-panel__scroll rs-tree" role="tree" aria-label="Seus resumos" onKeyDown={key}>
          <AnimatePresence initial={false}>
            {rows.map((r) => {
              const n = r.node;
              const d = dnd.drop && dnd.drop.id === n.id ? dnd.drop.where : undefined;
              // "depois" de uma pasta aberta aponta para dentro dela: a linha fica recuada
              const insideOpen = d === "after" && n.kind === "pasta" && r.open && r.hasKids;
              const renaming = ui.renaming === n.id;
              return (
                <motion.div key={n.id} className="rs-rowbox" initial={{ height: 0, opacity: 0, overflow: "hidden" }} animate={{ height: ROW_H, opacity: 1, transitionEnd: { overflow: "visible" } }} exit={{ height: 0, opacity: 0, overflow: "hidden" }} transition={{ duration: dur.quick, ease: ease.out }}>
                  <div data-rowid={n.id} role="treeitem" aria-level={r.depth + 1} aria-expanded={n.kind === "pasta" ? r.open : undefined} aria-selected={n.id === activeId} aria-label={nodeTitle(n)}
                    tabIndex={n.id === tabStop ? 0 : -1}
                    className={cx("rs-row", n.id === activeId && "is-active", dnd.drag?.id === n.id && "is-dragged")} data-drop={d} data-inner={insideOpen ? "" : undefined}
                    style={{ "--depth": r.depth } as React.CSSProperties}
                    onFocus={(e) => { if (e.target === e.currentTarget) setFocus(n.id); }}
                    onPointerDown={(e) => dnd.start(e, n.id)}
                    onClick={() => { if (!dnd.justDragged.current && !renaming) { setFocus(n.id); activate(n); } }}
                    onContextMenu={(e) => { e.preventDefault(); setMenu({ node: n, anchor: pointAnchor(e.clientX, e.clientY) }); }}>
                    {n.kind === "pasta" ? (
                      <button type="button" tabIndex={-1} className="rs-row__tw" aria-hidden onClick={(e) => { e.stopPropagation(); toggle(n.id); }}>
                        <Icon name="chevron-right" size={14} strokeWidth={2} className={cx("rs-row__chev", r.open && "is-open")} />
                      </button>
                    ) : <span className="rs-row__tw" aria-hidden />}
                    <span className="rs-row__glyph"><NodeGlyph node={n} /></span>
                    {renaming ? <RenameField node={n} onDone={(t) => { ui.stopRename(); if (t != null) void ui.acts.rename(n.id, t); focusRow(n.id); }} /> : <span className="rs-row__title">{nodeTitle(n)}</span>}
                    {!renaming ? (
                      <span className="rs-row__end">
                        <IaMark node={n} />
                        <SharedMark node={n} />
                        <span className="rs-row__acts">
                          {n.kind === "pasta" ? <button type="button" tabIndex={-1} className="rs-row__btn cd-hoverable" title="Novo resumo aqui" aria-label="Novo resumo aqui" onClick={(e) => { e.stopPropagation(); void ui.acts.create("doc", n.id); }}><Icon name="plus" size={16} /></button> : null}
                          <button type="button" tabIndex={-1} className="rs-row__btn cd-hoverable" title="Mais opções" aria-label="Mais opções" onClick={(e) => { e.stopPropagation(); setMenu({ node: n, anchor: anchorOf(e.currentTarget) }); }}><Icon name="more" size={16} /></button>
                        </span>
                      </span>
                    ) : null}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div className="rs-tree__end" data-on={dnd.drop?.id === "__end" ? "" : undefined} />
        </div>
      )}
      {menu ? <Menu anchor={menu.anchor} items={ui.menuFor(menu.node)} onClose={() => setMenu(null)} label={`Opções de ${nodeTitle(menu.node)}`} /> : null}
      {dragged && dnd.drag ? createPortal(
        <div className="rs-ghost cd-root" style={{ transform: `translate(${dnd.drag.x + 12}px, ${dnd.drag.y + 10}px)` }} aria-hidden>
          <NodeGlyph node={dragged} /><span>{nodeTitle(dragged)}</span>
        </div>, document.body,
      ) : null}
    </div>
  );
}
