/* Antes de gastar: os números da prova (sem IA e sem crédito), o que entra na análise e quanto do crédito isso usa.
   Se ficar pesado, a tela sugere o que tirar. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../../api/client";
import { getBank } from "../../data/bank";
import { Button, SegmentedControl, Switch } from "../../ds/basics";
import { Sheet, useToast } from "../../ds/overlay";
import { Icon } from "../../ds/Icon";
import { num, plural } from "../../lib/format";
import { useStore } from "../../state/store";
import { flushBeforeLeaving } from "../../sync/engine";
import { startList } from "../sessao/start";
import { Loading, Problem, errText, useApi } from "../comunidade/parts";
import { pctText } from "./api";
import type { Estimate, ResultOptions, Run } from "./api";
import { Priorities, Rhythm } from "./parts";

const pad = { detalhe: "padrao", acertos: true, dicas: true, transcricao: false, anterior: null } as ResultOptions;

export function AnaliseSheet({ sessionId, open, onClose }: { sessionId: string; open: boolean; onClose: () => void }) {
  const nav = useNavigate(), toast = useToast();
  const [opts, setOpts] = useState<ResultOptions>(pad);
  const [est, setEst] = useState<Estimate | null>(null), [err, setErr] = useState<unknown>(null), [busy, setBusy] = useState(false), [tick, setTick] = useState(0);
  const history = useApi<{ items: Run[] }>(open ? "/ia/analises" : null);
  const previous = useMemo(() => (history.data?.items || []).filter((x) => x.kind === "resultado" && x.status === "feito" && x.source.sessionId !== sessionId), [history.data, sessionId]);
  useEffect(() => {
    if (!open) return;
    let off = false;
    setErr(null);
    (async () => {
      // o servidor precisa ter a sessão que acabou de terminar
      await flushBeforeLeaving(8000).catch(() => {});
      try { const r = await apiPost<Estimate>("/ia/estimar", { sessionId, options: opts }); if (!off) setEst(r); }
      catch (e) { if (!off) setErr(e); }
    })();
    return () => { off = true; };
  }, [open, sessionId, opts, tick]);
  const set = (p: Partial<ResultOptions>) => setOpts((x) => ({ ...x, ...p }));
  const run = async () => {
    setBusy(true);
    try {
      const r = await apiPost<{ id: string }>("/ia/analises", { sessionId, options: opts });
      useStore.setState((st) => (st.sessions[sessionId] ? { sessions: { ...st.sessions, [sessionId]: { ...st.sessions[sessionId], analise: r.id } } } : st));
      onClose();
      nav("/analises/" + r.id);
    } catch (e) { toast({ text: errText(e), icon: "alert" }); setTick((t) => t + 1); } finally { setBusy(false); }
  };
  const doRecommended = () => {
    if (!est) return;
    const b = getBank(), ids = est.recomendadas.ids.map((x) => x.id).filter((id) => b.byId[id]);
    onClose();
    nav("/sessao/" + startList({ ids, title: "Recomendadas: " + est.numeros.geral.titulo, source: { type: "busca", query: "recomendadas" } }));
  };
  const blocked = est?.blocked;
  return (
    <Sheet open={open} onClose={onClose} title="Analisar esta prova" subtitle="Os números saem na hora e não usam crédito." width={600}
      footer={est && !blocked ? <Button variant="filled" size="lg" icon="sparkle" loading={busy} onClick={run}>Gerar análise</Button> : null}>
      {err ? <Problem error={err} onRetry={() => setTick((t) => t + 1)} /> : !est ? <Loading label="Calculando" /> : (
        <div className="setup an-sheet">
          <Priorities n={est.numeros} />
          <Rhythm n={est.numeros} />
          {est.recomendadas.ids.length ? (
            <div className="an-rec">
              <div><b>{plural(est.recomendadas.ids.length, "questão sugerida", "questões sugeridas")}</b><small>{est.recomendadas.perArea.map((a) => `${a.nome} ${a.n}`).join(" · ")}</small></div>
              <Button variant="gray" size="sm" onClick={doRecommended}>Fazer agora</Button>
            </div>
          ) : null}
          <div className="setup__group">
            <div className="setup__label">Análise com IA <small className="ev-count">procura padrões de erro e de acerto</small></div>
            {blocked ? <p className="an-notice"><Icon name="alert" size={16} />{blocked.message}</p> : (
              <>
                <div className="adm-row"><span>Quanto mandar de cada erro</span>
                  <SegmentedControl<ResultOptions["detalhe"]> size="sm" aria-label="Detalhe" value={opts.detalhe} onChange={(detalhe) => set({ detalhe })} options={[{ value: "leve", label: "Leve" }, { value: "padrao", label: "Padrão" }, { value: "completo", label: "Completo" }]} />
                </div>
                <label className="setup__switch"><span>Incluir as questões certas<small className="an-hint">Para achar também o que você faz bem.</small></span><Switch checked={opts.acertos} onChange={(acertos) => set({ acertos })} label="Incluir as questões certas" /></label>
                <label className="setup__switch"><span>Dicas do professor<small className="an-hint">O resumo do que foi dito no vídeo.</small></span><Switch checked={opts.dicas} onChange={(dicas) => set({ dicas })} label="Dicas do professor" /></label>
                <label className="setup__switch"><span>Transcrição dos vídeos<small className="an-hint">Pesa bastante e, nos nossos testes, não melhorou a análise.</small></span><Switch checked={opts.transcricao} onChange={(transcricao) => set({ transcricao })} label="Transcrição dos vídeos" /></label>
                {previous.length ? (
                  <label className="setup__switch"><span>Comparar com uma análise anterior<small className="an-hint">Mostra o que melhorou e o que se repetiu.</small></span>
                    <select className="fc-input fc-input--sm an-prev" aria-label="Análise anterior" value={opts.anterior || ""} onChange={(e) => set({ anterior: e.target.value || null })}>
                      <option value="">Não comparar</option>
                      {previous.slice(0, 12).map((x) => <option key={x.id} value={x.id}>{x.source.title} · {new Date(x.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</option>)}
                    </select>
                  </label>
                ) : null}
                <div className="an-cost" role="status">
                  <b className="num">Usa cerca de {pctText(est.percent)} do seu crédito do mês</b>
                  <small className="num">Restam {pctText(est.percentLeft)}{est.runsLeft != null && est.runsLeft < 1000 ? `, o que dá umas ${num(est.runsLeft)} análises como esta` : ""}. Renova no dia 1.</small>
                </div>
                {est.suggestions.length && est.percent > 1 ? (
                  <div className="an-lighter">
                    <small>Para gastar menos:</small>
                    {est.suggestions.map((s) => <button key={s.label} type="button" className="cd-hoverable" onClick={() => set(s.options)}>{s.label}<span className="num"> · {pctText(s.percent)}</span></button>)}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
