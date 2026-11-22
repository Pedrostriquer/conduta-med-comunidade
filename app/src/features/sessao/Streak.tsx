/* Sequência de acertos como um monitor: cada acerto desenha um complexo (P-QRS) no traçado e o próximo marco aparece
   ao lado ("faltam 2 para 10"). No erro a linha volta ao basal, sem som nem vermelho. Marcos 5/10/20… com uma mola curta. */
import { motion } from "motion/react";
import { spring } from "../../lib/motion";
import { cx } from "../../lib/cx";
import { num } from "../../lib/format";

export const MILESTONES = [5, 10, 20, 30, 50, 75, 100];
export const nextMilestone = (n: number) => MILESTONES.find((m) => m > n) ?? Math.ceil((n + 1) / 50) * 50;
export const isMilestone = (n: number) => MILESTONES.includes(n) || (n > 100 && n % 50 === 0);

const W = 260, H = 30, B = 20, STEP = 19, MAX = 12;

/** o traçado: basal com um complexo por acerto, os mais novos à direita */
function tracePath(n: number) {
  const k = Math.min(n, MAX);
  let d = `M0 ${B}`;
  for (let i = 0; i < k; i++) {
    const x = W - 22 - (k - 1 - i) * STEP;
    d += ` L${x} ${B} q2.2 -3.4 4.4 0 l2.2 0 l1.4 2.2 l2.6 -16 l2.8 19.5 l1.6 -5.7 l1.6 0 q2.4 -2.6 4.8 0`;
  }
  return d + ` L${W} ${B}`;
}

export function StreakTrace({ n, answered }: { n: number; answered: number }) {
  const m = nextMilestone(n), peak = n > 0 && isMilestone(n);
  return (
    <div className={cx("ecgbar", n > 0 && "is-live", peak && "is-peak")} aria-live="polite">
      <div className="ecgbar__in">
        <svg className="ecgbar__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          <path key={n} className="ecgbar__line" pathLength={1} d={tracePath(n)} />
          {n > 0 ? <circle key={"b" + n} className="ecgbar__blip" cx={W - 3} cy={B} r={2.6} /> : null}
        </svg>
        <span className="ecgbar__label">
          {n === 0 ? (answered ? <span className="ecgbar__muted">Linha de base · recomece a sequência</span> : <span className="ecgbar__muted">Acerte em sequência</span>)
            : peak ? (
              <motion.b key={"p" + n} className="ecgbar__peak num" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy}>{num(n)} seguidas</motion.b>
            ) : (
              <><motion.b key={n} className="num" initial={{ y: 5, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring.snappy}>{num(n)}</motion.b> {n === 1 ? "acerto" : "seguidas"}<span className="ecgbar__next"> · faltam {num(m - n)} para {num(m)}</span></>
            )}
        </span>
      </div>
    </div>
  );
}
