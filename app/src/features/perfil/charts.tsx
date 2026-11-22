/* Gráficos do Desempenho, desenhados à mão em SVG com as cores do design system.
   Uma série por gráfico (sem legenda: o título diz o que é), traço de 2px, barras finas com ponta arredondada,
   grade discreta, linha de referência tracejada e dica ao passar o mouse ou o dedo. */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const PAD = { l: 34, r: 10, t: 12, b: 24 };

export type LinePoint = { key: string; x: string; y: number | null; tip: ReactNode };

/** Linha 0–100% (acerto) com a meta tracejada. Pontos sem valor quebram a linha. */
export function LineChart({ points, goal, height = 190, label, dots }: { points: LinePoint[]; goal?: number; height?: number; label: string; dots?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hot, setHot] = useState<number | null>(null);
  const iw = Math.max(1, w - PAD.l - PAD.r), ih = height - PAD.t - PAD.b;
  // o eixo acompanha a faixa dos dados (com a meta sempre à vista), em dezenas
  const vals = points.flatMap((p) => (p.y == null ? [] : [p.y])).concat(goal != null ? [goal] : []);
  const lo = Math.max(0, Math.floor((Math.min(...vals, 100) - 8) / 10) * 10), hi = Math.min(100, Math.ceil((Math.max(...vals, 0) + 6) / 10) * 10);
  const span = Math.max(10, hi - lo);
  const X = (i: number) => PAD.l + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const Y = (v: number) => PAD.t + ih - ((v - lo) / span) * ih;
  const yTicks = [lo, Math.round((lo + lo + span) / 20) * 10, lo + span].filter((v, i, a) => a.indexOf(v) === i);
  const segs: string[] = []; let cur = "";
  points.forEach((p, i) => { if (p.y == null) { if (cur) segs.push(cur); cur = ""; } else cur += (cur ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.y).toFixed(1); });
  if (cur) segs.push(cur);
  const ticks = labelTicks(points.length, iw);
  const move = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - PAD.l) / iw) * (points.length - 1));
    setHot(points.length ? Math.max(0, Math.min(points.length - 1, i)) : null);
  };
  const hp = hot != null ? points[hot] : null;
  return (
    <div className="pf-chart" ref={ref} style={{ height }}>
      {w ? (
        <svg width={w} height={height} role="img" aria-label={label} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHot(null)}>
          {yTicks.map((v) => <g key={v}><line className="pf-grid" x1={PAD.l} x2={w - PAD.r} y1={Y(v)} y2={Y(v)} /><text className="pf-axis" x={PAD.l - 6} y={Y(v) + 4} textAnchor="end">{v}%</text></g>)}
          {goal != null ? <><line className="pf-goal" x1={PAD.l} x2={w - PAD.r} y1={Y(goal)} y2={Y(goal)} /><text className="pf-goal__label" x={PAD.l + 6} y={Y(goal) - 5}>meta {goal}%</text></> : null}
          {ticks.map((i) => <text key={i} className="pf-axis" x={X(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>{points[i].x}</text>)}
          {segs.map((d, i) => <path key={i} className="pf-line" d={d} />)}
          {dots ? points.map((p, i) => (p.y == null ? null : <circle key={p.key} className="pf-dot" cx={X(i)} cy={Y(p.y)} r={4.5} />)) : null}
          {hp ? <line className="pf-cross" x1={X(hot!)} x2={X(hot!)} y1={PAD.t} y2={PAD.t + ih} /> : null}
          {hp && hp.y != null ? <circle className="pf-dot pf-dot--hot" cx={X(hot!)} cy={Y(hp.y)} r={5} /> : null}
          <rect x={PAD.l} y={0} width={iw} height={height} fill="transparent" />
        </svg>
      ) : null}
      {hp ? <Tip x={X(hot!)} w={w}>{hp.tip}</Tip> : null}
    </div>
  );
}

export type Column = { key: string; x: string; v: number; tip: ReactNode; muted?: boolean };

/** Colunas com uma linha de referência (a meta da semana, por exemplo). */
export function Columns({ cols, goal, goalLabel, height = 190, label, format = (v: number) => String(v) }: {
  cols: Column[]; goal?: number; goalLabel?: string; height?: number; label: string; format?: (v: number) => string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hot, setHot] = useState<number | null>(null);
  const iw = Math.max(1, w - PAD.l - PAD.r), ih = height - PAD.t - PAD.b;
  const max = niceTop(Math.max(1, goal || 0, ...cols.map((c) => c.v)) * 1.08);
  const slot = iw / Math.max(1, cols.length), bw = Math.max(4, Math.min(28, slot * 0.56));
  const X = (i: number) => PAD.l + slot * i + slot / 2;
  const Y = (v: number) => PAD.t + ih - (v / max) * ih;
  const ticks = labelTicks(cols.length, iw);
  const hp = hot != null ? cols[hot] : null;
  return (
    <div className="pf-chart" ref={ref} style={{ height }}>
      {w ? (
        <svg width={w} height={height} role="img" aria-label={label} onPointerLeave={() => setHot(null)}>
          {[0, max / 2, max].map((v) => (<g key={v}><line className="pf-grid" x1={PAD.l} x2={w - PAD.r} y1={Y(v)} y2={Y(v)} /><text className="pf-axis" x={PAD.l - 6} y={Y(v) + 4} textAnchor="end">{format(v)}</text></g>))}
          {cols.map((c, i) => {
            const h = Math.max(c.v ? 3 : 0, PAD.t + ih - Y(c.v));
            return (
              <g key={c.key} onPointerEnter={() => setHot(i)} onPointerDown={() => setHot(i)}>
                <rect x={X(i) - slot / 2} y={PAD.t} width={slot} height={ih} fill="transparent" />
                {h ? <path className={"pf-bar" + (c.muted ? " pf-bar--muted" : "") + (hot === i ? " is-hot" : "")} d={barPath(X(i) - bw / 2, PAD.t + ih - h, bw, h)} /> : null}
              </g>
            );
          })}
          {goal ? <><line className="pf-goal" x1={PAD.l} x2={w - PAD.r} y1={Y(goal)} y2={Y(goal)} /><text className="pf-goal__label" x={PAD.l + 6} y={Y(goal) - 5}>{goalLabel || "meta"}</text></> : null}
          {ticks.map((i) => <text key={i} className="pf-axis" x={X(i)} y={height - 6} textAnchor="middle">{cols[i].x}</text>)}
        </svg>
      ) : null}
      {hp ? <Tip x={X(hot!)} w={w}>{hp.tip}</Tip> : null}
    </div>
  );
}

function Tip({ x, w, children }: { x: number; w: number; children: ReactNode }) {
  const edge = x < 90 ? "start" : x > w - 90 ? "end" : undefined;
  return <div className="pf-tip" role="status" data-edge={edge} style={{ left: x }}>{children}</div>;
}

/** barra com 4px de raio só no topo (a base fica presa ao eixo) */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
}

/** quais rótulos do eixo x mostrar para não colidirem (cerca de um a cada 56px) */
function labelTicks(n: number, iw: number) {
  if (!n) return [];
  const max = Math.max(2, Math.floor(iw / 56)), step = Math.max(1, Math.ceil(n / max));
  const out: number[] = [];
  for (let i = 0; i < n; i += step) out.push(i);
  // o último (hoje) sempre aparece; o anterior sai se ficar colado nele
  if (out[out.length - 1] !== n - 1) { if (n - 1 - out[out.length - 1] < step * 0.8) out.pop(); out.push(n - 1); }
  return out;
}

function niceTop(max: number) {
  const p = Math.pow(10, Math.floor(Math.log10(max))), m = max / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
