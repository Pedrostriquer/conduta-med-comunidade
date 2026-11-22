/* A proporção de cada área numa banca. O número inicial é uma estimativa a partir das provas que temos;
   quem discorda ajusta, e vale para o embaralhado, para o cronograma e para as análises com IA. */
import { useEffect, useMemo, useState } from "react";
import { useBank } from "../../data/bank";
import { estimatedShares, roundShares } from "../../data/select";
import type { Shares } from "../../data/select";
import { AREAS, areaShort } from "../../data/types";
import { Button, Stepper } from "../../ds/basics";
import { Sheet, useToast } from "../../ds/overlay";
import { useGoals } from "../../state/goals";

export function ProportionBar({ shares }: { shares: Shares }) {
  return <div className="prop-bar" aria-hidden>{AREAS.map((a) => (shares[a.id] ? <i key={a.id} data-a={a.id} style={{ flexGrow: shares[a.id] }} /> : null))}</div>;
}

export function ProportionSummary({ banca, onEdit }: { banca: string; onEdit: () => void }) {
  const bank = useBank()!;
  const custom = useGoals((s) => s.proporcoes[banca]);
  const shares = useMemo(() => custom || estimatedShares(bank, banca), [custom, bank, banca]);
  return (
    <div className="prop-sum">
      <div className="prop-sum__top"><span>{custom ? "Sua proporção" : "Proporção estimada"} do {banca}</span><Button variant="plain" size="sm" onClick={onEdit}>Ajustar</Button></div>
      <ProportionBar shares={shares} />
      <div className="prop-sum__legend num">{AREAS.map((a) => <span key={a.id}><i data-a={a.id} aria-hidden />{a.short} {shares[a.id]}%</span>)}</div>
    </div>
  );
}

export function ProportionSheet({ banca, open, onClose }: { banca: string; open: boolean; onClose: () => void }) {
  const bank = useBank()!, toast = useToast();
  const saved = useGoals((s) => s.proporcoes[banca]), setProporcao = useGoals((s) => s.setProporcao);
  const est = useMemo(() => estimatedShares(bank, banca), [bank, banca]);
  const [v, setV] = useState<Shares>(saved || est);
  useEffect(() => { if (open) setV(saved || est); }, [open]); // eslint-disable-line
  const total = AREAS.reduce((s, a) => s + v[a.id], 0);
  const save = () => {
    const next = roundShares(v, 100), same = AREAS.every((a) => next[a.id] === est[a.id]);
    setProporcao(banca, same ? null : next);
    toast({ text: total === 100 ? "Proporção salva." : "Salvo, ajustado para somar 100%.", icon: "check", duration: 2400 });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Proporção do ${banca}`} subtitle="Estimativa pelas provas que temos da banca. Se você discorda, ajuste: vale para o simulado embaralhado, o cronograma e as análises." width={480}
      footer={<>
        {saved ? <Button variant="plain" onClick={() => { setProporcao(banca, null); toast({ text: "Voltou para a estimativa.", icon: "check", duration: 2400 }); onClose(); }}>Voltar para a estimativa</Button> : null}
        <Button variant="filled" size="lg" disabled={!total} onClick={save}>Salvar</Button>
      </>}>
      {AREAS.map((a) => (
        <div key={a.id} className="prop-row">
          <div className="prop-row__l"><span>{a.label}</span><small className="num">Estimativa: {est[a.id]}%</small></div>
          <Stepper label={`${areaShort(a.id)}, em porcentagem`} value={v[a.id]} min={0} max={100} step={1} format={(x) => x + "%"} onChange={(x) => setV((s) => ({ ...s, [a.id]: x }))} />
        </div>
      ))}
      <div className="prop-total num" data-off={total !== 100 ? "" : undefined}><span>Soma</span><span>{total}%{total !== 100 ? " · ao salvar, ajustamos para 100%" : ""}</span></div>
    </Sheet>
  );
}
