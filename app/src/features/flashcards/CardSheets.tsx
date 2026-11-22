/* Folhas do card: editar os campos (e as etiquetas) e as informações do card com o histórico de revisões. */
import { useEffect, useState } from "react";
import { Button } from "../../ds/basics";
import { Sheet } from "../../ds/overlay";
import { cx } from "../../lib/cx";
import { dayKey, longDate, num } from "../../lib/format";
import { isQa, logs } from "./db";
import type { CardRec, RevLog } from "./db";
import { daysText, stateOf } from "./decks";

export const FIELD_NAMES: Record<CardRec["kind"], string[]> = { qa: ["Pergunta", "Resposta", "Referência"], cloze: ["Texto", "Extra"], basic: ["Frente", "Verso"] };
export const tagsText = (t?: string[]) => (t || []).join(" ");
export const parseTags = (s: string) => [...new Set(s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))];

export function CardEditor({ card, onClose, onSave }: { card: CardRec | null; onClose: () => void; onSave: (c: CardRec) => void }) {
  const [fields, setFields] = useState<string[]>([]);
  const [tags, setTags] = useState("");
  useEffect(() => { if (card) { setFields([...card.fields]); setTags(tagsText(card.tags)); } }, [card]);
  const names = card ? FIELD_NAMES[isQa(card.kind) ? "qa" : card.kind] : [];
  return (
    <Sheet open={!!card} onClose={onClose} title="Editar card" subtitle={card ? card.path.join(" › ") : undefined} width={620}
      footer={<div className="cd-row" style={{ justifyContent: "flex-end" }}><Button variant="gray" onClick={onClose}>Cancelar</Button><Button variant="filled" onClick={() => card && onSave({ ...card, fields, tags: parseTags(tags) })}>Salvar</Button></div>}>
      <div className="fc-form">
        {names.map((n, i) => (
          <label key={n} className="fc-field">
            <span className="fc-field__label">{n}</span>
            <textarea className="fc-input fc-input--area" value={fields[i] || ""} rows={i === 0 ? 5 : 4} onChange={(e) => setFields((f) => { const x = [...f]; x[i] = e.target.value; return x; })} />
          </label>
        ))}
        <label className="fc-field">
          <span className="fc-field__label">Etiquetas</span>
          <input className="fc-input" value={tags} placeholder="separadas por espaço" onChange={(e) => setTags(e.target.value)} />
        </label>
        <p className="fc-help">Os campos aceitam o HTML do Anki (negrito, listas, imagens já importadas).</p>
      </div>
    </Sheet>
  );
}

const RATE_LABEL: Record<RevLog["rate"], string> = { again: "De novo", hard: "Difícil", good: "Bom", easy: "Fácil" };
const KIND_LABEL: Record<RevLog["kind"], string> = { new: "Novo", learn: "Aprendendo", review: "Revisão", relearn: "Reaprendendo" };

export function CardInfo({ card, onClose }: { card: CardRec | null; onClose: () => void }) {
  const [hist, setHist] = useState<RevLog[] | null>(null);
  useEffect(() => { if (card) { setHist(null); logs(card.deck).then((xs) => setHist(xs.filter((l) => l.card === card.id).sort((a, b) => b.at - a.at))); } }, [card]);
  if (!card) return <Sheet open={false} onClose={onClose}><span /></Sheet>;
  const st = stateOf(card);
  const facts: [string, string][] = [
    ["Estado", st.label],
    ["Vence", card.isNew ? "quando entrar como novo" : longDate(dayKey(card.due), true)],
    ["Intervalo", card.ivl ? daysText(card.ivl) : "—"],
    ["Facilidade", card.isNew ? "—" : Math.round(card.ease * 100) + "%"],
    ["Revisões", num(card.reps)],
    ["Lapsos", num(card.lapses)],
    ["Primeira vez", card.introduced ? longDate(dayKey(card.introduced), true) : "ainda não estudado"],
    ["Etiquetas", card.tags?.length ? card.tags.join(", ") : "—"],
  ];
  return (
    <Sheet open onClose={onClose} title="Informações do card" subtitle={card.path.join(" › ")} width={560}>
      <dl className="fc-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>
      <h3 className="fc-sub">Histórico</h3>
      {!hist ? null : !hist.length ? <p className="fc-help">Nenhuma revisão registrada neste aparelho.</p> : (
        <ul className="fc-hist">
          {hist.slice(0, 30).map((l) => (
            <li key={l.id}>
              <span className="num">{new Date(l.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              <span>{KIND_LABEL[l.kind]}</span>
              <span className={cx("fc-hist__rate", "is-" + l.rate)}>{RATE_LABEL[l.rate]}</span>
              <span className="num">{l.ivl ? daysText(l.ivl) : "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
