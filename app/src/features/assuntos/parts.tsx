/* As peças do resumo de um assunto: tabela, números, passos, fluxo clicável, pistas, divergência, figura, vídeos e fontes.
   Todo texto passa por `limpa` (data/limpo.ts): anotações de trabalho do acervo não vão para a tela. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Divergencia, Fluxo, Fonte, Numero, Passos, Pista, Tabela, VideoRef, Visual, CaiAssim } from "../../data/assuntos";
import { ytClip } from "../../data/assuntos";
import { interno, limpa } from "../../data/limpo";
import { Icon } from "../../ds/Icon";
import { MdInline } from "../../lib/md";
import type { MdRefs } from "../../lib/md";
import { num, plural } from "../../lib/format";
import { useVideo } from "../video/VideoDock";

export function TabelaView({ t, refs }: { t: Tabela; refs?: MdRefs }) {
  const cols = t.colunas || [], rows = t.linhas || [];
  if (!rows.length) return null;
  return (
    <figure className="as-table">
      {t.titulo ? <figcaption className="as-cap"><MdInline text={limpa(t.titulo)} /></figcaption> : null}
      <div className="as-table__wrap">
        <table>
          {cols.length ? <thead><tr>{cols.map((c, i) => <th key={i}><MdInline text={limpa(c)} /></th>)}</tr></thead> : null}
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><MdInline text={limpa(c)} refs={refs} /></td>)}</tr>)}</tbody>
        </table>
      </div>
    </figure>
  );
}

/** "Como cai": quantas questões, em quantas bancas, e as perguntas que mais se repetem */
export function CaiAssimView({ c }: { c: CaiAssim }) {
  const facts = [c.questoes ? plural(c.questoes, "questão", "questões") : "", c.bancas ? plural(c.bancas, "banca", "bancas") : "", c.anos || ""].filter(Boolean);
  const asks = (c.perguntas_que_mais_se_repetem || []).map((x) => {
    const m = /^(.*?)\s*\((\d+)(?:,[^)]*)?\)\s*$/.exec(x);
    return m ? { text: limpa(m[1]), n: Number(m[2]) } : { text: limpa(x), n: 0 };
  }).filter((x) => x.text);
  if (!facts.length && !asks.length) return null;
  return (
    <div className="as-cai">
      <div className="as-cai__head"><span className="as-label">Como cai</span>{facts.length ? <span className="as-cai__facts num">{facts.join(" · ")}</span> : null}</div>
      {asks.length ? (
        <ul className="as-cai__list">
          {asks.map((x, i) => <li key={i}><span><MdInline text={x.text} /></span>{x.n ? <span className="as-cai__n num" aria-label={plural(x.n, "vez", "vezes")}>{num(x.n)}×</span> : null}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

export function NumerosView({ items }: { items: Numero[] }) {
  if (!items.length) return null;
  return (
    <div className="as-part">
      <h3 className="as-label">Números</h3>
      <dl className="as-nums">
        {items.map((n, i) => {
          const antes = limpa(n.antes), obs = limpa(n.obs);
          return (
            <div key={i} className="as-num">
              <dt><MdInline text={limpa(n.situacao)} /></dt>
              <dd>
                <span className="as-num__val"><MdInline text={limpa(n.valor)} /></span>
                {antes ? <span className="as-num__more">Antes: <MdInline text={antes} /></span> : null}
                {obs ? <span className="as-num__more"><MdInline text={obs} /></span> : null}
                {n.url && /^https?:\/\//.test(n.url) ? (
                  <a className="as-num__src" href={n.url} target="_blank" rel="noopener noreferrer" title={n.fonte || undefined}>fonte{n.ano ? ", " + n.ano : ""}<Icon name="external" size={12} /></a>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function PassosView({ p, refs }: { p: Passos; refs?: MdRefs }) {
  const items = (p.itens || []).map((x) => limpa(x).replace(/^\s*\d+[.)º]\s*/, "")).filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="as-part">
      <h3 className="as-label">{limpa(p.titulo) || "Conduta em passos"}</h3>
      <ol className="as-steps">
        {items.map((x, i) => <li key={i}><span className="as-steps__n num" aria-hidden>{i + 1}</span><span><MdInline text={x} refs={refs} /></span></li>)}
      </ol>
    </div>
  );
}

/** fluxo de decisão: uma pergunta por vez; cada escolha fica na trilha e dá para voltar a qualquer ponto */
export function FluxoView({ f, refs }: { f: Fluxo; refs?: MdRefs }) {
  const [path, setPath] = useState<{ ask: string; pick: string; to: string }[]>([]);
  const at = path.length ? path[path.length - 1].to : f.inicio;
  const node = f.nos?.[at];
  if (!node) return null;
  const opts = node.fim ? [] : node.opcoes || [];
  const end = !opts.length;
  return (
    <div className="as-part">
      <h3 className="as-label">{limpa(f.titulo) || "Fluxo"}</h3>
      <div className="as-flow" data-end={end && path.length ? "" : undefined}>
        {path.length ? (
          <ol className="as-flow__trail" aria-label="Caminho até aqui">
            {path.map((s, i) => (
              <li key={i}>
                <button type="button" className="as-flow__step cd-hoverable" onClick={() => setPath(path.slice(0, i))} title="Voltar para este ponto">
                  <span className="as-flow__ask"><MdInline text={limpa(s.ask)} /></span>
                  <span className="as-flow__pick"><Icon name="check" size={14} strokeWidth={2.25} />{limpa(s.pick)}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}
        <div className="as-flow__now" aria-live="polite">
          {end && path.length ? <span className="as-flow__endtag">Conduta</span> : null}
          <p className="as-flow__text"><MdInline text={limpa(node.texto)} refs={refs} /></p>
          {opts.length ? (
            <div className="as-flow__opts">
              {opts.map((o, i) => (
                <button key={i} type="button" className="as-flow__opt cd-hoverable" onClick={(e) => { if (e.detail > 0) e.currentTarget.blur(); setPath([...path, { ask: node.texto, pick: o.rotulo, to: o.vai }]); }}>
                  <span><MdInline text={limpa(o.rotulo)} /></span><Icon name="chevron-right" size={16} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {path.length ? <button type="button" className="as-flow__reset cd-hoverable" onClick={() => setPath([])}><Icon name="rotate" size={15} />Começar de novo</button> : null}
      </div>
    </div>
  );
}

export function PistasView({ items }: { items: Pista[] }) {
  const rows = items.map((p) => ({ pista: limpa(p.pista), resposta: limpa(p.resposta) })).filter((p) => p.pista && p.resposta);
  if (!rows.length) return null;
  return (
    <div className="as-part">
      <h3 className="as-label">Pista no enunciado, resposta</h3>
      <ul className="as-clues">
        {rows.map((p, i) => (
          <li key={i}>
            <span className="as-clues__clue"><MdInline text={p.pista} /></span>
            <Icon name="arrow-right" size={16} className="as-clues__arrow" />
            <span className="as-clues__ans"><MdInline text={p.resposta} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DivergenciaView({ d }: { d: Divergencia }) {
  const title = limpa(d.titulo || d.ponto);
  const lines = (d.linhas || []).filter((l) => !interno(l.fonte)).map((l) => ({ fonte: limpa(l.fonte), diz: limpa(l.diz), url: l.url })).filter((l) => l.diz);
  const sides = [d.lado_a, d.lado_b].map((x) => limpa(x)).filter(Boolean);
  const cobra = limpa(d.como_a_prova_tem_cobrado), ensina = limpa(d.o_resumo_ensina), aviso = limpa(d.aviso_fixo);
  if (!title && !lines.length && !sides.length) return null;
  return (
    <div className="as-div">
      <span className="as-div__icon" aria-hidden><Icon name="swap" size={18} /></span>
      <div className="as-div__main">
        <p className="as-div__kicker">As fontes divergem</p>
        {title ? <p className="as-div__title"><MdInline text={title} /></p> : null}
        {aviso ? <p className="as-div__text"><MdInline text={aviso} /></p> : null}
        {lines.length ? (
          <dl className="as-div__lines">
            {lines.map((l, i) => (
              <div key={i}>
                <dt>{l.url && /^https?:\/\//.test(l.url) ? <a href={l.url} target="_blank" rel="noopener noreferrer"><MdInline text={l.fonte} /></a> : <MdInline text={l.fonte} />}</dt>
                <dd><MdInline text={l.diz} /></dd>
              </div>
            ))}
          </dl>
        ) : null}
        {sides.length ? <ul className="as-div__sides">{sides.map((s, i) => <li key={i}><MdInline text={s} /></li>)}</ul> : null}
        {ensina ? <p className="as-div__text"><b>Aqui vale:</b> <MdInline text={ensina} /></p> : null}
        {cobra ? <p className="as-div__text"><b>Como a prova cobra:</b> <MdInline text={cobra} /></p> : null}
      </div>
    </div>
  );
}

/* ---------- figura: o SVG entra na página (assim herda a cor do texto e funciona no tema escuro) ---------- */
const svgs = new Map<string, Promise<string>>();
const getSvg = (url: string) => {
  let job = svgs.get(url);
  if (!job) {
    job = fetch(url, { credentials: "same-origin" }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); });
    job.catch(() => svgs.delete(url));
    svgs.set(url, job);
  }
  return job;
};

/** o desenho sem nada que execute ou busque fora: sem script, sem evento, sem link externo */
function cleanSvg(text: string): { svg: SVGSVGElement; width: number; adapts: boolean } | null {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement as unknown as SVGSVGElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) return null;
  svg.querySelectorAll("script, foreignObject, iframe, object, embed, audio, video, animate, set, title").forEach((n) => n.remove());
  svg.querySelectorAll("style").forEach((n) => { if (/@import|url\s*\(/i.test(n.textContent || "")) n.remove(); });
  svg.querySelectorAll("*").forEach((n) => [...n.attributes].forEach((a) => {
    const href = /(^|:)href$/i.test(a.name);
    // ilustração embutida na própria figura (imagem em base64) pode ficar; endereço de fora, não
    const embedded = href && n.nodeName.toLowerCase() === "image" && /^data:image\/(png|jpeg|webp);base64,/i.test(a.value.trim());
    if (/^on/i.test(a.name) || (href && !embedded && !a.value.trim().startsWith("#")) || (a.name === "style" && /url\s*\(|expression/i.test(a.value))) n.removeAttribute(a.name);
  }));
  // anotação de trabalho escrita dentro do desenho não aparece
  svg.querySelectorAll("text, tspan").forEach((n) => {
    if (n.children.length || !interno(n.textContent)) return;
    const t = limpa(n.textContent);
    if (t) n.textContent = t; else n.remove();
  });
  let w = parseFloat(svg.getAttribute("width") || "") || 0;
  const h = parseFloat(svg.getAttribute("height") || "") || 0;
  if (!svg.getAttribute("viewBox") && w && h) svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const vb = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb[2] > 0) w = vb[2];
  svg.removeAttribute("height");
  svg.setAttribute("width", "100%");
  svg.setAttribute("aria-hidden", "true");
  return { svg, width: w || 640, adapts: /currentColor/i.test(text) };
}

export function FiguraView({ slug, v }: { slug: string; v: Visual }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"wait" | "ok" | "plate" | "fail">("wait");
  const file = (v.arquivo || "").split("/").pop() || "";
  const url = `/img/assuntos/${slug}/${encodeURIComponent(file)}`;
  const isSvg = /\.svg$/i.test(file);
  useEffect(() => {
    if (!isSvg || !file) return;
    let on = true;
    getSvg(url).then((text) => {
      if (!on || !box.current) return;
      const c = cleanSvg(text);
      if (!c) { setState("fail"); return; }
      const node = document.importNode(c.svg, true) as unknown as SVGSVGElement;
      // no celular o desenho não encolhe até ficar ilegível: rola para o lado (a largura mínima só vale lá, no CSS)
      node.style.setProperty("--fig-min", Math.min(c.width, 560) + "px");
      node.style.maxWidth = Math.round(c.width * 1.15) + "px";
      box.current.replaceChildren(node);
      setState(c.adapts ? "ok" : "plate");
    }, () => { if (on) setState("fail"); });
    return () => { on = false; };
  }, [url, isSvg, file]);
  if (!file || state === "fail") return null;
  const title = limpa(v.titulo);
  return (
    <figure className="as-fig" data-state={state}>
      {isSvg
        ? <div className="as-fig__art" ref={box} role="img" aria-label={limpa(v.descricao) || title || "Figura"} tabIndex={0} />
        : <div className="as-fig__art" data-img=""><img src={url} alt={limpa(v.descricao) || title || ""} loading="lazy" /></div>}
      {title ? <figcaption className="as-cap">{title}</figcaption> : null}
    </figure>
  );
}

export function VideosView({ items }: { items: VideoRef[] }) {
  const { play } = useVideo();
  const rows = useMemo(() => items.map((v) => ({ v, clip: ytClip(v.url) })).filter((x) => x.clip), [items]);
  if (!rows.length) return null;
  return (
    <div className="as-part">
      <h3 className="as-label">Professores explicando</h3>
      <ul className="as-videos">
        {rows.map(({ v, clip }, i) => (
          <li key={i}>
            <button type="button" className="as-video cd-hoverable" onClick={() => play({ id: clip!.id, s: clip!.s, f: null, channel: v.canal, title: v.titulo })}>
              <span className="as-video__play" aria-hidden><Icon name="play" size={16} /></span>
              <span className="as-video__text">
                <span className="as-video__title">{limpa(v.o_que_explica) || limpa(v.titulo)}</span>
                <span className="as-video__sub">{[v.canal, clip!.s ? "a partir de " + clockOf(clip!.s) : null].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
const clockOf = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(x).padStart(2, "0"); };

export function FontesView({ items }: { items: Fonte[] }) {
  const rows = items.filter((f) => !(f.tipo || "").startsWith("material_de_") && f.nome && !interno(f.nome) && !/acervo/i.test(f.nome));
  if (!rows.length) return null;
  return (
    <details className="as-fontes">
      <summary className="cd-hoverable"><Icon name="chevron-right" size={15} className="as-fontes__chev" />Fontes deste bloco<span className="num">{num(rows.length)}</span></summary>
      <ul>
        {rows.map((f, i) => (
          <li key={i}>
            {f.url && /^https?:\/\//.test(f.url) ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.nome}</a> : <span>{f.nome}</span>}
            {f.ano ? <span className="num"> ({f.ano})</span> : null}
            {limpa(f.o_que) ? <small>{limpa(f.o_que)}</small> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
