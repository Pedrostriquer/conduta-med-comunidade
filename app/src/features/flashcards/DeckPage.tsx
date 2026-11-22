/* Tela do baralho (a "visão geral" do Anki): o que tem para hoje, a árvore de sub-baralhos com as contagens,
   e o caminho para opções, navegador, estatísticas, adicionar card e estudo personalizado. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Page, Section } from "../../app/Page";
import { Button, Stepper } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Pulse } from "../../ds/medical";
import { Dialog, Sheet, useToast } from "../../ds/overlay";
import { cx } from "../../lib/cx";
import { num, plural } from "../../lib/format";
import { spring } from "../../lib/motion";
import { deckCards, deleteDeck } from "./db";
import type { CardRec } from "./db";
import { PROFILES, minutesPerDay, newPerDay, presetFor, profileOf, todayOf, useFc } from "./config";
import { buildTree, useDeckStore, useDecks } from "./decks";
import type { Node } from "./decks";
import { Counts } from "./ui";

function Tree({ node, deck, open, toggle }: { node: Node; deck: string; open: Set<string>; toggle: (k: string) => void }) {
  const nav = useNavigate();
  const rows: Node[] = [];
  const walk = (n: Node) => n.children.forEach((c) => { rows.push(c); if (open.has(c.key)) walk(c); });
  walk(node);
  return (
    <ul className="list fc-tree" role="tree" aria-label="Sub-baralhos">
      <AnimatePresence initial={false}>
        {rows.map((n) => {
          const kids = n.children.length > 0, isOpen = open.has(n.key), due = n.fresh + n.learn + n.rev;
          return (
            <motion.li key={n.key} role="treeitem" aria-expanded={kids ? isOpen : undefined} aria-level={n.depth + 1}
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} style={{ overflow: "hidden" }}>
              <div className="row fc-tree__row" style={{ "--d": n.depth } as React.CSSProperties}>
                {kids ? (
                  <button type="button" className="fc-tree__tog cd-hoverable" aria-label={(isOpen ? "Recolher " : "Expandir ") + n.name} onClick={() => toggle(n.key)}>
                    <Icon name="chevron-right" size={16} className={cx("fc-tree__chev", isOpen && "is-open")} />
                  </button>
                ) : <span className="fc-tree__tog" aria-hidden />}
                <button type="button" className="fc-tree__name" onClick={() => (kids ? toggle(n.key) : nav(`/flashcards/navegar?deck=${deck}&sub=${encodeURIComponent(n.key)}`))}>
                  <span className="row__title">{n.name}</span>
                  <span className="row__sub num">{plural(n.total, "card", "cards")}</span>
                </button>
                <span className="fc-tree__end">
                  <Counts fresh={n.fresh} learn={n.learn} rev={n.rev} labels={false} />
                  <Button variant={due ? "tinted" : "plain"} size="sm" icon="play" label={"Estudar " + n.name} disabled={!due} onClick={() => nav(`/flashcards/revisar/${deck}?sub=${encodeURIComponent(n.key)}`)} />
                </span>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

type Modo = "novos+" | "rev+" | "esquecidos" | "adiantado" | "novos" | "etiqueta";
const MODES: { id: Modo; title: string; hint: string; unit?: string; def: number; max: number; step: number }[] = [
  { id: "novos+", title: "Aumentar o limite de novos de hoje", hint: "Mais cards novos só hoje", unit: "cards", def: 10, max: 500, step: 5 },
  { id: "rev+", title: "Aumentar o limite de revisões de hoje", hint: "Mais revisões só hoje", unit: "cards", def: 50, max: 2000, step: 10 },
  { id: "esquecidos", title: "Revisar os que errei", hint: "Cards em que você apertou De novo", unit: "dias", def: 1, max: 30, step: 1 },
  { id: "adiantado", title: "Revisar adiantado", hint: "Cards que vencem nos próximos dias", unit: "dias", def: 2, max: 30, step: 1 },
  { id: "novos", title: "Pré-visualizar novos", hint: "Ver novos sem gastar o limite de hoje", unit: "cards", def: 20, max: 200, step: 5 },
  { id: "etiqueta", title: "Estudar por etiqueta", hint: "Só os cards com uma etiqueta", def: 50, max: 500, step: 10 },
];

function CustomStudy({ open, onClose, deck, tags }: { open: boolean; onClose: () => void; deck: string; tags: string[] }) {
  const nav = useNavigate(), toast = useToast(), bump = useFc((s) => s.bump);
  const [modo, setModo] = useState<Modo>("novos+");
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(MODES.map((m) => [m.id, m.def])));
  const [tag, setTag] = useState("");
  useEffect(() => { if (!tag && tags[0]) setTag(tags[0]); }, [tags, tag]);
  const m = MODES.find((x) => x.id === modo)!, v = vals[modo];
  const go = () => {
    if (modo === "novos+" || modo === "rev+") {
      bump(deck, modo === "novos+" ? { extraNew: v } : { extraRev: v });
      useDeckStore.getState().refresh(); onClose();
      toast({ icon: "bolt", text: `Limite de ${modo === "novos+" ? "novos" : "revisões"} de hoje aumentado em ${num(v)}` });
      return;
    }
    const qs = new URLSearchParams({ modo, ...(m.unit === "dias" ? { dias: String(v) } : { n: String(v) }), ...(modo === "etiqueta" ? { tag } : {}) });
    nav(`/flashcards/revisar/${deck}?${qs}`);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Estudo personalizado" subtitle="Como no Anki: aumente o limite de hoje ou monte uma sessão à parte." width={560}
      footer={<div className="cd-row" style={{ justifyContent: "flex-end" }}><Button variant="gray" onClick={onClose}>Cancelar</Button><Button variant="filled" disabled={modo === "etiqueta" && !tag} onClick={go}>{modo.endsWith("+") ? "Aumentar" : "Começar"}</Button></div>}>
      <ul className="fc-radio" role="radiogroup" aria-label="Tipo de estudo">
        {MODES.map((x) => (
          <li key={x.id}>
            <button type="button" role="radio" aria-checked={modo === x.id} className="fc-radio__opt cd-hoverable" onClick={() => setModo(x.id)}>
              <i className="fc-radio__dot" aria-hidden />
              <span><b>{x.title}</b><small>{x.hint}</small></span>
            </button>
            <AnimatePresence initial={false}>
              {modo === x.id ? (
                <motion.div className="fc-radio__more" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth}>
                  <div className="fc-radio__inner">
                    {x.id === "etiqueta" ? (
                      tags.length ? (
                        <select className="fc-input" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Etiqueta">{tags.map((t) => <option key={t}>{t}</option>)}</select>
                      ) : <span className="fc-help">Nenhum card deste baralho tem etiqueta.</span>
                    ) : null}
                    <Stepper label={x.title} value={vals[x.id]} min={x.step} max={x.max} step={x.step} onChange={(n) => setVals((s) => ({ ...s, [x.id]: n }))}
                      format={(n) => `${x.id.endsWith("+") ? "+" : ""}${num(n)} ${x.unit || "cards"}`} />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function DeckPage() {
  const { deck = "" } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const { decks, loaded } = useDecks();
  const d = decks.find((x) => x.id === deck);
  const preset = useFc((s) => presetFor(deck, s));
  const t = useFc(() => todayOf(deck));
  const paused = useFc((s) => !!s.paused[deck]);
  const profile = PROFILES.find((x) => x.id === profileOf(preset));
  const [cards, setCards] = useState<CardRec[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [remove, setRemove] = useState(false);
  const custom = sp.get("personalizado") === "1";
  useEffect(() => { deckCards(deck).then(setCards); }, [deck, d?.due]);
  const tree = useMemo(() => (cards ? buildTree(cards) : null), [cards]);
  const tags = useMemo(() => [...new Set((cards || []).flatMap((c) => c.tags || []))].sort(), [cards]);
  useEffect(() => { if (tree && tree.children.length <= 6 && !open.size) setOpen(new Set(tree.children.filter((c) => c.children.length).slice(0, 2).map((c) => c.key))); }, [tree]); // eslint-disable-line
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const setCustom = (v: boolean) => setSp(v ? { personalizado: "1" } : {}, { replace: true });

  if (!loaded) return <Page title="Baralho" back={{ to: "/flashcards", label: "Flashcards" }}><div className="center-pad"><Pulse /></div></Page>;
  if (!d) return <Page title="Baralho não encontrado" back={{ to: "/flashcards", label: "Flashcards" }}><p className="fc-help">Ele pode ter sido removido.</p></Page>;
  const susp = cards?.filter((c) => c.q === -1).length || 0, bur = cards?.filter((c) => c.q === -2).length || 0;
  const studied = t.new + t.rev;
  return (
    <Page title={d.name} subtitle={<span className="num">{plural(d.cards, "card", "cards")}{d.images ? ` · ${num(d.images)} imagens` : ""} · predefinição {preset.name}</span>}
      back={{ to: "/flashcards", label: "Flashcards" }}>
      <motion.section className="panel fc-hero" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
        <div className="fc-hero__top">
          <div>
            <span className="fc-hero__eyebrow">Hoje</span>
            <Counts fresh={d.fresh} learn={d.learn} rev={d.rev} size="lg" />
          </div>
          <Button variant="filled" size="lg" icon="play" disabled={!d.due} onClick={() => nav("/flashcards/revisar/" + deck)}>{d.due ? "Estudar agora" : "Em dia"}</Button>
        </div>
        <p className="fc-hero__note">
          {studied ? `${plural(studied, "card estudado", "cards estudados")} hoje. ` : ""}
          {t.extraNew || t.extraRev ? `Limite de hoje aumentado (${t.extraNew ? "+" + t.extraNew + " novos" : ""}${t.extraNew && t.extraRev ? ", " : ""}${t.extraRev ? "+" + t.extraRev + " revisões" : ""}). ` : ""}
          {susp || bur ? `${susp ? plural(susp, "suspenso", "suspensos") : ""}${susp && bur ? " e " : ""}${bur ? plural(bur, "enterrado", "enterrados") : ""} fora da fila.` : ""}
        </p>
      </motion.section>

      <div className="cols fc-deckcols">
        <div className="cols__main">
          <Section title="Sub-baralhos" action={tree && tree.children.length ? (
            <div className="cd-row">
              <button type="button" className="sec__link" onClick={() => { const all = new Set<string>(); const w = (n: Node) => n.children.forEach((c) => { if (c.children.length) { all.add(c.key); w(c); } }); if (tree) w(tree); setOpen(all); }}>Expandir tudo</button>
              <button type="button" className="sec__link" onClick={() => setOpen(new Set())}>Recolher</button>
            </div>
          ) : null}>
            {!tree ? <div className="center-pad"><Pulse /></div> : tree.children.length ? <Tree node={tree} deck={deck} open={open} toggle={toggle} /> : <p className="fc-help">Este baralho não tem sub-baralhos.</p>}
            <p className="list__note">As contagens da árvore não descontam o limite diário; o botão Estudar agora segue as opções do baralho.</p>
          </Section>
        </div>

        <aside className="cols__aside">
          <button type="button" className="panel panel--tap fc-howto cd-hoverable" onClick={() => nav("/flashcards/opcoes/" + deck)}>
            <span className="fc-hero__eyebrow">Como você estuda este baralho</span>
            <span className="fc-howto__row"><b>{profile ? profile.name : "Personalizado"}</b><span className="fc-howto__min num">≈ {num(minutesPerDay(preset, { reviewsAhead: d.rev + d.learn, freshLeft: d.fresh }))} min/dia</span></span>
            <span className="fc-help num">{paused ? "Novos pausados" : `${num(newPerDay(preset))} novos por dia`} · {preset.maxReviews >= 9999 ? "sem teto de revisões" : `até ${num(preset.maxReviews)} revisões`}</span>
            <span className="fc-howto__go">Mudar o perfil e as opções<Icon name="chevron-right" size={16} /></span>
          </button>
          <ul className="list fc-deckacts" aria-label="Ações do baralho">
            {([
              ["bolt", "Estudo personalizado", "Mais novos hoje, revisar os que errou, adiantar", () => setCustom(true)],
              ["search", "Ver os cards", "Buscar, suspender, mudar de baralho", () => nav("/flashcards/navegar?deck=" + deck)],
              ["chart", "Estatísticas do baralho", "Previsão, retenção, intervalos", () => nav("/flashcards/estatisticas?deck=" + deck)],
              ["plus", "Adicionar card aqui", "Escrever, colar planilha", () => nav("/flashcards/novo?deck=" + deck)],
              ["share", "Publicar este baralho", "Link para a turma assinar", () => nav("/flashcards/compartilhados?aba=publicados")],
            ] as [string, string, string, () => void][]).map(([icon, label, hint, fn], i) => (
              <motion.li key={label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay: 0.04 + i * 0.03 } }}>
                <button type="button" className="row row--icon cd-hoverable" onClick={fn}>
                  <span className="row__icon"><Icon name={icon} size={20} /></span>
                  <span className="row__main"><span className="row__title">{label}</span><span className="row__sub">{hint}</span></span>
                  <span className="row__end"><Icon name="chevron-right" size={18} className="row__chev" /></span>
                </button>
              </motion.li>
            ))}
            <li><button type="button" className="row row--icon row--danger cd-hoverable" onClick={() => setRemove(true)}>
              <span className="row__icon"><Icon name="trash" size={20} /></span>
              <span className="row__main"><span className="row__title">Remover baralho</span><span className="row__sub">O arquivo do Anki continua no seu computador</span></span>
            </button></li>
          </ul>
        </aside>
      </div>

      <CustomStudy open={custom} onClose={() => setCustom(false)} deck={deck} tags={tags} />
      <Dialog open={remove} onClose={() => setRemove(false)} destructive confirmLabel="Remover" title="Remover este baralho?"
        onConfirm={async () => { await deleteDeck(deck); await useDeckStore.getState().refresh(); nav("/flashcards"); }}>
        Os cards e o histórico de revisões dele saem do app. O arquivo do Anki continua no seu computador.
      </Dialog>
    </Page>
  );
}
