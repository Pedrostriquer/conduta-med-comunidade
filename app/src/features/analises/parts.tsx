/* Peças das análises. */
import { AREAS } from "../../data/types";
import type { AreaId } from "../../data/types";
import { Icon } from "../../ds/Icon";
import { num } from "../../lib/format";
import type { Numeros } from "./api";

const AREA_ICON: Record<string, string> = Object.fromEntries(AREAS.map((a) => [a.id, a.id]));
const pct = (x: number) => Math.round(x * 100) + "%";

/** Onde a nota está sendo perdida: o peso da área na prova conta tanto quanto o acerto */
export function Priorities({ n }: { n: Numeros }) {
  const max = Math.max(1, ...n.areas.map((a) => a.perda));
  return (
    <section className="an-pri" aria-label="Onde você perde mais pontos">
      <h3 className="sec__title">Onde você perde mais pontos</h3>
      <p className="an-hint">Peso da área na prova{n.geral.banca ? ` do ${n.geral.banca}` : ""} × o que você erra. Por isso uma área que pesa muito e foi médio pode vir antes de uma que pesa pouco e foi mal.</p>
      <ul>
        {n.areas.map((a) => (
          <li key={a.area}>
            <div className="an-pri__top"><b>{a.nome}</b><span className="num">{a.perda.toFixed(1).replace(".", ",")} pontos</span></div>
            <span className="an-pri__bar" aria-hidden data-area={AREA_ICON[a.area as AreaId]}><i style={{ transform: `scaleX(${a.perda / max})` }} /></span>
            <small className="num">Pesa {a.peso}%{a.n ? ` · aqui ${a.ok} de ${a.n} (${pct(a.ok / a.n)})` : ""}{a.histN ? ` · antes ${pct(a.histOk / a.histN)} em ${num(a.histN)}` : ""}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** os dois sinais que passam batido: o ritmo caindo ao longo da prova e o erro que se repete */
export function Rhythm({ n }: { n: Numeros }) {
  const r = n.ritmo?.filter((x) => x.n) || [], rep = n.repetidas || [], chutes = n.chutes || [];
  const drop = r.length === 3 && r[0].segundos > 0 && r[2].segundos < r[0].segundos * 0.7;
  if (!r.some((x) => x.segundos) && !rep.length && !chutes.length) return null;
  return (
    <section className="an-sig">
      {r.some((x) => x.segundos) ? (
        <div className="an-sig__box">
          <h3 className="sec__title">Ritmo ao longo da prova</h3>
          <div className="an-thirds">
            {r.map((x) => <div key={x.parte}><small className="num">Q{x.de} a Q{x.ate}</small><b className="num">{x.certas} de {x.n}</b><span className="num">{x.segundos} s por questão{x.brancos ? ` · ${x.brancos} em branco` : ""}</span></div>)}
          </div>
          {drop ? <p className="an-notice"><Icon name="clock" size={15} />Você acelerou no fim da prova.</p> : null}
        </div>
      ) : null}
      {rep.length ? <p className="an-notice"><Icon name="undo" size={15} /><span><b className="num">{rep.length}</b> {rep.length === 1 ? "questão errada aqui você já tinha errado antes" : "questões erradas aqui você já tinha errado antes"}: {rep.slice(0, 14).map((x) => "Q" + x.n).join(", ")}{rep.length > 14 ? "…" : ""}</span></p> : null}
      {chutes.length ? <p className="an-notice"><Icon name="alert" size={15} /><span><b className="num">{chutes.length}</b> {chutes.length === 1 ? "acerto foi chute" : "acertos foram chute"}: não contam como domínio.</span></p> : null}
    </section>
  );
}
