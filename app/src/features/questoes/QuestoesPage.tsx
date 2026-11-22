/* Montar uma lista: por tema (árvore área › especialidade › tema), pelas que errou, pelos pontos fracos ou de uma prova.
   Filtros fixos e curtos (Banca · Ano · Status) e o resto em "Mais filtros". A contagem do botão é sempre a dos filtros. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useBank } from "../../data/bank";
import type { Bank, Topic } from "../../data/bank";
import { matchQuery, pick } from "../../data/select";
import type { ListFilter, ListQuery } from "../../data/select";
import { AREAS, BANCAS } from "../../data/types";
import type { AreaId, Exam } from "../../data/types";
import { useStore } from "../../state/store";
import type { Feedback } from "../../state/store";
import { useStats, weakTopics } from "../../state/stats";
import type { Stats } from "../../state/stats";
import { Page } from "../../app/Page";
import { Button, SegmentedControl, Stepper, Switch } from "../../ds/basics";
import { Sheet } from "../../ds/overlay";
import { Counter } from "../../ds/progress";
import { AREA_ICON, Icon } from "../../ds/Icon";
import { joinList, num, plural } from "../../lib/format";
import { cx } from "../../lib/cx";
import { startList } from "../sessao/start";
import { SimuladoSetup } from "../simulados/SimuladoSetup";
import { Check, MiniRing, PickChip, bancaOrder, yearsOf } from "./filters";

type Source = "tema" | "erros" | "fracos" | "prova";
type Status = ListFilter | "salvas";

const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const toggleSet = <T,>(s: Set<T>, k: T) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; };

/** bancas-alvo do cronograma (o plano pode ter uma ou várias) */
export function targetBancas(plan: unknown): string[] {
  const p = plan as { banca?: string; bancas?: string[] } | null;
  if (!p) return [];
  return p.bancas?.length ? p.bancas : p.banca ? [p.banca] : [];
}

/** "reaplicação" ou "2ª edição" quando há duas provas no mesmo ano */
export function edicao(e: Exam) {
  if (e.nome.includes("Reaplica")) return "reaplicação";
  const m = e.nome.match(/\d{4}[./](\d)$/);
  return m ? `${m[1]}ª edição` : null;
}

/* ---------- árvore: área › especialidade › tema ---------- */
function TemaRows({ t, on, temas, count, onTema }: { t: Topic; on: boolean; temas: Set<string>; count: (ids: string[]) => number; onTema: (k: string) => void }) {
  return (
    <motion.ul className="qt__temas" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
      {t.temas.map((x) => {
        const k = t.key + "/" + x.tema, sel = on || temas.has(k), n = count(x.ids);
        return (
          <li key={x.tema} className={cx("qt__row qt__row--3", !n && "is-empty")} onClick={() => !on && onTema(k)} aria-disabled={on || undefined}>
            <Check on={sel} label={x.tema} onClick={() => !on && onTema(k)} />
            <span className="qt__name">{x.tema}</span>
            <span className="qt__n num">{num(n)}</span>
            <span />
          </li>
        );
      })}
    </motion.ul>
  );
}

function TopicRow({ t, areaOn, sel, temas, count, onTopic, onTema, forceOpen }: {
  t: Topic; areaOn: boolean; sel: boolean; temas: Set<string>; count: (ids: string[]) => number; onTopic: () => void; onTema: (k: string) => void; forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const on = areaOn || sel;
  const picked = t.temas.filter((x) => temas.has(t.key + "/" + x.tema)).length;
  const n = count(t.ids);
  const isOpen = open || !!forceOpen;
  return (
    <li className={cx("qt__node", isOpen && "is-open")}>
      <div className={cx("qt__row qt__row--2", !n && "is-empty")} onClick={() => !areaOn && onTopic()} aria-disabled={areaOn || undefined}>
        <Check on={on} mixed={!on && picked > 0} label={t.esp} onClick={() => !areaOn && onTopic()} />
        <span className="qt__name">{t.esp}</span>
        <span className="qt__n num">{num(n)}</span>
        {t.temas.length > 1 ? (
          <button type="button" className="qt__exp cd-hoverable" aria-expanded={isOpen} aria-label={(isOpen ? "Fechar" : "Ver") + " temas de " + t.esp} onClick={(e) => { e.stopPropagation(); setOpen(!isOpen); }}>
            <Icon name="chevron-down" size={18} />
          </button>
        ) : <span />}
      </div>
      <AnimatePresence initial={false}>{isOpen && t.temas.length > 1 ? <TemaRows t={t} on={on} temas={temas} count={count} onTema={onTema} /> : null}</AnimatePresence>
    </li>
  );
}

function AreaNode({ area, topics, areaOn, topicsSel, temas, count, onArea, onTopic, onTema, query }: {
  area: (typeof AREAS)[number]; topics: Topic[]; areaOn: boolean; topicsSel: Set<string>; temas: Set<string>; count: (ids: string[]) => number;
  onArea: () => void; onTopic: (t: Topic) => void; onTema: (k: string) => void; query: string;
}) {
  const [open, setOpen] = useState(false);
  const searching = !!query;
  const isOpen = open || searching;
  const all = useMemo(() => topics.flatMap((t) => t.ids), [topics]);
  const picked = topics.some((t) => topicsSel.has(t.key) || t.temas.some((x) => temas.has(t.key + "/" + x.tema)));
  return (
    <li className={cx("qt__node qt__node--area", isOpen && "is-open")}>
      <div className="qt__row qt__row--1" onClick={() => setOpen(!isOpen)}>
        <Check on={areaOn} mixed={!areaOn && picked} label={area.label} onClick={onArea} />
        <span className="qt__name"><span className="qt__aicon" aria-hidden><Icon name={AREA_ICON[area.id]} size={17} /></span>{area.label}</span>
        <span className="qt__n num">{num(count(all))}</span>
        <button type="button" className="qt__exp cd-hoverable" aria-expanded={isOpen} aria-label={(isOpen ? "Fechar" : "Abrir") + " " + area.label} onClick={(e) => { e.stopPropagation(); setOpen(!isOpen); }}>
          <Icon name="chevron-down" size={18} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.ul className="qt__kids" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
            {topics.map((t) => (
              <TopicRow key={t.key} t={t} areaOn={areaOn} sel={topicsSel.has(t.key)} temas={temas} count={count} onTopic={() => onTopic(t)} onTema={onTema}
                forceOpen={searching && !norm(t.esp).includes(query) && t.temas.some((x) => norm(x.tema).includes(query))} />
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

/* ---------- prova: agrupada por banca (a da prova-alvo primeiro), um cartão por ano com o progresso ---------- */
function ExamPicker({ bank, st, inc, exam, setExam, bancas, anos, target }: {
  bank: Bank; st: Stats; inc: boolean; exam: string | null; setExam: (id: string) => void; bancas: string[]; anos: number[]; target: string[];
}) {
  const exams = bank.exams.filter((e) => (!bancas.length || bancas.includes(e.banca)) && (!anos.length || anos.includes(e.ano)));
  const order = bancaOrder(BANCAS, [...new Set(exams.map((e) => e.banca))], target[0]);
  if (!exams.length) return <div className="empty"><Icon name="filter" size={22} /><p>Nenhuma prova com esses filtros.</p></div>;
  return (
    <div className="xpick">
      {order.map((b) => (
        <section key={b} className="xpick__group" aria-label={b}>
          <h3 className="xpick__banca">{b}{target.includes(b) ? <span className="xpick__target">sua prova</span> : null}</h3>
          <div className="xpick__grid" role="radiogroup" aria-label={"Provas " + b}>
            {exams.filter((e) => e.banca === b).sort((x, y) => y.ano - x.ano || x.nome.localeCompare(y.nome)).map((e) => {
              const avail = (bank.byExam[e.id] || []).filter((x) => inc || x.ok);
              const done = avail.filter((x) => st.answered.has(x.id)).length;
              const on = exam === e.id;
              const ed = edicao(e);
              return (
                <button key={e.id} type="button" role="radio" aria-checked={on} className="xcard cd-hoverable" onClick={() => setExam(e.id)}>
                  <MiniRing value={avail.length ? done / avail.length : 0} size={38} stroke={4} tone={done && done === avail.length ? "success" : undefined} />
                  <span className="xcard__text">
                    <span className="xcard__year num">{e.ano}{ed ? <span className="xcard__ed"> {ed}</span> : null}</span>
                    <span className="xcard__meta num">{done ? `${num(done)} de ${num(avail.length)} feitas` : `${num(avail.length)} questões`}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** listas em aberto: as que a pessoa ainda não terminou e as que a IA dela montou */
function ActiveLists() {
  const nav = useNavigate();
  const sessions = useStore((s) => s.sessions);
  const lists = useMemo(() => Object.values(sessions)
    .filter((s) => s.kind === "lista" && s.status === "ativa" && s.qids.length && (s.source.type === "ia" || Object.keys(s.answers).length))
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 5), [sessions]);
  if (!lists.length) return null;
  return (
    <ul className="list qactive" aria-label="Listas em andamento">
      {lists.map((s) => {
        const done = s.qids.filter((q) => s.answers[q]?.checked).length;
        return (
          <li key={s.id}><button type="button" className="row row--icon cd-hoverable" onClick={() => nav("/sessao/" + s.id)}>
            <span className="row__icon"><Icon name={s.source.type === "ia" ? "sparkle" : "questions"} size={20} /></span>
            <span className="row__main">
              <span className="row__title">{s.title}</span>
              <span className="row__sub">{s.source.type === "ia" ? "Sua IA montou · " : ""}{done ? `${num(done)} de ${num(s.qids.length)} respondidas` : plural(s.qids.length, "questão", "questões")}</span>
            </span>
            <span className="row__end"><Icon name="chevron-right" size={18} className="row__chev" /></span>
          </button></li>
        );
      })}
    </ul>
  );
}

export function QuestoesPage() {
  const nav = useNavigate();
  const bank = useBank()!;
  const st = useStats(bank);
  const settings = useStore((s) => s.settings), setSettings = useStore((s) => s.setSettings);
  const plan = useStore((s) => s.plan);
  const savedIds = useStore((s) => s.saved), noteIds = useStore((s) => s.notes);
  const savedSet = useMemo(() => new Set([...Object.keys(savedIds), ...Object.keys(noteIds)]), [savedIds, noteIds]);
  const target = targetBancas(plan);

  const [source, setSource] = useState<Source>("tema");
  const [areasSel, setAreasSel] = useState<Set<AreaId>>(new Set());
  const [topics, setTopics] = useState<Set<string>>(new Set());
  const [temas, setTemas] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("novas");
  const [bancas, setBancas] = useState<string[]>([]);
  const [anos, setAnos] = useState<number[]>([]);
  const [exams, setExams] = useState<string[]>([]);
  const [withImage, setWithImage] = useState(false);
  const [more, setMore] = useState(false);
  const [exam, setExam] = useState<string | null>(null);
  const [simExam, setSimExam] = useState<Exam | null>(null);
  const [n, setN] = useState(20);
  const [feedback, setFeedback] = useState<Feedback>(settings.feedbackLista);
  const weak = useMemo(() => weakTopics(st).slice(0, 8), [st]);
  const [weakSel, setWeakSel] = useState<Set<string> | null>(null);
  const weakPicked = weakSel ?? new Set(weak.slice(0, 3).map((w) => w.key));

  // vindo da busca (?tema=area/especialidade ou area/especialidade/tema): já marca o tema; ?origem=erros|prova|fracos abre a origem
  const [sp, setSp] = useSearchParams();
  const preset = sp.get("tema"), origem = sp.get("origem");
  useEffect(() => {
    if (origem === "erros" || origem === "prova" || origem === "fracos") { setSource(origem); setSp({}, { replace: true }); return; }
    if (!preset) return;
    const parts = preset.split("/");
    if (bank.topicByKey[parts.slice(0, 2).join("/")]) {
      setSource("tema"); setQuery(""); setAreasSel(new Set());
      if (parts.length > 2) { setTopics(new Set()); setTemas(new Set([preset])); } else { setTemas(new Set()); setTopics(new Set([preset])); }
    }
    setSp({}, { replace: true });
  }, [preset, origem]); // eslint-disable-line

  const eff: Status = source === "erros" ? "erradas" : status;
  const common = useMemo<ListQuery>(() => ({
    filter: (eff === "salvas" ? "todas" : eff) as ListFilter,
    only: eff === "salvas" ? [...savedSet] : undefined,
    bancas: bancas.length ? bancas : undefined, anos: anos.length ? anos : undefined,
    exams: exams.length ? exams : undefined, withImage: withImage || undefined,
  }), [eff, savedSet, bancas, anos, exams, withImage]);

  const q: ListQuery = useMemo(() => {
    if (source === "fracos") return { ...common, topics: [...weakPicked] };
    if (source === "prova") return { filter: common.filter, only: common.only, exam: exam || "__none" };
    return { ...common, areasPick: [...areasSel], topics: [...topics], temas: [...temas] };
  }, [source, common, weakPicked, exam, areasSel, topics, temas]);
  const available = useMemo(() => matchQuery(bank, settings.incluirTodas, q, st), [bank, settings.incluirTodas, q, st]);
  const nothingPicked = (source === "prova" && !exam) || (source === "fracos" && !weakPicked.size);
  // de uma prova: por padrão a prova inteira (até 100)
  useEffect(() => { if (source === "prova" && exam) setN(100); }, [source, exam]);
  const count = nothingPicked ? 0 : available.length;
  const take = Math.min(n, count);

  // contagem de cada nó da árvore com os filtros atuais (sem a escolha de tema): é a mesma conta do botão
  const base = useMemo(() => new Set(matchQuery(bank, settings.incluirTodas, common, st).map((x) => x.id)), [bank, settings.incluirTodas, common, st]);
  const countIds = (ids: string[]) => ids.reduce((s, id) => s + (base.has(id) ? 1 : 0), 0);
  const qq = norm(query.trim());
  const byArea = useMemo(() => AREAS.map((a) => ({
    a, topics: bank.topics.filter((t) => t.area === a.id && (!qq || norm(t.esp).includes(qq) || t.temas.some((x) => norm(x.tema).includes(qq)))),
  })).filter((g) => g.topics.length), [bank.topics, qq]);
  const wrongTotal = useMemo(() => st.wrong.filter((id) => settings.incluirTodas || bank.byId[id]?.ok).length, [st.wrong, bank, settings.incluirTodas]);

  const toggleArea = (a: AreaId) => {
    const on = !areasSel.has(a);
    setAreasSel((s) => toggleSet(s, a));
    if (on) {
      setTopics((s) => new Set([...s].filter((k) => !k.startsWith(a + "/"))));
      setTemas((s) => new Set([...s].filter((k) => !k.startsWith(a + "/"))));
    }
  };
  const toggleTopic = (t: Topic) => {
    setTopics((s) => toggleSet(s, t.key));
    setTemas((s) => { const x = new Set(s); t.temas.forEach((m) => x.delete(t.key + "/" + m.tema)); return x; });
  };
  const clearPick = () => { setAreasSel(new Set()); setTopics(new Set()); setTemas(new Set()); };

  const picks = [
    ...[...areasSel].map((a) => ({ k: "a:" + a, label: AREAS.find((x) => x.id === a)!.short, rm: () => toggleArea(a) })),
    ...[...topics].map((k) => ({ k: "t:" + k, label: k.split("/")[1], rm: () => setTopics((s) => toggleSet(s, k)) })),
    ...[...temas].map((k) => ({ k: "m:" + k, label: k.split("/")[2], rm: () => setTemas((s) => toggleSet(s, k)) })),
  ];
  const title = () => {
    if (source === "erros") return "Questões que errei";
    if (source === "fracos") return joinList([...weakPicked].slice(0, 3).map((k) => k.split("/")[1]));
    if (source === "prova") return bank.examById[exam!]?.nome || "Prova";
    const names = picks.map((p) => p.label);
    if (eff === "salvas" && !names.length) return "Questões salvas";
    return names.length ? (names.length > 3 ? `${names.slice(0, 2).join(", ")} e mais ${names.length - 2}` : joinList(names)) : "Questões";
  };
  const start = () => {
    const ids = source === "prova" ? available.slice(0, take).map((x) => x.id) : pick(available, take);
    const src = source === "erros" ? { type: "erros" as const } : source === "fracos" ? { type: "fracos" as const, topics: [...weakPicked] }
      : source === "prova" ? { type: "prova" as const, exam: exam! } : eff === "salvas" && !picks.length ? { type: "salvas" as const } : { type: "temas" as const, topics: [...topics], temas: [...temas] };
    nav("/sessao/" + startList({ ids, title: title(), source: src, feedback }));
  };

  const SOURCES: { id: Source; icon: string; title: string; sub: string }[] = [
    { id: "tema", icon: "questions", title: "Por tema", sub: "Área, especialidade e tema" },
    { id: "erros", icon: "undo", title: "Que errei", sub: wrongTotal ? plural(wrongTotal, "para refazer", "para refazer") : "Nenhuma ainda" },
    { id: "fracos", icon: "target", title: "Pontos fracos", sub: "Onde você acerta menos" },
    { id: "prova", icon: "exam", title: "De uma prova", sub: plural(bank.exams.length, "prova", "provas") },
  ];
  const years = yearsOf(bank.exams);
  const presentBancas = [...new Set(bank.exams.map((e) => e.banca))];
  const bancaOpts = bancaOrder(BANCAS, presentBancas, target[0]).map((b) => ({ value: b, label: b, hint: target.includes(b) ? "sua prova" : undefined }));
  const extra = exams.length + (withImage ? 1 : 0) + (settings.incluirTodas ? 1 : 0);

  const toolbar = (
    <div className="qbar">
      {source === "tema" || source === "erros" ? (
        <label className="search qbar__search">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Buscar especialidade ou tema" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar especialidade ou tema" />
        </label>
      ) : null}
      <div className="qbar__chips">
        <PickChip label="Banca" options={bancaOpts} value={bancas} onChange={setBancas} />
        <PickChip label="Ano" options={years.map((y) => ({ value: y, label: String(y) }))} value={anos} onChange={setAnos} width={180} />
        {source !== "erros" ? (
          <SegmentedControl size="sm" aria-label="Status" value={status} onChange={setStatus}
            options={[{ value: "novas", label: "Novas" }, { value: "erradas", label: "Erradas" }, { value: "salvas", label: "Salvas" }, { value: "todas", label: "Todas" }]} />
        ) : null}
        {source !== "prova" ? (
          <button type="button" className="cd-chip cd-hoverable qbar__more" aria-pressed={extra > 0} onClick={() => setMore(true)}>
            <Icon name="sliders" size={16} />Mais filtros{extra ? <span className="cd-chip__count">{extra}</span> : null}
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <Page title="Questões" subtitle="Monte uma lista do seu jeito.">
      <ActiveLists />
      <div className="qsources" role="radiogroup" aria-label="De onde vêm as questões">
        {SOURCES.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={source === s.id} className="qsource cd-hoverable" onClick={() => setSource(s.id)}>
            <span className="qsource__icon" aria-hidden><Icon name={s.icon} size={20} /></span>
            <span className="qsource__text"><span className="qsource__title">{s.title}</span><span className="qsource__sub">{s.sub}</span></span>
          </button>
        ))}
      </div>

      <div className="cols qcols">
        <div className="cols__main">
          {toolbar}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={source} className="qbody" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
              {source === "tema" || source === "erros" ? (
                source === "erros" && !wrongTotal ? <div className="empty"><Icon name="check" size={22} /><p>Você ainda não errou nenhuma questão. Quando errar, ela aparece aqui para refazer até acertar.</p></div> : (
                  <>
                    {source === "erros" ? <p className="builder__lead">Refaça as que você errou ou deixou em branco. Acertou, ela sai daqui. Os números mostram quantas você errou em cada tema.</p> : null}
                    <ul className="qt list" aria-label="Áreas, especialidades e temas">
                      {byArea.map(({ a, topics: ts }) => (
                        <AreaNode key={a.id + (qq ? ":q" : "")} area={a} topics={ts} areaOn={areasSel.has(a.id)} topicsSel={topics} temas={temas} count={countIds}
                          onArea={() => toggleArea(a.id)} onTopic={toggleTopic} onTema={(k) => setTemas((s) => toggleSet(s, k))} query={qq} />
                      ))}
                      {!byArea.length ? <li className="empty-row">Nenhum tema com “{query}”.</li> : null}
                    </ul>
                  </>
                )
              ) : null}

              {source === "fracos" ? (
                weak.length ? (
                  <>
                    <p className="builder__lead">As especialidades em que você mais erra, pelas suas respostas. As três primeiras já vêm marcadas.</p>
                    <ul className="list" aria-label="Pontos fracos">
                      {weak.map((w) => {
                        const on = weakPicked.has(w.key), [ar, esp] = w.key.split("/");
                        return (
                          <li key={w.key}>
                            <div className="row weakrow" onClick={() => setWeakSel(toggleSet(weakPicked, w.key))}>
                              <Check on={on} label={esp} onClick={() => setWeakSel(toggleSet(weakPicked, w.key))} />
                              <span className="row__main"><span className="row__title">{esp}</span><span className="row__sub"><Icon name={AREA_ICON[ar]} size={14} /> {plural(w.n, "resposta", "respostas")}</span></span>
                              <span className="weakrow__acc"><span className="weakrow__bar" aria-hidden><i style={{ width: Math.round(w.acc * 100) + "%" }} /></span><b className="num">{Math.round(w.acc * 100)}%</b></span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : <div className="empty"><Icon name="target" size={22} /><p>Responda pelo menos 30 questões para o app achar seus pontos fracos.</p></div>
              ) : null}

              {source === "prova" ? <ExamPicker bank={bank} st={st} inc={settings.incluirTodas} exam={exam} setExam={setExam} bancas={bancas} anos={anos} target={target} /> : null}
            </motion.div>
          </AnimatePresence>
        </div>
        <aside className="cols__aside qsum-wrap">
          <section className="panel qsum" aria-label="Sua lista">
            <h2 className="qsum__title">Sua lista</h2>
            <div className="qsum__count" aria-live="polite">
              <span className="qsum__big"><Counter value={count} duration={0.36} /></span>
              <span className="qsum__cap">{nothingPicked ? (source === "prova" ? "escolha uma prova" : "escolha um tema") : count === 1 ? "questão disponível" : "questões disponíveis"}</span>
            </div>
            {source === "tema" || source === "erros" ? (
              picks.length ? (
                <div className="qsum__picks">
                  {picks.map((p) => <button key={p.k} type="button" className="qsum__pick cd-hoverable" onClick={p.rm} aria-label={"Tirar " + p.label}>{p.label}<Icon name="x" size={13} strokeWidth={2.25} /></button>)}
                  {picks.length > 1 ? <button type="button" className="sec__link qsum__clear" onClick={clearPick}>Limpar</button> : null}
                </div>
              ) : <p className="qsum__hint">{source === "erros" ? "Todas as que você errou. Marque uma área ou tema para filtrar." : "Todas as áreas. Marque áreas, especialidades ou temas na árvore."}</p>
            ) : source === "prova" && exam ? <p className="qsum__hint">{bank.examById[exam]?.nome}, na ordem da prova.</p> : null}
            <div className="qsum__row">
              <span className="qsum__label">Quantidade</span>
              <Stepper label="Quantidade de questões" value={Math.min(n, Math.max(5, count))} min={5} max={Math.max(5, Math.min(100, count))} step={5} onChange={setN} />
            </div>
            <div className="qsum__row">
              <span className="qsum__label">Correção</span>
              <SegmentedControl size="sm" aria-label="Correção" value={feedback} onChange={setFeedback} options={[{ value: "imediato", label: "Na hora" }, { value: "final", label: "No final" }]} />
            </div>
            <Button variant="filled" size="lg" block disabled={nothingPicked || !take} onClick={start}>{take ? `Começar ${plural(take, "questão", "questões")}` : "Começar"}</Button>
            {source === "prova" && exam ? <Button variant="plain" block icon="clock" onClick={() => setSimExam(bank.examById[exam])}>Fazer como simulado</Button> : null}
          </section>
        </aside>
      </div>

      <div className="tray qtray" aria-label="Lista">
        <div className="tray__count" aria-live="polite">
          <span className="tray__big"><Counter value={count} duration={0.36} /></span>
          <span className="tray__cap">{nothingPicked ? (source === "prova" ? "escolha uma prova" : "escolha um tema") : count === 1 ? "disponível" : "disponíveis"}</span>
        </div>
        <div className="tray__row">
          <Stepper label="Quantidade de questões" value={Math.min(n, Math.max(5, count))} min={5} max={Math.max(5, Math.min(100, count))} step={5} onChange={setN} />
          <Button variant="filled" size="lg" disabled={nothingPicked || !take} onClick={start} className="tray__go">Começar</Button>
        </div>
      </div>

      <Sheet open={more} onClose={() => setMore(false)} title="Mais filtros" subtitle={`${plural(count, "questão disponível", "questões disponíveis")} com tudo aplicado`}
        footer={<div className="cd-row" style={{ justifyContent: "space-between", width: "100%" }}>
          <Button variant="plain" onClick={() => { setExams([]); setWithImage(false); }}>Limpar</Button>
          <Button variant="filled" onClick={() => setMore(false)}>Ver {plural(count, "questão", "questões")}</Button>
        </div>}>
        <div className="setup">
          <div className="setup__group">
            <div className="setup__label">Conteúdo</div>
            <label className="setup__switch"><span>Só questões com imagem</span><Switch checked={withImage} onChange={setWithImage} label="Só questões com imagem" /></label>
            <label className="setup__switch"><span>Incluir sem vídeo e polêmicas</span><Switch checked={settings.incluirTodas} onChange={(v) => setSettings({ incluirTodas: v })} label="Incluir questões sem vídeo e polêmicas" /></label>
            <p className="setup__hint">Por padrão ficam de fora as que não têm correção em vídeo ou têm gabarito em discussão.</p>
          </div>
          <div className="setup__group">
            <div className="setup__label">Provas específicas{exams.length ? ` · ${exams.length}` : ""}</div>
            <div className="morex">
              {bancaOrder(BANCAS, presentBancas, target[0]).map((b) => (
                <div key={b} className="morex__group">
                  <span className="morex__banca">{b}</span>
                  <div className="chips">
                    {bank.exams.filter((e) => e.banca === b).sort((x, y) => y.ano - x.ano).map((e) => {
                      const on = exams.includes(e.id), ed = edicao(e);
                      return (
                        <button key={e.id} type="button" className="cd-chip cd-hoverable" aria-pressed={on} onClick={() => setExams(on ? exams.filter((x) => x !== e.id) : [...exams, e.id])}>
                          <span className="cd-chip__check" aria-hidden><Icon name="check" size={16} strokeWidth={2.25} /></span>{e.ano}{ed ? ` ${ed}` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Sheet>
      <SimuladoSetup exam={simExam} open={!!simExam} onClose={() => setSimExam(null)} />
    </Page>
  );
}
