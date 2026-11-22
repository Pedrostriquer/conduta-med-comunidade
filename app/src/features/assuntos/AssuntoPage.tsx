/* O resumo de um assunto (/assuntos/<slug>): "Em uma tela", o índice dos blocos (ao lado na tela larga; recolhível no resto)
   e cada bloco com o essencial, figuras, números, tabelas, passos, fluxos, pistas, divergências, o que cai pouco, vídeos e fontes.
   /assuntos/<slug>#<bloco> abre no bloco; com ?t=<trecho> (vindo de uma resolução) o trecho chega realçado. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useBank } from "../../data/bank";
import { loadResolucoes, useAssunto, useAssuntoInfo } from "../../data/assuntos";
import type { Assunto, Bloco } from "../../data/assuntos";
import { limpa } from "../../data/limpo";
import { areaLabel } from "../../data/types";
import { useStore } from "../../state/store";
import { useStats } from "../../state/stats";
import { Page } from "../../app/Page";
import { Button } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Pulse } from "../../ds/medical";
import { useToast } from "../../ds/overlay";
import { useMedia } from "../../lib/hooks";
import { Md, MdInline } from "../../lib/md";
import type { MdRefs } from "../../lib/md";
import { num, plural } from "../../lib/format";
import { MiniRing } from "../questoes/filters";
import { progressBySlug } from "./AssuntosPage";
import { PracticeSheet } from "./PracticeSheet";
import type { Practice } from "./PracticeSheet";
import { CaiAssimView, DivergenciaView, FiguraView, FluxoView, FontesView, NumerosView, PassosView, PistasView, TabelaView, VideosView } from "./parts";

const HL = "as-trecho";
type HighlightApi = { highlights?: { set: (k: string, v: unknown) => void; delete: (k: string) => void } };
const nz = (x: string) => x.toLowerCase().replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();

/** acha o trecho dentro do bloco: o menor elemento que o contém e, se der, o intervalo exato do texto */
function findTrecho(root: HTMLElement, trecho: string): { el: HTMLElement; range: Range | null } | null {
  const t = nz(trecho);
  if (!t) return null;
  const cands = [...root.querySelectorAll<HTMLElement>("p, li, tr, dt, dd")].filter((e) => !e.closest(".as-fontes, .as-videos, .as-cai") && nz(e.textContent || "").includes(t));
  if (!cands.length) return null;
  const el = cands.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0];
  // texto corrido do elemento, com espaços reduzidos, e de onde veio cada letra
  const at: { node: Text; off: number }[] = [];
  let str = "", gap = true;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
    const s = n.data;
    for (let i = 0; i < s.length; i++) {
      if (/\s/.test(s[i])) { if (!gap) { str += " "; at.push({ node: n, off: i }); gap = true; } }
      else { str += s[i].toLowerCase().charAt(0); at.push({ node: n, off: i }); gap = false; }
    }
  }
  const i = str.indexOf(t);
  let range: Range | null = null;
  if (i >= 0 && at[i] && at[i + t.length - 1]) {
    range = document.createRange();
    range.setStart(at[i].node, at[i].off);
    range.setEnd(at[i + t.length - 1].node, at[i + t.length - 1].off + 1);
  }
  return { el: (el.closest("tr, .as-num") as HTMLElement | null) || el, range };
}

function BlocoView({ slug, b, i, refs, practice }: { slug: string; b: Bloco; i: number; refs: MdRefs; practice: { n: number | null; busy: boolean; go: () => void } }) {
  const essencial = useMemo(() => limpa(b.essencial_md, true), [b]);
  const pouco = useMemo(() => limpa(b.cai_pouco), [b]);
  return (
    <section className="as-block" id={b.id} aria-labelledby={"t-" + b.id}>
      <header className="as-block__head">
        <span className="as-block__n num">Bloco {i + 1}<span aria-hidden> · </span>{b.id}</span>
        <h2 className="as-block__title" id={"t-" + b.id}>{b.titulo}</h2>
      </header>
      {b.cai_assim ? <CaiAssimView c={b.cai_assim} /> : null}
      <Md text={essencial} refs={refs} className="as-prose" />
      {(b.visuais || []).map((v, k) => <FiguraView key={k} slug={slug} v={v} />)}
      {b.numeros?.length ? <NumerosView items={b.numeros} /> : null}
      {(b.tabelas || []).map((t, k) => <TabelaView key={k} t={t} refs={refs} />)}
      {(b.passos || []).map((p, k) => <PassosView key={k} p={p} refs={refs} />)}
      {(b.fluxos || []).map((f, k) => <FluxoView key={k} f={f} refs={refs} />)}
      {b.pistas?.length ? <PistasView items={b.pistas} /> : null}
      {(b.divergencias || []).map((d, k) => <DivergenciaView key={k} d={d} />)}
      {pouco ? <p className="as-rare"><b>Cai pouco.</b> <MdInline text={pouco} refs={refs} /></p> : null}
      {b.videos?.length ? <VideosView items={b.videos} /> : null}
      <footer className="as-block__foot">
        {practice.n !== 0 ? (
          <Button variant="tinted" size="sm" icon="questions" loading={practice.busy} onClick={practice.go}>
            {practice.n ? `Treinar este bloco · ${plural(practice.n, "questão", "questões")}` : "Treinar este bloco"}
          </Button>
        ) : <span className="as-block__none">Ainda sem questões deste bloco.</span>}
        {b.fontes?.length ? <FontesView items={b.fontes} /> : null}
      </footer>
    </section>
  );
}

function Toc({ a, active, onGo }: { a: Assunto; active: string | null; onGo: (id: string) => void }) {
  return (
    <ol className="as-toc">
      {a.em_uma_tela?.texto_md ? <li><a href="#em-uma-tela" aria-current={active === "em-uma-tela" ? "true" : undefined} onClick={(e) => { e.preventDefault(); onGo("em-uma-tela"); }}><span className="as-toc__n" aria-hidden>·</span>Em uma tela</a></li> : null}
      {a.blocos.map((b, i) => (
        <li key={b.id}><a href={"#" + b.id} aria-current={active === b.id ? "true" : undefined} onClick={(e) => { e.preventDefault(); onGo(b.id); }}><span className="as-toc__n num" aria-hidden>{i + 1}</span>{b.titulo}</a></li>
      ))}
    </ol>
  );
}

export function AssuntoPage() {
  const { slug = "" } = useParams();
  const loc = useLocation(), toast = useToast();
  const bank = useBank()!;
  const st = useStats(bank);
  const inc = useStore((s) => s.settings.incluirTodas);
  const { data: a, error, retry } = useAssunto(slug);
  const wide = useMedia("(min-width: 1240px)");
  const doc = useRef<HTMLDivElement>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [target, setTarget] = useState<Practice | null>(null);
  /** bloco → questões, pelas resoluções do assunto; só é baixado quando alguém pede para treinar um bloco */
  const [byBlock, setByBlock] = useState<Record<string, string[]> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { setByBlock(null); setTocOpen(false); setTarget(null); }, [slug]);

  const prog = useMemo(() => progressBySlug(bank, inc, st).get(slug) || { ids: [], n: 0, done: 0, ok: 0 }, [bank, inc, st, slug]);
  const area = useAssuntoInfo(slug)?.area;
  const hash = decodeURIComponent(loc.hash.slice(1));
  const trecho = new URLSearchParams(loc.search).get("t");

  // ir a um bloco pelo índice: rola com suavidade e deixa o endereço apontando para ele (sem passar pelo roteador, que rolaria de novo)
  const go = useCallback((id: string) => {
    setTocOpen(false);
    history.replaceState(history.state, "", location.pathname + "#" + encodeURIComponent(id));
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const refs = useMemo<MdRefs>(() => ({ ids: new Set((a?.blocos || []).map((b) => b.id)), onRef: go }), [a, go]);

  // chegar no bloco (e no trecho). As figuras entram depois e empurram o texto: reposiciona até a pessoa mexer na tela.
  useEffect(() => {
    if (!a || !hash || !doc.current) return;
    const block = document.getElementById(hash);
    if (!block || !doc.current.contains(block)) return;
    let mark: HTMLElement | null = null, stop = false;
    const api = (window.CSS as unknown as HighlightApi).highlights;
    const place = () => {
      if (stop) return;
      const hit = trecho ? findTrecho(block, trecho) : null;
      if (mark && mark !== hit?.el) delete mark.dataset.aqui;
      mark = hit?.el || null;
      if (mark) mark.dataset.aqui = "";
      const H = (window as unknown as { Highlight?: new (r: Range) => unknown }).Highlight;
      if (api && H) { if (hit?.range) api.set(HL, new H(hit.range)); else api.delete(HL); }
      (mark || block).scrollIntoView({ block: mark ? "center" : "start" });
    };
    place();
    const ro = new ResizeObserver(() => place());
    ro.observe(doc.current);
    const again = [250, 900].map((ms) => window.setTimeout(place, ms));
    const quit = () => { stop = true; ro.disconnect(); };
    const timer = window.setTimeout(quit, 2500);
    const evs = ["wheel", "touchstart", "keydown", "mousedown"] as const;
    evs.forEach((e) => addEventListener(e, quit, { passive: true, once: true }));
    return () => {
      again.forEach(clearTimeout); clearTimeout(timer); quit();
      evs.forEach((e) => removeEventListener(e, quit));
      if (mark) delete mark.dataset.aqui;
      api?.delete(HL);
    };
  }, [a, hash, trecho]);

  // qual bloco está na tela (para o índice)
  useEffect(() => {
    if (!a) return;
    const ids = ["em-uma-tela", ...a.blocos.map((b) => b.id)];
    const read = () => {
      let cur: string | null = null;
      for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= 140) cur = id; }
      setActive((old) => (old === cur ? old : cur));
    };
    read();
    addEventListener("scroll", read, { passive: true });
    return () => removeEventListener("scroll", read);
  }, [a]);

  const all = () => setTarget({ title: a?.titulo || "Assunto", ids: prog.ids, slug });
  const block = async (b: Bloco) => {
    let map = byBlock;
    if (!map) {
      setBusy(b.id);
      try {
        const res = await loadResolucoes(slug);
        map = {};
        for (const id of prog.ids) { const k = res[id]?.resumo?.bloco; if (k) (map[k] ||= []).push(id); }
        setByBlock(map);
      } catch { toast({ text: "Não foi possível montar a lista. Confira a conexão e tente de novo.", icon: "alert" }); return; } finally { setBusy(null); }
    }
    const ids = map[b.id] || [];
    if (!ids.length) { toast({ text: "Ainda não há questões deste bloco.", icon: "info" }); return; }
    setTarget({ title: b.titulo, ids, slug, bloco: b.id });
  };

  if (!a) {
    return (
      <Page title="Assunto" crumbs={[{ label: "Assuntos", to: "/assuntos" }]}>
        <div className="empty" role="status">
          {error ? <><p>Não foi possível abrir este assunto. Confira a conexão e tente de novo.</p><Button variant="gray" onClick={retry}>Tentar de novo</Button></> : <Pulse size={64} label="Carregando o assunto" />}
        </div>
      </Page>
    );
  }

  const tela = limpa(a.em_uma_tela?.texto_md, true);
  const acc = prog.done ? Math.round((prog.ok / prog.done) * 100) : null;
  const progress = (
    <section className="as-prog" aria-label="Seu progresso neste assunto">
      <MiniRing value={prog.n ? prog.done / prog.n : 0} size={52} stroke={5} tone={prog.n > 0 && prog.done === prog.n ? "success" : undefined}>{prog.n ? Math.round((prog.done / prog.n) * 100) + "%" : null}</MiniRing>
      <div className="as-prog__text">
        <span className="as-prog__main num">{prog.done ? <>{num(prog.done)} de {num(prog.n)} feitas</> : plural(prog.n, "questão", "questões")}</span>
        <span className="as-prog__sub num">{acc != null ? `${acc}% de acerto` : "Você ainda não fez nenhuma."}</span>
      </div>
      <Button variant="filled" icon="questions" disabled={!prog.n} onClick={all} className="as-prog__go">Fazer questões deste assunto</Button>
    </section>
  );

  return (
    <Page title={a.titulo} crumbs={[{ label: "Assuntos", to: "/assuntos" }]} className="as-page"
      subtitle={[area ? areaLabel(area) : null, plural(a.blocos.length, "bloco", "blocos")].filter(Boolean).join(" · ")}>
      <div className="as-cols" data-wide={wide ? "" : undefined}>
        <div className="as-doc" ref={doc}>
          {!wide ? (
            <>
              {progress}
              <nav className="as-index" aria-label="Índice do assunto" data-open={tocOpen ? "" : undefined}>
                <button type="button" className="as-index__btn cd-hoverable" aria-expanded={tocOpen} onClick={() => setTocOpen(!tocOpen)}>
                  <Icon name="layers" size={18} /><span>Índice</span><span className="as-index__n num">{plural(a.blocos.length, "bloco", "blocos")}</span><Icon name="chevron-down" size={18} className="as-index__chev" />
                </button>
                {tocOpen ? <Toc a={a} active={active} onGo={go} /> : null}
              </nav>
            </>
          ) : null}
          {tela || a.em_uma_tela?.tabelas?.length ? (
            <section className="as-tela" id="em-uma-tela" aria-labelledby="t-tela">
              <h2 className="as-tela__title" id="t-tela">Em uma tela</h2>
              <Md text={tela} refs={refs} className="as-prose" />
              {a.em_uma_tela?.tabelas?.length ? (
                <details className="as-tela__more">
                  <summary className="cd-hoverable"><Icon name="chevron-right" size={16} className="as-tela__chev" />Quadros de consulta rápida<span className="num">{num(a.em_uma_tela.tabelas.length)}</span></summary>
                  {a.em_uma_tela.tabelas.map((t, k) => <TabelaView key={k} t={t} refs={refs} />)}
                </details>
              ) : null}
            </section>
          ) : null}
          {a.blocos.map((b, i) => (
            <BlocoView key={b.id} slug={slug} b={b} i={i} refs={refs}
              practice={{ n: byBlock ? (byBlock[b.id] || []).length : null, busy: busy === b.id, go: () => void block(b) }} />
          ))}
        </div>
        {wide ? (
          <aside className="as-side">
            {progress}
            <nav className="as-side__toc" aria-label="Índice do assunto">
              <h2 className="as-label">Neste assunto</h2>
              <Toc a={a} active={active} onGo={go} />
            </nav>
          </aside>
        ) : null}
      </div>
      <PracticeSheet target={target} onClose={() => setTarget(null)} />
    </Page>
  );
}
