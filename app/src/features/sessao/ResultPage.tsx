/* Resultado de uma lista ou simulado, dentro do app (com a trilha): o número, o tempo, o ritmo, o mapa das questões,
   as áreas e o próximo passo — refazer as que errou até acertar, ou conferir gabarito e vídeos. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { getBank, useBank } from "../../data/bank";
import { AREAS } from "../../data/types";
import type { Exam } from "../../data/types";
import { useStore } from "../../state/store";
import { useStats } from "../../state/stats";
import { buildSchedule, planStatus } from "../../data/plan";
import { Page } from "../../app/Page";
import type { Crumb } from "../../app/Page";
import { Button } from "../../ds/basics";
import { BarList, Counter, ProgressRing } from "../../ds/progress";
import { Icon } from "../../ds/Icon";
import { cap, dayKey, duration, longDate, num, pace, plural, today } from "../../lib/format";
import { spring } from "../../lib/motion";
import { cx } from "../../lib/cx";
import { SimuladoSetup } from "../simulados/SimuladoSetup";
import { AnaliseSheet } from "../analises/AnaliseSheet";
import { DayGoal } from "./Celebration";
import { sessionAnswers, startRedo } from "./start";

export function ResultPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const s = useStore((x) => x.sessions[id]);
  const sessions = useStore((x) => x.sessions), attempts = useStore((x) => x.attempts);
  const plan = useStore((x) => x.plan), celebrated = useStore((x) => x.celebrated), meta = useStore((x) => x.settings.metaDiaria);
  const bank = useBank();
  const st = useStats(bank);
  const b = getBank();
  const [again, setAgain] = useState<Exam | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  useEffect(() => { if (!s) nav("/simulados/resultados", { replace: true }); }, [s, nav]);

  const r = useMemo(() => {
    if (!s) return null;
    const answers = sessionAnswers(s, attempts);
    const rows = s.qids.filter((qid) => b.byId[qid]).map((qid) => ({ q: b.byId[qid], a: answers[qid] }));
    // a anulada aparece no mapa, mas não entra em nenhuma conta
    const counted = rows.filter((x) => !x.q.an);
    const right = counted.filter((x) => x.a?.choice && x.a.choice === x.q.g).length;
    const blank = counted.filter((x) => !x.a?.choice).length;
    const wrong = counted.length - right - blank;
    const areas = AREAS.map((ar) => { const xs = counted.filter((x) => x.q.area === ar.id); const ok = xs.filter((x) => x.a?.choice === x.q.g).length; return { key: ar.id, name: ar.label, area: ar.id, n: xs.length, value: xs.length ? Math.round((ok / xs.length) * 100) : 0 }; }).filter((x) => x.n);
    const answered = counted.length - blank;
    return { rows, right, blank, wrong, total: counted.length, annulled: rows.length - counted.length, acc: counted.length ? right / counted.length : 0, areas, paceSec: answered ? s.elapsedMs / 1000 / answered : 0 };
  }, [s, b, attempts]);

  // meta do dia: celebra uma vez por dia, na sessão que fez passar da meta
  const goal = useMemo(() => {
    if (!bank) return null;
    let g = meta;
    if (plan) { const ps = planStatus(plan, buildSchedule(plan, bank, st), st, sessions); if (ps.todayPlan?.kind === "estudo") g = ps.todayPlan.target; }
    return g;
  }, [bank, plan, st, sessions, meta]);
  const doneToday = st.activity.get(today()) || 0;
  const latch = useRef<boolean | null>(null);
  if (latch.current === null && goal != null) latch.current = doneToday >= goal && !celebrated[today()] && !!s?.finishedAt && dayKey(s.finishedAt) === today();
  const celebrate = !!latch.current;
  useEffect(() => { if (celebrate) useStore.getState().celebrate(today()); }, [celebrate]);

  if (!s || !r) return null;
  const isSim = s.kind === "simulado";
  const isRedo = s.source.type === "refazer";
  const target = s.limitSec ? s.limitSec / s.qids.length : null;
  const toFix = r.wrong + r.blank;
  const redoOpen = Object.values(sessions).find((x) => x.status === "ativa" && x.source.type === "refazer" && x.source.from === s.id);
  const redoLeft = redoOpen ? redoOpen.qids.filter((q) => !(redoOpen.answers[q]?.checked && redoOpen.answers[q]?.choice === b.byId[q]?.g)).length : 0;
  const examId = s.source.type === "simulado" || s.source.type === "prova" ? s.source.exam : null;
  const exam = examId ? b.examById[examId] : null;
  const from = isRedo && s.source.type === "refazer" ? sessions[s.source.from] : null;
  const misses = s.misses || {};
  const hard = Object.keys(misses).filter((q) => misses[q] > 0);
  const kindLabel = isSim ? (s.feedback === "imediato" ? "Treino" : "Simulado") : isRedo ? "Refazer erradas" : "Lista";
  const crumbs: Crumb[] = isSim ? [{ label: "Simulados", to: "/simulados" }, { label: "Resultados", to: "/simulados/resultados" }]
    : from ? [{ label: "Resultados", to: "/simulados/resultados" }, { label: from.title, to: "/resultado/" + from.id }]
    : [{ label: "Questões", to: "/questoes" }, { label: "Resultados", to: "/simulados/resultados" }];
  const when = s.finishedAt ? cap(longDate(dayKey(s.finishedAt))) : "";
  const redo = () => nav("/sessao/" + startRedo(s.id));

  return (
    <Page title={s.title} subtitle={`${kindLabel} · ${when}`} crumbs={crumbs} className="resultp">
      {celebrate && goal ? <DayGoal done={doneToday} goal={goal} streak={st.streak} /> : null}
      <div className="cols">
        <div className="cols__main">
          <section className="panel rhero" aria-label="Resultado">
            <ProgressRing value={r.acc} size={132} stroke={11} tone={r.acc >= 0.7 ? "success" : undefined} label={`${Math.round(r.acc * 100)}% de acerto`}>
              <div>
                <span className="result__pct"><Counter value={Math.round(r.acc * 100)} from={0} format={(v) => v + "%"} /></span>
                <span className="cd-ring__cap">de acerto</span>
              </div>
            </ProgressRing>
            <motion.div className="rhero__text" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: 0.15 }}>
              {isRedo ? (
                <>
                  <h2 className="rhero__title">{toFix ? `Faltaram ${plural(toFix, "questão", "questões")}` : `Você acertou ${r.total === 1 ? "a questão" : `as ${num(r.total)}`}`}</h2>
                  <p className="result__sub">{hard.length ? <>{plural(hard.length, "precisou", "precisaram")} de mais de uma tentativa.</> : "Todas de primeira."}</p>
                </>
              ) : (
                <>
                  <h2 className="rhero__title"><b className="num">{num(r.right)}</b> de {num(r.total)} certas</h2>
                  <p className="result__sub">{r.wrong ? <>{plural(r.wrong, "errada", "erradas")}</> : "Nenhuma errada"}{r.blank ? <> · {r.blank} em branco</> : null}</p>
                </>
              )}
              <div className="rhero__tiles">
                <div className="tile"><span className="caps">Tempo</span><b className="num">{duration(s.elapsedMs / 1000)}</b></div>
                <div className="tile"><span className="caps">Ritmo</span><b className="num">{pace(r.paceSec)}</b><small>{target ? `meta ${pace(target)}` : "por questão"}</small></div>
                <div className="tile"><span className="caps">{isRedo ? "Tentativas" : "Erros"}</span><b className="num">{isRedo ? num(r.total + Object.values(misses).reduce((a, x) => a + x, 0)) : num(toFix)}</b><small>{isRedo ? "no total" : r.blank ? `${r.blank} em branco` : "para refazer"}</small></div>
              </div>
            </motion.div>
          </section>

          <section className="panel rmap" aria-label="Questões">
            <div className="rmap__head">
              <h2 className="sec__title">Questões</h2>
              <span className="rmap__legend" aria-hidden><span><i data-k="ok" />Certa</span><span><i data-k="no" />Errada</span><span><i />Em branco</span>{r.annulled ? <span><i data-k="an" />Anulada</span> : null}</span>
            </div>
            <div className="rmap__grid">
              {r.rows.map(({ q, a }, i) => {
                const k = q.an ? "an" : !a?.choice ? "blank" : a.choice === q.g ? "ok" : "no";
                return (
                  <button key={q.id} type="button" className={cx("rcell cd-hoverable", "rcell--" + k)} onClick={() => nav(`/correcao/${s.id}?f=todas&i=${i}`)}
                    aria-label={`Questão ${i + 1}: ${k === "ok" ? "certa" : k === "no" ? "errada" : k === "an" ? "anulada" : "em branco"}. Ver correção`}>
                    {i + 1}{misses[q.id] ? <span className="rcell__miss" aria-hidden>{misses[q.id] + 1}×</span> : null}
                  </button>
                );
              })}
            </div>
            {r.annulled ? <p className="result__note">{r.annulled === 1 ? "1 questão foi anulada pela banca e não conta" : `${num(r.annulled)} questões foram anuladas pela banca e não contam`} na sua nota.</p> : null}
          </section>

          {r.areas.length > 1 ? (
            <section className="panel result__areas">
              <h2 className="sec__title">Por área</h2>
              <BarList rows={r.areas} goal={70} />
              <p className="result__note">A linha marca 70%, a meta de acerto.</p>
            </section>
          ) : null}
        </div>

        <aside className="cols__aside">
          <section className="panel ract" aria-label="Próximo passo">
            <h2 className="qsum__title">Próximo passo</h2>
            {toFix && !isRedo ? (
              <>
                <Button variant="filled" size="lg" block icon="undo" onClick={redo}>
                  {redoOpen ? `Continuar refazendo · faltam ${num(redoLeft)}` : `Refazer ${toFix === 1 ? "a que errei" : `as ${toFix} que errei`}`}
                </Button>
                <p className="ract__hint">Com a correção na hora. A que você errar de novo volta para o fim da fila até acertar.</p>
              </>
            ) : !isRedo ? <p className="result__perfect"><Icon name="check" size={18} strokeWidth={2.25} />Nenhum erro nesta {isSim ? "prova" : "lista"}.</p> : null}
            <Button variant="gray" size="lg" block icon="video" onClick={() => nav(`/correcao/${s.id}?f=${toFix && !isRedo ? "erradas" : "todas"}`)}>
              {toFix && !isRedo ? "Ver gabarito e vídeos" : "Rever as questões"}
            </Button>
            {toFix && !isRedo ? <Button variant="plain" block icon="cards" onClick={() => nav("/flashcards/ia?sessao=" + s.id)}>Criar flashcards das erradas</Button> : null}
            {!isRedo ? (
              s.analise ? <Button variant="gray" size="lg" block icon="sparkle" onClick={() => nav("/analises/" + s.analise)}>Ver a análise</Button>
                : <Button variant="tinted" size="lg" block icon="sparkle" onClick={() => setAnalyzing(true)}>Analisar meus erros</Button>
            ) : null}
            <div className="ract__more">
              {exam ? <Button variant="plain" icon="redo" onClick={() => setAgain(exam)}>Fazer esta prova de novo</Button> : null}
              {from ? <Button variant="plain" onClick={() => nav("/resultado/" + from.id)}>Voltar ao resultado de {from.title}</Button> : null}
              {isSim ? <Button variant="plain" onClick={() => nav("/simulados")}>Outro simulado</Button> : <Button variant="plain" onClick={() => nav("/questoes")}>Montar outra lista</Button>}
              <Button variant="plain" onClick={() => nav("/")}>Voltar para Hoje</Button>
            </div>
          </section>
        </aside>
      </div>
      <SimuladoSetup exam={again} open={!!again} onClose={() => setAgain(null)} />
      {analyzing ? <AnaliseSheet sessionId={s.id} open onClose={() => setAnalyzing(false)} /> : null}
    </Page>
  );
}
