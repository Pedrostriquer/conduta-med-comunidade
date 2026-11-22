/* Quando um dia fica para trás: mostra quanto ficou e o que acontece em cada escolha antes de escolher. */
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Bank } from "../../data/bank";
import type { PlanDay, PlanStatus } from "../../data/plan";
import { redistribution, yesterday } from "../../data/plan";
import { useStore } from "../../state/store";
import type { Plan } from "../../state/store";
import { Button } from "../../ds/basics";
import { Sheet, useToast } from "../../ds/overlay";
import { Icon } from "../../ds/Icon";
import { num, plural, relativeDay, weekday } from "../../lib/format";
import { spring } from "../../lib/motion";
import { SimuladoSetup } from "../simulados/SimuladoSetup";

type Choice = "espalhar" | "hoje" | "ignorar";

export function Behind({ plan, days, ps, bank, compact, bare, onDone }: { plan: Plan; days: PlanDay[]; ps: PlanStatus; bank: Bank; compact?: boolean; bare?: boolean; onDone?: () => void }) {
  const patch = useStore((s) => s.patchPlan);
  const toast = useToast();
  const [pick, setPick] = useState<Choice>("espalhar");
  const [sim, setSim] = useState<PlanDay | null>(null);
  const [sheet, setSheet] = useState(false);
  const red = useMemo(() => redistribution(plan, days, ps.behind), [plan, days, ps.behind]);
  if (!ps.behind && !ps.missedSims.length) return null;
  const todayTarget = ps.todayPlan?.kind === "estudo" ? ps.todayPlan.target : 0;
  const apply = () => {
    const y = yesterday();
    if (pick === "espalhar") { patch({ ajustes: red.ajustes, resolvidoAte: y }); toast({ text: `Pronto: ${num(red.perDay)} questões por dia até a prova.`, icon: "check" }); }
    if (pick === "hoje") { const k = ps.todayPlan?.key; if (k) patch({ ajustes: { ...plan.ajustes, [k]: (plan.ajustes[k] || 0) + ps.behind }, resolvidoAte: y }); toast({ text: `Hoje ficou com ${num(todayTarget + ps.behind)} questões.`, icon: "check" }); }
    if (pick === "ignorar") { patch({ resolvidoAte: y }); toast({ text: "O plano segue como estava.", icon: "check" }); }
    onDone?.();
  };
  const ms = ps.missedSims[ps.missedSims.length - 1];
  if (compact && ps.behind) {
    return (
      <motion.section className="behind behind--compact" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} aria-label="O que ficou para trás">
        <span className="behind__icon" aria-hidden><Icon name="clock" size={18} /></span>
        <div className="behind__text">
          <h3 className="behind__title">{plural(ps.behind, "questão ficou", "questões ficaram")} para trás</h3>
          <p className="behind__sub">Espalhando até a prova, ficam <b className="num">{num(red.perDay)}</b> por dia.</p>
        </div>
        <Button variant="tinted" size="sm" onClick={() => setSheet(true)}>Resolver</Button>
        <Sheet open={sheet} onClose={() => setSheet(false)} title={`${plural(ps.behind, "questão ficou", "questões ficaram")} para trás`} subtitle="Escolha como recuperar. A data da prova não muda." width={480}>
          <Behind plan={plan} days={days} ps={ps} bank={bank} bare onDone={() => setSheet(false)} />
        </Sheet>
      </motion.section>
    );
  }
  return (
    <motion.section className={bare ? "behind behind--bare" : "behind"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} aria-label="O que ficou para trás">
      {ps.behind ? (
        <>
          {bare ? null : <div className="behind__head">
            <span className="behind__icon" aria-hidden><Icon name="clock" size={18} /></span>
            <div>
              <h3 className="behind__title">{plural(ps.behind, "questão ficou", "questões ficaram")} para trás</h3>
              <p className="behind__sub">Escolha como recuperar. A data da prova não muda.</p>
            </div>
          </div>}
          <div className="behind__opts" role="radiogroup" aria-label="Como recuperar">
            {([
              ["espalhar", "Espalhar até a prova", <><b className="num">{num(red.perDay)}</b> por dia em vez de {num(plan.meta)}{red.overflow ? <> · {plural(red.overflow, "questão passa", "questões passam")} do teto e fica{red.overflow === 1 ? "" : "m"} de fora</> : null}</>],
              ["hoje", "Somar a hoje", <>Hoje vira <b className="num">{num(todayTarget + ps.behind)}</b> questões</>],
              ["ignorar", "Deixar para lá", <>O plano segue com {num(plan.meta)} por dia</>],
            ] as [Choice, string, React.ReactNode][]).filter(([k]) => k !== "hoje" || ps.todayPlan?.kind === "estudo").map(([k, t, d]) => (
              <button key={k} type="button" role="radio" aria-checked={pick === k} className="behind__opt cd-hoverable" onClick={() => setPick(k)}>
                <span className="behind__dot" aria-hidden />
                <span className="behind__opt-t">{t}</span>
                <AnimatePresence initial={false}>
                  {pick === k ? <motion.span className="behind__opt-d" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>{d}</motion.span> : null}
                </AnimatePresence>
              </button>
            ))}
          </div>
          <div className="behind__actions"><Button variant="filled" onClick={apply}>{pick === "espalhar" ? "Espalhar" : pick === "hoje" ? "Somar a hoje" : "Deixar para lá"}</Button></div>
        </>
      ) : null}
      {ms ? (
        <div className="behind__sim">
          <Icon name="exam" size={18} />
          <span>O simulado de {weekday(ms.key)} ({relativeDay(ms.key)}) não foi feito.</span>
          <Button variant="tinted" size="sm" onClick={() => setSim(ms)}>Fazer agora</Button>
          {!ps.behind ? <Button variant="plain" size="sm" onClick={() => patch({ resolvidoAte: yesterday() })}>Pular</Button> : null}
        </div>
      ) : null}
      <SimuladoSetup exam={sim?.exam ? bank.examById[sim.exam] : null} open={!!sim} onClose={() => setSim(null)} planDay={sim?.key} formato={sim?.formato} />
    </motion.section>
  );
}
