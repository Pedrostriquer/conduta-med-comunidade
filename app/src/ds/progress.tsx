/* Progresso: anel, medidor, barras e o número que conta até o valor. */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { animate } from "motion/react";
import { num } from "../lib/format";
import { reduceMotion } from "../lib/motion";
import { AREA_ICON, Icon } from "./Icon";

/** Número que conta do valor anterior até o novo (520ms, ease-out). Na primeira montagem conta a partir de `from`. */
export function Counter({ value, from, format = num, duration = 0.52 }: { value: number; from?: number; format?: (v: number) => ReactNode; duration?: number }) {
  const [shown, setShown] = useState(from ?? value);
  const prev = useRef(from ?? value);
  useEffect(() => {
    if (reduceMotion() || prev.current === value) { setShown(value); prev.current = value; return; }
    const c = animate(prev.current, value, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(v) });
    prev.current = value;
    return () => c.stop();
  }, [value, duration]);
  const isInt = Number.isInteger(value);
  return <span className="cd-num">{format(isInt ? Math.round(shown) : shown)}</span>;
}

/** Anel de progresso. Na montagem enche a partir de zero (520ms) para mostrar o quanto já foi feito. */
export function ProgressRing({ value, size = 96, stroke, tone, label, text, caption, children, animateIn = true }: {
  value: number; size?: number; stroke?: number; tone?: "success"; label?: string; text?: ReactNode; caption?: ReactNode; children?: ReactNode; animateIn?: boolean;
}) {
  const sw = stroke || Math.max(6, size / 10), r = (size - sw) / 2, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const [shown, setShown] = useState(animateIn ? 0 : v);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(v)); return () => cancelAnimationFrame(id); }, [v]);
  return (
    <div className="cd-ring" data-tone={tone} role="img" aria-label={label || Math.round(v * 100) + "%"} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="cd-ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={sw} />
        <circle className="cd-ring__fill" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - shown)} />
      </svg>
      <div className="cd-ring__label" aria-hidden>
        {children ?? (
          <div>
            <span className="cd-ring__value" style={{ "--fs": Math.round(size / 4.4) + "px" } as React.CSSProperties}>{text ?? Math.round(v * 100) + "%"}</span>
            {caption ? <span className="cd-ring__cap">{caption}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function Meter({ label, value, max, valueLabel, tone }: { label: ReactNode; value: number; max: number; valueLabel?: ReactNode; tone?: "success" | "warning" }) {
  const p = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <div className="cd-meter">
      <div className="cd-meter__row"><span>{label}</span><span>{valueLabel ?? <><b>{num(value)}</b> de {num(max)}</>}</span></div>
      <div className="cd-meter__track" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={typeof label === "string" ? label : undefined}>
        <div className="cd-meter__fill" data-tone={tone} style={{ "--p": p * 100 + "%" } as React.CSSProperties} />
      </div>
    </div>
  );
}

export type BarRow = { key: string; name: string; value: number; n?: number; area?: string; onClick?: () => void };

export function BarList({ rows, goal, summary }: { rows: BarRow[]; goal?: number; summary?: ReactNode }) {
  return (
    <figure className="cd-bars" style={{ margin: 0 }}>
      {summary ? <figcaption className="cd-bars__summary">{summary}</figcaption> : null}
      {rows.map((r) => {
        const inner = (
          <>
            <span className="cd-bars__name" title={r.name}>
              {r.area ? <Icon name={AREA_ICON[r.area]} size={18} /> : null}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
            </span>
            <span className="cd-bars__track" role="img" aria-label={`${r.name}: ${r.value}%${r.n ? " em " + r.n + " questões" : ""}`}>
              <span className="cd-bars__fill" style={{ "--p": r.value + "%" } as React.CSSProperties} />
              {goal != null ? <span className="cd-bars__goal" style={{ "--g": goal + "%" } as React.CSSProperties} /> : null}
            </span>
            <span className="cd-bars__val">{r.value}%</span>
          </>
        );
        return r.onClick
          ? <button key={r.key} type="button" className="cd-bars__row ui-bars__btn cd-hoverable" onClick={r.onClick}>{inner}</button>
          : <div key={r.key} className="cd-bars__row">{inner}</div>;
      })}
      <div className="cd-bars__axis" aria-hidden><span /><div><span>0%</span><span>50%</span><span>100%</span></div><span /></div>
    </figure>
  );
}
