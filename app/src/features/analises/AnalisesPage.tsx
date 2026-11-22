/* Análises com IA: o crédito do mês, a análise automática dos flashcards e o histórico. As provas e listas se analisam pela tela de resultado. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiPost } from "../../api/client";
import { Page } from "../../app/Page";
import { Badge, Button, SegmentedControl, Stepper } from "../../ds/basics";
import { useToast } from "../../ds/overlay";
import { Meter } from "../../ds/progress";
import { Icon } from "../../ds/Icon";
import { num } from "../../lib/format";
import { flushBeforeLeaving } from "../../sync/engine";
import { EmptyState, Loading, Problem, errText, relTime, useApi } from "../comunidade/parts";
import { FLASH_FILTER, pctText } from "./api";
import type { Credit, FlashSettings, Run } from "./api";

export function AnalisesPage() {
  const nav = useNavigate();
  const credit = useApi<Credit>("/ia/credito"), list = useApi<{ items: Run[] }>("/ia/analises");
  const items = list.data?.items || [];
  return (
    <Page title="Análises com IA" subtitle="Padrões de erro e de acerto, e o que fazer em seguida.">
      <div className="cols">
        <div className="cols__main">
          <section className="panel an-block">
            <h2 className="sec__title">Suas análises</h2>
            {list.error ? <Problem error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : !items.length ? (
              <EmptyState icon="sparkle" title="Nenhuma análise ainda" action={<Button variant="tinted" size="sm" onClick={() => nav("/simulados/resultados")}>Ver meus resultados</Button>}>Termine uma prova ou lista e toque em Analisar, na tela de resultado.</EmptyState>
            ) : (
              <ul className="list">
                {items.map((x) => (
                  <li key={x.id}><button type="button" className="row row--icon cd-hoverable" onClick={() => nav("/analises/" + x.id)}>
                    <span className="row__icon"><Icon name={x.kind === "flashcards" ? "cards" : "exam"} size={20} /></span>
                    <span className="row__main">
                      <span className="row__title">{x.kind === "flashcards" ? "Flashcards do dia" : x.source.title}{x.trigger === "auto" ? <Badge tone="neutral">automática</Badge> : null}</span>
                      <span className="row__sub">{x.status === "rodando" ? "Analisando" : x.status === "erro" ? "Não terminou" : relTime(x.createdAt)}</span>
                    </span>
                    <Icon name="chevron-right" size={18} className="row__chev" />
                  </button></li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="cols__aside">
          <CreditCard c={credit.data} />
          <FlashCard reload={list.reload} />
        </aside>
      </div>
    </Page>
  );
}

function CreditCard({ c }: { c: Credit | null }) {
  if (!c) return null;
  const renews = new Date(c.renews + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  return (
    <section className="panel an-block" aria-label="Crédito de IA">
      <h2 className="sec__title">Seu crédito deste mês</h2>
      {c.available ? <>
        <Meter label="Usado" value={Math.round(c.percentUsed * 10) / 10} max={100} valueLabel={pctText(c.percentUsed)} tone={c.percentUsed > 90 ? "warning" : undefined} />
        <p className="an-hint num">{num(c.runs)} {c.runs === 1 ? "análise" : "análises"} neste mês. Renova em {renews}.</p>
      </> : <p className="an-hint">As análises com IA ainda não foram ligadas. Os números de cada prova já aparecem, sem usar crédito.</p>}
    </section>
  );
}

function FlashCard({ reload }: { reload: () => void }) {
  const nav = useNavigate(), toast = useToast();
  const d = useApi<FlashSettings>("/ia/ajustes");
  const [f, setF] = useState<FlashSettings | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => { if (d.data) setF(d.data); }, [d.data]);
  if (!f) return null;
  const save = async (p: Partial<FlashSettings>) => {
    const next = { ...f, ...p };
    setF(next);
    try { await api("/ia/ajustes", { method: "PUT", body: { modo: next.modo, limite: next.limite, filtro: next.filtro, puxar: next.puxar } }); }
    catch (e) { toast({ text: errText(e), icon: "alert" }); }
  };
  const near = [10, 30, 60, 100].reduce((b, n) => (Math.abs(n - f.limite) < Math.abs(b - f.limite) ? n : b), 30);
  const day = (f.estimativa[near] ?? 0) * (f.limite / near);
  const run = async () => {
    setBusy(true);
    try {
      await flushBeforeLeaving(8000).catch(() => {});
      const r = await apiPost<{ id: string }>("/ia/flashcards", {});
      reload();
      nav("/analises/" + r.id);
    } catch (e) { toast({ text: errText(e), icon: "alert" }); } finally { setBusy(false); }
  };
  return (
    <section className="panel an-block an-flash" aria-label="Análise dos flashcards">
      <h2 className="sec__title">Análise dos flashcards</h2>
      <p className="an-hint">Olha os cards que você errou no dia, acha os temas e procura nos seus baralhos outros cards iguais para a próxima revisão. O que você já aprendeu fica de fora.</p>
      <SegmentedControl<FlashSettings["modo"]> size="sm" block aria-label="Quando rodar" value={f.modo} onChange={(modo) => save({ modo })} options={[{ value: "desligado", label: "Desligada" }, { value: "manual", label: "Ao pedir" }, { value: "meta", label: "Na meta" }]} />
      {f.modo === "meta" ? <p className="an-hint">Roda sozinha, uma vez por dia, quando você bate a meta de cards, e já coloca os parecidos na próxima revisão.</p> : f.modo === "manual" ? <p className="an-hint">Só roda quando você tocar em analisar, e você decide se os parecidos entram na fila.</p> : null}
      {f.modo !== "desligado" ? <>
        <div className="adm-row"><span>Quais cards</span>
          <select className="fc-input fc-input--sm" aria-label="Quais cards" value={f.filtro} onChange={(e) => save({ filtro: e.target.value as FlashSettings["filtro"] })}>{(Object.keys(FLASH_FILTER) as FlashSettings["filtro"][]).map((k) => <option key={k} value={k}>{FLASH_FILTER[k]}</option>)}</select>
        </div>
        <div className="adm-row"><span>Até quantos por dia</span><Stepper label="Cards analisados por dia" value={f.limite} min={5} max={200} step={5} onChange={(limite) => save({ limite })} /></div>
        <div className="adm-row"><span>Puxar até quantos parecidos</span><Stepper label="Cards puxados" value={f.puxar} min={0} max={50} step={5} onChange={(puxar) => save({ puxar })} /></div>
        <p className="an-cost num"><b>Cerca de {pctText(day)} do crédito por dia</b><small>{f.modo === "meta" ? `Rodando todo dia, uns ${pctText(day * 30)} do mês.` : "Só gasta quando você pedir."}</small></p>
        <Button variant="gray" block loading={busy} onClick={run}>Analisar os cards de hoje</Button>
      </> : null}
    </section>
  );
}
