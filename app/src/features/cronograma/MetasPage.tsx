/* Metas e sequência: o que conta como dia cumprido, as metas de questões e de cards que entram no cronograma,
   a grade das últimas 12 semanas, os marcos e os dias de plantão (que preservam a sequência). Sem chama nem mascote. */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useBank } from "../../data/bank";
import { buildSchedule, planStatus } from "../../data/plan";
import { useStore } from "../../state/store";
import { useStats } from "../../state/stats";
import { MILESTONES, PLANTAO_MAX, PLANTAO_POR_MES, SEC_PER_CARD, useCardsDone, useGoals, useStreak } from "../../state/goals";
import { useDecks } from "../flashcards/decks";
import { Page, Section } from "../../app/Page";
import { Button, Stepper, Switch } from "../../ds/basics";
import { useToast } from "../../ds/overlay";
import { Counter } from "../../ds/progress";
import { Icon } from "../../ds/Icon";
import { cap, duration, longDate, num, plural, relativeDay, today } from "../../lib/format";
import { cx } from "../../lib/cx";
import { spring } from "../../lib/motion";
import { MilestoneNote, nextMilestoneText, StreakGrid, StreakLegend } from "./parts";

export function MetasPage() {
  const nav = useNavigate();
  const toast = useToast();
  const bank = useBank()!;
  const st = useStats(bank);
  const plan = useStore((s) => s.plan), sessions = useStore((s) => s.sessions);
  const metaDiaria = useStore((s) => s.settings.metaDiaria), setSettings = useStore((s) => s.setSettings), patchPlan = useStore((s) => s.patchPlan);
  const g = useGoals();
  const { decks } = useDecks();
  const todayByDeck = useCardsDone((s) => s.todayByDeck);
  const t = today();
  const todayTarget = useMemo(() => {
    if (!plan) return null;
    const ps = planStatus(plan, buildSchedule(plan, bank, st), st, sessions);
    return ps.todayPlan?.kind === "estudo" ? ps.todayPlan.target : null;
  }, [plan, bank, st, sessions]);
  const goalQ = todayTarget ?? (plan ? plan.meta : metaDiaria);
  const s = useStreak(bank, goalQ);
  const fresh = MILESTONES.filter((m) => s.current >= m.n && !g.marcos[m.n]).pop();
  const metaQ = plan ? plan.meta : metaDiaria;
  const setMetaQ = (v: number) => (plan ? patchPlan({ meta: v }) : setSettings({ metaDiaria: v }));
  const cardsTotal = Object.values(g.cardGoals).reduce((a, b) => a + b, 0);
  const plantaoHoje = !!g.plantao[t];

  const registerToday = () => { g.registerPlantao(t); toast({ text: "Plantão registrado. Sequência preservada.", icon: "check" }); };
  const repair = () => { if (s.repairable) { g.registerPlantao(s.repairable); toast({ text: "Plantão registrado. Sequência preservada.", icon: "check" }); } };

  return (
    <Page title="Metas e sequência" subtitle="O que conta como dia cumprido e o que entra no seu dia.">
      <AnimatePresence>{fresh ? <MilestoneNote key={fresh.n} m={fresh} onClose={() => g.celebrateMilestone(fresh.n)} /> : null}</AnimatePresence>
      <div className="cols">
        <div className="cols__main">
          <section className="panel streak-hero" aria-label="Sequência">
            <div className="streak-hero__top">
              <div className="streak-hero__n">
                <span className="num"><Counter value={s.current} from={0} /></span>
                <small>{s.current === 1 ? "dia seguido" : "dias seguidos"}</small>
              </div>
              <div className="streak-hero__side">
                <div><b className="num">{s.best}</b><span>recorde</span></div>
                <div><b className="num">{s.plantoes}</b><span>{s.plantoes === 1 ? "plantão guardado" : "plantões guardados"}</span></div>
              </div>
            </div>
            <div className="streak-hero__next">
              <div className="streak-hero__track" aria-hidden>
                <motion.i initial={{ scaleX: 0 }} animate={{ scaleX: s.next ? Math.min(1, s.current / s.next.n) : 1 }} transition={{ ...spring.smooth, delay: 0.1 }} />
              </div>
              <span>{nextMilestoneText(s.current, s.next)}</span>
            </div>
            <p className={cx("streak-hero__today", s.todayCounts && "is-ok")}>
              {s.todayCounts ? <><Icon name="check" size={16} strokeWidth={2.5} />Hoje já conta{plantaoHoje ? " (plantão)" : ""}.</>
                : <>Para hoje contar: mais <b className="num">{num(s.today.faltaQ)}</b> {s.today.faltaQ === 1 ? "questão" : "questões"} ou <b className="num">{num(s.today.faltaC)}</b> cards.</>}
            </p>
          </section>

          <Section title="Últimas 12 semanas">
            <div className="panel streak-grid-card">
              <StreakGrid grid={s.grid} />
              <StreakLegend />
              <p className="pe-note">Um dia sem estudo não apaga o que você construiu: o que conta é voltar no dia seguinte.</p>
            </div>
          </Section>

          <Section title="Marcos">
            <ul className="milestones">
              {MILESTONES.map((m, i) => {
                const got = s.best >= m.n || s.current >= m.n;
                return (
                  <motion.li key={m.n} className={cx("milestones__it", got && "is-got")} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: 0.04 * i }}>
                    <span className="milestones__mark" aria-hidden>{got ? <Icon name="check" size={16} strokeWidth={2.75} /> : <span className="num">{m.n}</span>}</span>
                    <span className="milestones__t"><b>{m.label}</b><small>{got ? (g.marcos[m.n] ? `Alcançado ${relativeDay(g.marcos[m.n])}` : "Alcançado") : `Faltam ${plural(m.n - s.current, "dia", "dias")}`}</small></span>
                  </motion.li>
                );
              })}
            </ul>
          </Section>
        </div>

        <aside className="cols__aside">
          <section className="panel metas-card" aria-label="Metas diárias">
            <h2 className="sec__title">Metas diárias</h2>
            <div className="pe-row">
              <div className="pe-row__l"><span>Questões por dia</span><small>{plan ? "A meta do cronograma" : "Sem cronograma, vale esta"}{` · ≈ ${duration(metaQ * 150)}`}</small></div>
              <Stepper label="Questões por dia" value={metaQ} min={5} max={200} step={5} onChange={setMetaQ} />
            </div>
            <h3 className="metas-card__sub">Cards por dia</h3>
            {decks.length ? decks.map((d) => {
              const on = !!g.cardGoals[d.id], did = todayByDeck.get(d.id) || 0;
              return (
                <div key={d.id} className="pe-row">
                  <div className="pe-row__l"><span>{d.name}</span><small>{on ? `${num(did)} de ${num(g.cardGoals[d.id])} hoje` : `${num(d.due)} na fila hoje · fora da meta`}</small></div>
                  <div className="pe-inline">
                    <Switch label={`Meta de cards em ${d.name}`} checked={on} onChange={(v) => g.setCardGoal(d.id, v ? 20 : null)} />
                    {on ? <Stepper label="Cards por dia" value={g.cardGoals[d.id]} min={5} max={500} step={5} onChange={(v) => g.setCardGoal(d.id, v)} /> : null}
                  </div>
                </div>
              );
            }) : (
              <div className="pe-empty"><Icon name="cards" size={18} /><span>Importe ou crie um baralho para pôr cards na meta.</span><Button variant="tinted" size="sm" onClick={() => nav("/flashcards")}>Flashcards</Button></div>
            )}
            {cardsTotal ? <p className="pe-note">{num(cardsTotal)} cards por dia, ≈ {duration(cardsTotal * SEC_PER_CARD)}. Entram na lista de Hoje e na carga do cronograma.</p> : null}
          </section>

          <section className="panel metas-card" aria-label="O que conta como dia">
            <h2 className="sec__title">O que conta como dia</h2>
            <p className="pe-note">O dia entra na sequência com um mínimo, não com a meta inteira. Basta um dos dois.</p>
            <div className="pe-row">
              <div className="pe-row__l"><span>Questões</span></div>
              <Stepper label="Mínimo de questões" value={g.minimo.questoes} min={1} max={100} step={1} onChange={(v) => g.setMinimo({ questoes: v })} />
            </div>
            <div className="pe-row">
              <div className="pe-row__l"><span>ou cards</span></div>
              <Stepper label="Mínimo de cards" value={g.minimo.cards} min={1} max={300} step={5} onChange={(v) => g.setMinimo({ cards: v })} />
            </div>
          </section>

          <section className="panel metas-card plantao" aria-label="Dias de plantão">
            <h2 className="sec__title">Dias de plantão</h2>
            <p className="pe-note">Plantão, prova da faculdade, um dia que não deu. Você ganha {PLANTAO_POR_MES} por mês e guarda até {PLANTAO_MAX}. Usar um mantém a sequência.</p>
            <div className="plantao__bank" aria-label={`${s.plantoes} guardados`}>
              {Array.from({ length: PLANTAO_MAX }, (_, i) => <i key={i} data-on={i < s.plantoes ? "" : undefined} />)}
            </div>
            {s.repairable ? (
              <div className="plantao__repair">
                <span>{cap(relativeDay(s.repairable))} ficou sem estudo. Um plantão salva a sequência.</span>
                <Button variant="tinted" size="sm" onClick={repair}>Usar em {relativeDay(s.repairable)}</Button>
              </div>
            ) : null}
            {plantaoHoje ? (
              <div className="plantao__repair"><span>Hoje está como plantão.</span><Button variant="plain" size="sm" onClick={() => g.undoPlantao(t)}>Desfazer</Button></div>
            ) : !s.todayCounts ? (
              <Button variant="gray" block disabled={!s.plantoes} onClick={registerToday}>Registrar plantão hoje</Button>
            ) : null}
            {Object.keys(g.plantao).length ? (
              <p className="pe-note">Usados: {Object.keys(g.plantao).sort().reverse().slice(0, 4).map((k) => cap(longDate(k))).join(" · ")}</p>
            ) : null}
          </section>
        </aside>
      </div>
    </Page>
  );
}
