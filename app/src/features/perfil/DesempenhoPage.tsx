/* Desempenho: só das questões (os flashcards têm as próprias estatísticas). Acerto e volume no período,
   por área, os temas fracos que mais caem, as erradas para revisar, o progresso em cada prova e os simulados.
   Sem percentil, ranking ou XP: comparação só com a meta da própria pessoa. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBank } from "../../data/bank";
import { AREAS, areaShort } from "../../data/types";
import { matchQuery, pick } from "../../data/select";
import { useStore } from "../../state/store";
import { examProgress, periodMetrics, useStats, weakFrequent } from "../../state/stats";
import { Page, Section } from "../../app/Page";
import { Button, SegmentedControl } from "../../ds/basics";
import { Sheet } from "../../ds/overlay";
import { BarList } from "../../ds/progress";
import { AREA_ICON, Icon } from "../../ds/Icon";
import { cap, num, pace, plural, relativeDay, shortDate, tinyDate, today, dayKey } from "../../lib/format";
import { startErrors, startList, topicName } from "../sessao/start";
import { Columns, LineChart } from "./charts";
import type { Column, LinePoint } from "./charts";

type Period = "7" | "30" | "90" | "tudo";
const PERIODS: { value: Period; label: string }[] = [{ value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "90", label: "90 dias" }, { value: "tudo", label: "Tudo" }];
const pctOf = (ok: number, n: number) => (n ? Math.round((ok / n) * 100) : 0);

export function DesempenhoPage() {
  const nav = useNavigate();
  const bank = useBank()!;
  const st = useStats(bank);
  const attempts = useStore((s) => s.attempts), sessions = useStore((s) => s.sessions), plan = useStore((s) => s.plan), settings = useStore((s) => s.settings);
  const [period, setPeriod] = useState<Period>("30");
  const [area, setArea] = useState<string | null>(null);
  const [allExams, setAllExams] = useState(false);
  const m = useMemo(() => periodMetrics(attempts, bank, period === "tudo" ? null : Number(period)), [attempts, bank, period]);
  const goalDay = plan ? plan.meta : settings.metaDiaria;
  const studyDays = plan ? plan.dias.length : 7;

  // acerto ao longo do tempo: por dia em 7 dias; média móvel de 7 dias em 30; por semana em 90 e tudo
  const line = useMemo<LinePoint[]>(() => {
    if (period === "7") return m.daily.map((d) => ({ key: d.key, x: tinyDate(d.key), y: d.n ? pctOf(d.ok, d.n) : null, tip: <><b>{cap(relativeDay(d.key))}</b><span>{d.n ? `${pctOf(d.ok, d.n)}% em ${plural(d.n, "questão", "questões")}` : "Sem estudo"}</span></> }));
    if (period === "30") return m.daily.map((d, i) => {
      const win = m.daily.slice(Math.max(0, i - 6), i + 1), n = win.reduce((s, x) => s + x.n, 0), ok = win.reduce((s, x) => s + x.ok, 0);
      return { key: d.key, x: tinyDate(d.key), y: n ? pctOf(ok, n) : null, tip: <><b>{cap(relativeDay(d.key))}</b><span>{n ? `${pctOf(ok, n)}% nos 7 dias até aqui` : "Sem estudo na semana"}</span><span>{d.n ? `${plural(d.n, "questão", "questões")} no dia` : "nenhuma no dia"}</span></> };
    });
    return m.weekly.map((w) => ({ key: w.start, x: tinyDate(w.start), y: w.n ? pctOf(w.ok, w.n) : null, tip: <><b>Semana de {shortDate(w.start)}</b><span>{w.n ? `${pctOf(w.ok, w.n)}% em ${plural(w.n, "questão", "questões")}` : "Sem estudo"}</span></> }));
  }, [m, period]);

  // volume: por dia em 7 e 30 dias (meta do dia); por semana em 90 e tudo (meta da semana)
  const weeklyView = period === "90" || period === "tudo";
  const cols = useMemo<Column[]>(() => weeklyView
    ? m.weekly.map((w) => ({ key: w.start, x: tinyDate(w.start), v: w.n, muted: w.start > today(), tip: <><b>Semana de {shortDate(w.start)}</b><span>{plural(w.n, "questão", "questões")} em {plural(w.studyDays, "dia", "dias")}</span><span>meta {num(goalDay * studyDays)}</span></> }))
    : m.daily.map((d) => ({ key: d.key, x: tinyDate(d.key), v: d.n, tip: <><b>{cap(relativeDay(d.key))}</b><span>{d.n ? `${plural(d.n, "questão", "questões")} · ${pctOf(d.ok, d.n)}%` : "Sem estudo"}</span></> })),
  [m, weeklyView, goalDay, studyDays]);
  const hitDays = m.daily.filter((d) => d.n >= goalDay).length;

  const areaRows = AREAS.map((a) => ({ a, t: m.byArea.get(a.id) })).filter((x) => x.t?.n);
  const weak = useMemo(() => weakFrequent(st, bank), [st, bank]);
  const progress = useMemo(() => examProgress(st, bank), [st, bank]);
  const exams = useMemo(() => {
    const target = new Set(plan ? [plan.banca] : []);
    return [...bank.exams]
      .map((e) => ({ e, p: progress.get(e.id) || { done: 0, ok: 0 }, n: (bank.byExam[e.id] || []).filter((q) => settings.incluirTodas || q.ok).length }))
      .filter((x) => x.n)
      .sort((a, b) => Number(target.has(b.e.banca)) - Number(target.has(a.e.banca)) || b.p.done / b.n - a.p.done / a.n || b.e.ano - a.e.ano);
  }, [bank, progress, plan, settings.incluirTodas]);
  const shownExams = allExams ? exams : exams.slice(0, 6);

  const sims = useMemo(() => Object.values(sessions).filter((s) => s.kind === "simulado" && s.status === "finalizada" && (s.finishedAt || 0) >= new Date(m.from + "T00:00:00").getTime())
    .sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0))
    .map((s) => { const counted = s.qids.filter((id) => !bank.byId[id]?.an), ok = counted.filter((id) => s.answers[id]?.choice === bank.byId[id]?.g).length; return { s, pct: pctOf(ok, counted.length), ok, n: counted.length }; }), [sessions, bank, m.from]);
  const simPoints = sims.map(({ s, pct, ok, n }) => ({ key: s.id, x: tinyDate(dayKey(s.finishedAt!)), y: pct, tip: <><b>{s.title}</b><span>{pct}% · {num(ok)} de {num(n)}</span><span>{cap(relativeDay(dayKey(s.finishedAt!)))}</span></> }));

  const due = st.dueWrong.length;
  const train = (keys: string[], title: string) => {
    const xs = matchQuery(bank, settings.incluirTodas, { topics: keys, filter: "todas" }, st).filter((q) => !st.last.get(q.id)?.correct);
    const id = startList({ ids: pick(xs, 20), title, source: { type: "fracos", topics: keys } });
    nav("/sessao/" + id);
  };
  const espRows = area ? [...st.byTopic.entries()].filter(([k, v]) => k.startsWith(area + "/") && v.n >= 3).map(([k, v]) => ({ key: k, name: k.split("/")[1], n: v.n, value: pctOf(v.ok, v.n) })).sort((a, b) => a.value - b.value) : [];

  if (!st.total) {
    return (
      <Page title="Desempenho" subtitle="Só das questões. Os flashcards têm as próprias estatísticas.">
        <div className="empty"><Icon name="chart" size={28} /><p>Responda algumas questões para ver seu acerto por área, os temas fracos e a evolução nos simulados.</p>
          <Button variant="filled" onClick={() => nav("/questoes")}>Montar uma lista</Button></div>
      </Page>
    );
  }

  return (
    <Page className="pf-page" title="Desempenho" subtitle="Só das questões. Os flashcards têm as próprias estatísticas."
      actions={<SegmentedControl size="sm" aria-label="Período" value={period} onChange={setPeriod} options={PERIODS} />}>
      <div className="pf-tiles">
        <Tile label="Acerto" value={`${Math.round(m.accuracy * 100)}%`} note={m.total ? `${plural(m.total, "resposta", "respostas")}` : "sem respostas no período"} tone={m.total && m.accuracy >= 0.7 ? "ok" : undefined} />
        <Tile label="Questões" value={num(m.total)} note={`${num(Math.round(m.total / Math.max(1, m.days)))} por dia · meta ${num(goalDay)}`} />
        <Tile label="Tempo por questão" value={m.paceSec ? pace(m.paceSec) : "—"} note="média no período" />
        <Tile label="Dias na meta" value={`${num(hitDays)}`} note={`de ${plural(m.days, "dia", "dias")}`} />
      </div>

      <div className="cols cols--wide-aside">
        <div className="cols__main">
          <Section title="Acerto ao longo do tempo" action={<span className="pf-hint">{period === "30" ? "média dos 7 dias anteriores" : period === "7" ? "por dia" : "por semana"}</span>}>
            <div className="panel pf-panel">
              {line.some((p) => p.y != null) ? <LineChart points={line} goal={70} label={`Acerto ao longo do tempo, ${PERIODS.find((p) => p.value === period)!.label}`} dots={period === "7" || line.length <= 16} /> : <p className="muted">Sem respostas neste período.</p>}
            </div>
          </Section>

          <Section title={weeklyView ? "Questões por semana" : "Questões por dia"} action={<span className="pf-hint">a linha é a meta</span>}>
            <div className="panel pf-panel">
              <Columns cols={cols} goal={weeklyView ? goalDay * studyDays : goalDay} goalLabel={weeklyView ? `meta ${num(goalDay * studyDays)}` : `meta ${num(goalDay)}`} label={weeklyView ? "Questões por semana" : "Questões por dia"} format={(v) => num(Math.round(v))} />
            </div>
          </Section>

          <Section title="Por área">
            <div className="panel pf-panel">
              <div className="pf-areas" role="table" aria-label="Acerto e tempo por área">
                <div className="pf-areas__head" role="row"><span role="columnheader">Área</span><span role="columnheader">Acerto</span><span role="columnheader" className="r">Questões</span><span role="columnheader" className="r">Tempo</span></div>
                {areaRows.map(({ a, t }) => {
                  const p = pctOf(t!.ok, t!.n);
                  return (
                    <button key={a.id} type="button" role="row" className="pf-areas__row cd-hoverable" onClick={() => setArea(a.id)} aria-label={`${a.label}: ${p}% de acerto, ver especialidades`}>
                      <span role="cell" className="pf-areas__name"><Icon name={AREA_ICON[a.id]} size={18} />{a.label}</span>
                      <span role="cell" className="pf-areas__bar"><span className="pf-meter"><i style={{ width: p + "%" }} data-ok={p >= 70 ? "" : undefined} /><b style={{ left: "70%" }} aria-hidden /></span><span className="num pf-areas__pct">{p}%</span></span>
                      <span role="cell" className="r num">{num(t!.n)}</span>
                      <span role="cell" className="r num">{t!.msN ? pace(t!.ms / t!.msN / 1000) : "—"}</span>
                    </button>
                  );
                })}
              </div>
              <p className="result__note">A marca em 70% é a meta de acerto. Toque numa área para ver as especialidades.</p>
            </div>
          </Section>

          <Section title="Simulados" action={sims.length ? <button type="button" className="sec__link" onClick={() => nav("/simulados/resultados")}>Todos os resultados</button> : null}>
            <div className="panel pf-panel">
              {sims.length >= 2 ? <LineChart points={simPoints} goal={70} label="Nota nos simulados" dots /> : null}
              {sims.length ? (
                <ul className="pf-simlist">
                  {[...sims].reverse().slice(0, 4).map(({ s, pct }) => (
                    <li key={s.id}><button type="button" className="row cd-hoverable" onClick={() => nav("/resultado/" + s.id)}>
                      <span className={"hist__score num" + (pct >= 70 ? " is-ok" : "")}>{pct}%</span>
                      <span className="row__main"><span className="row__title">{s.title}</span><span className="row__sub">{cap(relativeDay(dayKey(s.finishedAt!)))}</span></span>
                      <span className="row__end"><Icon name="chevron-right" size={18} className="row__chev" /></span>
                    </button></li>
                  ))}
                </ul>
              ) : <p className="muted pf-empty-line">Nenhum simulado terminado neste período. <button type="button" className="sec__link" onClick={() => nav("/simulados")}>Ver provas</button></p>}
            </div>
          </Section>
        </div>

        <aside className="cols__aside">
          <Section title="Para revisar">
            <div className="panel pf-panel pf-due">
              <div><b className="num pf-due__n">{num(due)}</b><span>{due === 1 ? "questão errada esperando revisão" : "questões erradas esperando revisão"}</span></div>
              <Button variant="filled" disabled={!due} onClick={() => nav("/sessao/" + startErrors(15))}>{due ? `Revisar ${Math.min(15, due)}` : "Em dia"}</Button>
            </div>
          </Section>

          <Section title="Temas fracos que mais caem">
            {weak.length ? (
              <ul className="list">
                {weak.map((w) => (
                  <li key={w.key}><div className="row row--2 pf-weak">
                    <span className="row__main"><span className="row__title"><Icon name={AREA_ICON[w.key.split("/")[0]]} size={16} />{topicName(w.key)}</span>
                      <span className="row__sub num">{Math.round(w.acc * 100)}% de acerto · {plural(w.n, "resposta", "respostas")} · {(w.share * 100).toFixed(1).replace(".", ",")}% do banco</span></span>
                    <Button variant="tinted" size="sm" onClick={() => train([w.key], topicName(w.key))}>Treinar</Button>
                  </div></li>
                ))}
              </ul>
            ) : <p className="muted pf-empty-line">Com pelo menos 5 respostas numa especialidade, ela aparece aqui se o acerto estiver abaixo de 80%.</p>}
          </Section>

          <Section title="Progresso nas provas" action={exams.length > 6 ? <button type="button" className="sec__link" onClick={() => setAllExams((v) => !v)}>{allExams ? "Menos" : `Todas (${exams.length})`}</button> : null}>
            <div className="panel pf-panel pf-exams">
              {plan ? <p className="pf-hint">Primeiro as provas de {plan.banca}, a sua prova-alvo.</p> : null}
              {shownExams.map(({ e, p, n }) => (
                <div key={e.id} className="pf-exam">
                  <div className="pf-exam__head"><span className="pf-exam__name">{e.banca} <span className="num">{e.ano}</span>{/\d{4}[./](\d)$/.test(e.nome) ? <small> · {e.nome.match(/[./](\d)$/)![1]}ª</small> : e.nome.includes("Reaplica") ? <small> · reapl.</small> : null}</span>
                    <span className="pf-exam__val num">{num(p.done)}/{num(n)}{p.done ? <> · <b data-ok={pctOf(p.ok, p.done) >= 70 ? "" : undefined}>{pctOf(p.ok, p.done)}%</b></> : null}</span></div>
                  <span className="pf-meter pf-meter--thin"><i style={{ width: Math.min(100, (p.done / n) * 100) + "%" }} /></span>
                </div>
              ))}
            </div>
          </Section>
        </aside>
      </div>

      <Sheet open={!!area} onClose={() => setArea(null)} title={area ? AREAS.find((a) => a.id === area)!.label : ""} subtitle="Acerto por especialidade, da menor para a maior (desde o começo)"
        footer={espRows.length ? <Button variant="filled" icon={area ? AREA_ICON[area] : undefined} onClick={() => { const ks = espRows.slice(0, 3).map((r) => r.key); setArea(null); train(ks, ks.map(topicName).join(", ")); }}>Treinar as 3 mais fracas</Button> : undefined}>
        {espRows.length ? <BarList rows={espRows} goal={70} /> : <p className="muted">Responda mais questões de {area ? areaShort(area) : ""} para ver as especialidades.</p>}
      </Sheet>
    </Page>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "ok" }) {
  return (
    <div className="pf-tile" data-tone={tone}>
      <span className="caps">{label}</span>
      <b className="num">{value}</b>
      <small>{note}</small>
    </div>
  );
}
