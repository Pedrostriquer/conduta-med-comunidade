/* Simulados: as provas reais agrupadas por banca (a da prova-alvo primeiro), o que está em andamento e os últimos resultados.
   Prova já feita abre o resultado (dentro do app, com a trilha); "Fazer de novo" abre a configuração. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useBank } from "../../data/bank";
import { BANCAS } from "../../data/types";
import type { Exam } from "../../data/types";
import { useStore } from "../../state/store";
import type { Session } from "../../state/store";
import { Page, Section } from "../../app/Page";
import { SegmentedControl } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { clock, duration, num, relativeDay, dayKey } from "../../lib/format";
import { spring } from "../../lib/motion";
import { cx } from "../../lib/cx";
import { SimuladoSetup } from "./SimuladoSetup";
import { simDefaultMinutes } from "../sessao/start";
import { MiniRing, PickChip, bancaOrder, yearsOf } from "../questoes/filters";
import { edicao, targetBancas } from "../questoes/QuestoesPage";

export function score(s: Session, g: (id: string) => string | undefined, answers = s.answers) {
  // anulada não tem gabarito e não conta na nota
  const counted = s.qids.filter((id) => g(id) !== "");
  const ok = counted.filter((id) => answers[id]?.choice === g(id)).length;
  return counted.length ? ok / counted.length : 0;
}

type Done = "todas" | "nao" | "feitas";

export function SimuladosPage() {
  const nav = useNavigate();
  const bank = useBank()!;
  const sessions = useStore((s) => s.sessions), inc = useStore((s) => s.settings.incluirTodas), plan = useStore((s) => s.plan);
  const target = targetBancas(plan);
  const [bancas, setBancas] = useState<string[]>([]);
  const [anos, setAnos] = useState<number[]>([]);
  const [done, setDone] = useState<Done>("todas");
  const [setup, setSetup] = useState<Exam | null>(null);
  const g = (id: string) => bank.byId[id]?.g;
  const sims = useMemo(() => Object.values(sessions).filter((s) => s.kind === "simulado"), [sessions]);
  const active = sims.filter((s) => s.status === "ativa").sort((a, b) => b.createdAt - a.createdAt);
  const history = sims.filter((s) => s.status === "finalizada").sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  // por prova: o último resultado (para abrir), a melhor nota e se há um em andamento
  const byExam = useMemo(() => {
    const m = new Map<string, { last?: Session; best: number; live?: Session }>();
    for (const s of sims) {
      if (s.source.type !== "simulado") continue;
      const e = s.source.exam, x = m.get(e) || { best: 0 };
      if (s.status === "ativa") { if (!x.live || x.live.createdAt < s.createdAt) x.live = s; }
      else { if (!x.last || (x.last.finishedAt || 0) < (s.finishedAt || 0)) x.last = s; x.best = Math.max(x.best, score(s, g)); }
      m.set(e, x);
    }
    return m;
  }, [sims]); // eslint-disable-line

  const exams = bank.exams.filter((e) => (!bancas.length || bancas.includes(e.banca)) && (!anos.length || anos.includes(e.ano))
    && (done === "todas" || (done === "feitas") === !!byExam.get(e.id)?.last));
  const present = [...new Set(bank.exams.map((e) => e.banca))];
  const order = bancaOrder(BANCAS, [...new Set(exams.map((e) => e.banca))], target[0]);

  return (
    <Page title="Simulados" subtitle="Provas reais, no tempo da prova.">
      {active.length || history.length ? (
        <div className="simtop">
          {active.map((s) => {
            const n = s.qids.filter((id) => s.answers[id]?.choice).length;
            const left = s.limitSec ? Math.max(0, s.limitSec - s.elapsedMs / 1000) : null;
            return (
              <button key={s.id} type="button" className="panel panel--tap now" onClick={() => nav("/sessao/" + s.id)}>
                <div className="now__eyebrow"><Icon name="pause" size={14} />Pausado</div>
                <div className="now__title">{s.title}</div>
                <div className="now__meta num">{num(n)} de {num(s.qids.length)} respondidas{left != null ? ` · ${clock(left)} restantes` : ""}</div>
                <div className="now__bar" aria-hidden><i style={{ transform: `scaleX(${n / s.qids.length})` }} /></div>
                <span className="cd-btn cd-btn--filled now__cta">Retomar<Icon name="chevron-right" size={18} /></span>
              </button>
            );
          })}
          {history.length ? (
            <section className="panel simlast" aria-label="Últimos resultados">
              <div className="simlast__head"><h2 className="sec__title">Últimos resultados</h2><button type="button" className="sec__link" onClick={() => nav("/simulados/resultados")}>Ver todos</button></div>
              <ul className="simlast__list">
                {history.slice(0, 3).map((s) => {
                  const sc = score(s, g);
                  return (
                    <li key={s.id}>
                      <button type="button" className="simlast__row cd-hoverable" onClick={() => nav("/resultado/" + s.id)}>
                        <span className={cx("hist__score num", sc >= 0.7 && "is-ok")}>{Math.round(sc * 100)}%</span>
                        <span className="row__main"><span className="row__title">{s.title}</span><span className="row__sub">{relativeDay(dayKey(s.finishedAt || s.createdAt))} · {duration(s.elapsedMs / 1000)}</span></span>
                        <Icon name="chevron-right" size={18} className="row__chev" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      <Section title="Provas" action={
        <div className="qbar__chips">
          <PickChip label="Banca" options={bancaOrder(BANCAS, present, target[0]).map((b) => ({ value: b, label: b, hint: target.includes(b) ? "sua prova" : undefined }))} value={bancas} onChange={setBancas} />
          <PickChip label="Ano" options={yearsOf(bank.exams).map((y) => ({ value: y, label: String(y) }))} value={anos} onChange={setAnos} width={180} />
          <SegmentedControl size="sm" aria-label="Feitas" value={done} onChange={setDone} options={[{ value: "todas", label: "Todas" }, { value: "nao", label: "Não feitas" }, { value: "feitas", label: "Feitas" }]} />
        </div>
      }>
        {!exams.length ? <div className="empty"><Icon name="filter" size={22} /><p>Nenhuma prova com esses filtros.</p></div> : null}
        <div className="simgroups">
          {order.map((b) => {
            const xs = exams.filter((e) => e.banca === b).sort((x, y) => y.ano - x.ano || x.nome.localeCompare(y.nome));
            return (
              <section key={b} className="simgroup" aria-label={b}>
                <h3 className="xpick__banca">{b}<span className="simgroup__n num">{xs.length} {xs.length === 1 ? "prova" : "provas"}</span>{target.includes(b) ? <span className="xpick__target">sua prova</span> : null}</h3>
                <motion.div layout className="simgrid" transition={spring.smooth}>
                  {xs.map((e) => {
                    const n = (bank.byExam[e.id] || []).filter((q) => inc || q.ok).length;
                    const info = byExam.get(e.id), best = info?.last ? info.best : null, ed = edicao(e);
                    const open = () => { if (info?.live) nav("/sessao/" + info.live.id); else if (info?.last) nav("/resultado/" + info.last.id); else setSetup(e); };
                    return (
                      <motion.div layout key={e.id} className={cx("scard", best != null && "is-done", info?.live && "is-live")} transition={spring.smooth}>
                        <button type="button" className="scard__main cd-hoverable" onClick={open}
                          aria-label={`${e.nome}${best != null ? `, feito, ${Math.round(best * 100)}%` : info?.live ? ", em andamento" : ""}`}>
                          <span className="scard__top">
                            <span className="scard__year num">{e.ano}</span>
                            {best != null ? <MiniRing value={best} size={36} stroke={4} tone={best >= 0.7 ? "success" : undefined}><span className="num">{Math.round(best * 100)}</span></MiniRing> : null}
                          </span>
                          {ed ? <span className="scard__tag">{ed}</span> : null}
                          <span className="scard__meta num">{num(n)} questões · {duration(simDefaultMinutes(e, n) * 60)}</span>
                          <span className="scard__status">
                            {info?.live ? <><Icon name="pause" size={13} />Em andamento</> : best != null ? <><Icon name="check" size={13} strokeWidth={2.25} />Ver resultado</> : "Não feito"}
                          </span>
                        </button>
                        {best != null && !info?.live ? <button type="button" className="scard__again cd-hoverable" onClick={() => setSetup(e)} aria-label={"Fazer " + e.nome + " de novo"} title="Fazer de novo"><Icon name="redo" size={16} /></button> : null}
                      </motion.div>
                    );
                  })}
                </motion.div>
              </section>
            );
          })}
        </div>
      </Section>
      <SimuladoSetup exam={setup} open={!!setup} onClose={() => setSetup(null)} />
    </Page>
  );
}
