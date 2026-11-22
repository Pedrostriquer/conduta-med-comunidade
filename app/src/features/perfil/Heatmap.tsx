/* Atividade no estilo do GitHub: uma célula por dia, mais escura quanto mais questões.
   O tom mais escuro é meta batida. Passe o dedo (ou o mouse) pela grade para ver cada dia.
   No perfil de outra pessoa não há meta nem acerto: sem `goal` a escala sai da própria atividade e sem `correct` o dia mostra só a quantidade. */
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, cap, fromKey, longDate, monthShort, num, today } from "../../lib/format";
import type { DayKey } from "../../lib/format";
import { haptic } from "../../lib/motion";

const CELL = 12, GAP = 3, LABEL = 26;

/** sem meta, o tom mais escuro é um dia entre os 10% mais cheios da pessoa */
function goalFrom(activity: Map<DayKey, number>) {
  const xs = [...activity.values()].filter(Boolean).sort((a, b) => a - b);
  return xs.length ? Math.max(4, xs[Math.floor(xs.length * 0.9)]) : 10;
}

export function Heatmap({ activity, correct, goal: goalProp, unit = ["questão", "questões"], maxWeeks = 53 }: { activity: Map<DayKey, number>; correct?: Map<DayKey, number>; goal?: number; unit?: [string, string]; maxWeeks?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [weeks, setWeeks] = useState(26);
  const [hot, setHot] = useState<DayKey | null>(null);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setWeeks(Math.max(10, Math.min(maxWeeks, Math.floor((el.clientWidth - LABEL) / (CELL + GAP))))));
    ro.observe(el); return () => ro.disconnect();
  }, [maxWeeks]);
  const t = today();
  const goal = useMemo(() => goalProp ?? goalFrom(activity), [goalProp, activity]);
  const { cols, months } = useMemo(() => {
    const wd = (fromKey(t).getDay() + 6) % 7, lastMonday = addDays(t, -wd), first = addDays(lastMonday, -(weeks - 1) * 7);
    const cols: DayKey[][] = [], months: { i: number; label: string }[] = [];
    for (let w = 0; w < weeks; w++) {
      const col = Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d));
      cols.push(col);
      const m = fromKey(col[0]).getMonth();
      if (w === 0 || fromKey(cols[w - 1][0]).getMonth() !== m) {
        // dois rótulos colados não cabem: o mês que só aparece numa ponta perde o nome
        if (months.length && w - months[months.length - 1].i < 3) months.pop();
        months.push({ i: w, label: monthShort(m) });
      }
    }
    return { cols, months };
  }, [weeks, t]);
  const level = (n: number) => (!n ? 0 : n >= goal ? 4 : n >= goal * 0.6 ? 3 : n >= goal * 0.25 ? 2 : 1);
  const total = cols.flat().reduce((s, k) => s + (k <= t ? activity.get(k) || 0 : 0), 0);
  const studied = cols.flat().filter((k) => (activity.get(k) || 0) > 0).length;

  const at = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const w = Math.floor(x / (CELL + GAP)), d = Math.floor(y / (CELL + GAP));
    const k = cols[w]?.[d];
    if (k && k <= t && k !== hot) { setHot(k); if (e.pointerType === "touch") haptic("tick"); }
  };
  const hw = hot ? cols.findIndex((c) => c.includes(hot)) : -1, hd = hot ? cols[hw].indexOf(hot) : -1;
  const n = hot ? activity.get(hot) || 0 : 0, ok = hot ? correct?.get(hot) || 0 : 0;
  const key = (e: React.KeyboardEvent) => {
    const step = ({ ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 } as Record<string, number>)[e.key];
    if (!step) return;
    e.preventDefault();
    const nk = addDays(hot || t, step);
    if (nk <= t && nk >= cols[0][0]) setHot(nk);
  };
  return (
    <div className="heat" ref={wrap}>
      <div className="heat__sum"><b className="num">{num(total)}</b> {total === 1 ? unit[0] : unit[1]} em <b className="num">{studied}</b> {studied === 1 ? "dia" : "dias"}, nos últimos {weeks >= 52 ? "12 meses" : `${Math.round(weeks / 4.3)} meses`}</div>
      <div className="heat__body">
        <div className="heat__wd" aria-hidden><span /><span>seg</span><span /><span>qua</span><span /><span>sex</span><span /></div>
        <div className="heat__main">
          <div className="heat__months" aria-hidden style={{ width: weeks * (CELL + GAP) }}>{months.map((m) => <span key={m.i} style={{ left: m.i * (CELL + GAP) }}>{m.label}</span>)}</div>
          <div className="heat__grid" role="grid" tabIndex={0} aria-label="Atividade por dia. Use as setas para ver cada dia." onKeyDown={key}
            onPointerMove={at} onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); at(e); }} onPointerLeave={(e) => e.pointerType !== "touch" && setHot(null)}
            onBlur={() => setHot(null)} style={{ gridTemplateColumns: `repeat(${weeks}, ${CELL}px)` }}>
            {cols.map((col, w) => (
              <div key={w} className="heat__col" role="row">
                {col.map((k) => <i key={k} role="gridcell" className="heat__cell" data-l={k > t ? "x" : level(activity.get(k) || 0)} data-hot={k === hot ? "" : undefined} aria-label={`${longDate(k)}: ${num(activity.get(k) || 0)} ${unit[1]}`} />)}
              </div>
            ))}
            {hot ? (
              <div className="heat__tip" role="status" style={{ left: hw * (CELL + GAP) + CELL / 2, top: hd * (CELL + GAP) }} data-edge={hw < 6 ? "start" : hw > weeks - 7 ? "end" : undefined}>
                <b>{n ? `${num(n)} ${n === 1 ? unit[0] : unit[1]}` : "Sem estudo"}</b>
                {n && correct ? <span>{Math.round((ok / n) * 100)}% de acerto</span> : null}
                <span>{cap(longDate(hot))}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="heat__legend" aria-hidden>
        <span>Menos</span>{[0, 1, 2, 3, 4].map((l) => <i key={l} className="heat__cell" data-l={l} />)}<span>Mais</span>
        {goalProp != null ? <span className="heat__goal">o mais escuro é a meta do dia ({num(goalProp)})</span> : null}
      </div>
    </div>
  );
}
