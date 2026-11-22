/* Calendário do mês: para escolher a data da prova e para ver o cronograma por mês. */
import { useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "../../ds/basics";
import { addDays, cap, dayKey, fromKey, monthName, today, weekdayShort } from "../../lib/format";
import type { DayKey } from "../../lib/format";
import { cx } from "../../lib/cx";

export function Month({ value, onPick, min, max, render, initial, label = "Calendário" }: {
  value?: DayKey | null; onPick?: (k: DayKey) => void; min?: DayKey; max?: DayKey;
  /** conteúdo extra de cada dia (status do cronograma) */
  render?: (k: DayKey) => { node?: ReactNode; className?: string; aria?: string } | null;
  initial?: DayKey; label?: string;
}) {
  const start = fromKey(initial || value || today());
  const [ym, setYm] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const [dir, setDir] = useState(1);
  const first = new Date(ym.y, ym.m, 1), lead = (first.getDay() + 6) % 7, days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (DayKey | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => dayKey(new Date(ym.y, ym.m, i + 1)))];
  const shift = (d: number) => { setDir(d); setYm(({ y, m }) => { const x = new Date(y, m + d, 1); return { y: x.getFullYear(), m: x.getMonth() }; }); };
  const t = today();
  const canPrev = !min || dayKey(new Date(ym.y, ym.m, 0)) >= min;
  const canNext = !max || dayKey(new Date(ym.y, ym.m + 1, 1)) <= max;
  return (
    <div className="month" aria-label={label}>
      <div className="month__head">
        <Button variant="plain" size="sm" icon="chevron-left" label="Mês anterior" disabled={!canPrev} onClick={() => shift(-1)} />
        <span className="month__title">{cap(monthName(ym.m))} de {ym.y}</span>
        <Button variant="plain" size="sm" icon="chevron-right" label="Próximo mês" disabled={!canNext} onClick={() => shift(1)} />
      </div>
      <div className="month__wd" aria-hidden>{[1, 2, 3, 4, 5, 6, 0].map((i) => <span key={i}>{weekdayShort(i)}</span>)}</div>
      <div className="month__clip">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={ym.y + "-" + ym.m} className="month__grid" role="grid" custom={dir}
            initial={{ opacity: 0, x: dir * 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -28 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
            {cells.map((k, i) => {
              if (!k) return <span key={"e" + i} />;
              const dis = (min && k < min) || (max && k > max);
              const extra = render?.(k);
              const d = fromKey(k).getDate();
              const cls = cx("mday", k === t && "is-today", value === k && "is-picked", dis && "is-off", extra?.className);
              return onPick ? (
                <button key={k} type="button" role="gridcell" className={cls} disabled={!!dis} aria-pressed={value === k} aria-label={extra?.aria || k} onClick={() => onPick(k)}>
                  <span className="mday__n num">{d}</span>{extra?.node}
                </button>
              ) : (
                <div key={k} role="gridcell" className={cls} aria-label={extra?.aria}><span className="mday__n num">{d}</span>{extra?.node}</div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export const nextDays = (n: number) => addDays(today(), n);
