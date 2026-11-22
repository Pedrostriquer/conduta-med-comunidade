/* Peças dos filtros do banco, usadas em Questões, Simulados e Resultados:
   o chip que abre uma lista para escolher (Banca ▾, Ano ▾), a caixinha de marcar e o anel de progresso pequeno. */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "../../ds/Icon";
import { num } from "../../lib/format";
import { cx } from "../../lib/cx";

export type PickOption<T> = { value: T; label: ReactNode; count?: number; hint?: ReactNode };

export function Check({ on, label, onClick, mixed }: { on: boolean; mixed?: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={mixed ? "mixed" : on} aria-label={label} className={cx("cd-check", mixed && "is-mixed")} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {mixed ? <span className="check-dash" aria-hidden /> : <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
    </button>
  );
}

/** Chip com lista: "Banca", "Banca · ENARE" ou "Banca · 3". Escolhe uma ou várias opções. */
export function PickChip<T extends string | number>({ label, options, value, onChange, multi = true, icon, width = 260 }: {
  label: string; options: PickOption<T>[]; value: T[]; onChange: (v: T[]) => void; multi?: boolean; icon?: string; width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === "keydown" ? (e as KeyboardEvent).key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener("pointerdown", close); addEventListener("keydown", close);
    return () => { removeEventListener("pointerdown", close); removeEventListener("keydown", close); };
  }, [open]);
  const on = value.length > 0;
  const first = options.find((o) => o.value === value[0]);
  const shown = !on ? null : value.length === 1 ? first?.label : num(value.length);
  const toggle = (v: T) => {
    if (!multi) { onChange(value[0] === v ? [] : [v]); setOpen(false); return; }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <div className="pick" ref={ref}>
      <button type="button" className="cd-chip cd-hoverable pick__btn" aria-pressed={on} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(!open)}>
        {icon ? <Icon name={icon} size={16} /> : null}
        <span>{label}{shown != null ? <span className="pick__val"> · {shown}</span> : null}</span>
        <Icon name="chevron-down" size={16} className="pick__chev" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div className="pick__pop cd-root" style={{ width }} role="listbox" aria-multiselectable={multi} aria-label={label}
            initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
            <div className="pick__list">
              {options.map((o) => {
                const sel = value.includes(o.value);
                return (
                  <button key={String(o.value)} type="button" role="option" aria-selected={sel} className="pick__opt cd-hoverable" onClick={() => toggle(o.value)}>
                    <span className={cx("pick__box", !multi && "pick__box--radio")} aria-hidden>{sel ? <Icon name="check" size={13} strokeWidth={3} /> : null}</span>
                    <span className="pick__label">{o.label}{o.hint ? <span className="pick__hint">{o.hint}</span> : null}</span>
                    {o.count != null ? <span className="pick__n num">{num(o.count)}</span> : null}
                  </button>
                );
              })}
            </div>
            {multi && on ? <div className="pick__foot"><button type="button" className="sec__link" onClick={() => onChange([])}>Limpar</button><button type="button" className="sec__link" onClick={() => setOpen(false)}>Pronto</button></div> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** anel pequeno de progresso (feito / total) com o número no meio */
export function MiniRing({ value, size = 40, stroke = 4, tone, children, label }: { value: number; size?: number; stroke?: number; tone?: "success"; children?: ReactNode; label?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <span className={cx("mring", tone && "mring--" + tone)} style={{ width: size, height: size }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="mring__track" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="mring__fill" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      {children != null ? <span className="mring__in">{children}</span> : null}
    </span>
  );
}

/** anos das provas, do mais novo ao mais antigo */
export const yearsOf = (exams: { ano: number }[]) => [...new Set(exams.map((e) => e.ano))].sort((a, b) => b - a);

/** bancas na ordem: a da prova-alvo primeiro, depois a ordem do app */
export function bancaOrder(all: readonly string[], present: string[], target?: string | null) {
  const xs = all.filter((b) => present.includes(b));
  if (target && xs.includes(target)) return [target, ...xs.filter((b) => b !== target)];
  return xs;
}
