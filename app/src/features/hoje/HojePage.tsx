/* Hoje: à esquerda, o que fazer agora e a lista do dia (que se fecha com "Fechar o dia"); à direita, a meta,
   a sequência e o ritmo dos últimos dias. Para quem está começando, três primeiros passos. Uma ação principal por vez. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useBank } from "../../data/bank";
import type { PlanDay } from "../../data/plan";
import { buildSchedule, planStatus } from "../../data/plan";
import { useStore } from "../../state/store";
import type { Session } from "../../state/store";
import { useStats } from "../../state/stats";
import { MILESTONES, useCardsByDay, useDayProgress, useGoals, useStreak } from "../../state/goals";
import { Page, Section } from "../../app/Page";
import { Counter, ProgressRing } from "../../ds/progress";
import { Rhythm } from "../../ds/medical";
import { Button } from "../../ds/basics";
import { useToast } from "../../ds/overlay";
import { AREA_ICON, Icon } from "../../ds/Icon";
import { addDays, cap, clock, duration, joinList, longDate, num, plural, today } from "../../lib/format";
import { haptic, spring } from "../../lib/motion";
import { cx } from "../../lib/cx";
import { Behind } from "../cronograma/Behind";
import { MilestoneNote, nextMilestoneText, StreakGrid, TaskList, useDayTasks } from "../cronograma/parts";
import { SimuladoSetup } from "../simulados/SimuladoSetup";
import { startDaily, startPlanDay, topicName } from "../sessao/start";
import { useDecks } from "../flashcards/decks";
import { apiGet } from "../../api/client";
import type { PluginStatus } from "../../api/types";

function greeting(nome: string) {
  const h = new Date().getHours();
  const g = h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  return nome ? `${g}, ${nome.split(" ")[0]}` : g;
}

function Continue({ s }: { s: Session }) {
  const nav = useNavigate();
  const done = Object.values(s.answers).filter((a) => (s.feedback === "imediato" ? a.checked : a.choice)).length;
  const left = s.limitSec ? Math.max(0, s.limitSec - s.elapsedMs / 1000) : null;
  return (
    <button type="button" className="panel panel--tap now" onClick={() => nav("/sessao/" + s.id)}>
      <div className="now__eyebrow"><Icon name={s.kind === "simulado" ? "exam" : "questions"} size={16} />{s.kind === "simulado" ? "Simulado em andamento" : "Lista em andamento"}</div>
      <div className="now__title">{s.title}</div>
      <div className="now__meta num">{num(done)} de {num(s.qids.length)} respondidas{left != null ? ` · ${clock(left)} restantes` : ""}</div>
      <div className="now__bar" aria-hidden><i style={{ transform: `scaleX(${done / s.qids.length})` }} /></div>
      <span className="cd-btn cd-btn--filled now__cta">Continuar<Icon name="chevron-right" size={18} /></span>
    </button>
  );
}

/** os três primeiros passos de quem está começando; somem quando tudo foi feito (ou ao dispensar) */
function FirstSteps({ hasAttempts, hasCards, hasSim, onList }: { hasAttempts: boolean; hasCards: boolean; hasSim: boolean; onList: () => void }) {
  const nav = useNavigate();
  const dismiss = useGoals((s) => s.dismissSteps);
  // a IA já foi usada alguma vez? (uma consulta só, ao abrir)
  const [aiUsed, setAiUsed] = useState(false);
  useEffect(() => { apiGet<PluginStatus>("/plugin/status").then((s) => setAiUsed(!!s.lastUsedAt || s.connections.length > 0)).catch(() => {}); }, []);
  const steps = [
    { ok: hasAttempts, title: "Resolver o primeiro bloco", sub: "10 questões, com a correção em vídeo no minuto da questão", label: "Começar", run: onList },
    { ok: hasCards, title: "Revisar o primeiro flashcard", sub: "Importe do Anki ou crie os seus", label: "Flashcards", run: () => nav("/flashcards") },
    { ok: hasSim, title: "Fazer o primeiro simulado", sub: "Uma prova real, no tempo da prova", label: "Simulados", run: () => nav("/simulados") },
    { ok: aiUsed, title: "Conectar a sua IA", sub: "Claude ou ChatGPT: ela acha padrões nos seus erros e ensina a usar tudo aqui", label: "Conectar", run: () => nav("/plugin") },
  ];
  const n = steps.filter((x) => x.ok).length;
  return (
    <motion.section className="panel firststeps" layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} aria-label="Primeiros passos">
      <header className="firststeps__head">
        <div><h2 className="sec__title">Primeiros passos</h2><p className="pe-note">{n} de {steps.length} feitos</p></div>
        <Button variant="plain" size="sm" onClick={dismiss}>Dispensar</Button>
      </header>
      <ol className="firststeps__list">
        {steps.map((x, i) => (
          <li key={i} data-done={x.ok ? "" : undefined}>
            <span className="firststeps__n" aria-hidden>{x.ok ? <Icon name="check" size={14} strokeWidth={3} /> : i + 1}</span>
            <span className="firststeps__t"><b>{x.title}</b><small>{x.sub}</small></span>
            {!x.ok ? <Button variant="tinted" size="sm" onClick={x.run}>{x.label}</Button> : null}
          </li>
        ))}
      </ol>
    </motion.section>
  );
}

export function HojePage() {
  const nav = useNavigate();
  const toast = useToast();
  const bank = useBank()!;
  const st = useStats(bank);
  const plan = useStore((s) => s.plan), sessions = useStore((s) => s.sessions), settings = useStore((s) => s.settings);
  const { decks } = useDecks();
  const g = useGoals();
  useCardsByDay();
  const [sim, setSim] = useState<PlanDay | null>(null);
  const [closing, setClosing] = useState(false);
  const t = today();

  const { days, ps } = useMemo(() => {
    if (!plan) return { days: null, ps: null };
    const days = buildSchedule(plan, bank, st);
    return { days, ps: planStatus(plan, days, st, sessions) };
  }, [plan, bank, st, sessions, g.cardGoals, g.prefs]); // eslint-disable-line

  const active = useMemo(() => Object.values(sessions).filter((s) => s.status === "ativa" && Object.keys(s.answers).length).sort((a, b) => b.createdAt - a.createdAt)[0], [sessions]);
  const tp = ps?.todayPlan;
  const goal = tp?.kind === "estudo" ? tp.target : plan ? 0 : settings.metaDiaria;
  const cardGoal = Object.entries(g.cardGoals).filter(([id]) => decks.some((d) => d.id === id)).reduce((s, [, n]) => s + n, 0);
  const day = useDayProgress(bank, goal, cardGoal);
  const streak = useStreak(bank, goal || settings.metaDiaria);
  const doneToday = day.questoes;
  const remaining = Math.max(0, goal - doneToday);
  const hit = goal > 0 && doneToday >= goal;
  const rhythm = useMemo(() => Array.from({ length: 14 }, (_, i) => { const k = addDays(t, i - 13); return { key: k, n: st.activity.get(k) || 0 }; }), [st, t]);
  const simDay = tp?.kind === "simulado" && tp.exam ? tp : null;
  const simDone = simDay ? Object.values(sessions).some((s) => s.kind === "simulado" && s.status === "finalizada" && s.planDay === simDay.key) : false;
  const onSim = useCallback((d: PlanDay) => setSim(d), []);
  const tasks = useDayTasks(tp || null, t, st, bank, onSim, plan);
  const fresh = MILESTONES.filter((m) => streak.current >= m.n && !g.marcos[m.n]).pop();
  const hasSim = Object.values(sessions).some((s) => s.kind === "simulado");
  const showSteps = !g.passosOk && !(st.total > 0 && decks.length > 0 && hasSim);

  const startToday = () => {
    const id = tp?.kind === "estudo" ? startPlanDay(tp, remaining || 20) : startDaily(Math.min(40, remaining || 20));
    nav("/sessao/" + id);
  };
  const closeDay = () => {
    if (!day.minimoOk) return;
    setClosing(true); haptic("success");
    g.closeDay(t);
    const n = streak.todayCounts ? streak.current : streak.current + 1;
    toast({ text: `Dia fechado. ${plural(n, "dia seguido", "dias seguidos")}.`, icon: "check" });
    setTimeout(() => setClosing(false), 1400);
  };
  const pending = tasks.filter((x) => !x.done).length;

  return (
    <Page title="Hoje" subtitle={cap(longDate(t))}>
      <AnimatePresence>{fresh ? <MilestoneNote key={fresh.n} m={fresh} onClose={() => g.celebrateMilestone(fresh.n)} /> : null}</AnimatePresence>
      <div className="cols cols--hoje">
        <div className="cols__main">
          {plan && days && ps ? <Behind plan={plan} days={days} ps={ps} bank={bank} compact /> : null}

          <Section title="Agora">
            <div className="stack">
              {active ? <Continue s={active} /> : null}
              {simDay && !simDone && simDay.exam ? (
                <button type="button" className="panel panel--tap now" onClick={() => setSim(simDay)}>
                  <div className="now__eyebrow"><Icon name="exam" size={16} />Simulado do cronograma</div>
                  <div className="now__title">{bank.examById[simDay.exam]?.nome}{simDay.formato === "embaralhada" ? " · embaralhado" : ""}</div>
                  <div className="now__meta">No tempo da prova, com correção ao final</div>
                  <span className="cd-btn cd-btn--filled now__cta">Configurar<Icon name="chevron-right" size={18} /></span>
                </button>
              ) : null}
              {!(simDay && !simDone) ? (
                <button type="button" className={"panel panel--tap now" + (active ? " now--quiet" : "")} onClick={startToday}>
                  <div className="now__eyebrow"><Icon name="questions" size={16} />{plan ? "Questões do dia" : "Lista do dia"}</div>
                  <div className="now__title">
                    {tp?.kind === "estudo" && tp.topics.length ? joinList(tp.topics.map(topicName)) : plan ? "Revisão livre" : "Todas as áreas"}
                  </div>
                  {tp?.kind === "estudo" && tp.topics.length ? (
                    <div className="now__areas">{[...new Set(tp.topics.map((k) => k.split("/")[0]))].map((a) => <Icon key={a} name={AREA_ICON[a]} size={18} />)}</div>
                  ) : null}
                  <div className="now__meta">{hit ? "Meta batida. Quer fazer mais 20?" : `${plural(Math.min(50, remaining || 20), "questão", "questões")} · cerca de ${duration(Math.min(50, remaining || 20) * 150)}`}</div>
                  {!active ? <span className="cd-btn cd-btn--filled now__cta">{doneToday ? "Continuar" : "Começar"}<Icon name="chevron-right" size={18} /></span> : <span className="cd-btn cd-btn--tinted now__cta">Começar</span>}
                </button>
              ) : null}
            </div>
          </Section>

          <Section title="Lista do dia" action={tasks.length ? <span className="sec__aux num">{pending ? `${pending} ${pending === 1 ? "pendente" : "pendentes"}` : "tudo feito"}</span> : undefined}>
            <div className={cx("cd-tasks today-list", closing && "is-closing", day.fechado && "is-closed")}>
              <TaskList tasks={tasks} empty={plan ? "Dia livre no plano." : "Monte um cronograma para a lista do dia aparecer aqui."} />
              <div className="today-list__foot">
                {day.fechado ? (
                  <span className="today-list__closed"><Icon name="check" size={16} strokeWidth={2.5} />Dia fechado{streak.current ? ` · ${plural(streak.current, "dia seguido", "dias seguidos")}` : ""}</span>
                ) : (
                  <span className="today-list__hint">{day.minimoOk ? (day.metaOk ? "Meta cumprida." : "O mínimo já conta para a sequência.") : `Mínimo para o dia contar: ${num(g.minimo.questoes)} questões ou ${num(g.minimo.cards)} cards.`}</span>
                )}
                {!day.fechado ? <Button variant={day.minimoOk ? "filled" : "gray"} size="sm" disabled={!day.minimoOk} onClick={closeDay}>Fechar o dia</Button>
                  : <Button variant="plain" size="sm" onClick={() => g.reopenDay(t)}>Reabrir</Button>}
              </div>
            </div>
          </Section>

          <AnimatePresence>{showSteps ? <FirstSteps hasAttempts={st.total > 0} hasCards={decks.length > 0} hasSim={hasSim} onList={() => nav("/sessao/" + startDaily(10))} /> : null}</AnimatePresence>

          {!plan ? (
            <button type="button" className="panel panel--tap plancta" onClick={() => nav("/cronograma/novo")}>
              <span className="plancta__icon" aria-hidden><Icon name="calendar" size={22} /></span>
              <span><span className="plancta__title">Monte seu cronograma</span><span className="plancta__sub">Diga a prova e a data. O plano diz quantas questões e cards fazer por dia e quando fazer simulado.</span></span>
              <Icon name="chevron-right" size={20} className="row__chev" />
            </button>
          ) : null}

          <Section title="Estudar do seu jeito">
            <div className="shortcuts shortcuts--4">
              <button type="button" className="shortcut cd-hoverable" onClick={() => nav("/questoes")}><Icon name="questions" size={22} /><span>Montar lista</span></button>
              <button type="button" className="shortcut cd-hoverable" onClick={() => nav("/simulados")}><Icon name="exam" size={22} /><span>Fazer simulado</span></button>
              <button type="button" className="shortcut cd-hoverable" onClick={() => nav("/flashcards")}><Icon name="cards" size={22} /><span>Flashcards</span></button>
              <button type="button" className="shortcut cd-hoverable" onClick={() => nav("/questoes/salvas")}><Icon name="bookmark" size={22} /><span>Salvas</span></button>
            </div>
          </Section>
        </div>

        <aside className="cols__aside">
          <motion.section className="panel goal" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} aria-label="Meta do dia">
            <ProgressRing value={goal ? doneToday / goal : day.frac} size={92} stroke={9} tone={hit ? "success" : undefined} label={`${doneToday} de ${goal} questões hoje`}>
              <div className="goal__ring">
                <span className="goal__n"><Counter value={doneToday} from={0} /></span>
                <span className="goal__of num">de {num(goal)}</span>
              </div>
            </ProgressRing>
            <div className="goal__body">
              <div className="goal__hello">{greeting(settings.nome)}</div>
              <div className="goal__title">
                {simDay && !simDone ? "Hoje é dia de simulado" : hit ? "Meta do dia batida" : doneToday ? `Faltam ${plural(remaining, "questão", "questões")}` : goal ? `${plural(goal, "questão", "questões")} hoje` : "Dia livre"}
              </div>
              {cardGoal ? <div className="goal__cards num"><Icon name="cards" size={14} />{num(day.cards)} de {num(cardGoal)} cards</div> : null}
            </div>
            <div className={cx("goal__rhythm", closing && "is-pulse")}>
              <Rhythm days={rhythm} height={30} muted={!rhythm.some((d) => d.n)} />
              <span className="goal__streak">{st.total ? "14 dias" : "Seu ritmo aparece aqui"}</span>
            </div>
          </motion.section>

          <button type="button" className="panel panel--tap plan-streak" onClick={() => nav("/cronograma/metas")} aria-label="Ver metas e sequência">
            <div className="plan-streak__top">
              <span className="plan-streak__n num"><Counter value={streak.current} from={0} /></span>
              <span className="plan-streak__l">{streak.current === 1 ? "dia seguido" : "dias seguidos"}<small>{streak.todayCounts ? "Hoje já conta" : `Faltam ${streak.today.faltaQ} questões ou ${streak.today.faltaC} cards`}</small></span>
              <Icon name="chevron-right" size={18} className="row__chev" />
            </div>
            <StreakGrid grid={streak.grid} compact />
            <div className="plan-streak__foot">
              <span>Recorde <b className="num">{streak.best}</b></span>
              <span>{nextMilestoneText(streak.current, streak.next)}</span>
              {streak.plantoes ? <span>{plural(streak.plantoes, "plantão", "plantões")}</span> : null}
            </div>
          </button>

          {plan && ps ? (
            <button type="button" className="panel panel--tap plan-mini" onClick={() => nav("/cronograma")}>
              <span className="plan-mini__n num">{Math.max(0, ps.daysLeft)}</span>
              <span className="plan-mini__t"><b>{ps.daysLeft === 1 ? "dia" : "dias"} até a prova</b><small>{Math.round(ps.progress * 100)}% do plano · semana {num(ps.weekDone)} de {num(ps.weekTarget)}</small></span>
              <Icon name="chevron-right" size={18} className="row__chev" />
            </button>
          ) : null}
        </aside>
      </div>

      <SimuladoSetup exam={sim?.exam ? bank.examById[sim.exam] : null} open={!!sim} onClose={() => setSim(null)} planDay={sim?.key} formato={sim?.formato} />
    </Page>
  );
}
