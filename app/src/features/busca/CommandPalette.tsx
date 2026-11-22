/* Paleta de busca (⌘K ou Ctrl+K, ou openPalette()): questões do banco, temas para montar lista, provas, atalhos, pessoas e
   resumos. Setas escolhem, Enter abre, Esc fecha. Questões abrem numa sessão de uma questão; dá para resolver todas as encontradas.
   Temas, provas e atalhos saem do índice, na hora; questões, pessoas e resumos vêm do servidor, com atraso e cancelando o pedido anterior. */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useBank } from "../../data/bank";
import type { Exam } from "../../data/types";
import { useStore } from "../../state/store";
import { useStats } from "../../state/stats";
import { AREA_ICON, Icon } from "../../ds/Icon";
import { Kbd } from "../../ds/basics";
import { num } from "../../lib/format";
import { ease, spring } from "../../lib/motion";
import { cx } from "../../lib/cx";
import { SimuladoSetup } from "../simulados/SimuladoSetup";
import { examTag, searchExams, searchNav, searchTopics, terms } from "./search";
import { useQuestionSearch } from "./questions";
import { Marked, startFound } from "./parts";
import { useRemoteSearch } from "./remote";
import { Avatar } from "../comunidade/parts";

const subs = new Set<(v: boolean) => void>();
/** abre a paleta de busca de qualquer lugar (barra lateral, topo) */
export function openPalette() { subs.forEach((f) => f(true)); }

const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const paletteKey = mac ? "⌘K" : "Ctrl K";

type Item = { id: string; group: string; run: () => void; render: React.ReactNode };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [exam, setExam] = useState<Exam | null>(null);
  useEffect(() => {
    subs.add(setOpen);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    addEventListener("keydown", key);
    return () => { subs.delete(setOpen); removeEventListener("keydown", key); };
  }, []);
  return (
    <>
      {createPortal(<AnimatePresence>{open ? <Palette key="p" onClose={() => setOpen(false)} onExam={(e) => { setOpen(false); setExam(e); }} /> : null}</AnimatePresence>, document.body)}
      <SimuladoSetup exam={exam} open={!!exam} onClose={() => setExam(null)} />
    </>
  );
}

function Palette({ onClose, onExam }: { onClose: () => void; onExam: (e: Exam) => void }) {
  const bank = useBank()!;
  const nav = useNavigate();
  const inc = useStore((s) => s.settings.incluirTodas);
  const st = useStats(bank);
  const [query, setQuery] = useState("");
  const [deferred, setDeferred] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null), back = useRef<Element | null>(null);

  useEffect(() => { const t = setTimeout(() => setDeferred(query), query.length < deferred.length ? 0 : 90); return () => clearTimeout(t); }, [query]); // eslint-disable-line
  useEffect(() => {
    back.current = document.activeElement;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    setTimeout(() => input.current?.focus(), 10);
    return () => { document.body.style.overflow = prev; (back.current as HTMLElement | null)?.focus?.({ preventScroll: true }); };
  }, []);

  const ts = useMemo(() => terms(deferred), [deferred]);
  const go = (to: string) => { onClose(); nav(to); };
  const found = useQuestionSearch(ts.length ? { q: deferred.trim(), todas: inc, limit: 6, trecho: 140 } : null, deferred.trim() + "|" + inc, 160);
  const hits = useMemo(() => found.hits.filter((h) => bank.byId[h.id]), [found.hits, bank]);
  const total = found.total;
  const remote = useRemoteSearch(deferred);
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [], more: Item[] = [];
    const nv = searchNav(deferred);
    if (ts.length) {
      hits.forEach(({ id, where, text }) => {
        const q = bank.byId[id];
        out.push({
          id: "q:" + q.id, group: "Questões", run: () => go("/sessao/" + startFound([q.id], "", { type: "busca", query: deferred })),
          render: (
            <>
              <span className="pal__glyph"><Icon name="questions" size={18} /></span>
              <span className="pal__main">
                <span className="pal__title"><span className="pal__tag">{examTag(bank, q)} · Questão {q.n}</span>{st.answered.has(q.id) ? <span className="pal__done"><Icon name="check" size={13} strokeWidth={2.5} />Feita</span> : null}</span>
                <span className="pal__snip">{where !== "stem" ? <b>Alternativa {where}: </b> : null}<Marked text={text} ts={ts} /></span>
              </span>
            </>
          ),
        });
      });
      if (total > 1) {
        const ids = found.ids.filter((id) => bank.byId[id]);
        out.push({
          id: "all", group: "Questões", run: () => go("/sessao/" + startFound(ids, `Busca: “${deferred.trim()}”`, { type: "busca", query: deferred })),
          render: <><span className="pal__glyph pal__glyph--accent"><Icon name="play" size={16} /></span><span className="pal__main"><span className="pal__title">Resolver {total > 50 ? `50 das ${num(total)}` : `as ${num(total)}`} encontradas</span></span></>,
        });
      }
      out.push({
        id: "page", group: "Questões", run: () => go("/busca?q=" + encodeURIComponent(deferred.trim())),
        render: <><span className="pal__glyph"><Icon name="search" size={18} /></span><span className="pal__main"><span className="pal__title">{total ? `Ver as ${num(total)} na Busca, com filtros` : "Buscar com filtros"}</span></span></>,
      });
      searchTopics(bank, deferred).forEach((t) => more.push({
        id: "t:" + t.key, group: "Temas", run: () => go("/questoes?tema=" + encodeURIComponent(t.key)),
        render: <><span className="pal__glyph"><Icon name={AREA_ICON[t.area]} size={18} /></span><span className="pal__main"><span className="pal__title"><Marked text={t.label} ts={ts} /></span><span className="pal__sub">{t.sub} · {num(t.n)} questões · montar lista</span></span></>,
      }));
      searchExams(bank, deferred).forEach((e) => more.push({
        id: "e:" + e.id, group: "Provas", run: () => onExam(e),
        render: <><span className="pal__glyph"><Icon name="exam" size={18} /></span><span className="pal__main"><span className="pal__title"><Marked text={e.nome} ts={ts} /></span><span className="pal__sub">{num(e.elegiveis)} questões · fazer como simulado</span></span></>,
      }));
    }
    // sem questão com o texto (ex.: "enare 2026"), provas e temas vêm primeiro
    if (hits.length) out.push(...more); else out.unshift(...more);
    nv.forEach((n) => out.push({
      id: "n:" + n.id, group: "Ir para", run: () => go(n.to),
      render: <><span className="pal__glyph"><Icon name={n.icon} size={18} /></span><span className="pal__main"><span className="pal__title"><Marked text={n.label} ts={ts} /></span></span></>,
    }));
    if (ts.length) {
      remote.people.slice(0, 5).forEach((p) => out.push({
        id: "u:" + p.handle, group: "Pessoas", run: () => go("/u/" + p.handle),
        render: <><span className="pal__glyph"><Avatar name={p.name} url={p.avatarUrl} size={26} /></span><span className="pal__main"><span className="pal__title"><span><Marked text={p.name} ts={ts} /></span></span><span className="pal__sub">@{p.handle}{p.faculdade ? ` · ${p.faculdade}` : ""}</span></span></>,
      }));
      remote.docs.slice(0, 5).forEach((d) => out.push({
        id: "d:" + d.id, group: "Resumos", run: () => go("/resumos/" + d.id),
        render: <><span className="pal__glyph"><Icon name={d.kind === "pasta" ? "folder" : "doc"} size={18} /></span><span className="pal__main"><span className="pal__title"><span><Marked text={d.title || "Sem título"} ts={ts} /></span></span>{d.snippet ? <span className="pal__snip"><Marked text={d.snippet} ts={ts} /></span> : null}</span></>,
      }));
    }
    return out;
  }, [deferred, ts, hits, total, found.ids, bank, st, remote]); // eslint-disable-line

  // Enter antes de a busca alcançar a digitação: abre o primeiro resultado assim que ele chega (as questões vêm do servidor)
  const enter = useRef(false);
  useEffect(() => { setActive(0); }, [deferred, found.settled]);
  useEffect(() => { if (enter.current && found.settled) { enter.current = false; items[0]?.run(); } }, [deferred, found.settled]); // eslint-disable-line
  useEffect(() => { list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  // Enter age ao soltar a tecla: assim ela não cai no botão da tela que abre em seguida (ex.: Começar simulado)
  const armed = useRef(false);
  const keyUp = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || !armed.current) return;
    e.preventDefault(); armed.current = false;
    if (query !== deferred || !found.settled) { enter.current = true; setDeferred(query); return; }
    items[active]?.run();
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); armed.current = true; }
    else if (e.key === "Tab") e.preventDefault();
  };

  const groups: { name: string; xs: { it: Item; i: number }[] }[] = [];
  items.forEach((it, i) => { const g = groups.find((x) => x.name === it.group) || (groups.push({ name: it.group, xs: [] }), groups[groups.length - 1]); g.xs.push({ it, i }); });
  const nothing = ts.length > 0 && found.settled && !hits.length && !items.some((x) => ["Temas", "Provas", "Pessoas", "Resumos"].includes(x.group));

  return (
    <motion.div className="pal-scrim cd-root" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.14, ease: ease.exit } }} transition={{ duration: 0.2, ease: ease.out }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div className="pal" role="dialog" aria-modal aria-label="Buscar" onKeyDown={key} onKeyUp={keyUp}
        initial={{ opacity: 0, scale: 0.97, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: -4, transition: { duration: 0.14, ease: ease.exit } }} transition={spring.smooth}>
        <label className="pal__input">
          <Icon name="search" size={20} />
          <input ref={input} autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar questões, temas, provas, pessoas, resumos…" aria-label="Buscar"
            role="combobox" aria-expanded aria-controls="pal-list" aria-activedescendant={items[active] ? "pal-" + active : undefined} autoComplete="off" spellCheck={false} />
          {query ? <button type="button" className="pal__clear cd-hoverable" aria-label="Limpar" onClick={() => { setQuery(""); input.current?.focus(); }}><Icon name="x" size={16} /></button> : null}
          <button type="button" className="pal__esc" onClick={onClose} aria-label="Fechar"><Kbd>esc</Kbd></button>
        </label>
        <div className="pal__list" id="pal-list" role="listbox" ref={list} aria-label="Resultados">
          {nothing ? <p className="pal__empty">Nada com “{deferred.trim()}”. Tente outra palavra do enunciado ou o nome do tema.</p> : null}
          {groups.map((g) => (
            <div key={g.name} className="pal__group" role="group" aria-label={g.name}>
              <div className="pal__ghead">{g.name}{g.name === "Questões" && total ? <span className="num">{num(total)}</span> : null}</div>
              {g.xs.map(({ it, i }) => (
                <motion.div key={it.id} id={"pal-" + i} data-i={i} role="option" aria-selected={i === active} className={cx("pal__item", i === active && "is-active")}
                  onMouseMove={() => active !== i && setActive(i)} onClick={() => it.run()}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: ease.out, delay: Math.min(i, 8) * 0.012 }}>
                  {it.render}
                  {i === active ? <span className="pal__enter" aria-hidden><Icon name="enter" size={16} /></span> : null}
                </motion.div>
              ))}
            </div>
          ))}
          {!ts.length ? <p className="pal__tip">Digite uma palavra do enunciado (“pré-eclâmpsia”, “sulfato de magnésio”), um tema, uma prova (“enare 2026”), o nome de alguém ou um resumo seu.</p> : null}
        </div>
        <footer className="pal__foot" aria-hidden>
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> escolher</span><span><Kbd>↵</Kbd> abrir</span><span><Kbd>esc</Kbd> fechar</span>
        </footer>
      </motion.div>
    </motion.div>
  );
}
