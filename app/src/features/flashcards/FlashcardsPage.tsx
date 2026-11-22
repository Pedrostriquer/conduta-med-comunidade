/* Flashcards: os baralhos importados do Anki e a importação (soltar → ler → escolher → importar).
   Não é o foco do app; as revisões ficam separadas e não contam no desempenho das questões. */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Page } from "../../app/Page";
import { Button } from "../../ds/basics";
import { Sheet } from "../../ds/overlay";
import { Icon } from "../../ds/Icon";
import { Pulse } from "../../ds/medical";
import { Meter } from "../../ds/progress";
import { num, plural } from "../../lib/format";
import { spring } from "../../lib/motion";
import { useStore } from "../../state/store";
import { useDecks } from "./decks";
import { countSeen } from "./db";
import { Counts } from "./ui";

if (import.meta.env.DEV) import("./devseed");
import { fileSize, useImport } from "./importer";

function FileRow({ name, meta }: { name: string; meta: string }) {
  return (
    <div className="cd-file">
      <span className="cd-file__glyph"><Icon name="cards" size={22} /></span>
      <div><div className="cd-file__name">{name.replace(/\.apkg$/i, "")}</div><div className="cd-file__meta">{meta}</div></div>
      <span />
    </div>
  );
}

export function Importer({ onDone }: { onDone?: () => void }) {
  const im = useImport();
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null), drop = useRef<HTMLDivElement>(null);
  const limit = useStore((s) => s.settings.cardsNovosPorDia);
  const nav = useNavigate();
  const total = im.summary ? im.summary.groups.reduce((s, g) => s + (im.groups[g.name] ? g.cards : 0), 0) : 0;
  const pick = (f?: File | null) => { if (f) im.open(f); };
  const meta = im.summary ? `${fileSize(im.file?.size || 0)} · ${num(im.summary.cards)} cards · ${num(im.summary.images)} imagens` : fileSize(im.file?.size || 0);

  let body: React.ReactNode;
  if (im.step === "idle" || im.step === "error") {
    body = (
      <div ref={drop} className="cd-drop" data-over={over ? "" : undefined} data-error={im.step === "error" ? "" : undefined}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
        <span className="cd-drop__icon"><Icon name="upload" size={26} /></span>
        <h3>Importar do Anki</h3>
        <p>Arraste o arquivo .apkg para cá ou escolha no computador. Os baralhos, as imagens e a estrutura de pastas vêm junto.</p>
        <div className="cd-row" style={{ justifyContent: "center", marginTop: 6 }}>
          <Button variant="filled" icon="file" onClick={() => input.current?.click()}>Escolher arquivo</Button>
        </div>
        <input ref={input} type="file" accept=".apkg" hidden onChange={(e) => pick(e.target.files?.[0])} />
        {im.error ? <div className="cd-callout" role="alert" style={{ marginTop: 8, textAlign: "left", background: "var(--danger-soft)", color: "var(--danger-ink)" }}><Icon name="alert" size={18} />{im.error}</div> : null}
      </div>
    );
  } else if (im.step === "reading") {
    body = (
      <div className="cd-import__panel" aria-busy>
        <FileRow name={im.file!.name} meta={meta} />
        <div className="fc-reading"><Pulse size={88} label="Lendo o arquivo" /><span>Lendo o baralho…</span></div>
        <div className="cd-import__actions"><Button variant="gray" onClick={im.cancel}>Cancelar</Button></div>
      </div>
    );
  } else if (im.step === "review" && im.summary) {
    const s = im.summary;
    body = (
      <div className="cd-import__panel">
        <FileRow name={s.name} meta={meta} />
        <div><h3>Escolha o que entra</h3><p className="cd-import__p" style={{ marginTop: 4 }}>{num(s.subdecks)} baralhos em {s.groups.length} grupos. A estrutura de pastas é mantida.</p></div>
        <ul className="cd-tree" aria-label="Baralhos">
          {s.groups.map((g) => {
            const on = !!im.groups[g.name];
            return (
              <li key={g.name}>
                <button type="button" role="checkbox" aria-checked={on} aria-label={g.name} className="cd-check" onClick={() => im.toggle(g.name)}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </button>
                <div><div className="cd-tree__name">{g.name}</div><div className="cd-tree__sub">{plural(g.subdecks, "baralho", "baralhos")}</div></div>
                <span className="cd-tree__n">{num(g.cards)}</span>
              </li>
            );
          })}
        </ul>
        <div className="cd-callout"><Icon name="info" size={18} />Todos entram como novos, {num(limit)} por dia. Imagens são copiadas só para os cards escolhidos.{s.unsupported ? ` ${plural(s.unsupported, "card de oclusão de imagem fica", "cards de oclusão de imagem ficam")} de fora.` : ""}</div>
        <div className="cd-import__actions">
          <Button variant="gray" onClick={im.cancel}>Cancelar</Button>
          <Button variant="filled" disabled={!total} onClick={im.start}>Importar {num(total)} cards</Button>
        </div>
      </div>
    );
  } else if (im.step === "importing") {
    body = (
      <div className="cd-import__panel" aria-busy>
        <FileRow name={im.summary?.name || im.file!.name} meta={meta} />
        <Meter label={im.phase === "cards" ? "Importando cards" : "Copiando imagens"} value={im.n} max={Math.max(1, im.total)} valueLabel={im.total ? <><b>{num(im.n)}</b> de {num(im.total)}</> : "começando"} />
        <p className="cd-import__p">Você pode continuar usando o app enquanto isso.</p>
        <div className="cd-import__actions"><Button variant="gray" onClick={im.cancel}>Cancelar</Button></div>
      </div>
    );
  } else {
    body = (
      <div className="cd-import__panel" role="status" style={{ alignItems: "center", textAlign: "center", padding: "32px 24px" }}>
        <span className="cd-done-mark"><svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
        <h3>{num(im.result?.cards || 0)} cards importados</h3>
        <p className="cd-import__p">Na revisão de hoje aparecem os {num(limit)} primeiros novos; você muda esse limite em Ajustes.</p>
        <div className="cd-row" style={{ justifyContent: "center" }}>
          <Button variant="gray" icon="undo" onClick={im.cancel}>Desfazer importação</Button>
          <Button variant="filled" onClick={() => { const d = im.deck; im.reset(); onDone?.(); nav("/flashcards/revisar/" + d); }}>Começar a revisar</Button>
        </div>
      </div>
    );
  }
  return <div className="cd-import cd-root">{body}</div>;
}

/** barrinha do baralho: quanto dele você já viu (cards que já saíram de novos) */
function DeckBar({ id, total }: { id: string; total: number }) {
  const [seen, setSeen] = useState<number | null>(null);
  useEffect(() => { let on = true; countSeen(id).then((n) => on && setSeen(n)); return () => { on = false; }; }, [id, total]);
  const p = seen == null || !total ? 0 : seen / total;
  return (
    <div className="fc-deckbar" title={seen == null ? "" : `${num(seen)} de ${num(total)} cards já vistos`}>
      <span className="fc-deckbar__track"><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: p }} transition={spring.smooth} /></span>
      <span className="fc-deckbar__lab num">{seen == null ? "" : `${Math.round(p * 100)}% visto`}</span>
    </div>
  );
}

export function FlashcardsPage() {
  const { decks, loaded } = useDecks();
  const nav = useNavigate();
  const im = useImport();
  const [sheet, setSheet] = useState(false);
  const busy = im.step !== "idle" && im.step !== "error";
  const tot = decks.reduce((a, d) => ({ fresh: a.fresh + d.fresh, learn: a.learn + d.learn, rev: a.rev + d.rev }), { fresh: 0, learn: 0, rev: 0 });
  const totalMin = Math.round((tot.fresh * 40 + (tot.learn + tot.rev) * 9) / 60);
  return (
    <Page title="Flashcards" subtitle="Seus baralhos do Anki. As revisões não entram no desempenho das questões."
      actions={decks.length ? <Button variant="tinted" icon="upload" onClick={() => setSheet(true)}>Importar</Button> : null}>
      {!loaded ? <div className="center-pad"><Pulse /></div> : !decks.length ? (
        <div className="stack">
          <Importer />
          <button type="button" className="panel panel--tap fc-own" onClick={() => nav("/flashcards/novo")}>
            <span className="deck__glyph" aria-hidden><Icon name="pencil" size={20} /></span>
            <span><b>Ou crie seus próprios cards</b><small>Frente e verso, invertido ou lacunas, com prévia ao vivo</small></span>
            <Icon name="chevron-right" size={18} className="row__chev" />
          </button>
        </div>
      ) : (
        <div className="stack">
          <div className="panel fc-total">
            <div className="fc-total__main">
              <span className="fc-total__label">Hoje{decks.length > 1 ? ", em todos os baralhos" : ""}</span>
              <Counts fresh={tot.fresh} learn={tot.learn} rev={tot.rev} size="lg" />
            </div>
            <div className="fc-total__side">
              <span className="fc-total__min num">≈ {num(totalMin)} min</span>
              <span className="fc-help">{tot.fresh + tot.learn + tot.rev ? "para zerar o dia" : "Tudo em dia por hoje"}</span>
            </div>
          </div>
          {busy && im.step !== "done" && !sheet ? <button type="button" className="panel panel--tap fc-busy" onClick={() => setSheet(true)}><Pulse size={56} label="Importando" /><span>Importação em andamento</span><Icon name="chevron-right" size={18} /></button> : null}
          <div className="grid-auto fc-decks" style={{ "--min": "320px" } as React.CSSProperties}>
          <AnimatePresence initial={false}>
            {decks.map((d, i) => (
              <motion.article key={d.id} layout className="panel deck fc-deck" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay: i * 0.04 } }} exit={{ opacity: 0, scale: 0.98 }} transition={spring.smooth}>
                <button type="button" className="fc-deck__hit" aria-label={"Abrir " + d.name} onClick={() => nav("/flashcards/baralho/" + d.id)} />
                <div className="deck__head">
                  <span className="deck__glyph" aria-hidden><Icon name="cards" size={22} /></span>
                  <div className="deck__titles">
                    <h2 className="deck__name">{d.name}</h2>
                    <p className="deck__meta num">{num(d.cards)} cards{d.images ? ` · ${num(d.images)} imagens` : ""}{d.id.startsWith("sub-") ? " · assinado" : d.id === "meus-erros" ? " · das questões que errei" : ""}</p>
                  </div>
                  <Icon name="chevron-right" size={18} className="row__chev" />
                </div>
                <DeckBar id={d.id} total={d.cards} />
                <div className="deck__today">
                  <Counts fresh={d.fresh} learn={d.learn} rev={d.rev} />
                  <Button variant={d.due ? "filled" : "gray"} disabled={!d.due} className="fc-deck__go" onClick={() => nav("/flashcards/revisar/" + d.id)}>{d.due ? "Estudar" : "Em dia"}</Button>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
          </div>
        </div>
      )}
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Importar do Anki" width={600}><Importer onDone={() => setSheet(false)} /></Sheet>
    </Page>
  );
}
