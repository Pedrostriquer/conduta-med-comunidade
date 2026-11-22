/* Peças do cronograma usadas em mais de uma tela: as tarefas de um dia (Hoje e Cronograma), a faixa até a prova,
   a semana em quadro, a grade da sequência e o aviso de marco. */
import { useMemo } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import type { Bank } from "../../data/bank";
import type { PlanDay } from "../../data/plan";
import { PHASES, simDoneOn } from "../../data/plan";
import { useStore } from "../../state/store";
import type { Plan, Session } from "../../state/store";
import type { Stats } from "../../state/stats";
import { dueReviews } from "../../state/stats";
import { useCardsDone, useGoals } from "../../state/goals";
import type { DayMark, Milestone, PlanPrefs } from "../../state/goals";
import { useDecks } from "../flashcards/decks";
import type { DeckInfo } from "../flashcards/decks";
import { AREA_ICON, Icon } from "../../ds/Icon";
import { Button } from "../../ds/basics";
import { addDays, cap, dayKey, diffDays, duration, fromKey, joinList, longDate, num, plural, shortDate, today, weekdayShort } from "../../lib/format";
import type { DayKey } from "../../lib/format";
import { cx } from "../../lib/cx";
import { spring } from "../../lib/motion";
import { startDueReviews, startErrors, startPlanDay, topicName } from "../sessao/start";

/* ---------- tarefas de um dia ---------- */
export type Task = {
  id: string;
  icon: string;
  title: ReactNode;
  meta: ReactNode;
  done: boolean;
  /** feito / meta */
  progress?: [number, number];
  action?: { label: string; run: () => void };
  areas?: string[];
};

export function TaskCheck({ on }: { on: boolean }) {
  return (
    <span className="tcheck" data-on={on ? "" : undefined} aria-hidden>
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </span>
  );
}

const sameDay = (ms: number | undefined, k: DayKey) => !!ms && dayKey(ms) === k;

/** as tarefas de um dia: questões do plano, questões que voltam, cards de cada baralho com meta e o simulado */
export function useDayTasks(day: PlanDay | null, k: DayKey, st: Stats, bank: Bank, onSim: (d: PlanDay) => void, plan: Plan | null): Task[] {
  const nav = useNavigate();
  const sessions = useStore((s) => s.sessions), reviews = useStore((s) => s.reviews);
  const metaDiaria = useStore((s) => s.settings.metaDiaria);
  const cardGoals = useGoals((s) => s.cardGoals);
  const todayByDeck = useCardsDone((s) => s.todayByDeck);
  const { decks } = useDecks();
  const t = today();
  return useMemo(() => {
    const out: Task[] = [];
    const past = k < t, isToday = k === t, did = st.activity.get(k) || 0;
    if (day?.kind === "simulado") {
      const ok = simDoneOn(sessions, k);
      out.push({
        id: "sim", icon: "exam", done: ok,
        title: <>Simulado {day.exam ? bank.examById[day.exam]?.nome : ""}{day.formato === "embaralhada" ? " embaralhado" : ""}</>,
        meta: "No tempo da prova, correção ao final",
        action: !ok && (isToday || past) ? { label: past ? "Fazer agora" : "Começar", run: () => onSim(day) } : undefined,
      });
    }
    if (day?.onlyCards && !isToday) {
      const names = day.decks?.length ? decks.filter((d: DeckInfo) => day.decks!.includes(d.id)).map((d: DeckInfo) => d.name) : [];
      out.push({ id: "cards", icon: "cards", done: false, title: names.length ? <>Cards · {joinList(names)}</> : "Só flashcards", meta: day.cards ? plural(day.cards, "card", "cards") : "Sem questões neste dia" });
    }
    if ((day?.kind === "estudo" && !day.onlyCards) || (!plan && isToday)) {
      const target = day?.kind === "estudo" ? day.target : metaDiaria;
      const ok = did >= target && target > 0;
      out.push({
        id: "q", icon: "questions", done: ok && (past || isToday), progress: past || isToday ? [Math.min(did, target), target] : undefined,
        title: day?.topics.length ? joinList(day.topics.map(topicName)) : "Questões do dia",
        areas: day ? [...new Set(day.topics.map((x) => x.split("/")[0]))] : undefined,
        meta: <>{past || isToday ? `${num(Math.min(did, 999))} de ${num(target)} questões` : plural(target, "questão", "questões")}{day?.light ? " · dia de plantão" : ""}{plan?.ajustes[k] ? ` (${plan.ajustes[k] > 0 ? "+" : ""}${plan.ajustes[k]})` : ""}</>,
        action: isToday && !ok && day ? { label: did ? "Continuar" : "Começar", run: () => nav("/sessao/" + startPlanDay(day, target - did)) } : undefined,
      });
    }
    if (isToday) {
      const back = dueReviews({ reviews: reviews || {} });
      const fixedToday = Object.values(sessions).some((s: Session) => (s.source.type === "erros" || s.source.type === "retorno") && s.status === "finalizada" && sameDay(s.finishedAt, k));
      // dia só de flashcards: nada de questão, nem as que voltaram
      if (day?.onlyCards) { /* só os cards, abaixo */ }
      else if (back.length) {
        out.push({ id: "voltam", icon: "redo", done: false, title: "Questões que voltam hoje", meta: plural(back.length, "questão marcada para rever", "questões marcadas para rever"), action: { label: "Revisar", run: () => nav("/sessao/" + startDueReviews()) } });
      } else if (st.dueWrong.length) {
        out.push({ id: "erros", icon: "undo", done: false, title: "Revisar erros", meta: plural(Math.min(15, st.dueWrong.length), "questão errada para refazer", "questões erradas para refazer"), action: { label: "Revisar", run: () => nav("/sessao/" + startErrors()) } });
      } else if (fixedToday) {
        out.push({ id: "erros", icon: "undo", done: true, title: "Revisar erros", meta: "Feito hoje" });
      }
      // dia só de flashcards: os baralhos que a regra escolheu vêm primeiro, com a meta da regra
      const only = day?.onlyCards && day.decks?.length ? new Set(day.decks) : null;
      const withGoal = decks.filter((d: DeckInfo) => (only ? only.has(d.id) : cardGoals[d.id]));
      for (const d of withGoal) {
        const goal = cardGoals[d.id] || (only && day?.cards ? Math.round(day.cards / only.size) : 0) || d.due, doneN = todayByDeck.get(d.id) || 0;
        const ok = doneN >= goal;
        out.push({
          id: "deck:" + d.id, icon: "cards", done: ok || d.due === 0, progress: [Math.min(doneN, goal), goal],
          title: <>Cards · {d.name}</>, meta: d.due ? `${num(doneN)} de ${num(goal)} hoje · ${plural(d.due, "na fila", "na fila")}` : doneN ? `${num(doneN)} revisados hoje` : "Nada na fila hoje",
          action: d.due && doneN < goal ? { label: doneN ? "Continuar" : "Revisar", run: () => nav("/flashcards/revisar/" + d.id) } : undefined,
        });
      }
      const loose = decks.filter((d: DeckInfo) => !cardGoals[d.id] && d.due > 0);
      if (loose.length && !withGoal.length) {
        const due = loose.reduce((s, d) => s + d.due, 0);
        out.push({ id: "cards", icon: "cards", done: false, title: "Flashcards", meta: `${plural(due, "card", "cards")} na fila · sem meta no plano`, action: { label: "Revisar", run: () => nav(loose.length === 1 ? "/flashcards/revisar/" + loose[0].id : "/flashcards") } });
      }
    }
    return out;
  }, [day, k, t, st, bank, sessions, reviews, cardGoals, todayByDeck, decks, plan, metaDiaria, nav, onSim]);
}

export function TaskList({ tasks, empty }: { tasks: Task[]; empty?: ReactNode }) {
  if (!tasks.length) return <p className="tasks__none">{empty || "Nada planejado."}</p>;
  return (
    <ul className="tl" role="list">
      {tasks.map((x, i) => (
        <motion.li key={x.id} className="tl__item" data-done={x.done ? "" : undefined} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: i * 0.03 }}>
          <span className="tstate"><TaskCheck on={x.done} /></span>
          <div className="tl__body">
            <div className="tl__title">{x.title}</div>
            <div className="tl__meta">
              {x.areas?.length ? <span className="task-areas" aria-hidden>{x.areas.map((a) => <Icon key={a} name={AREA_ICON[a]} size={15} />)}</span> : <Icon name={x.icon} size={15} />}
              <span className="num">{x.meta}</span>
            </div>
            {x.progress && x.progress[1] > 0 ? <span className="tl__bar" aria-hidden><i style={{ transform: `scaleX(${Math.min(1, x.progress[0] / x.progress[1])})` }} /></span> : null}
          </div>
          {x.action ? <Button variant={x.done ? "plain" : "tinted"} size="sm" onClick={x.action.run}>{x.action.label}</Button> : null}
        </motion.li>
      ))}
    </ul>
  );
}

/** o dia fora do estudo: prova, véspera, folga, pausa */
export function DayNote({ day, did }: { day: PlanDay | null; did: number }) {
  if (!day) return <p className="tasks__none">Fora do cronograma.</p>;
  const [icon, title, sub] =
    day.kind === "prova" ? ["flag", "Dia da prova", "Boa prova."]
    : day.kind === "vespera" ? ["today", "Véspera", "Descanso e uma revisão leve dos erros."]
    : day.pausa ? ["today", day.pausa, did ? `Você fez ${plural(did, "questão", "questões")} mesmo assim.` : "Pausa no plano."]
    : ["today", "Folga", did ? `Você fez ${plural(did, "questão", "questões")} mesmo assim.` : "Dia livre no seu plano."];
  return <div className="task-solo"><Icon name={icon} size={20} filled={day.kind === "prova"} /><div><b>{title}</b><span>{sub}</span></div></div>;
}

/* ---------- faixa até a prova: um traço por dia, altura pela carga, fases ao fundo ---------- */
export function UntilExam({ days, plan, sessions, sel, onPick }: { days: PlanDay[]; plan: Plan; sessions: Record<string, Session>; sel?: DayKey; onPick?: (k: DayKey) => void }) {
  const t = today();
  const N = days.length || 1;
  const maxLoad = Math.max(1, ...days.map((d) => d.minutes || 0));
  const phaseRanges = PHASES.map((p) => {
    const xs = days.map((d, i) => ({ d, i })).filter(({ d }) => (d.kind === "estudo" || d.kind === "simulado") && d.phase === p.id);
    return xs.length ? { p, a: xs[0].i, b: xs[xs.length - 1].i, from: xs[0].d.key, to: xs[xs.length - 1].d.key } : null;
  });
  const ti = days.findIndex((d) => d.key === t), si = sel ? days.findIndex((d) => d.key === sel) : -1;
  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPick) return;
    const r = e.currentTarget.getBoundingClientRect(), i = Math.max(0, Math.min(N - 1, Math.floor(((e.clientX - r.left) / r.width) * N)));
    onPick(days[i].key);
  };
  return (
    <section className="until" aria-label="Até a prova">
      <div className="until__head">
        <span className="until__title">Até a prova</span>
        <span className="until__legend"><i className="lg lg--q" />estudo <i className="lg lg--s" />simulado <i className="lg lg--l" />plantão <i className="lg lg--f" />folga</span>
      </div>
      <svg className="until__svg" viewBox={`0 0 ${N} 48`} preserveAspectRatio="none" role="img" onClick={pick}
        aria-label={`${plural(days.filter((d) => d.kind === "estudo").length, "dia de estudo", "dias de estudo")} e ${plural(days.filter((d) => d.kind === "simulado").length, "simulado", "simulados")} até ${longDate(plan.data)}`}>
        {phaseRanges.map((r, i) => r ? <rect key={i} className={`until__phase until__phase--${i}`} x={r.a} y={0} width={r.b - r.a + 1} height={48} /> : null)}
        {days.map((d, i) => {
          if (d.kind === "prova") return <rect key={d.key} className="until__exam" x={i} y={2} width={1} height={44} />;
          if (d.kind === "simulado") return <rect key={d.key} className={cx("until__sim", simDoneOn(sessions, d.key) && "is-ok")} x={i + 0.1} y={6} width={0.8} height={40} />;
          if (d.kind !== "estudo") return <rect key={d.key} className={cx("until__rest", d.pausa && "is-pause")} x={i + 0.15} y={42} width={0.7} height={4} />;
          const h = Math.max(4, ((d.minutes || 0) / maxLoad) * 34);
          return <rect key={d.key} className={cx("until__day", d.light && "is-light", d.key < t && "is-past")} x={i + 0.15} y={46 - h} width={0.7} height={h} />;
        })}
        {si >= 0 ? <rect className="until__sel" x={si} y={0} width={1} height={48} /> : null}
        {ti >= 0 ? <rect className="until__today" x={ti + 0.35} y={0} width={0.3} height={48} /> : null}
      </svg>
      <div className="until__phases">
        {phaseRanges.map((r, i) => r ? (
          <div key={i} className={`until__ph until__ph--${i}`} style={{ flex: r.b - r.a + 1 }}>
            <b>{r.p.name}</b><span className="num">{shortDate(r.from)} – {shortDate(r.to)}</span>
          </div>
        ) : null)}
      </div>
    </section>
  );
}

/* ---------- semana em quadro: 7 colunas (linhas no celular), carga e itens de cada dia ---------- */
export function WeekBoard({ week, byKey, st, sessions, sel, onSel, prefs, bank }: {
  week: DayKey[]; byKey: Map<DayKey, PlanDay>; st: Stats; sessions: Record<string, Session>; sel: DayKey; onSel: (k: DayKey) => void; prefs: PlanPrefs; bank: Bank;
}) {
  const t = today();
  const maxMin = Math.max(60, ...week.map((k) => byKey.get(k)?.minutes || 0));
  return (
    <div className="wb" role="group" aria-label="Semana">
      {week.map((k) => {
        const d = byKey.get(k) || null, did = st.activity.get(k) || 0, wd = fromKey(k).getDay();
        const isPast = k < t, isToday = k === t;
        const load = (d?.minutes || 0) / maxMin;
        const ok = d?.kind === "estudo" ? did >= d.target : d?.kind === "simulado" ? simDoneOn(sessions, k) : false;
        return (
          <button key={k} type="button" className={cx("wb__day cd-hoverable", d?.kind === "folga" && "is-rest", d?.kind === "prova" && "is-exam", isPast && "is-past")} aria-pressed={sel === k}
            data-today={isToday ? "" : undefined} onClick={() => onSel(k)} aria-label={`${longDate(k)}${isToday ? ", hoje" : ""}`}>
            <span className="wb__head">
              <span className="wb__wd">{weekdayShort(wd)}</span>
              <span className="wb__n num">{fromKey(k).getDate()}</span>
              {ok && (isPast || isToday) ? <span className="wb__ok" aria-label="feito"><Icon name="check" size={12} strokeWidth={3} /></span> : null}
            </span>
            <span className="wb__load" aria-hidden><i style={{ transform: `scaleX(${Math.min(1, load)})` }} /></span>
            <span className="wb__items">
              {!d ? <span className="wb__it is-muted">—</span>
                : d.kind === "prova" ? <span className="wb__it is-exam"><Icon name="flag" size={13} filled />Prova</span>
                : d.kind === "vespera" ? <span className="wb__it is-muted">Véspera</span>
                : d.kind === "folga" ? <span className={cx("wb__it", d.pausa ? "is-light" : "is-muted")}>{d.pausa || "Folga"}</span>
                : d.kind === "simulado" ? <span className="wb__it is-sim"><Icon name="exam" size={13} />{d.exam ? bank.examById[d.exam]?.banca : "Simulado"}</span>
                : (
                  <>
                    {d.onlyCards ? null : <span className="wb__it"><Icon name="questions" size={13} /><b className="num">{isPast || isToday ? `${Math.min(did, d.target)}/${d.target}` : d.target}</b><span className="wb__unit">q</span></span>}
                    {d.topics.length ? <span className="wb__it wb__topics">{d.topics.map(topicName).join(" · ")}</span> : null}
                    {d.evento ? <span className="wb__it is-light">{d.evento}</span> : d.light ? <span className="wb__it is-light">Plantão</span> : null}
                  </>
                )}
              {d?.cards && (d.kind === "estudo" || d.kind === "simulado") ? <span className="wb__it"><Icon name="cards" size={13} /><b className="num">{d.cards}</b><span className="wb__unit">cards</span></span> : null}
            </span>
            {d?.minutes && (d.kind === "estudo" || d.kind === "simulado") ? <span className="wb__time num">{duration(d.minutes * 60)}</span> : null}
          </button>
        );
      })}
      {prefs.ritmo === "horas" ? <span className="sr">Carga calculada pelas horas de cada dia.</span> : null}
    </div>
  );
}

/* ---------- grade da sequência: 12 semanas, segunda a domingo ---------- */
const MARK_LABEL: Record<DayMark, string> = { cheio: "meta cheia", minimo: "mínimo cumprido", plantao: "dia de plantão", vazio: "sem estudo", futuro: "" };
export function StreakGrid({ grid, compact }: { grid: { key: DayKey; mark: DayMark; q: number; c: number }[]; compact?: boolean }) {
  // alinha para a primeira coluna começar numa segunda-feira
  const first = grid[0]?.key, lead = first ? (fromKey(first).getDay() + 6) % 7 : 0;
  type Cell = (typeof grid)[number] | null;
  const cells: Cell[] = [...Array<Cell>(lead).fill(null), ...grid];
  const shown: Cell[] = compact ? grid.slice(-28) : cells;
  return (
    <div className={cx("sg", compact && "sg--compact")} role="img" aria-label={`Últimas ${compact ? 4 : 12} semanas: ${grid.filter((g) => g.mark !== "vazio" && g.mark !== "futuro").length} dias que contaram`}>
      {shown.map((c, i) => c ? <i key={c.key} className={`sg__c sg__c--${c.mark}`} title={c.mark === "futuro" ? undefined : `${cap(longDate(c.key))}: ${MARK_LABEL[c.mark]}${c.q ? ` · ${c.q} questões` : ""}${c.c ? ` · ${c.c} cards` : ""}`} /> : <i key={"x" + i} className="sg__c sg__c--pad" />)}
    </div>
  );
}

export function StreakLegend() {
  return (
    <div className="sg-legend">
      <span><i className="sg__c sg__c--cheio" />Meta cheia</span>
      <span><i className="sg__c sg__c--minimo" />Mínimo</span>
      <span><i className="sg__c sg__c--plantao" />Plantão</span>
      <span><i className="sg__c sg__c--vazio" />Sem estudo</span>
    </div>
  );
}

/* ---------- marco: aviso curto e sóbrio, com o traço do ECG ---------- */
export function MilestoneNote({ m, onClose }: { m: Milestone; onClose: () => void }) {
  return (
    <motion.section className="milestone" role="status" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={spring.smooth}>
      <svg className="milestone__ecg" viewBox="0 0 96 32" aria-hidden><path d="M0 18 H22 L26 18 L29 22 L33 4 L37 28 L40 18 H58 C61 18 63 12 67 12 C71 12 73 18 76 18 H96" /></svg>
      <div className="milestone__text">
        <b>{m.label} seguidos</b>
        <span>Sequência mantida dia após dia. O próximo marco aparece quando chegar lá.</span>
      </div>
      <Button variant="plain" size="sm" icon="x" label="Fechar" onClick={onClose} />
    </motion.section>
  );
}

/** "faltam X para N dias" */
export function nextMilestoneText(current: number, next: Milestone | null) {
  if (!next) return "Todos os marcos alcançados";
  const left = next.n - current;
  return `${plural(left, "dia", "dias")} para ${next.label}`;
}

export const weeksOf = (k: DayKey) => { const wd = (fromKey(k).getDay() + 6) % 7; return addDays(k, -wd); };
export const daysBetween = (a: DayKey, b: DayKey) => diffDays(a, b);
