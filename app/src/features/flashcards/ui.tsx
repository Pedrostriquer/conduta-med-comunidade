/* Peças das telas de flashcards: contagens de hoje (novos, aprendendo, revisar), linhas de opção e o menu de bandeiras. */
import type { ReactNode } from "react";
import { Counter } from "../../ds/progress";
import { cx } from "../../lib/cx";
import { num } from "../../lib/format";
import { FLAGS } from "./decks";

/** as três contagens do Anki, nas cores do design system: novos em azul, aprendendo em âmbar, revisar em verde */
export function Counts({ fresh, learn, rev, size, labels = true }: { fresh: number; learn: number; rev: number; size?: "lg"; labels?: boolean }) {
  const item = (n: number, label: string, tone: string) => (
    <span className={cx("fc-count", "fc-count--" + tone, !n && "is-zero")} title={`${num(n)} ${label}`}>
      <b className="num"><Counter value={n} /></b>{labels ? <small>{label}</small> : null}
    </span>
  );
  return (
    <span className={cx("fc-counts", size === "lg" && "fc-counts--lg")} aria-label={`${num(fresh)} novos, ${num(learn)} aprendendo, ${num(rev)} para revisar`}>
      {item(fresh, "novos", "new")}{item(learn, "aprendendo", "learn")}{item(rev, "revisar", "rev")}
    </span>
  );
}

/** linha de opção: título e explicação à esquerda, controle à direita (empilha no celular) */
export function Opt({ title, hint, children, id }: { title: ReactNode; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <li><div className="row row--stack fc-opt" id={id}>
      <span className="row__main"><span className="row__title">{title}</span>{hint ? <span className="row__sub">{hint}</span> : null}</span>
      <div className="fc-opt__ctl">{children}</div>
    </div></li>
  );
}

export function FlagDot({ flag, size = 10 }: { flag?: number; size?: number }) {
  const f = FLAGS.find((x) => x.id === flag);
  if (!f) return null;
  return <i className="fc-flagdot" style={{ background: f.color, width: size, height: size }} title={"Bandeira " + f.name.toLowerCase()} aria-label={"Bandeira " + f.name.toLowerCase()} />;
}

export function FlagPicker({ value, onPick }: { value?: number; onPick: (f: number) => void }) {
  return (
    <div className="fc-flags" role="radiogroup" aria-label="Bandeira">
      <button type="button" role="radio" aria-checked={!value} className="fc-flags__opt cd-hoverable" onClick={() => onPick(0)} aria-label="Sem bandeira"><i className="fc-flags__none" /></button>
      {FLAGS.map((f) => (
        <button key={f.id} type="button" role="radio" aria-checked={value === f.id} className="fc-flags__opt cd-hoverable" onClick={() => onPick(f.id)} aria-label={"Bandeira " + f.name.toLowerCase()} title={f.name}>
          <i style={{ background: f.color }} />
        </button>
      ))}
    </div>
  );
}
