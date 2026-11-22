/* Cronograma: contagem até a prova, a faixa com todos os dias até lá, a semana (ou o mês) e as tarefas do dia escolhido.
   Se algo fica para trás, o plano mostra como recuperar sem mudar a data. "Ajustar" abre o editor completo. */
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useBank } from "../../data/bank";
import type { PlanDay } from "../../data/plan";
import { buildSchedule, planImpact, planStatus, PHASES, simDoneOn } from "../../data/plan";
import { useStore } from "../../state/store";
import { useStats } from "../../state/stats";
import { useGoals, usePlanPrefs, useStreak } from "../../state/goals";
import { Page, Section } from "../../app/Page";
import { Button, SegmentedControl } from "../../ds/basics";
import { Meter, ProgressRing } from "../../ds/progress";
import { Icon } from "../../ds/Icon";
import { addDays, cap, duration, fromKey, longDate, num, plural, shortDate, today, weekdayName, weekdayShort } from "../../lib/format";
import type { DayKey } from "../../lib/format";
import { cx } from "../../lib/cx";
import { Behind } from "./Behind";
import { DayEvents, EventSheet } from "./Events";
import { Month } from "./Calendar";
import { PlanEditor } from "./PlanEditor";
import { DayNote, StreakGrid, TaskList, UntilExam, useDayTasks, WeekBoard, nextMilestoneText } from "./parts";
import { SimuladoSetup } from "../simulados/SimuladoSetup";

function Empty() {
  const nav = useNavigate();
  return (
    <Page title="Cronograma" subtitle="Um plano que leva até a data da prova.">
      <section className="panel plan-empty">
        <span className="plan-empty__icon" aria-hidden><Icon name="calendar" size={28} /></span>
        <h2>Diga a prova e a data</h2>
        <p>O cronograma divide os temas pelo que mais cai nas suas bancas, marca os simulados, encaixa os flashcards e ajusta o ritmo se um dia ficar para trás.</p>
        <Button variant="filled" size="lg" onClick={() => nav("/cronograma/novo")}>Montar cronograma</Button>
      </section>
    </Page>
  );
}

export function CronogramaPage() {
  const [sp] = useSearchParams();
  const plan = useStore((s) => s.plan);
  if (!plan) return <Empty />;
  if (sp.get("ajustar") === "1") return <PlanEditor />;
  return <PlanView />;
}

function PlanView() {
  const nav = useNavigate();
  const bank = useBank()!;
  const st = useStats(bank);
  const plan = useStore((s) => s.plan)!, sessions = useStore((s) => s.sessions);
  const prefs = usePlanPrefs(plan);
  const cardGoals = useGoals((s) => s.cardGoals);
  const t = today();
  const [view, setView] = useState<"semana" | "mes">("semana");
  const [sel, setSel] = useState<DayKey>(t);
  const [weekOff, setWeekOff] = useState(0);
  const [monthKey, setMonthKey] = useState(0);
  const [sim, setSim] = useState<PlanDay | null>(null);
  const eventos = useGoals((s) => s.eventos), regras = useGoals((s) => s.regras);
  const [marking, setMarking] = useState(false);
  const { days, byKey, ps, impact } = useMemo(() => {
    const days = buildSchedule(plan, bank, st, prefs, cardGoals, eventos, regras);
    return { days, byKey: new Map(days.map((d) => [d.key, d])), ps: planStatus(plan, days, st, sessions), impact: planImpact(days, prefs) };
  }, [plan, bank, st, sessions, prefs, cardGoals, eventos, regras]);
  const streak = useStreak(bank, ps.todayPlan?.kind === "estudo" ? ps.todayPlan.target : plan.meta);
  const day = byKey.get(sel) || null;
  const onSim = useCallback((d: PlanDay) => setSim(d), []);
  const tasks = useDayTasks(day, sel, st, bank, onSim, plan);
  const wd = (fromKey(t).getDay() + 6) % 7, monday = addDays(t, -wd + weekOff * 7);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const sims = days.filter((d) => d.kind === "simulado");
  const pickDay = (k: DayKey) => {
    setSel(k);
    // leva a semana (ou o mês) até o dia escolhido na faixa
    const mk = (fromKey(k).getDay() + 6) % 7, mon = addDays(k, -mk);
    setWeekOff(Math.round((fromKey(mon).getTime() - fromKey(addDays(t, -wd)).getTime()) / (7 * 86400000)));
    setMonthKey((x) => x + 1);
  };
  const phaseNow = PHASES[ps.phase];
  const weekLabel = weekOff === 0 ? "Esta semana" : weekOff === 1 ? "Próxima semana" : weekOff === -1 ? "Semana passada" : `${shortDate(week[0])} – ${shortDate(week[6])}`;

  return (
    <Page title="Cronograma" subtitle={`${plan.exame} · ${cap(longDate(plan.data, true))}`}
      actions={<Button variant="tinted" size="sm" icon="sliders" onClick={() => nav("/cronograma?ajustar=1")}>Ajustar</Button>}>
      <div className="cols cols--plan">
        <div className="cols__main">
          <section className="cd-plan__hero plan-hero" aria-label="Contagem regressiva">
            <div>
              <div className="cd-plan__eyebrow">{plan.exame}{prefs.bancas.length ? ` + ${prefs.bancas.join(", ")}` : ""}</div>
              <div className="cd-plan__count num">{Math.max(0, ps.daysLeft)}<small>{ps.daysLeft === 1 ? "dia" : "dias"}</small></div>
              <div className="cd-plan__date">{ps.daysLeft > 0 ? `até ${weekdayName(fromKey(plan.data).getDay())}, ${shortDate(plan.data)}` : ps.daysLeft === 0 ? "É hoje. Boa prova." : "A prova já passou"}</div>
              <div className="plan-hero__status">
                {!ps.behind && !ps.missedSims.length ? <span className="pill pill--ok"><Icon name="check" size={14} strokeWidth={2.25} />Em dia</span> : null}
                <span className="pill num">≈ {num(impact.avgQ)} questões/dia</span>
                {impact.cards ? <span className="pill num">{num(impact.cards)} cards/dia</span> : null}
                <span className="pill num">≈ {duration(impact.avgMin * 60)} por dia</span>
                <span className="pill">{phaseNow.name}</span>
              </div>
            </div>
            <ProgressRing value={ps.progress} size={104} caption="do plano" label={`${Math.round(ps.progress * 100)}% do plano concluído`} />
          </section>

          <Behind plan={plan} days={days} ps={ps} bank={bank} />

          <UntilExam days={days} plan={plan} sessions={sessions} sel={sel} onPick={pickDay} />

          <Section title={view === "semana" ? weekLabel : "Mês"} action={
            <div className="plan-viewbar">
              {view === "semana" ? (
                <div className="plan-weeknav">
                  <Button variant="plain" size="sm" icon="chevron-left" label="Semana anterior" onClick={() => setWeekOff(weekOff - 1)} />
                  {weekOff ? <Button variant="plain" size="sm" onClick={() => { setWeekOff(0); setSel(t); }}>Hoje</Button> : null}
                  <Button variant="plain" size="sm" icon="chevron-right" label="Próxima semana" onClick={() => setWeekOff(weekOff + 1)} />
                </div>
              ) : null}
              <SegmentedControl size="sm" aria-label="Visualização" value={view} onChange={setView} options={[{ value: "semana", label: "Semana" }, { value: "mes", label: "Mês" }]} />
            </div>
          }>
            {view === "semana" ? (
              <WeekBoard week={week} byKey={byKey} st={st} sessions={sessions} sel={sel} onSel={setSel} prefs={prefs} bank={bank} />
            ) : (
              <div className="panel month-card month-card--plan">
                <Month key={monthKey} value={sel} onPick={setSel} min={plan.inicio} max={plan.data} initial={sel} label="Cronograma do mês"
                  render={(k) => {
                    const d = byKey.get(k); if (!d) return null;
                    const did = st.activity.get(k) || 0;
                    const ph = `ph-${d.phase}`;
                    if (d.kind === "prova") return { node: <span className="mday__tag is-exam"><Icon name="flag" size={11} filled />Prova</span>, className: "is-examday", aria: `${longDate(k)}: prova` };
                    if (d.kind === "vespera") return { node: <span className="mday__tag">véspera</span>, className: "is-rest", aria: `${longDate(k)}: véspera` };
                    if (d.kind === "simulado") return { node: <span className={cx("mday__tag is-sim", simDoneOn(sessions, k) && "is-ok")}>simulado</span>, className: ph, aria: `${longDate(k)}: simulado` };
                    if (d.kind !== "estudo") return { node: <span className="mday__tag">{d.pausa ? d.pausa.toLowerCase() : "folga"}</span>, className: "is-rest", aria: `${longDate(k)}: ${d.pausa || "folga"}` };
                    if (d.onlyCards) return { node: <span className="mday__tag">{(d.evento || "plantão").toLowerCase()}</span>, className: cx(ph, "is-light"), aria: `${longDate(k)}: ${d.evento || "plantão"}, só flashcards` };
                    const p = Math.min(1, did / Math.max(1, d.target));
                    return {
                      node: <><span className="mday__tag num">{k <= t ? `${Math.min(did, d.target)}/${d.target}` : d.target}{d.evento ? ` · ${d.evento.toLowerCase()}` : d.light ? " · plantão" : ""}</span><i className="mday__bar"><b style={{ transform: `scaleX(${k <= t ? p : 0})` }} /></i></>,
                      className: cx(ph, k < t && p < 1 && "is-short", d.light && "is-light"), aria: `${longDate(k)}: ${did} de ${d.target} questões`,
                    };
                  }} />
                <div className="month-legend">
                  {PHASES.map((p) => <span key={p.id}><i className={`ph-dot ph-${p.id}`} />{p.name}</span>)}
                  <span><i className="ph-dot is-sim" />Simulado</span>
                </div>
              </div>
            )}
          </Section>
        </div>

        <aside className="cols__aside">
          <AnimatePresence mode="wait" initial={false}>
            <motion.section key={sel} className="cd-tasks day-tasks" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} aria-label={`Tarefas de ${longDate(sel)}`}>
              <div className="cd-tasks__head"><h3>{sel === t ? "Hoje" : cap(longDate(sel))}</h3>{day?.phase != null && day.kind !== "prova" ? <span>{PHASES[day.phase].name}{day.minutes ? ` · ≈ ${duration(day.minutes * 60)}` : ""}</span> : null}</div>
              {day?.evento || day?.pausa ? <p className="day-tasks__ev"><Icon name="calendar" size={15} />{day.evento || day.pausa}{day.onlyCards ? " · só flashcards" : day.light ? " · dia leve" : ""}</p> : null}
              {day && (day.kind === "estudo" || day.kind === "simulado") ? <TaskList tasks={tasks} empty={day.onlyCards ? "Sem questões neste dia." : undefined} /> : <DayNote day={day} did={st.activity.get(sel) || 0} />}
              <DayEvents day={sel} onAdd={() => setMarking(true)} />
            </motion.section>
          </AnimatePresence>

          <section className="panel goals" aria-label="Metas da semana">
            <h2 className="sec__title">Metas da semana</h2>
            <Meter label="Questões" value={ps.weekDone} max={Math.max(1, ps.weekTarget)} tone={ps.weekDone >= ps.weekTarget ? "success" : undefined} />
            {ps.weekSims ? <Meter label="Simulados" value={ps.weekSimsDone} max={ps.weekSims} tone={ps.weekSimsDone >= ps.weekSims ? "success" : undefined} /> : null}
            <p className="goals__note">
              {prefs.ritmo === "meta" ? plural(plan.meta, "questão", "questões") + " por dia" : prefs.ritmo === "horas" ? "Questões pelas horas de cada dia" : "Questões por dia da semana"}, {plan.dias.length === 7 ? "todos os dias" : plan.dias.map((d) => weekdayShort(d)).join(", ")}
              {prefs.plantoes.length ? ` · plantão ${prefs.plantoes.map((d) => weekdayShort(d)).join(", ")}` : ""}
              {plan.simulado.freq !== "nenhum" ? ` · simulado ${plan.simulado.freq === "semanal" ? "toda" : "a cada duas semanas, na"} ${weekdayName(plan.simulado.dia)}` : ""}. {plural(sims.length, "simulado", "simulados")} até a prova.
            </p>
          </section>

          <button type="button" className="panel panel--tap plan-streak" onClick={() => nav("/cronograma/metas")}>
            <div className="plan-streak__top">
              <span className="plan-streak__n num">{streak.current}</span>
              <span className="plan-streak__l">{streak.current === 1 ? "dia seguido" : "dias seguidos"}<small>{nextMilestoneText(streak.current, streak.next)}</small></span>
              <Icon name="chevron-right" size={18} className="row__chev" />
            </div>
            <StreakGrid grid={streak.grid} compact />
          </button>
        </aside>
      </div>
      <SimuladoSetup exam={sim?.exam ? bank.examById[sim.exam] : null} open={!!sim} onClose={() => setSim(null)} planDay={sim?.key} formato={sim?.formato} />
      <EventSheet open={marking} onClose={() => setMarking(false)} initial={sel} min={t} max={plan.data} />
    </Page>
  );
}
