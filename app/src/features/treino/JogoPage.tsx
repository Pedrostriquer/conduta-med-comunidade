/* A tela do treino de digitar: barra, palco (3D ou ECG), os três números, o nome grande e o teclado.
   /treino/<nível>            treino livre: a pessoa escolhe quanto ver do nome (automático, nome, parte, memória)
   /treino/<nível>?m=rever    aquecimento: de memória, só o que está na hora de rever
   /treino/dia                o "do dia": cinco itens de memória, uma tentativa cada */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, SegmentedControl } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { conjunto as acharConjunto, CONJUNTOS, tituloConjunto } from "./catalogo";
import type { Conjunto, ItemDef } from "./catalogo";
import { acerto, dobra, Motor, ppm } from "./motor";
import type { Ajuda, Nivel, Tipo } from "./motor";
import { Palco3D, PalcoEcg } from "./Palcos";
import { chave, doDia, hoje, paraRever, useTreino } from "./progresso";
import { acordar, ligarSom, somAcerto, somErro, somFim, somLigado, somTecla } from "./som";
import { Teclado } from "./Teclado";
import type { TecladoRef } from "./Teclado";
import "../../styles/treino.css";

const AJUDAS: { value: Ajuda; label: string; ariaLabel: string }[] = [
  { value: "auto", label: "Automático", ariaLabel: "Automático: mostra menos conforme você acerta" },
  { value: "nome", label: "Nome", ariaLabel: "Vendo o nome" },
  { value: "parte", label: "Parte", ariaLabel: "Vendo parte: primeira letra e número de letras" },
  { value: "memoria", label: "Memória", ariaLabel: "De memória" },
];
const NOME_NIVEL: Record<Nivel, string> = { 0: "vendo o nome", 1: "vendo parte", 2: "de memória" };
const O_QUE = { ossos: "o osso aceso", musculos: "o músculo aceso", ecg: "o ritmo" } as const;
/** o modo que a pessoa escolheu por último vale para o próximo nível que ela abrir */
let ultimaAjuda: Ajuda = "auto";

export function JogoPage() {
  const { id = "" } = useParams();
  const [q] = useSearchParams();
  // a lista de itens é decidida uma vez, ao abrir: o progresso muda durante a partida e não pode trocar a fila
  const partida = useMemo(() => {
    if (id === "dia") { const d = doDia(); return { conjunto: d.conjunto, itens: d.itens, tipo: "dia" as Tipo }; }
    const c = acharConjunto(id);
    if (!c) return null;
    if (q.get("m") === "rever") { const devidos = paraRever(useTreino.getState().itens, c); return { conjunto: c, itens: devidos.length ? devidos : c.itens, tipo: "rever" as Tipo }; }
    return { conjunto: c, itens: c.itens, tipo: "niveis" as Tipo };
  }, [id, q]);
  if (!partida) return <Navigate to="/treino" replace />;
  return <Jogo key={id + partida.tipo} {...partida} />;
}

function Jogo({ conjunto, itens, tipo }: { conjunto: Conjunto; itens: ItemDef[]; tipo: Tipo }) {
  const nav = useNavigate();
  const motor = useMemo(() => new Motor(itens, tipo, (id) => useTreino.getState().itens[chave(conjunto, id)]?.f ?? 0), [itens, tipo, conjunto]);
  const s = useSyncExternalStore(motor.subscribe, motor.get);
  const kb = useRef<TecladoRef>(null), palavra = useRef<HTMLDivElement>(null);
  const [som, setSom] = useState(somLigado());

  useEffect(() => {
    const treme = () => { const w = palavra.current; if (!w) return; w.removeAttribute("data-treme"); void w.offsetWidth; w.setAttribute("data-treme", ""); };
    const off = motor.ouvir((e) => {
      if (e.t === "tecla") { somTecla(e.c === " " ? "espaco" : "tecla"); kb.current?.pisca(e.c, !e.ok); if (!e.ok) { somErro(); treme(); } }
      else if (e.t === "certo") somAcerto(e.seguidos);
      else if (e.t === "errado") { somErro(); treme(); }
      else if (e.t === "resultado") useTreino.getState().registrar(chave(conjunto, e.id), e.nivel, e.como);
      else if (e.t === "fim") {
        somFim(true);
        if (tipo === "dia") useTreino.getState().fecharDia({ data: hoje(), conjunto: conjunto.id, quadros: motor.get().respostas.map((r) => r.como) });
      }
    });
    motor.iniciar(tipo === "niveis" ? ultimaAjuda : "memoria");
    return () => { off(); motor.destruir(); };
  }, [motor, conjunto, tipo]);

  const revelar = () => { acordar(); if (motor.revelar()) somTecla(); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest?.("input, textarea, select, [contenteditable], .tr__bar")) return;
      acordar();
      const k = e.key;
      if (k === "Enter") { e.preventDefault(); somTecla("enter"); kb.current?.pisca("enter"); if (motor.get().fase === "fim" && tipo !== "niveis") nav("/treino"); else motor.enter(); return; }
      if (k === "Backspace") { e.preventDefault(); if (motor.apagar()) { somTecla(); kb.current?.pisca("apagar"); } return; }
      if (k === "Escape") { nav("/treino"); return; }
      if (k === "Tab" || k === "?") { e.preventDefault(); if (motor.revelar()) somTecla(); return; }
      if (k === " ") { e.preventDefault(); motor.tecla(" "); return; }
      if (k.length === 1 && /[\p{L}0-9'’-]/u.test(k)) { const c = dobra(k); if (/^[a-z0-9'-]$/.test(c)) { e.preventDefault(); motor.tecla(c); } }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [motor, nav, tipo]);

  const it = motor.atual, alvo = it ? motor.chave(it) : "", d = s.digitado, nivel = motor.nivel;
  const total = itens.length, n = Math.min(s.idx + 1, s.fila.length);
  const letras = it ? [...it.nome] : [];
  const sp = (c: string) => (c === " " ? " " : c);

  let corpo: ReactNode = null, sub = "";
  if (it && (s.fase === "certo" || s.fase === "errado")) {
    corpo = letras.map((c, i) => <span key={i} className="t">{sp(c)}</span>);
    sub = it.apoio;
  } else if (it && nivel === 0) {
    corpo = letras.map((c, i) => <span key={i} className={i < d.length ? "t" : i === d.length ? "cur" : undefined}>{sp(c)}</span>);
    sub = it.apoio;
  } else if (it && nivel === 1) {
    corpo = <>{letras.map((c, i) => i < d.length
      ? <span key={i} className="t">{sp(alvo[i] === d[i] ? c : d[i])}</span>
      : <span key={i} className={i === d.length ? "ph cur" : "ph"}>{i === 0 ? c : c === " " ? " " : c === "-" ? "-" : "·"}</span>)}
      {d.length > letras.length ? <span className="t">{d.slice(letras.length).replace(/ /g, " ")}</span> : null}</>;
    sub = it.pista;
  } else if (it) {
    corpo = <>{[...d].map((c, i) => <span key={i} className="t">{sp(alvo[i] === c ? letras[i] : c)}</span>)}<i className="fim" /></>;
    sub = d ? "" : `nomeie ${O_QUE[conjunto.modo]}`;
  }

  const trocar = (a: Ajuda) => { acordar(); somTecla(); ultimaAjuda = a; motor.iniciar(a); (document.activeElement as HTMLElement | null)?.blur(); };
  const titulo = tipo === "dia" ? `Do dia · ${tituloConjunto(conjunto)}` : tituloConjunto(conjunto) + (tipo === "rever" ? " · aquecimento" : "");
  const olho = tipo === "dia" ? "Do dia · de memória" : tipo === "rever" ? "Aquecimento · de memória" : (s.ajuda === "auto" ? "Automático · " : "") + NOME_NIVEL[s.revelado ? 0 : s.fila[s.idx]?.nivel ?? 0] + (s.revelado ? " (revelado)" : "");
  // no fim, o que vale mostrar: as respostas do nível mais difícil que apareceu
  const topo = Math.max(0, ...s.respostas.map((r) => r.nivel)) as Nivel, doTopo = s.respostas.filter((r) => r.nivel === topo);
  const certos = doTopo.filter((r) => r.como === "certo").length, viu = doTopo.filter((r) => r.como === "viu").length;
  const lista = CONJUNTOS.filter((c) => c.modo === conjunto.modo), proximo = lista[lista.indexOf(conjunto) + 1];
  const mais = s.ajuda === "nome" ? "parte" : s.ajuda === "parte" ? "memoria" : null;

  return (
    <div className="tr cd-root" data-tom={conjunto.modo === "ecg" ? "papel" : "palco"} data-fase={s.fase}>
      <header className="tr__bar">
        <button type="button" className="backlink cd-hoverable" onClick={() => nav("/treino")}><Icon name="chevron-left" size={20} strokeWidth={2} />Treino</button>
        <h1 className="tr__title">{titulo}</h1>
        <div className="tr__tools">
          {tipo === "niveis" ? <SegmentedControl size="sm" aria-label="Quanto do nome você quer ver" options={AJUDAS} value={s.ajuda} onChange={trocar} /> : null}
          <button type="button" className="tr__som cd-hoverable" aria-pressed={som} aria-label={som ? "Som ligado" : "Som desligado"} onClick={(e) => { const v = !som; ligarSom(v); setSom(v); if (v) somTecla(); e.currentTarget.blur(); }}>
            <span className="tr__som-t">{som ? "Som ligado" : "Som desligado"}</span><span className="tr__som-c" aria-hidden>♪</span>
          </button>
        </div>
      </header>

      <div className="tr__stage">
        {conjunto.modo === "ecg" ? <PalcoEcg motor={motor} /> : <Palco3D motor={motor} conjunto={conjunto} />}
        <dl className="tr__stats">
          <div><dd>{ppm(s.stats)}</dd><dt>palavras por minuto</dt></div>
          <div><dd>{acerto(s.stats)}<small>%</small></dd><dt>de acerto</dt></div>
          <div><dd>{s.stats.feitos}<small>/{total}</small></dd><dt>feitos</dt></div>
        </dl>
        <span className="tr__credit">{conjunto.modo === "ecg" ? "25 mm/s · 10 mm/mV · lupa 2× · traçados sintéticos" : "modelos: BodyParts3D (DBCLS) · CC BY-SA"}</span>
      </div>

      <div className="tr__panel">
        {s.fase === "fim" ? (
          <div className="tr__pausa">
            <p className="tr__eye">{tipo === "dia" ? "Do dia concluído" : tipo === "rever" ? "Aquecimento concluído" : "Lista concluída"} · <em>{total}</em> {total === 1 ? "item" : "itens"}</p>
            <p className="tr__pausa-t">{topo === 0 ? `Você copiou os ${total} nomes` : `${topo === 2 ? "De memória" : "Vendo parte"}: ${certos} de ${doTopo.length} de primeira${viu ? ` · ${viu} ${viu === 1 ? "revelado" : "revelados"}` : ""}`}</p>
            {topo > 0 ? <div className="tr__quadros" aria-hidden>{doTopo.map((r, i) => <i key={i} data-r={r.como} />)}</div> : null}
            <p className="tr__pausa-s">{ppm(s.stats)} palavras por minuto · {acerto(s.stats)}% de acerto nas teclas</p>
            <div className="tr__acoes">
              {tipo === "niveis" ? <>
                {mais ? <Button variant="filled" onClick={() => trocar(mais)}>Agora {mais === "parte" ? "vendo parte" : "de memória"}</Button> : null}
                <Button variant={mais ? "gray" : "filled"} kbd="↵" onClick={() => { acordar(); motor.enter(); }}>De novo</Button>
                {proximo ? <Button variant="gray" iconEnd="arrow-right" onClick={() => nav("/treino/" + proximo.id)}>{tituloConjunto(proximo)}</Button> : null}
                <Button variant="plain" onClick={() => nav("/treino")}>Voltar</Button>
              </> : <Button variant="filled" kbd="↵" onClick={() => nav("/treino")}>Voltar ao treino</Button>}
            </div>
          </div>
        ) : (
          <>
            <p className="tr__eye">{olho} · <em>{n}</em>/{s.fila.length}</p>
            <div className="tr__word" ref={palavra} data-estado={s.fase} data-longo={letras.length > 32 ? "4" : letras.length > 24 ? "3" : letras.length > 17 ? "2" : letras.length > 11 ? "1" : undefined} aria-live="polite">{corpo}</div>
            <p className="tr__sub">{sub || " "}</p>
            <div className="tr__fb" data-tipo={s.fase}>
              {s.fase === "errado" ? <><span>{s.recado}</span><Button size="sm" variant="gray" kbd="↵" onClick={() => { acordar(); motor.enter(); }}>Continuar</Button></>
                : s.fase === "certo" && s.recado ? <span>{s.recado}</span>
                : s.fase === "digitando" && nivel !== 0 ? <>
                  <Button size="sm" variant="gray" kbd="Tab" onClick={revelar}>Revelar</Button>
                  {d ? <span className="tr__fb-dica">Enter para conferir</span> : null}
                </> : s.revelado && s.fase === "digitando" ? <span className="tr__fb-dica">Digite o nome para seguir. Este item volta daqui a pouco.</span> : null}
            </div>
          </>
        )}
        <Teclado ref={kb} numeros={/\d/.test(alvo)} proxima={s.fase === "digitando" && nivel === 0 ? alvo[d.length] : undefined}
          onTecla={(c) => { acordar(); motor.tecla(c); }}
          onApagar={() => { acordar(); if (motor.apagar()) somTecla(); }}
          onEnter={() => { acordar(); somTecla("enter"); if (motor.get().fase === "fim" && tipo !== "niveis") nav("/treino"); else motor.enter(); }} />
      </div>
    </div>
  );
}
