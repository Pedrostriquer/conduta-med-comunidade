/* O resultado de uma análise: o que se repete nos erros, o que está indo bem, as próximas questões ou os próximos cards. */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiPost } from "../../api/client";
import { Page } from "../../app/Page";
import { getBank } from "../../data/bank";
import { Badge, Button } from "../../ds/basics";
import { useToast } from "../../ds/overlay";
import { Icon } from "../../ds/Icon";
import { plural } from "../../lib/format";
import { startList } from "../sessao/start";
import { EmptyState, Loading, Problem, errText, useApi } from "../comunidade/parts";
import { PATTERN } from "./api";
import type { Analise, FlashAnalise, Run } from "./api";
import { Priorities, Rhythm } from "./parts";

const Crumbs = [{ label: "Análises com IA", to: "/analises" }];

export function AnaliseView() {
  const { id = "" } = useParams();
  const d = useApi<{ item: Run }>(`/ia/analises/${id}`);
  useEffect(() => {
    if (d.data?.item.status !== "rodando") return;
    const t = setTimeout(d.reload, 2000);
    return () => clearTimeout(t);
  }, [d.data, d.reload]);
  const run = d.data?.item;
  const title = run ? (run.kind === "flashcards" ? `Flashcards de ${dayLabel(run.source.day)}` : run.source.title || "Análise") : "Análise";
  if (d.error) return <Page title="Análise" crumbs={Crumbs}><Problem error={d.error} onRetry={d.reload} /></Page>;
  if (!run) return <Page title="Análise" crumbs={Crumbs}><Loading /></Page>;
  return (
    <Page title={title} subtitle={new Date(run.createdAt).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })} crumbs={Crumbs}>
      {run.status === "rodando" ? <section className="panel an-wait"><span className="cd-spinner" aria-hidden /><div><b>Analisando</b><p>Costuma levar menos de um minuto. Pode sair daqui: a análise fica guardada.</p></div></section>
        : run.status === "erro" ? <EmptyState icon="alert" title="A análise não terminou">{run.error}</EmptyState>
        : run.kind === "flashcards" ? <FlashView run={run} reload={d.reload} /> : <ResultView run={run} />}
    </Page>
  );
}
const dayLabel = (d?: string) => { if (!d) return "hoje"; const [, m, x] = d.split("-"); return `${x}/${m}`; };

function QLinks({ sid, ns }: { sid?: string; ns: number[] }) {
  return <span className="an-qs">{ns.slice(0, 24).map((n) => (sid ? <Link key={n} className="num" to={`/correcao/${sid}?f=todas&i=${n - 1}`}>Q{n}</Link> : <span key={n} className="num">Q{n}</span>))}</span>;
}

function ResultView({ run }: { run: Run }) {
  const nav = useNavigate();
  const a = run.result?.analise as Analise | undefined, n = run.result?.numeros, rec = run.result?.recomendadas, sid = run.source.sessionId;
  const start = () => {
    const b = getBank(), ids = (rec?.ids || []).map((x) => x.id).filter((id) => b.byId[id]);
    nav("/sessao/" + startList({ ids, title: "Recomendadas: " + (run.source.title || "análise"), source: { type: "analise", id: run.id } }));
  };
  return (
    <div className="cols">
      <div className="cols__main">
        {a ? <section className="panel an-summary"><p>{a.resumo}</p>{a.comparacao ? <p className="an-compare"><b>Comparando com a anterior:</b> {a.comparacao}</p> : null}</section> : null}
        {a?.padroes_erro.length ? (
          <section className="panel an-block">
            <h2 className="sec__title">O que se repete nos erros</h2>
            <ul className="an-patterns">
              {a.padroes_erro.map((p, i) => (
                <li key={i}>
                  <div className="an-patterns__top"><b>{p.titulo}</b><Badge tone="neutral">{PATTERN[p.tipo] || p.tipo}</Badge></div>
                  <p>{p.explicacao}</p>
                  {p.o_que_fazer ? <p className="an-do"><Icon name="chevron-right" size={14} />{p.o_que_fazer}</p> : null}
                  <QLinks sid={sid} ns={p.questoes} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {a?.padroes_acerto.length ? (
          <section className="panel an-block">
            <h2 className="sec__title">O que está indo bem</h2>
            <ul className="an-patterns">{a.padroes_acerto.map((p, i) => <li key={i}><b>{p.titulo}</b><p>{p.explicacao}</p><QLinks sid={sid} ns={p.questoes} /></li>)}</ul>
          </section>
        ) : null}
        {n ? <section className="panel an-block"><Rhythm n={n} /></section> : null}
      </div>
      <aside className="cols__aside">
        {rec?.ids.length ? (
          <section className="panel ract" aria-label="Próximas questões">
            <h2 className="qsum__title">Próximas questões</h2>
            <p className="ract__hint">{plural(rec.ids.length, "questão escolhida", "questões escolhidas")} pelo que mais perde pontos: primeiro o que você errou mais de uma vez, depois o que ainda não fez nos temas fracos.</p>
            <ul className="an-peraarea">{rec.perArea.map((x) => <li key={x.area}><span>{x.nome}</span><b className="num">{x.n}</b></li>)}</ul>
            <Button variant="filled" size="lg" block onClick={start}>Fazer {rec.ids.length === 1 ? "a questão" : `as ${rec.ids.length}`}</Button>
          </section>
        ) : null}
        {a?.proximos_passos.length ? (
          <section className="panel an-block">
            <h2 className="sec__title">Próximos passos</h2>
            <ol className="an-steps">{a.proximos_passos.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </section>
        ) : null}
        {n ? <section className="panel an-block"><Priorities n={n} /></section> : null}
        {sid ? <Button variant="plain" block onClick={() => nav("/resultado/" + sid)}>Voltar ao resultado</Button> : null}
      </aside>
    </div>
  );
}

function FlashView({ run, reload }: { run: Run; reload: () => void }) {
  const toast = useToast();
  const a = run.result?.analise as FlashAnalise | undefined, cards = run.result?.cards || [], applied = run.result?.applied;
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    try { const r = await apiPost<{ applied: number }>(`/ia/analises/${run.id}/aplicar`); toast({ text: `${plural(r.applied, "card vai", "cards vão")} na próxima revisão.`, icon: "check" }); reload(); }
    catch (e) { toast({ text: errText(e), icon: "alert" }); } finally { setBusy(false); }
  };
  return (
    <div className="cols">
      <div className="cols__main">
        {a ? <section className="panel an-summary"><p>{a.resumo}</p></section> : null}
        {a?.temas.length ? (
          <section className="panel an-block">
            <h2 className="sec__title">Onde você mais errou</h2>
            <ul className="an-patterns">{a.temas.map((t, i) => <li key={i}><b>{t.nome}</b><p>{t.explicacao}</p></li>)}</ul>
          </section>
        ) : null}
      </div>
      <aside className="cols__aside">
        <section className="panel ract" aria-label="Cards para a próxima revisão">
          <h2 className="qsum__title">Para a próxima revisão</h2>
          {!cards.length ? <p className="ract__hint">Não achamos nos seus baralhos outros cards desses temas que valham a pena: os parecidos você já aprendeu.</p> : (
            <>
              <p className="ract__hint">Cards dos seus baralhos sobre os mesmos temas. Só entra o que você ainda não viu ou vem errando; o que já aprendeu fica de fora. Eles ocupam as vagas de novos, sem aumentar sua meta.</p>
              <ul className="an-cards">{cards.map((c) => <li key={c.id}><span>{c.frente}</span><small>{c.tema} · {c.motivo}</small></li>)}</ul>
              {applied ? <p className="result__perfect"><Icon name="check" size={18} strokeWidth={2.25} />Já estão na fila.</p> : <Button variant="filled" size="lg" block loading={busy} onClick={apply}>Colocar na próxima revisão</Button>}
            </>
          )}
        </section>
      </aside>
    </div>
  );
}
