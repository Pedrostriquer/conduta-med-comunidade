/* Explorar: o corpo em 3D sem jogo. Camadas (ossos, músculos, órgãos), clicar numa estrutura para ver o nome e uma
   linha sobre ela, isolar, esconder para ver o que está embaixo, e buscar por nome.
   O corpo leve (corpo.bin) abre na hora; as peças detalhadas de uma região só são baixadas quando a pessoa a escolhe
   (clicando na zona, na lista ou num resultado da busca); os músculos e os órgãos, só quando a camada é ligada. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Chip } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { ficha, INDICE, PULA, REGIOES_EXPLORAR } from "./atlas";
import type { Achado } from "./atlas";
import type { Corpo, EstadoPeca, PecaInfo } from "./corpo3d";
import { dobra } from "./motor";
import "../../styles/treino.css";

type Camada = "ossos" | "musculos" | "orgaos";
type Peca = PecaInfo & { camada: Camada | "corpo"; regiao: string | null };
const NOME_CAMADA: Record<Camada, string> = { ossos: "Ossos", musculos: "Músculos", orgaos: "Órgãos" };
const TIPO: Record<string, string> = { o: "Osso", m: "Músculo", g: "Órgão" };
const claro = () => document.documentElement.dataset.theme !== "dark";

export function ExplorarPage() {
  const nav = useNavigate();
  const canvas = useRef<HTMLCanvasElement>(null), corpo = useRef<Corpo | null>(null);
  const pecas = useRef(new Map<string, Peca>()), baixados = useRef(new Set<string>());
  const [pronto, setPronto] = useState(false), [erro, setErro] = useState(false), [baixando, setBaixando] = useState(0);
  const [regiao, setRegiao] = useState<string | null>(null);
  const [camadas, setCamadas] = useState<Record<Camada, boolean>>({ ossos: true, musculos: false, orgaos: false });
  const [sel, setSel] = useState<string | null>(null), [isolada, setIsolada] = useState(false);
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [versao, setVersao] = useState(0); // muda quando chegam peças novas
  const pedido = useRef<string | null>(null); // a peça que a busca quer escolher assim que chegar

  /** baixa um arquivo uma vez só e registra as peças que entraram */
  const baixar = useCallback(async (arquivo: string, camada: Peca["camada"], reg: string | null, so?: PecaInfo["tipo"][], pula?: (p: string) => boolean) => {
    if (baixados.current.has(arquivo) || !corpo.current) return;
    baixados.current.add(arquivo); setBaixando((n) => n + 1);
    try {
      const novas = await corpo.current.carregar(arquivo, { so, pula, estado: "oculto" });
      for (const p of novas) pecas.current.set(p.id, { ...p, camada: p.tipo === "p" ? "corpo" : camada, regiao: reg });
      setVersao((v) => v + 1);
    } catch { baixados.current.delete(arquivo); setErro(true); }
    finally { setBaixando((n) => n - 1); }
  }, []);

  // a cena
  useEffect(() => {
    let vivo = true;
    import("./corpo3d").then(async (m) => {
      if (!vivo) return;
      const c = m.criarCorpo(canvas.current!, {
        aoClicar: (id) => {
          const p = id ? pecas.current.get(id) : undefined;
          if (p?.arquivo === "corpo") { const r = REGIOES_EXPLORAR.find((x) => x.zonas.includes(p.peca)); if (r) { setRegiao(r.id); setSel(null); setIsolada(false); } }
          else { setSel(id); if (!id) setIsolada(false); }
        },
      });
      corpo.current = c; c.tema(claro());
      await baixar("corpo", "corpo", null);
      if (vivo) setPronto(true);
    }).catch(() => { if (vivo) setErro(true); });
    const mo = new MutationObserver(() => corpo.current?.tema(claro()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { vivo = false; mo.disconnect(); corpo.current?.destruir(); corpo.current = null; };
  }, [baixar]);

  // o que baixar: os ossos da região escolhida; músculos e órgãos só com a camada ligada
  useEffect(() => {
    if (!pronto) return;
    const r = REGIOES_EXPLORAR.find((x) => x.id === regiao);
    void (async () => {
      if (r && camadas.ossos) {
        const vistos = new Set<string>();
        for (const a of r.ossos) { await baixar(a, "ossos", r.id, ["o"], (p) => vistos.has(p) || !!PULA[a]?.includes(p)); for (const p of pecas.current.values()) if (p.arquivo === a) vistos.add(p.peca); }
      }
      if (r && camadas.musculos) await Promise.all(r.musculos.map((a) => baixar(a, "musculos", r.id, ["m"])));
      if (camadas.orgaos) await baixar("orgaos", "orgaos", null, ["g"]);
    })();
  }, [pronto, regiao, camadas, baixar]);

  // o estado de cada peça na cena
  useEffect(() => {
    const c = corpo.current;
    if (!c) return;
    const r = REGIOES_EXPLORAR.find((x) => x.id === regiao), escondidas = new Set(ocultas);
    const detalhada = r ? [...pecas.current.values()].some((p) => p.regiao === r.id && p.camada === "ossos") : false;
    for (const p of pecas.current.values()) {
      let e: EstadoPeca;
      if (p.tipo === "p") e = "fantasma";
      else if (p.arquivo === "corpo") e = !camadas.ossos ? (camadas.musculos || camadas.orgaos ? "fantasma" : "oculto") : r?.zonas.includes(p.peca) && detalhada ? "fantasma" : isolada ? "fantasma" : "solido";
      else if (!camadas[p.camada as Camada] || (p.regiao && p.regiao !== regiao) || escondidas.has(p.id)) e = "oculto";
      else e = isolada && sel && p.id !== sel ? "fantasma" : "solido";
      c.estado(p.id, e);
    }
    c.selecionar(sel);
  }, [regiao, camadas, sel, isolada, ocultas, versao]);

  // enquadra a região quando ela muda; e a peça pedida pela busca quando ela chega
  useEffect(() => {
    const c = corpo.current;
    if (!c || !pronto) return;
    if (pedido.current && pecas.current.has(pedido.current)) { const id = pedido.current; pedido.current = null; setSel(id); c.enquadrar([id]); return; }
    if (pedido.current) return;
    const r = REGIOES_EXPLORAR.find((x) => x.id === regiao);
    c.enquadrar(r ? r.zonas.map((z) => "corpo/" + z) : null);
  }, [regiao, versao, pronto]);

  const achados = useMemo(() => {
    const t = dobra(busca.trim());
    if (t.length < 2) return [];
    const comeca: Achado[] = [], contem: Achado[] = [];
    for (const a of INDICE) { const n = dobra(a.nome); if (n.startsWith(t)) comeca.push(a); else if (n.includes(t)) contem.push(a); }
    return [...comeca, ...contem].slice(0, 8);
  }, [busca]);
  const ir = (a: Achado) => {
    setBusca(""); pedido.current = a.id; setIsolada(false); setOcultas((o) => o.filter((x) => x !== a.id));
    setCamadas((c) => ({ ...c, [a.camada]: true }));
    if (a.regiao) setRegiao(a.regiao);
    if (pecas.current.has(a.id)) setVersao((v) => v + 1);
  };

  const p = sel ? pecas.current.get(sel) : undefined, f = p ? ficha(p.arquivo, p.peca) : null;
  const r = REGIOES_EXPLORAR.find((x) => x.id === regiao);
  return (
    <div className="tr-exp cd-root">
      <header className="tr__bar">
        <button type="button" className="backlink cd-hoverable" onClick={() => nav("/treino")}><Icon name="chevron-left" size={20} strokeWidth={2} />Treino</button>
        <h1 className="tr__title">Explorar{r ? " · " + r.titulo : ""}</h1>
        <span />
      </header>
      <div className="tr-exp__palco">
        <canvas ref={canvas} className="tr-exp__c" aria-label="Corpo em 3D. Arraste para girar, use a roda para aproximar e clique numa estrutura." />
        {!pronto || baixando ? <p className="tr-exp__aviso">{erro ? "Não deu para carregar. Recarregue a página." : pronto ? "Baixando as peças…" : "Carregando o corpo…"}</p> : null}
        <span className="tr__credit">modelos: BodyParts3D (DBCLS) · CC BY-SA</span>
      </div>
      <aside className="tr-exp__lado">
        <div className="tr-exp__busca">
          <Icon name="search" size={18} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar osso, músculo ou órgão" aria-label="Buscar por nome" autoComplete="off" spellCheck={false} />
          {achados.length ? (
            <ul className="tr-exp__achados">
              {achados.map((a) => <li key={a.id}><button type="button" className="cd-hoverable" onClick={() => ir(a)}><b>{a.nome}</b><span>{NOME_CAMADA[a.camada]}{a.regiao ? " · " + REGIOES_EXPLORAR.find((x) => x.id === a.regiao)!.titulo : ""}</span></button></li>)}
            </ul>
          ) : busca.trim().length >= 2 ? <p className="tr-exp__nada">Nada com esse nome.</p> : null}
        </div>

        <section>
          <h2 className="tr-exp__h">Camadas</h2>
          <div className="tr-exp__chips">
            {(Object.keys(NOME_CAMADA) as Camada[]).map((c) => <Chip key={c} pressed={camadas[c]} onChange={(v) => setCamadas((x) => ({ ...x, [c]: v }))}>{NOME_CAMADA[c]}</Chip>)}
          </div>
          {camadas.musculos && !regiao ? <p className="tr-exp__dica">Escolha uma região para ver os músculos dela.</p> : null}
        </section>

        <section>
          <h2 className="tr-exp__h">Região</h2>
          <div className="tr-exp__chips">
            <Chip pressed={!regiao} onChange={() => { setRegiao(null); setSel(null); setIsolada(false); }}>Corpo inteiro</Chip>
            {REGIOES_EXPLORAR.map((x) => <Chip key={x.id} pressed={regiao === x.id} onChange={() => { setRegiao(x.id); setSel(null); setIsolada(false); }}>{x.titulo}</Chip>)}
          </div>
        </section>

        <section className="tr-exp__sel" aria-live="polite">
          {f && p ? (
            <>
              <span className="tr-exp__tipo">{TIPO[p.tipo] ?? ""}</span>
              <h2 className="tr-exp__nome">{f.nome}</h2>
              {f.linha ? <p className="tr-exp__linha">{f.linha}</p> : null}
              <div className="tr-exp__acoes">
                <Button size="sm" variant={isolada ? "tinted" : "gray"} onClick={() => setIsolada((v) => !v)}>{isolada ? "Mostrar as outras" : "Isolar"}</Button>
                <Button size="sm" variant="gray" onClick={() => { setOcultas((o) => [...o, p.id]); setSel(null); setIsolada(false); }}>Esconder</Button>
                <Button size="sm" variant="plain" onClick={() => corpo.current?.enquadrar([p.id])}>Aproximar</Button>
              </div>
            </>
          ) : <p className="tr-exp__dica">{regiao ? "Clique numa estrutura para ver o nome. Esconda as de cima para ver o que está embaixo." : "Clique numa parte do corpo para ver as peças dela, ou escolha a região acima."}</p>}
        </section>

        {ocultas.length ? <Button size="sm" variant="gray" icon="undo" onClick={() => setOcultas([])}>Mostrar {ocultas.length === 1 ? "a estrutura escondida" : `as ${ocultas.length} escondidas`}</Button> : null}
      </aside>
    </div>
  );
}
