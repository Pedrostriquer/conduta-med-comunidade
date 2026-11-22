/* Botões e controles do design system, portados para React com o mesmo DOM e as mesmas classes (cd-*). */
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";
import { num } from "../lib/format";
import { Icon } from "./Icon";

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="cd-kbd" aria-hidden>{children}</kbd>;
}

type BtnProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: "filled" | "tinted" | "gray" | "plain" | "destructive";
  size?: "sm" | "md" | "lg";
  icon?: string; iconEnd?: string; loading?: boolean; block?: boolean; kbd?: string; label?: string; href?: string;
  children?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "gray", size = "md", icon, iconEnd, loading, block, kbd, label, href, className, children, disabled, ...rest }, ref,
) {
  const iconOnly = icon && !children;
  const cls = cx("cd-btn", "cd-hoverable", "cd-btn--" + variant, size !== "md" && "cd-btn--" + size, iconOnly && "cd-btn--icon", block && "cd-btn--block", className);
  const inner = (
    <>
      {loading ? <span className="cd-spinner" aria-hidden /> : icon ? <Icon name={icon} size={size === "sm" ? 18 : 20} /> : null}
      {children ? <span>{children}</span> : null}
      {iconEnd ? <Icon name={iconEnd} size={18} /> : null}
      {kbd ? <Kbd>{kbd}</Kbd> : null}
    </>
  );
  if (href) return <a className={cls} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>{inner}</a>;
  return (
    <button ref={ref} type="button" className={cls} aria-label={iconOnly ? label : rest["aria-label"]} aria-busy={loading || undefined} disabled={disabled} {...rest}>
      {inner}
    </button>
  );
});

export type SegOption<T> = { value: T; label: ReactNode; icon?: string; ariaLabel?: string };

export function SegmentedControl<T extends string | number>({ options, value, onChange, size, block, ...aria }: {
  options: SegOption<T>[]; value: T; onChange: (v: T) => void; size?: "sm"; block?: boolean; "aria-label"?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null), thumb = useRef<HTMLSpanElement>(null), first = useRef(true);
  const place = useCallback(() => {
    const el = wrap.current?.querySelector<HTMLElement>('[aria-checked="true"]'), t = thumb.current;
    if (!el || !t) return;
    t.style.setProperty("--x", el.offsetLeft + "px");
    t.style.setProperty("--w", el.offsetWidth + "px");
  }, []);
  useLayoutEffect(() => {
    const t = thumb.current; if (!t) return;
    if (first.current) { t.setAttribute("data-instant", ""); place(); t.getBoundingClientRect(); t.removeAttribute("data-instant"); first.current = false; }
    else place();
  }, [value, place]);
  useEffect(() => {
    if (!window.ResizeObserver || !wrap.current) return;
    const ro = new ResizeObserver(() => { thumb.current?.setAttribute("data-instant", ""); place(); requestAnimationFrame(() => thumb.current?.removeAttribute("data-instant")); });
    ro.observe(wrap.current); return () => ro.disconnect();
  }, [place]);
  const key = (e: React.KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value); let n: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % options.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + options.length) % options.length;
    if (n === null) return;
    e.preventDefault(); onChange(options[n].value);
    wrap.current?.querySelectorAll<HTMLElement>(".cd-seg__item")[n]?.focus();
  };
  return (
    <div ref={wrap} role="radiogroup" aria-label={aria["aria-label"]} className={cx("cd-seg", size === "sm" && "cd-seg--sm", block && "cd-seg--block")} onKeyDown={key}>
      <span ref={thumb} className="cd-seg__thumb" aria-hidden />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} className="cd-seg__item" onClick={() => onChange(o.value)} aria-label={o.ariaLabel}>
            {o.icon ? <Icon name={o.icon} size={18} /> : null}{o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ pressed, onChange, icon, count, children, className }: {
  pressed?: boolean; onChange?: (v: boolean) => void; icon?: string; count?: number; children: ReactNode; className?: string;
}) {
  return (
    <button type="button" className={cx("cd-chip cd-hoverable", className)} aria-pressed={!!pressed} onClick={() => onChange?.(!pressed)}>
      <span className="cd-chip__check" aria-hidden><Icon name="check" size={16} strokeWidth={2.25} /></span>
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
      {count != null ? <span className="cd-chip__count">{num(count)}</span> : null}
    </button>
  );
}

export function Badge({ tone = "neutral", icon, children, title }: { tone?: "neutral" | "accent" | "success" | "danger" | "warning" | "outline"; icon?: string; children: ReactNode; title?: string }) {
  return (
    <span className={cx("cd-badge", tone !== "neutral" && "cd-badge--" + tone)} title={title}>
      {icon ? <Icon name={icon} size={14} strokeWidth={2} /> : null}{children}
    </span>
  );
}

/** Interruptor (não existe no design system; segue os tokens: trilho surface-3, ligado em accent, polegar com spring-snappy) */
export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button type="button" role="switch" id={id} aria-checked={checked} aria-label={label} className="ui-switch" onClick={() => onChange(!checked)}>
      <span className="ui-switch__thumb" aria-hidden />
    </button>
  );
}

/** − valor + com repetição ao segurar */
export function Stepper({ value, min, max, step = 1, onChange, format = (v: number) => num(v), label }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => ReactNode; label: string;
}) {
  const timer = useRef<number>(0), held = useRef(false), live = useRef(value);
  live.current = value;
  const bump = (d: number) => onChange(Math.max(min, Math.min(max, live.current + d)));
  const start = (d: number) => {
    held.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(function rep() {
      held.current = true; bump(d); timer.current = window.setTimeout(rep, 70);
    }, 420);
  };
  const stop = () => window.clearTimeout(timer.current);
  useEffect(() => stop, []);
  const btn = (d: number, icon: string, dis: boolean, aria: string) => (
    <button type="button" className="ui-stepper__btn cd-hoverable" disabled={dis} aria-label={aria}
      onPointerDown={() => start(d)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onClick={() => { if (!held.current) bump(d); held.current = false; }}>
      <Icon name={icon} size={18} strokeWidth={2} />
    </button>
  );
  return (
    <div className="ui-stepper" role="group" aria-label={label}>
      {btn(-step, "minus", value <= min, "Menos")}
      <output className="ui-stepper__val" aria-live="polite">{format(value)}</output>
      {btn(step, "plus", value >= max, "Mais")}
    </div>
  );
}
