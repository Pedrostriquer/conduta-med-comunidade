/* Busca no banco em página cheia: palavras do enunciado ou das alternativas, com filtros de banca, ano, área e
   só as não feitas. A busca roda no servidor (questions.ts) e os resultados vêm em páginas; "Resolver estas" vira uma lista.
   Sem filtros, acima das questões aparecem também as pessoas e os resumos seus com aquela palavra (vêm do servidor, com atraso). */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useBank } from "../../data/bank";
import { AREAS, BANCAS } from "../../data/types";
import { useStore } from "../../state/store";
import { useStats } from "../../state/stats";
import { Page } from "../../app/Page";
import { Button, Chip, Kbd, Switch } from "../../ds/basics";
import { AREA_ICON, Icon } from "../../ds/Icon";
import { num } from "../../lib/format";
import { ease } from "../../lib/motion";
import { useMedia } from "../../lib/hooks";
import { examTag, terms } from "./search";
import { useQuestionSearch } from "./questions";
import { Marked, SaveToggle, startFound } from "./parts";
import { paletteKey } from "./CommandPalette";
import { useRemoteSearch } from "./remote";
import { Avatar } from "../comunidade/parts";

const PER = 20;
const toggle = <T,>(s: T[], v: T) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]);

export function SearchPage() {
  const bank = useBank()!;
  const nav = useNavigate();
  const inc = useStore((s) => s.settings.incluirTodas);
  const st = useStats(bank);
  const [sp, setSp] = useSearchParams();
  const [query, setQuery] = useState(sp.get("q") || "");
  const [q, setQ] = useState(query);
  const [bancas, setBancas] = useState<string[]>([]);
  const [anos, setAnos] = useState<number[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [novas, setNovas] = useState(false);
  const [page, setPage] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hover = useMedia("(hover: hover)");

  useEffect(() => { const t = setTimeout(() => setQ(query), 140); return () => clearTimeout(t); }, [query]);
  useEffect(() => { setSp(q.trim() ? { q: q.trim() } : {}, { replace: true }); }, [q]); // eslint-disable-line
  useEffect(() => { const x = sp.get("q") || ""; if (x !== q.trim()) { setQuery(x); setQ(x); } }, [sp.get("q")]); // eslint-disable-line
  useEffect(() => { if (!sp.get("q")) input.current?.focus(); }, []); // eslint-disable-line

  const ts = useMemo(() => terms(q), [q]);
  const filtering = bancas.length + anos.length + areas.length > 0 || novas;
  const remote = useRemoteSearch(q, !filtering);
  // "só as que não fiz": as respondidas vão no pedido, porque quem sabe o que a pessoa fez é o navegador
  const done = useMemo(() => (novas ? [...st.answered] : undefined), [novas, st.answered]);
  const active = ts.length > 0 || filtering;
  const key = JSON.stringify([q.trim(), bancas, anos, areas, inc, novas ? done!.length : -1, page]);
  const found = useQuestionSearch(active ? { q: q.trim(), bancas, anos, areas, todas: inc, excluir: done, offset: page * PER, limit: PER, trecho: 260 } : null, key, 120);
  useEffect(() => setPage(0), [q, bancas, anos, areas, novas]);
  const total = found.total, pages = Math.ceil(total / PER);
  const shown = found.hits.filter((h) => bank.byId[h.id]);

  const bancasOn = BANCAS.filter((b) => bank.exams.some((e) => e.banca === b));
  const years = [...new Set(bank.exams.map((e) => e.ano))].sort((a, b) => b - a);
  const resolve = () => {
    const ids = found.ids.filter((id) => bank.byId[id]);
    const title = q.trim() ? `Busca: “${q.trim()}”` : "Questões da busca";
    nav("/sessao/" + startFound(ids, title, { type: "busca", query: q.trim() }));
  };
  const goPage = (p: number) => { setPage(p); scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <Page title="Buscar" subtitle={hover ? <>Palavras do enunciado ou das alternativas. Em qualquer tela, <Kbd>{paletteKey}</Kbd> abre a busca rápida.</> : "Palavras do enunciado ou das alternativas."} back={{ to: "/questoes", label: "Questões" }}>
      <div className="sp">
        <label className="search sp__search">
          <Icon name="search" size={18} />
          <input ref={input} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ex.: sulfato de magnésio, apendicite, Kawasaki" aria-label="Buscar no banco" />
        </label>
        <div className="sp__filters">
          <div className="sp__frow"><span className="sp__flabel">Área</span>
            <div className="chips chips--scroll" role="group" aria-label="Área">
              {AREAS.map((a) => <Chip key={a.id} icon={AREA_ICON[a.id]} pressed={areas.includes(a.id)} onChange={() => setAreas((s) => toggle(s, a.id))}>{a.short}</Chip>)}
            </div>
          </div>
          <div className="sp__frow"><span className="sp__flabel">Banca</span>
            <div className="chips chips--scroll" role="group" aria-label="Banca">
              {bancasOn.map((b) => <Chip key={b} pressed={bancas.includes(b)} onChange={() => setBancas((s) => toggle(s, b))}>{b}</Chip>)}
            </div>
          </div>
          <div className="sp__frow"><span className="sp__flabel">Ano</span>
            <div className="chips chips--scroll" role="group" aria-label="Ano">
              {years.map((y) => <Chip key={y} pressed={anos.includes(y)} onChange={() => setAnos((s) => toggle(s, y))}><span className="num">{y}</span></Chip>)}
            </div>
          </div>
          <div className="sp__fend">
            <span className="sp__switch"><Switch checked={novas} onChange={setNovas} label="Só as que não fiz" id="sp-novas" /><label htmlFor="sp-novas">Só as que não fiz</label></span>
            {filtering ? <Button variant="plain" size="sm" onClick={() => { setBancas([]); setAnos([]); setAreas([]); setNovas(false); }}>Limpar filtros</Button> : null}
          </div>
        </div>

        {!filtering && (remote.people.length || remote.docs.length) ? (
          <div className="sp__others">
            {remote.people.length ? (
              <section aria-label="Pessoas">
                <span className="sp__flabel">Pessoas</span>
                <div className="sp__people">
                  {remote.people.slice(0, 8).map((p) => (
                    <button key={p.handle} type="button" className="sp__person cd-hoverable" onClick={() => nav("/u/" + p.handle)}>
                      <Avatar name={p.name} url={p.avatarUrl} size={32} />
                      <span><b><Marked text={p.name} ts={ts} /></b><small>@{p.handle}{p.faculdade ? ` · ${p.faculdade}` : ""}</small></span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {remote.docs.length ? (
              <section aria-label="Resumos">
                <span className="sp__flabel">Resumos</span>
                <ul className="list">
                  {remote.docs.slice(0, 5).map((d) => (
                    <li key={d.id}><button type="button" className="row row--icon cd-hoverable" onClick={() => nav("/resumos/" + d.id)}>
                      <span className="row__icon"><Icon name={d.kind === "pasta" ? "folder" : "doc"} size={20} /></span>
                      <span className="row__main"><span className="row__title"><Marked text={d.title || "Sem título"} ts={ts} /></span>{d.snippet ? <span className="row__sub"><Marked text={d.snippet} ts={ts} /></span> : null}</span>
                      <span className="row__end"><Icon name="chevron-right" size={18} className="row__chev" /></span>
                    </button></li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        {ts.length || filtering ? (
          <div className="sp__bar">
            <span className="sp__count" aria-live="polite" aria-busy={!found.settled}>{found.settled || total ? <><b className="num">{num(total)}</b> {total === 1 ? "questão" : "questões"}</> : found.error ? null : "Buscando…"}</span>
            {total ? <Button variant="filled" icon="play" onClick={resolve}>{total > 50 ? "Resolver 50 destas" : total === 1 ? "Resolver esta" : "Resolver estas"}</Button> : null}
          </div>
        ) : null}

        {!ts.length && !filtering ? (
          <div className="empty"><Icon name="search" size={22} /><p>Busque por uma palavra do caso, um remédio, uma doença ou um exame. Os filtros ajudam a achar a questão de uma prova específica.</p></div>
        ) : found.error ? (
          <div className="empty"><Icon name="alert" size={22} /><p>Não foi possível buscar agora. Confira a conexão e tente de novo em instantes.</p></div>
        ) : !shown.length && !found.settled ? null : !shown.length ? (
          <div className="empty"><Icon name="search" size={22} /><p>Nenhuma questão com {q.trim() ? `“${q.trim()}”` : "esses filtros"}{filtering && q.trim() ? " e esses filtros" : ""}. Tente menos palavras ou tire um filtro.</p></div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.ul key={q + found.offset + bancas.join() + anos.join() + areas.join() + novas} className="list sp__list" aria-label="Resultados" aria-busy={!found.settled}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.16 }}>
              {shown.map(({ id: hid, where, text }, i) => {
                const x = bank.byId[hid];
                const last = st.last.get(x.id);
                return (
                  <motion.li key={x.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: ease.out, delay: Math.min(i, 10) * 0.02 }}>
                    <div className="hit cd-hoverable" role="button" tabIndex={0} onClick={() => nav("/sessao/" + startFound([x.id], "", { type: "busca", query: q.trim() }))}
                      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) nav("/sessao/" + startFound([x.id], "", { type: "busca", query: q.trim() })); }}>
                      <div className="hit__top">
                        <span className="hit__tag"><Icon name={AREA_ICON[x.area]} size={14} />{examTag(bank, x)} · Questão {x.n}</span>
                        {last ? <span className="hit__done" data-ok={last.correct ? "" : undefined}><Icon name={last.correct ? "check" : "x"} size={13} strokeWidth={2.5} />{last.correct ? "Acertou" : "Errou"}</span> : null}
                        <SaveToggle qid={x.id} size="sm" />
                      </div>
                      <p className="hit__snip">{where !== "stem" ? <b>Alternativa {where}: </b> : null}<Marked text={text} ts={ts} /></p>
                    </div>
                  </motion.li>
                );
              })}
            </motion.ul>
          </AnimatePresence>
        )}

        {pages > 1 ? (
          <nav className="pager" aria-label="Páginas">
            <Button variant="gray" icon="chevron-left" label="Página anterior" disabled={!page} onClick={() => goPage(page - 1)} />
            <span className="pager__label num">{num(page * PER + 1)}–{num(Math.min(total, page * PER + PER))} de {num(total)}</span>
            <Button variant="gray" icon="chevron-right" label="Próxima página" disabled={page >= pages - 1} onClick={() => goPage(page + 1)} />
          </nav>
        ) : null}
      </div>
    </Page>
  );
}
