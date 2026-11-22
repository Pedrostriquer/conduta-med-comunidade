/* Linguagem médica do design system: ECG para esperas, monitor para desempenho e o ritmo dos dias de estudo. */
import { useMemo } from "react";
import { cx } from "../lib/cx";
import { num, weekday, shortDate } from "../lib/format";
import type { DayKey } from "../lib/format";
import { Icon } from "./Icon";

export const ECG = "M0 20 H18 C20.5 20 21.5 15.5 24 15.5 C26.5 15.5 27.5 20 30 20 H35 L37 23 L41.5 4 L46 30 L48.5 20 H55 C58 20 60 13 64 13 C68 13 70 20 73 20 H96";

export function Pulse({ size = 96, tone, label = "Carregando" }: { size?: number; tone?: "success"; label?: string }) {
  return (
    <span className={cx("cd-pulse", tone && "cd-pulse--" + tone)} role="status" aria-label={label} style={{ width: size, height: size * 0.36 }}>
      <svg viewBox="0 0 96 34" width={size} height={size * 0.36} aria-hidden preserveAspectRatio="none">
        <path className="cd-pulse__base" d={ECG} pathLength={1} />
        <path className="cd-pulse__beat" d={ECG} pathLength={1} />
      </svg>
    </span>
  );
}

function trace(vals: number[], w: number, hh: number, lo: number, hi: number) {
  const n = vals.length; if (n < 2) return null;
  const X = (i: number) => (i / (n - 1)) * w, Y = (v: number) => hh - 2 - ((v - lo) / Math.max(1e-6, hi - lo)) * (hh - 4);
  let d = "M" + X(0).toFixed(1) + " " + Y(vals[0]).toFixed(1);
  for (let i = 1; i < n; i++) {
    const x0 = X(i - 1), x1 = X(i), y0 = Y(vals[i - 1]), y1 = Y(vals[i]), m = (x0 + x1) / 2;
    d += ` C${m.toFixed(1)} ${y0.toFixed(1)} ${m.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return { d, x: X(n - 1), y: Y(vals[n - 1]), Y };
}

export type Vital = { label: string; value: number; display?: string; unit?: string; goal?: number; goalLabel?: string; trend?: number[]; note?: string; alarm?: string; higherIsBetter?: boolean };

export function Vitals({ metrics, title }: { metrics: Vital[]; title?: string }) {
  return (
    <section className="cd-vitals" aria-label={title || "Sinais vitais do estudo"}>
      {metrics.map((m) => {
        const vals = m.trend || [];
        const all = vals.concat(m.goal != null ? [m.goal] : []);
        const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.15 || 1;
        const t = trace(vals, 160, 40, lo - pad, hi + pad);
        const below = m.goal != null && (m.higherIsBetter === false ? m.value > m.goal : m.value < m.goal);
        return (
          <article key={m.label} className="cd-vital" data-alarm={below ? "" : undefined}>
            <header className="cd-vital__head">
              <span className="cd-vital__ch">{m.label}</span>
              {m.goal != null ? <span className="cd-vital__lim">meta<b>{m.goalLabel ?? m.goal}</b></span> : null}
            </header>
            <div className="cd-vital__val">
              <span className="cd-vital__n">{m.display ?? num(m.value)}</span>
              {m.unit ? <span className="cd-vital__u">{m.unit}</span> : null}
            </div>
            {t ? (
              <svg className="cd-vital__trace" viewBox="0 0 160 40" preserveAspectRatio="none" role="img" aria-label={m.label + ": " + vals.join(", ")}>
                {m.goal != null ? <line className="cd-vital__goal" x1={0} x2={160} y1={t.Y(m.goal)} y2={t.Y(m.goal)} /> : null}
                <path className="cd-vital__line" d={t.d} />
                <circle className="cd-vital__now" cx={t.x} cy={t.y} r={3} />
              </svg>
            ) : <div className="cd-vital__trace" />}
            <footer className="cd-vital__foot">
              {below ? <span className="cd-vital__alarm"><Icon name="alert" size={14} strokeWidth={2} />{m.alarm || "abaixo da meta"}</span> : <span>{m.note || ""}</span>}
            </footer>
          </article>
        );
      })}
    </section>
  );
}

/** Ritmo: cada dia de estudo é um batimento no traçado; dia sem estudo é linha reta.
    A sequência atual se lê como um ritmo regular. Ao montar, o traçado corre e o último batimento pisca. */
export function Rhythm({ days, height = 34, muted }: { days: { key: DayKey; n: number }[]; height?: number; muted?: boolean }) {
  const W = 24, base = height * 0.62;
  const { d, last } = useMemo(() => {
    let p = `M0 ${base}`, x = 0, last: { x: number; y: number } | null = null;
    const max = Math.max(1, ...days.map((x) => x.n));
    days.forEach((day) => {
      if (day.n > 0) {
        const amp = 0.55 + 0.45 * Math.min(1, day.n / max);
        const top = base - (base - 3) * amp, bot = base + (height - base - 2) * 0.7 * amp;
        p += ` H${x + 6} L${x + 8} ${base + 2} L${x + 11} ${top.toFixed(1)} L${x + 14} ${bot.toFixed(1)} L${x + 16} ${base} H${x + W}`;
        last = { x: x + 11, y: top };
      } else {
        p += ` H${x + W}`;
      }
      x += W;
    });
    return { d: p, last: last as { x: number; y: number } | null };
  }, [days, base, height]);
  const width = days.length * W;
  const label = days.map((x) => `${weekday(x.key)} ${shortDate(x.key)}: ${x.n ? num(x.n) + " questões" : "sem estudo"}`).join("; ");
  return (
    <span className={cx("ui-rhythm", muted && "is-muted")} role="img" aria-label={"Ritmo dos últimos dias. " + label} style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden>
        <path className="ui-rhythm__line" d={d} pathLength={1} />
      </svg>
      {last ? <i className="ui-rhythm__dot" style={{ left: (last.x / width) * 100 + "%", top: last.y }} /> : null}
    </span>
  );
}
