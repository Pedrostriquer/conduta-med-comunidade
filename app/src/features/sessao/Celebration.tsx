/* Meta do dia batida: o traçado de ECG corre e termina num ✓ (a única mola com quique fora do acerto). */
import { motion } from "motion/react";
import { spring } from "../../lib/motion";
import { num } from "../../lib/format";

export function DayGoal({ done, goal, streak }: { done: number; goal: number; streak: number }) {
  return (
    <motion.section className="goalhit" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
      <svg className="goalhit__ecg" viewBox="0 0 220 44" aria-hidden>
        <path className="goalhit__line" pathLength={1} d="M2 26 H48 C52 26 53 20 57 20 C61 20 62 26 66 26 H74 L77 30 L83 6 L89 38 L93 26 H110 C114 26 116 17 121 17 C126 17 128 26 132 26 H150" />
      </svg>
      <motion.span className="goalhit__mark" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring.bouncy, delay: 0.75 }} aria-hidden>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path className="goalhit__check" pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </motion.span>
      <div className="goalhit__text">
        <h2>Meta do dia batida</h2>
        <p><span className="num">{num(done)}</span> de {num(goal)} questões hoje{streak > 1 ? <> · <span className="num">{streak}</span> dias seguidos</> : null}</p>
      </div>
    </motion.section>
  );
}
