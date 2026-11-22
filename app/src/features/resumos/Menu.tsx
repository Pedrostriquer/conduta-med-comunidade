/* Menu e balão soltos: ficam por cima de tudo, ajustados para caber na tela. Clicar neles não tira o foco do editor. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Icon } from "../../ds/Icon";
import { cx } from "../../lib/cx";
import { ease, dur } from "../../lib/motion";
import { Glyph } from "./glyphs";

export type Anchor = { left: number; top: number; bottom: number; right: number };
export const anchorOf = (el: Element): Anchor => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, bottom: r.bottom, right: r.right }; };
export const pointAnchor = (x: number, y: number): Anchor => ({ left: x, right: x, top: y, bottom: y });

export function Popover({ anchor, onClose, children, className, label, align = "start", keepFocus = true }: {
  anchor: Anchor; onClose: () => void; children: ReactNode; className?: string; label?: string; align?: "start" | "end"; keepFocus?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, pad = 8;
    let left = align === "end" ? anchor.right - w : anchor.left;
    left = Math.max(pad, Math.min(left, innerWidth - w - pad));
    let top = anchor.bottom + 6;
    if (top + h > innerHeight - pad) top = anchor.top - h - 6 >= pad ? anchor.top - h - 6 : Math.max(pad, innerHeight - h - pad);
    setPos({ left, top });
  }, [anchor, align]);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const away = () => onClose();
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    addEventListener("resize", away);
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("keydown", key, true); removeEventListener("resize", away); };
  }, [onClose]);
  return createPortal(
    <motion.div ref={box} className={cx("rs-pop cd-root", className)} role="dialog" aria-label={label} style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.quick, ease: ease.out }}
      onMouseDown={keepFocus ? (e) => { if (!(e.target as HTMLElement).closest("input,textarea")) e.preventDefault(); } : undefined}>
      {children}
    </motion.div>,
    document.body,
  );
}

export type MenuItem = { label: ReactNode; icon?: string; glyph?: string; danger?: boolean; disabled?: boolean; checked?: boolean; hint?: string; onSelect: () => void } | "sep";

export function Menu({ anchor, items, onClose, label, align, autoFocus = true }: { anchor: Anchor; items: MenuItem[]; onClose: () => void; label: string; align?: "start" | "end"; autoFocus?: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => list.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(t);
  }, [autoFocus]);
  const key = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault(); e.stopPropagation();
    const btns = [...(list.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") || [])];
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement as HTMLElement);
    const n = e.key === "Home" ? 0 : e.key === "End" ? btns.length - 1 : e.key === "ArrowDown" ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
    btns[n].focus();
  };
  return (
    <Popover anchor={anchor} onClose={onClose} align={align} className="rs-menu" label={label}>
      <div ref={list} role="menu" aria-label={label} onKeyDown={key}>
        {items.map((it, i) => it === "sep" ? <div key={i} className="rs-menu__sep" role="separator" /> : (
          <button key={i} type="button" role={it.checked != null ? "menuitemradio" : "menuitem"} aria-checked={it.checked} className="rs-menu__item cd-hoverable" data-danger={it.danger ? "" : undefined} disabled={it.disabled}
            onClick={() => { onClose(); it.onSelect(); }}>
            <span className="rs-menu__icon">{it.glyph ? <Glyph name={it.glyph} size={18} /> : it.icon ? <Icon name={it.icon} size={18} /> : null}</span>
            <span className="rs-menu__label">{it.label}</span>
            {it.checked ? <Icon name="check" size={16} strokeWidth={2.25} className="rs-menu__check" /> : it.hint ? <span className="rs-menu__hint">{it.hint}</span> : null}
          </button>
        ))}
      </div>
    </Popover>
  );
}
