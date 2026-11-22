/* Plantões e compromissos no calendário: marcar um ou vários dias, dizer o que estudar neles e mudar quando a escala muda.
   O cronograma se refaz sozinho: quem fica só com flashcards ou de folga sai da conta, e os temas seguem para os dias livres. */
import { useEffect, useMemo, useState } from "react";
import { Button, Chip, SegmentedControl, Stepper, Switch } from "../../ds/basics";
import { Sheet, useToast } from "../../ds/overlay";
import { addDays, longDate, num, shortDate } from "../../lib/format";
import type { DayKey } from "../../lib/format";
import { uid } from "../../lib/random";
import { DEFAULT_RULES, EVENT_LABEL, MODE_LABEL, useGoals } from "../../state/goals";
import type { DayEvent, DayEventKind, DayMode, DayRule } from "../../state/goals";
import { useDecks } from "../flashcards/decks";
import { Month } from "./Calendar";

const KINDS = Object.keys(EVENT_LABEL) as DayEventKind[];
const MODE_HINT: Record<DayMode, string> = {
  normal: "Só marca no calendário. O estudo do dia não muda.",
  leve: "Só o mínimo de questões, e os flashcards de sempre.",
  flashcards: "Sem questões neste dia. O tema passa para o próximo dia livre.",
  folga: "Nada planejado. O tema passa para o próximo dia livre.",
};

/** dias marcados e soltos viram intervalos: 3, 4 e 5 são um plantão só */
function toRanges(days: DayKey[]) {
  const sorted = [...days].sort(), out: { de: DayKey; ate: DayKey }[] = [];
  for (const k of sorted) {
    const last = out[out.length - 1];
    if (last && addDays(last.ate, 1) === k) last.ate = k; else out.push({ de: k, ate: k });
  }
  return out;
}

export function RuleFields({ rule, onChange }: { rule: DayRule; onChange: (r: DayRule) => void }) {
  const { decks } = useDecks();
  return (
    <>
      <SegmentedControl<DayMode> size="sm" block aria-label="O que estudar" value={rule.modo} onChange={(modo) => onChange({ ...rule, modo })}
        options={(Object.keys(MODE_LABEL) as DayMode[]).map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
      <p className="ev-hint">{MODE_HINT[rule.modo]}</p>
      {rule.modo === "flashcards" ? (
        <div className="ev-decks">
          <span className="setup__label">Quais baralhos</span>
          {decks.length ? (
            <div className="ev-chips" role="group" aria-label="Baralhos deste dia">
              <Chip pressed={!rule.decks.length} onChange={() => onChange({ ...rule, decks: [] })}>Os do plano</Chip>
              {decks.map((d) => <Chip key={d.id} pressed={rule.decks.includes(d.id)} onChange={(on) => onChange({ ...rule, decks: on ? [...rule.decks, d.id] : rule.decks.filter((x) => x !== d.id) })}>{d.name}</Chip>)}
            </div>
          ) : <p className="ev-hint">Você ainda não tem baralhos. Quando tiver, escolha aqui.</p>}
          <label className="setup__switch ev-cards">
            <span>Quantos cards</span>
            <Stepper label="Cards no dia" value={rule.cards ?? 50} min={10} max={500} step={10} onChange={(cards) => onChange({ ...rule, cards })} />
          </label>
        </div>
      ) : null}
    </>
  );
}

export function EventSheet({ open, onClose, initial, min, max }: { open: boolean; onClose: () => void; initial: DayKey; min?: DayKey; max?: DayKey }) {
  const regras = useGoals((s) => s.regras), addEventos = useGoals((s) => s.addEventos), setRegra = useGoals((s) => s.setRegra);
  const toast = useToast();
  const [tipo, setTipo] = useState<DayEventKind>("plantao");
  const [picked, setPicked] = useState<DayKey[]>([initial]);
  const [nome, setNome] = useState("");
  const [rule, setRule] = useState<DayRule>(regras.plantao || DEFAULT_RULES.plantao);
  const [always, setAlways] = useState(true);
  useEffect(() => { if (open) { setPicked([initial]); setNome(""); setTipo("plantao"); setRule(regras.plantao || DEFAULT_RULES.plantao); setAlways(true); } }, [open, initial]); // eslint-disable-line
  const chooseKind = (k: DayEventKind) => { setTipo(k); setRule(regras[k] || DEFAULT_RULES[k]); };
  const save = () => {
    if (always) setRegra(tipo, rule);
    addEventos(toRanges(picked).map((r): DayEvent => ({ id: uid(), ...r, tipo, ...(nome.trim() ? { nome: nome.trim() } : {}), ...(always ? {} : { regra: rule }) })));
    toast({ text: picked.length === 1 ? "Marcado. O cronograma já se ajustou." : `${num(picked.length)} dias marcados. O cronograma já se ajustou.`, icon: "check" });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Marcar no calendário" subtitle="Plantão muda toda hora: marque, tire e o cronograma se refaz." width={560}
      footer={<Button variant="filled" size="lg" disabled={!picked.length} onClick={save}>{picked.length > 1 ? `Marcar ${num(picked.length)} dias` : "Marcar"}</Button>}>
      <div className="setup">
        <div className="setup__group">
          <div className="setup__label">O que é</div>
          <div className="ev-chips" role="group" aria-label="Tipo">{KINDS.map((k) => <Chip key={k} pressed={tipo === k} onChange={() => chooseKind(k)}>{EVENT_LABEL[k]}</Chip>)}</div>
          <label className="fc-field"><span className="fc-field__label">Nome <small>opcional</small></span>
            <input className="fc-input" value={nome} maxLength={40} placeholder={tipo === "plantao" ? "Ex.: Plantão UPA" : ""} onChange={(e) => setNome(e.target.value)} />
          </label>
        </div>
        <div className="setup__group">
          <div className="setup__label">Quais dias <small className="ev-count">toque em quantos quiser</small></div>
          <div className="ev-month">
            <Month value={null} min={min} max={max} initial={initial} label="Dias do compromisso" onPick={(k) => setPicked((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))}
              render={(k) => (picked.includes(k) ? { className: "is-picked", aria: `${longDate(k)}, marcado` } : { aria: longDate(k) })} />
          </div>
        </div>
        <div className="setup__group">
          <div className="setup__label">O que estudar nesses dias</div>
          <RuleFields rule={rule} onChange={setRule} />
          <label className="setup__switch"><span>Usar sempre em {tipo === "plantao" ? "plantões" : tipo === "viagem" ? "viagens" : "compromissos deste tipo"}</span><Switch checked={always} onChange={setAlways} label="Usar sempre" /></label>
        </div>
      </div>
    </Sheet>
  );
}

/** os compromissos do dia escolhido, para tirar quando a escala muda */
export function DayEvents({ day, onAdd }: { day: DayKey; onAdd: () => void }) {
  const eventos = useGoals((s) => s.eventos), removeEvento = useGoals((s) => s.removeEvento), addEventos = useGoals((s) => s.addEventos);
  const toast = useToast();
  const here = useMemo(() => eventos.filter((e) => day >= e.de && day <= e.ate), [eventos, day]);
  const remove = (e: DayEvent) => {
    removeEvento(e.id);
    toast({ text: "Tirado do calendário.", icon: "check", action: "Desfazer", onAction: () => addEventos([e]) });
  };
  return (
    <div className="day-events">
      {here.map((e) => (
        <div key={e.id} className="day-events__it">
          <span><b>{e.nome || EVENT_LABEL[e.tipo]}</b>{e.de !== e.ate ? <small className="num">{shortDate(e.de)} a {shortDate(e.ate)}</small> : null}</span>
          <Button variant="plain" size="sm" icon="x" label={`Tirar ${e.nome || EVENT_LABEL[e.tipo]}`} onClick={() => remove(e)} />
        </div>
      ))}
      <Button variant="plain" size="sm" icon="plus" onClick={onAdd}>Marcar plantão ou compromisso</Button>
    </div>
  );
}
