/* Treino de digitar: a estrutura acende, a pessoa digita o nome, ela some.
   Tela de escolha: o "do dia", o aquecimento, o Explorar e os três modos. Em Ossos e Músculos a região pode ser
   escolhida no corpo 3D ou na lista ao lado; "Principal" mostra o que a faculdade e as provas cobram, "Completo" mostra
   tudo. Nada é travado: todo nível está liberado desde o começo, só com a marca do que já foi dominado. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Page } from "../../app/Page";
import { SegmentedControl } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { CONJUNTOS, TITULO_MODO, tituloConjunto } from "./catalogo";
import type { Conjunto, Modo } from "./catalogo";
import { CorpoEscolha } from "./CorpoEscolha";
import { doDia, hoje, resumo, useTreino } from "./progresso";
import type { Resumo } from "./progresso";
import "../../styles/treino.css";

const MODOS: Modo[] = ["ossos", "musculos", "ecg"];
const SOBRE: Record<Modo, string> = {
  ossos: "O osso da vez acende em 3D, com os vizinhos em volta.",
  musculos: "O músculo da vez sobre o esqueleto, em 3D.",
  ecg: "Ritmos e padrões no papel milimetrado, a 25 mm/s.",
};
const ALCANCE = [{ value: "principal" as const, label: "Principal" }, { value: "completo" as const, label: "Completo" }];
const soma = (rs: Resumo[]) => rs.reduce((a, r) => ({ total: a.total + r.total, vistos: a.vistos + r.vistos, dominados: a.dominados + r.dominados, rever: a.rever + r.rever }), { total: 0, vistos: 0, dominados: 0, rever: 0 });

function Barra({ r }: { r: Resumo }) {
  return (
    <span className="tr-barra" role="img" aria-label={`${r.dominados} de ${r.total} dominados`}>
      <i style={{ width: (100 * r.vistos) / r.total + "%" }} data-tipo="visto" />
      <i style={{ width: (100 * r.dominados) / r.total + "%" }} />
    </span>
  );
}

export function TreinoPage() {
  const nav = useNavigate();
  const [q, setQ] = useSearchParams();
  const modo = (MODOS.includes(q.get("modo") as Modo) ? q.get("modo") : "ossos") as Modo;
  const completo = q.get("ver") === "completo";
  const mudar = (p: { modo?: Modo; completo?: boolean }) => {
    const m = p.modo ?? modo, c = p.completo ?? completo;
    setQ({ ...(m === "ossos" ? {} : { modo: m }), ...(c ? { ver: "completo" } : {}) }, { replace: true });
  };
  const itens = useTreino((s) => s.itens), dia = useTreino((s) => s.dia), sequencia = useTreino((s) => s.sequencia);
  const porConjunto = useMemo(() => new Map(CONJUNTOS.map((c) => [c.id, resumo(itens, c)])), [itens]);
  const r = (c: Conjunto) => porConjunto.get(c.id)!;
  const valem = (c: Conjunto) => completo || c.principal;
  const doModo = (m: Modo) => soma(CONJUNTOS.filter((c) => c.modo === m && valem(c)).map(r));
  // as regiões do modo, com os níveis que valem agora
  const regs = useMemo(() => {
    const out: { grupo: string; regiao: string; niveis: Conjunto[] }[] = [];
    for (const c of CONJUNTOS) if (c.modo === modo && (completo || c.principal)) { const x = out.find((y) => y.grupo === c.grupo); if (x) x.niveis.push(c); else out.push({ grupo: c.grupo, regiao: c.regiao, niveis: [c] }); }
    return out;
  }, [modo, completo]);

  const [grupo, setGrupo] = useState<string | null>(null);
  useEffect(() => setGrupo(null), [modo]);
  const cartoes = useRef<Record<string, HTMLElement | null>>({});
  const escolher = (g: string) => { setGrupo(g); cartoes.current[g]?.scrollIntoView({ block: "nearest", behavior: "smooth" }); };

  const d = useMemo(() => doDia(), []);
  const feitoHoje = dia?.data === hoje() ? dia : null;
  const maisDevido = [...CONJUNTOS].sort((a, b) => r(b).rever - r(a).rever)[0];
  const totalRever = soma(CONJUNTOS.map(r)).rever, niveisRever = CONJUNTOS.filter((c) => r(c).rever).length;

  return (
    <Page title="Treino" subtitle="Veja, digite o nome, passe para o próximo. Em cada nível você escolhe quanto quer ver do nome: tudo, parte ou nada.">
      <div className="tr-topo">
        <button type="button" className="tr-tile cd-hoverable" onClick={() => nav("/treino/dia")}>
          <span className="tr-tile__eye"><Icon name="today" size={16} />Do dia{sequencia > 1 && feitoHoje ? ` · ${sequencia} dias seguidos` : ""}</span>
          <span className="tr-tile__t">{feitoHoje ? "Feito hoje" : "5 itens de memória"}</span>
          <span className="tr-tile__d">{tituloConjunto(d.conjunto)}</span>
          {feitoHoje ? <span className="tr__quadros">{feitoHoje.quadros.map((m, i) => <i key={i} data-r={m} />)}</span> : null}
          <Icon name="chevron-right" size={20} className="tr-tile__go" />
        </button>
        <button type="button" className="tr-tile cd-hoverable" disabled={!totalRever} onClick={() => nav(`/treino/${maisDevido.id}?m=rever`)}>
          <span className="tr-tile__eye"><Icon name="redo" size={16} />Aquecimento</span>
          <span className="tr-tile__t">{totalRever ? `${totalRever} ${totalRever === 1 ? "item" : "itens"} para rever` : "Nada para rever agora"}</span>
          <span className="tr-tile__d">{totalRever ? `De memória, em ${niveisRever} ${niveisRever === 1 ? "nível" : "níveis"}.` : "O que você acerta de memória volta aqui depois de alguns dias."}</span>
          {totalRever ? <Icon name="chevron-right" size={20} className="tr-tile__go" /> : null}
        </button>
        <button type="button" className="tr-tile cd-hoverable" onClick={() => nav("/treino/explorar")}>
          <span className="tr-tile__eye"><Icon name="layers" size={16} />Explorar</span>
          <span className="tr-tile__t">O corpo em 3D</span>
          <span className="tr-tile__d">Sem jogo: camadas, nomes, isolar e esconder.</span>
          <Icon name="chevron-right" size={20} className="tr-tile__go" />
        </button>
      </div>

      <div className="tr-modos" role="tablist" aria-label="Modo">
        {MODOS.map((m) => {
          const t = doModo(m);
          return (
            <button key={m} type="button" role="tab" aria-selected={m === modo} className="tr-modo cd-hoverable" onClick={() => mudar({ modo: m })}>
              <span className="tr-modo__t">{TITULO_MODO[m]}</span>
              <span className="tr-modo__d">{SOBRE[m]}</span>
              <span className="tr-modo__p"><Barra r={t} /><span><b>{t.dominados}</b> de {t.total} dominados</span></span>
            </button>
          );
        })}
      </div>

      <div className="tr-alcance">
        <SegmentedControl size="sm" aria-label="Quanto mostrar" options={ALCANCE} value={completo ? "completo" : "principal"} onChange={(v) => mudar({ completo: v === "completo" })} />
        <span>{completo ? (modo === "ecg" ? "O que cai e mais um grupo para ir além." : "Tudo o que há como peça separada no modelo.") : modo === "ecg" ? "Os ritmos e padrões que as provas cobram." : "O que a faculdade e as provas cobram."}</span>
      </div>

      <div className="tr-escolha" data-corpo={modo !== "ecg" ? "" : undefined}>
        {modo !== "ecg" ? <CorpoEscolha key={modo} modo={modo} grupo={grupo} titulos={Object.fromEntries(regs.map((x) => [x.grupo, x.regiao]))} onGrupo={escolher} /> : null}
        <div className="tr-regs" role="tabpanel">
          {regs.map(({ grupo: g, regiao, niveis }) => {
            const t = soma(niveis.map(r));
            return (
              <section key={g} className="tr-reg" ref={(el) => { cartoes.current[g] = el; }} data-sel={g === grupo ? "" : undefined} onPointerEnter={() => modo !== "ecg" && setGrupo(g)}>
                <header className="tr-reg__head">
                  <h2 className="tr-reg__t">{modo === "ecg" ? "Ritmos e padrões" : regiao}</h2>
                  <span className="tr-reg__n">{t.dominados}/{t.total}</span>
                </header>
                <ul className="tr-niveis">
                  {niveis.map((c, i) => {
                    const x = r(c), primeiroExtra = !c.principal && (i === 0 || niveis[i - 1].principal);
                    return (
                      <li key={c.id} className="tr-nivel" data-extra={primeiroExtra ? (modo === "ecg" ? "Para ir além" : "Completo") : undefined}>
                        <button type="button" className="tr-nivel__ir cd-hoverable" onClick={() => nav("/treino/" + c.id)}>
                          <span className="tr-nivel__n" data-ok={x.dominados === x.total ? "" : undefined}>{x.dominados === x.total ? <Icon name="check" size={16} strokeWidth={2.4} /> : "N" + (i + 1)}</span>
                          <span className="tr-nivel__txt">
                            <span className="tr-nivel__t">{c.nivel || "Os principais"}</span>
                            <span className="tr-nivel__d">{c.itens.length} itens{x.vistos ? ` · ${x.dominados} dominados` : ""}</span>
                          </span>
                          <Barra r={x} />
                          <Icon name="chevron-right" size={18} className="tr-nivel__go" />
                        </button>
                        {x.rever ? <button type="button" className="tr-nivel__rever cd-hoverable" onClick={() => nav(`/treino/${c.id}?m=rever`)} title="Aquecimento: de memória, só o que está na hora de rever">rever {x.rever}</button> : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
      <p className="tr-menu__nota">{modo === "ecg" ? "Traçados sintéticos, gerados por fórmula." : "Modelos: BodyParts3D, © The Database Center for Life Science (DBCLS), CC BY-SA 2.1 Japão."} O progresso fica guardado na sua conta.</p>
    </Page>
  );
}
