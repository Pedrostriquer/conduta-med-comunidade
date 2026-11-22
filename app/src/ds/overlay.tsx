/* Diálogo (alerta), folha (sheet) e avisos (toast). Diálogo e folha prendem o foco e devolvem ao fechar. */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useCompact } from "../lib/hooks";
import { ease, reduceMotion, spring } from "../lib/motion";
import { cx } from "../lib/cx";
import { Button, Kbd } from "./basics";
import { Icon } from "./Icon";

/** folha aberta por cima de outra: Esc e Tab valem só para a de cima */
const traps: object[] = [];

function useFocusTrap(open: boolean, box: React.RefObject<HTMLElement | null>, onEsc: () => void) {
  const back = useRef<Element | null>(null);
  const esc = useRef(onEsc); esc.current = onEsc;
  useEffect(() => {
    if (!open) return;
    back.current = document.activeElement;
    const me = {};
    traps.push(me);
    const t = setTimeout(() => {
      const f = box.current?.querySelector<HTMLElement>("[data-autofocus]") || box.current;
      f?.focus({ preventScroll: true });
    }, 20);
    const key = (e: KeyboardEvent) => {
      if (traps[traps.length - 1] !== me) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); esc.current(); }
      if (e.key === "Tab" && box.current) {
        const els = box.current.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input, select, textarea, [tabindex='0']");
        if (!els.length) return;
        const a = els[0], z = els[els.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    addEventListener("keydown", key, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t); removeEventListener("keydown", key, true);
      traps.splice(traps.indexOf(me), 1);
      document.body.style.overflow = prevOverflow;
      (back.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, [open, box]);
}

/** Diálogo de confirmação: só para o que não volta (finalizar prova, apagar). Vira folha no celular. */
export function Dialog({ open, title, children, confirmLabel, cancelLabel = "Cancelar", destructive, onConfirm, onClose }: {
  open: boolean; title: ReactNode; children?: ReactNode; confirmLabel: string; cancelLabel?: string; destructive?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = (after?: () => void) => {
    setClosing(true);
    setTimeout(() => { setClosing(false); (after || onClose)(); }, reduceMotion() ? 0 : 200);
  };
  useFocusTrap(open, box, () => close());
  if (!open) return null;
  return createPortal(
    <div className="cd-scrim cd-root" data-closing={closing ? "" : undefined} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={box} className="cd-dialog" role="alertdialog" aria-modal aria-labelledby="dlg-t" tabIndex={-1}>
        <span className="cd-grabber" aria-hidden />
        <h2 id="dlg-t" className="cd-dialog__title">{title}</h2>
        {children ? <p className="cd-dialog__body">{children}</p> : null}
        <div className="cd-dialog__actions">
          <Button variant="gray" onClick={() => close()}>{cancelLabel}</Button>
          <Button variant={destructive ? "destructive" : "filled"} data-autofocus="" onClick={() => close(onConfirm)}>{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Folha: sobe da borda no celular (arrastar para baixo fecha) e é um painel central no desktop. */
export function Sheet({ open, onClose, title, subtitle, children, footer, width = 560, label, className }: {
  open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number; label?: string; className?: string;
}) {
  const compact = useCompact();
  const box = useRef<HTMLDivElement>(null);
  const drag = useDragControls();
  useFocusTrap(open, box, onClose);
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div key="scrim" className="ui-sheet-scrim cd-root" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.16, ease: ease.exit } }}
          transition={{ duration: 0.24, ease: ease.out }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div ref={box} role="dialog" aria-modal aria-label={label || (typeof title === "string" ? title : undefined)} tabIndex={-1}
            className={cx("ui-sheet", compact ? "ui-sheet--bottom" : "ui-sheet--center", className)} style={compact ? undefined : { maxWidth: width }}
            initial={compact ? { y: "100%" } : { opacity: 0, scale: 0.96 }}
            animate={compact ? { y: 0 } : { opacity: 1, scale: 1 }}
            exit={compact ? { y: "100%", transition: { duration: 0.24, ease: ease.exit } } : { opacity: 0, scale: 0.97, transition: { duration: 0.16, ease: ease.exit } }}
            transition={spring.smooth}
            drag={compact ? "y" : false} dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 600) onClose(); }}>
            {compact ? <div className="ui-sheet__grab" onPointerDown={(e) => drag.start(e)}><span className="cd-grabber" aria-hidden /></div> : null}
            {title ? (
              <header className="ui-sheet__head" onPointerDown={(e) => compact && drag.start(e)}>
                <div>
                  <h2 className="ui-sheet__title">{title}</h2>
                  {subtitle ? <p className="ui-sheet__sub">{subtitle}</p> : null}
                </div>
                <Button variant="gray" size="sm" icon="x" label="Fechar" className="ui-sheet__close" onClick={onClose} />
              </header>
            ) : null}
            <div className="ui-sheet__body">{children}</div>
            {footer ? <footer className="ui-sheet__foot">{footer}</footer> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/* ---------- Avisos ---------- */
type ToastItem = { id: number; text: ReactNode; icon?: string; action?: string; kbd?: string; onAction?: () => void; closing?: boolean };
const ToastCtx = createContext<(t: Omit<ToastItem, "id"> & { duration?: number }) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => {
    setItems((x) => x.map((t) => (t.id === id ? { ...t, closing: true } : t)));
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 170);
  }, []);
  const show = useCallback((t: Omit<ToastItem, "id"> & { duration?: number }) => {
    const id = ++seq.current;
    setItems((x) => [...x.slice(-2), { ...t, id }]);
    setTimeout(() => dismiss(id), t.duration ?? 4200);
  }, [dismiss]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {createPortal(
        <div className="cd-toasts ui-toasts">
          {items.map((t) => (
            <div key={t.id} className="cd-toast cd-root" role="status" aria-live="polite" data-closing={t.closing ? "" : undefined}>
              {t.icon ? <Icon name={t.icon} size={18} /> : null}
              <span>{t.text}</span>
              {t.action ? (
                <button type="button" className="cd-toast__action" onClick={() => { t.onAction?.(); dismiss(t.id); }}>{t.action}{t.kbd ? <Kbd>{t.kbd}</Kbd> : null}</button>
              ) : <span style={{ width: 10 }} />}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}
