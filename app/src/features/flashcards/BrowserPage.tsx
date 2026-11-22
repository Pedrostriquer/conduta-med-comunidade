/* Navegador de cards (o "Navegar" do Anki): busca, filtros por baralho, estado e bandeira, tabela paginada,
   prévia do card e ações em lote (suspender, enterrar, bandeira, marcar, mover, esquecer, excluir). */
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Page } from "../../app/Page";
import { Button, Chip, SegmentedControl } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Pulse } from "../../ds/medical";
import { Dialog, Sheet, useToast } from "../../ds/overlay";
import { cx } from "../../lib/cx";
import { dayKey, num, plural, tinyDate } from "../../lib/format";
import { useCompact } from "../../lib/hooks";
import { spring } from "../../lib/motion";
import { allCards, allDecks, deckCards, deleteCards, putMany, queueOf } from "./db";
import type { CardRec, DeckRec } from "./db";
import { presetFor } from "./config";
import { FLAGS, SEP, daysText, inSub, stateOf, useDeckStore } from "./decks";
import { fold, plainText } from "./render";
import { CardEditor, CardInfo } from "./CardSheets";
import { Face } from "./ReviewPage";
import { FlagDot, FlagPicker } from "./ui";

const PAGE = 100;
type St = "novo" | "aprendendo" | "revisao" | "suspenso" | "enterrado" | "marcado";
const STATES: [St, string][] = [["novo", "Novos"], ["aprendendo", "Aprendendo"], ["revisao", "Revisão"], ["suspenso", "Suspensos"], ["enterrado", "Enterrados"], ["marcado", "Marcados"]];
const match = (c: CardRec, s: St) => {
  const q = c.q ?? 2;
  return s === "novo" ? q === 0 : s === "aprendendo" ? q === 1 : s === "revisao" ? q === 2 : s === "suspenso" ? q === -1 : s === "enterrado" ? q === -2 : !!c.marked;
};
type Sort = "vence" | "criado" | "intervalo" | "facilidade" | "lapsos";

function dueText(c: CardRec) {
  if (c.q === 0) return "Novo #" + num((c.order % 100000) + 1);
  if (c.q === -1) return "Suspenso";
  const k = dayKey(c.due), t = dayKey();
  return k <= t ? (k < t ? "Atrasado" : "Hoje") : tinyDate(k);
}

function Preview({ card, deckName, onEdit, onInfo }: { card: CardRec; deckName: string; onEdit: () => void; onInfo: () => void }) {
  const [open, setOpen] = useState(false);
  const urls = useMemo(() => new Map<string, string>(), []);
  useEffect(() => setOpen(false), [card.id]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const st = stateOf(card);
  return (
    <div className="fc-pv">
      <div className="fc-pv__head">
        <SegmentedControl size="sm" aria-label="Lado" value={open ? "r" : "p"} onChange={(v) => setOpen(v === "r")} options={[{ value: "p", label: "Pergunta" }, { value: "r", label: "Resposta" }]} />
        <span className="cd-row">
          <Button variant="plain" size="sm" icon="pencil" label="Editar" onClick={onEdit} />
          <Button variant="plain" size="sm" icon="info" label="Informações" onClick={onInfo} />
        </span>
      </div>
      <div className="cd-fc fc-pv__card"><div className="cd-fc__stack"><div className="cd-fc__card" data-depth="0"><div className="fc-face"><Face card={card} open={open} urls={urls} /></div></div></div></div>
      <dl className="fc-facts fc-facts--sm">
        <div><dt>Baralho</dt><dd>{deckName}</dd></div>
        <div><dt>Estado</dt><dd><span className={"fc-state is-" + st.tone}>{st.label}</span></dd></div>
        <div><dt>Vence</dt><dd className="num">{dueText(card)}</dd></div>
        <div><dt>Intervalo</dt><dd className="num">{card.ivl ? daysText(card.ivl) : "—"}</dd></div>
        <div><dt>Facilidade</dt><dd className="num">{card.isNew ? "—" : Math.round(card.ease * 100) + "%"}</dd></div>
        <div><dt>Revisões · lapsos</dt><dd className="num">{num(card.reps)} · {num(card.lapses)}</dd></div>
      </dl>
    </div>
  );
}

export function BrowserPage() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const compact = useCompact();
  const [deck, setDeck] = useState(sp.get("deck") || "");
  const [sub, setSub] = useState(sp.get("sub") || "");
  const [decks, setDecks] = useState<DeckRec[]>([]);
  const [cards, setCards] = useState<CardRec[] | null>(null);
  const [text, setText] = useState("");
  const query = useDeferredValue(text);
  const [states, setStates] = useState<Set<St>>(new Set());
  const [flag, setFlag] = useState(0);
  const [sort, setSort] = useState<Sort>("vence");
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cur, setCur] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "preview" | "flag" | "move" | "edit" | "info" | "delete">(null);
  const [moveTo, setMoveTo] = useState({ deck: "", sub: "" });

  useEffect(() => { allDecks().then(setDecks); }, []);
  useEffect(() => { setCards(null); setSel(new Set()); setCur(null); (deck ? deckCards(deck) : allCards()).then(setCards); }, [deck]);
  useEffect(() => { setPage(0); }, [query, states, flag, sort, deck, sub]);
  const names = useMemo(() => new Map(decks.map((d) => [d.id, d.name])), [decks]);
  const paths = useMemo(() => [...new Set((cards || []).flatMap((c) => c.path.map((_, i) => c.path.slice(0, i + 1).join(SEP))))].sort(), [cards]);

  const rows = useMemo(() => {
    if (!cards) return [];
    const qq = fold(query.trim()), tag = qq.startsWith("tag:") ? qq.slice(4) : null;
    let xs = cards.filter((c) => inSub(c, sub) && (!flag || c.flag === flag) && (!states.size || [...states].some((s) => match(c, s))));
    if (tag != null) xs = xs.filter((c) => (c.tags || []).some((t) => fold(t).includes(tag)));
    else if (qq) xs = xs.filter((c) => fold(plainText(c)).includes(qq) || fold(c.path.join(" ")).includes(qq));
    const key: Record<Sort, (c: CardRec) => number> = {
      vence: (c) => (c.q === 0 ? 1e15 + c.order : c.q! < 0 ? 2e15 + c.due : c.due), criado: (c) => c.order, intervalo: (c) => -c.ivl, facilidade: (c) => (c.isNew ? 9 : c.ease), lapsos: (c) => -c.lapses,
    };
    return [...xs].sort((a, b) => key[sort](a) - key[sort](b));
  }, [cards, query, states, flag, sort, sub]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  const current = cards?.find((c) => c.id === cur) || null;
  const allOnPage = slice.length > 0 && slice.every((c) => sel.has(c.id));

  /** aplica uma mudança aos cards escolhidos (ou ao atual) e grava */
  const apply = async (fn: (c: CardRec) => CardRec, msg: string, icon: string) => {
    if (!cards) return;
    const ids = sel.size ? sel : cur ? new Set([cur]) : new Set<string>();
    const changed = cards.filter((c) => ids.has(c.id)).map(fn).map((c) => ({ ...c, q: queueOf(c) }));
    await putMany("cards", changed);
    const m = new Map(changed.map((c) => [c.id, c]));
    setCards(cards.map((c) => m.get(c.id) || c).filter((c) => !deck || c.deck === deck));
    useDeckStore.getState().refresh();
    toast({ icon, text: `${msg}: ${plural(changed.length, "card", "cards")}`, duration: 2400 });
  };
  const target = sel.size || (cur ? 1 : 0);
  const anySusp = cards?.some((c) => (sel.size ? sel.has(c.id) : c.id === cur) && c.suspended);
  const forget = (c: CardRec): CardRec => { const n: CardRec = { ...c, isNew: 1, step: 0, ivl: 0, reps: 0, lapses: 0, ease: presetFor(c.deck).startEase, due: c.order }; delete n.relearn; delete n.introduced; delete n.buried; return n; };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const open = (id: string) => { setCur(id); if (compact) setSheet("preview"); };

  const bulk = target ? (
    <motion.div className="fc-bulk cd-root" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={spring.snappy} role="toolbar" aria-label="Ações nos cards escolhidos">
      <span className="fc-bulk__n num">{sel.size ? plural(sel.size, "escolhido", "escolhidos") : "1 card"}</span>
      <Button variant="plain" size="sm" icon={anySusp ? "play" : "ban"} onClick={() => apply((c) => { const n = { ...c }; if (anySusp) delete n.suspended; else n.suspended = 1; return n; }, anySusp ? "Reativados" : "Suspensos", "ban")}>{compact ? undefined : anySusp ? "Reativar" : "Suspender"}</Button>
      <Button variant="plain" size="sm" icon="moon" onClick={() => apply((c) => ({ ...c, buried: dayKey() }), "Enterrados até amanhã", "moon")}>{compact ? undefined : "Enterrar"}</Button>
      <Button variant="plain" size="sm" icon="flag" onClick={() => setSheet("flag")}>{compact ? undefined : "Bandeira"}</Button>
      <Button variant="plain" size="sm" icon="star" onClick={() => apply((c) => ({ ...c, marked: 1 }), "Marcados", "star")}>{compact ? undefined : "Marcar"}</Button>
      <Button variant="plain" size="sm" icon="swap" onClick={() => { setMoveTo({ deck: deck || decks[0]?.id || "", sub: "" }); setSheet("move"); }}>{compact ? undefined : "Mover"}</Button>
      <Button variant="plain" size="sm" icon="rotate" onClick={() => apply(forget, "Voltaram a novos", "rotate")}>{compact ? undefined : "Esquecer"}</Button>
      <Button variant="plain" size="sm" icon="trash" className="fc-bulk__del" onClick={() => setSheet("delete")}>{compact ? undefined : "Excluir"}</Button>
      {sel.size ? <Button variant="gray" size="sm" icon="x" label="Limpar escolha" onClick={() => setSel(new Set())} /> : null}
    </motion.div>
  ) : null;

  return (
    <Page title="Navegar" subtitle={cards ? <span className="num">{rows.length === cards.length ? plural(cards.length, "card", "cards") : `${num(rows.length)} de ${plural(cards.length, "card", "cards")}`}</span> : "Carregando os cards…"}
      crumbs={deck ? [{ label: "Flashcards", to: "/flashcards" }, { label: names.get(deck) || "Baralho", to: "/flashcards/baralho/" + deck }] : undefined} className="fc-wide"
      actions={<Button variant="tinted" icon="plus" onClick={() => nav("/flashcards/novo" + (deck ? "?deck=" + deck : ""))}>{compact ? undefined : "Adicionar"}</Button>}>
      <div className="fc-filters">
        <label className="fc-search">
          <Icon name="search" size={18} />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar no texto, no sub-baralho ou tag:etiqueta" aria-label="Buscar cards" />
          {text ? <button type="button" className="fc-search__x" aria-label="Limpar busca" onClick={() => setText("")}><Icon name="x" size={16} /></button> : null}
        </label>
        <div className="fc-filters__row">
          <select className="fc-input fc-input--sm" value={deck} onChange={(e) => { setDeck(e.target.value); setSub(""); }} aria-label="Baralho">
            <option value="">Todos os baralhos</option>
            {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="fc-input fc-input--sm" value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Sub-baralho" disabled={!paths.length}>
            <option value="">Todos os sub-baralhos</option>
            {paths.map((p) => <option key={p} value={p}>{"  ".repeat(p.split(SEP).length - 1) + p.split(SEP).pop()}</option>)}
          </select>
          <select className="fc-input fc-input--sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar por">
            <option value="vence">Ordenar por vencimento</option><option value="criado">Ordem do baralho</option><option value="intervalo">Maior intervalo</option>
            <option value="facilidade">Menor facilidade</option><option value="lapsos">Mais lapsos</option>
          </select>
        </div>
        <div className="chips chips--scroll fc-filters__chips" role="group" aria-label="Estado">
          {STATES.map(([s, label]) => <Chip key={s} pressed={states.has(s)} onChange={() => setStates((x) => { const n = new Set(x); if (n.has(s)) n.delete(s); else n.add(s); return n; })}>{label}</Chip>)}
          <span className="fc-filters__sep" aria-hidden />
          {FLAGS.map((f) => (
            <button key={f.id} type="button" className="fc-flagchip cd-hoverable" aria-pressed={flag === f.id} aria-label={"Bandeira " + f.name.toLowerCase()} title={f.name} onClick={() => setFlag(flag === f.id ? 0 : f.id)}>
              <i style={{ background: f.color }} />
            </button>
          ))}
        </div>
      </div>

      {!cards ? <div className="center-pad"><Pulse label="Carregando os cards" /></div> : !rows.length ? (
        <div className="fc-empty"><Icon name="search" size={28} /><b>Nenhum card encontrado</b><span>{cards.length ? "Tente outra busca ou tire um filtro." : "Importe um baralho ou adicione cards."}</span></div>
      ) : (
        <div className={cx("fc-browse", current && !compact && "has-preview")}>
          <div className="fc-table" role="table" aria-label="Cards">
            <div className="fc-tr fc-tr--head" role="row">
              <span role="columnheader"><button type="button" role="checkbox" aria-checked={allOnPage} aria-label="Escolher todos desta página" className="cd-check"
                onClick={() => setSel((s) => { const n = new Set(s); slice.forEach((c) => (allOnPage ? n.delete(c.id) : n.add(c.id))); return n; })}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </button></span>
              <span role="columnheader">Card</span>
              <span role="columnheader" className="fc-col--deck">Sub-baralho</span>
              <span role="columnheader" className="fc-col--n">Vence</span>
              <span role="columnheader" className="fc-col--n fc-col--opt">Intervalo</span>
              <span role="columnheader" className="fc-col--n fc-col--opt">Facil.</span>
              <span role="columnheader" className="fc-col--n fc-col--opt">Lapsos</span>
            </div>
            {slice.map((c) => {
              const st = stateOf(c);
              return (
                <div key={c.id} role="row" className={cx("fc-tr", cur === c.id && "is-cur", sel.has(c.id) && "is-sel", c.q! < 0 && "is-dim")} onClick={() => open(c.id)}>
                  <span role="cell" onClick={(e) => e.stopPropagation()}>
                    <button type="button" role="checkbox" aria-checked={sel.has(c.id)} aria-label="Escolher card" className="cd-check" onClick={() => toggle(c.id)}>
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    </button>
                  </span>
                  <span role="cell" className="fc-col--q">
                    <span className="fc-q">{c.marked ? <Icon name="star" size={13} className="fc-rv__star" /> : null}<FlagDot flag={c.flag} size={8} /><span className="fc-q__t">{plainText(c) || "(sem texto)"}</span></span>
                    <span className="fc-q__sub"><i className={"fc-state is-" + st.tone}>{st.label}</i>{compact ? <> · {dueText(c)}</> : null}{!deck ? <> · {names.get(c.deck)}</> : null}</span>
                  </span>
                  <span role="cell" className="fc-col--deck" title={c.path.join(" › ")}>{c.path[c.path.length - 1] || names.get(c.deck)}</span>
                  <span role="cell" className="fc-col--n num">{dueText(c)}</span>
                  <span role="cell" className="fc-col--n fc-col--opt num">{c.ivl ? daysText(c.ivl) : "—"}</span>
                  <span role="cell" className="fc-col--n fc-col--opt num">{c.isNew ? "—" : Math.round(c.ease * 100) + "%"}</span>
                  <span role="cell" className="fc-col--n fc-col--opt num">{c.lapses || "—"}</span>
                </div>
              );
            })}
            {pages > 1 ? (
              <div className="fc-pager">
                <Button variant="gray" size="sm" icon="chevron-left" label="Página anterior" disabled={!page} onClick={() => setPage(page - 1)} />
                <span className="num">Página {num(page + 1)} de {num(pages)}</span>
                <Button variant="gray" size="sm" icon="chevron-right" label="Próxima página" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} />
              </div>
            ) : null}
          </div>
          {!compact && current ? (
            <aside className="fc-side">
              <Preview card={current} deckName={names.get(current.deck) || ""} onEdit={() => setSheet("edit")} onInfo={() => setSheet("info")} />
            </aside>
          ) : null}
        </div>
      )}

      <div className="fc-bulk-wrap"><AnimatePresence>{bulk}</AnimatePresence></div>

      <Sheet open={sheet === "preview" && !!current} onClose={() => setSheet(null)} title="Card" width={560}>
        {current ? <Preview card={current} deckName={names.get(current.deck) || ""} onEdit={() => setSheet("edit")} onInfo={() => setSheet("info")} /> : <span />}
      </Sheet>
      <Sheet open={sheet === "flag"} onClose={() => setSheet(null)} title="Bandeira" width={420}>
        <FlagPicker onPick={(f) => { apply((c) => ({ ...c, flag: f || undefined }), f ? "Bandeira " + FLAGS[f - 1].name.toLowerCase() : "Bandeira removida", "flag"); setSheet(null); }} />
      </Sheet>
      <Sheet open={sheet === "move"} onClose={() => setSheet(null)} title="Mover para" width={480}
        footer={<div className="cd-row" style={{ justifyContent: "flex-end" }}><Button variant="gray" onClick={() => setSheet(null)}>Cancelar</Button>
          <Button variant="filled" disabled={!moveTo.deck} onClick={() => { const path = moveTo.sub.split(/\s*(?:›|::)\s*/).filter(Boolean); apply((c) => ({ ...c, deck: moveTo.deck, path, media: c.media || c.deck }), "Movidos", "swap"); setSheet(null); }}>Mover</Button></div>}>
        <div className="fc-form">
          <label className="fc-field"><span className="fc-field__label">Baralho</span>
            <select className="fc-input" value={moveTo.deck} onChange={(e) => setMoveTo({ ...moveTo, deck: e.target.value })}>{decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label className="fc-field"><span className="fc-field__label">Sub-baralho <small>opcional</small></span>
            <input className="fc-input" list="fc-move-paths" value={moveTo.sub} placeholder="Ex.: Cardiologia › Arritmias" onChange={(e) => setMoveTo({ ...moveTo, sub: e.target.value })} />
            <datalist id="fc-move-paths">{paths.map((p) => <option key={p} value={p} />)}</datalist></label>
        </div>
      </Sheet>
      <Dialog open={sheet === "delete"} onClose={() => setSheet(null)} destructive confirmLabel="Excluir" title={`Excluir ${plural(target, "card", "cards")}?`}
        onConfirm={async () => {
          const ids = sel.size ? [...sel] : cur ? [cur] : [];
          await deleteCards(ids);
          const byDeck = new Map<string, number>(); cards?.filter((c) => ids.includes(c.id)).forEach((c) => byDeck.set(c.deck, (byDeck.get(c.deck) || 0) + 1));
          await putMany("decks", decks.filter((d) => byDeck.has(d.id)).map((d) => ({ ...d, cards: Math.max(0, d.cards - (byDeck.get(d.id) || 0)) })));
          setCards((cs) => cs?.filter((c) => !ids.includes(c.id)) || null); setSel(new Set()); setCur(null);
          useDeckStore.getState().refresh(); toast({ icon: "trash", text: plural(ids.length, "card excluído", "cards excluídos") });
        }}>
        Os cards e o histórico deles saem do app. Isso não volta.
      </Dialog>
      <CardEditor card={sheet === "edit" ? current : null} onClose={() => setSheet(null)} onSave={(n) => { putMany("cards", [n]); setCards((cs) => cs?.map((c) => (c.id === n.id ? n : c)) || null); setSheet(null); toast({ icon: "check", text: "Card salvo", duration: 1800 }); }} />
      <CardInfo card={sheet === "info" ? current : null} onClose={() => setSheet(null)} />
    </Page>
  );
}
