/* Resolver: lista de questões ou simulado, em tela cheia (sem a navegação).
   Topo: "Questão 3 de 40", cronômetro, bandeira e o mapa numa gaveta (em listas e simulados).
   Lista do banco: correção na hora (padrão), com o resultado, a explicação, a autoavaliação e "Criar flashcard".
   Simulado: correção ao final (padrão), ritmo por questão. Treino: simulado com correção a cada questão.
   Refazer erradas: correção na hora; a que errar de novo vai para o fim da fila até acertar.
   Com correção na hora, a sequência de acertos aparece como traçado de ECG. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { fullQuestion, getBank, useBodies } from "../../data/bank";
import type { Question } from "../../data/types";
import { AREAS } from "../../data/types";
import { useStore } from "../../state/store";
import type { Session } from "../../state/store";
import { Button, Kbd, SegmentedControl } from "../../ds/basics";
import { Dialog, Sheet, useToast } from "../../ds/overlay";
import { AREA_ICON, Icon } from "../../ds/Icon";
import { clock, duration, num, pace } from "../../lib/format";
import { useCompact, useKey, useNow } from "../../lib/hooks";
import { haptic, isTyping, spring } from "../../lib/motion";
import { cx } from "../../lib/cx";
import { useVideo } from "../video/VideoDock";
import { QuestionView } from "./QuestionView";
import { BodyWait } from "./BodyWait";
import { StreakTrace, isMilestone } from "./Streak";

export function examLabelOf(q: Question) {
  return getBank().examById[q.p]?.nome.replace(" · Reaplicação", " (reaplicação)") ?? q.p;
}

/* ---------- tempo: acumula num ref e grava a cada 10 s, ao trocar de questão e ao sair ---------- */
function useClock(s: Session | undefined, qid: string | null) {
  const addTime = useStore((x) => x.addTime);
  const since = useRef<number | null>(null), lastQ = useRef<string | null>(qid);
  const live = s?.status === "ativa";
  const flush = () => {
    if (!s || since.current == null) return;
    const now = Date.now(), ms = now - since.current;
    since.current = now;
    addTime(s.id, lastQ.current, ms);
  };
  useEffect(() => {
    if (!live) return;
    since.current = Date.now();
    const t = setInterval(flush, 10000);
    const vis = () => { if (document.hidden) { flush(); since.current = null; } else since.current = Date.now(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); flush(); since.current = null; };
  }, [live, s?.id]); // eslint-disable-line
  useEffect(() => { if (lastQ.current !== qid) { flush(); lastQ.current = qid; } }, [qid]); // eslint-disable-line
  const now = useNow(1000, live);
  const elapsed = (s?.elapsedMs || 0) + (since.current != null ? Math.max(0, now - since.current) : 0);
  return { elapsedSec: elapsed / 1000, flush };
}

/* ---------- barra de progresso da lista: um segmento por questão ---------- */
function Segments({ s, onJump }: { s: Session; onJump: (i: number) => void }) {
  const b = getBank();
  if (s.qids.length > 50) {
    const done = s.qids.filter((id) => s.answers[id]?.checked).length;
    return <div className="segs segs--bar" aria-hidden><i style={{ transform: `scaleX(${done / s.qids.length})` }} /></div>;
  }
  return (
    <div className="segs" role="list" aria-label="Progresso da lista">
      {s.qids.map((id, i) => {
        const a = s.answers[id];
        const st = a?.checked ? (s.feedback === "imediato" && !b.byId[id].an ? (a.choice === b.byId[id].g ? "ok" : "no") : "done") : a?.choice ? "done" : null;
        return (
          <button key={id} type="button" role="listitem" className="segs__seg" data-state={st || undefined} aria-current={i === s.cur ? "step" : undefined}
            disabled={!a?.checked && i !== s.cur && s.feedback === "imediato"} onClick={() => onJump(i)} aria-label={`Questão ${i + 1}`}>
            <i />
          </button>
        );
      })}
    </div>
  );
}

/* ---------- ritmo do simulado: onde você está × onde deveria estar pelo tempo ---------- */
function PaceStrip({ s, elapsedSec }: { s: Session; elapsedSec: number }) {
  const n = s.qids.length, answered = s.qids.filter((id) => s.answers[id]?.choice).length;
  const target = s.limitSec ? s.limitSec / n : null;
  const mine = answered ? elapsedSec / answered : null;
  const expected = target ? Math.min(n, elapsedSec / target) : null;
  const ahead = target != null && mine != null ? mine <= target : null;
  return (
    <div className="pace" aria-label="Ritmo">
      <div className="pace__track" aria-hidden>
        <i className="pace__fill" style={{ transform: `scaleX(${answered / n})` }} />
        {expected != null ? <i className="pace__tick" style={{ left: `${(expected / n) * 100}%` }} /> : null}
      </div>
      <div className="pace__row">
        <span className="num">{s.cur + 1} de {n}</span>
        <span className="pace__right num">
          {mine != null ? <span className={cx("pace__mine", ahead === true && "is-ok", ahead === false && "is-late")}>ritmo {pace(mine)}</span> : null}
          {target ? <span className="pace__goal">{mine != null ? " · " : ""}meta {pace(target)} por questão</span> : null}
        </span>
      </div>
    </div>
  );
}

/* ---------- mapa da prova (simulado) ---------- */
function ExamMap({ s, elapsedSec, onJump, onFinish }: { s: Session; elapsedSec: number; onJump: (i: number) => void; onFinish: () => void }) {
  const b = getBank();
  const immediate = s.feedback === "imediato";
  const firstOpen = s.qids.findIndex((id) => !s.answers[id]?.checked);
  const cellState = (id: string) => {
    const a = s.answers[id];
    if (immediate && a?.checked && !b.byId[id]?.an) return a.choice === b.byId[id]?.g ? "ok" : "no";
    return a?.choice ? "answered" : "blank";
  };
  const canJump = (i: number) => !immediate || !!s.answers[s.qids[i]]?.checked || i === firstOpen || i === s.cur;
  const groups = AREAS.map((a) => ({ a, idx: s.qids.map((id, i) => ({ id, i })).filter(({ id }) => b.byId[id].area === a.id) })).filter((g) => g.idx.length);
  const answered = s.qids.filter((id) => s.answers[id]?.choice).length, marked = Object.keys(s.marked).length;
  const left = s.qids.length - answered;
  const target = s.limitSec ? s.limitSec / s.qids.length : null, mine = answered ? elapsedSec / answered : null;
  let insight: string | null = null;
  if (s.limitSec && mine != null) {
    const projected = elapsedSec + left * mine, slack = s.limitSec - projected;
    insight = slack >= 0 ? `No seu ritmo, você termina com ${duration(slack)} de folga.` : `No seu ritmo, faltariam ${duration(-slack)}. Para terminar no tempo, ${pace((s.limitSec - elapsedSec) / Math.max(1, left))} por questão.`;
  }
  const key = (e: React.KeyboardEvent) => {
    const d = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 10, ArrowUp: -10 } as Record<string, number>)[e.key]; if (!d) return;
    const el = document.activeElement as HTMLElement | null, i = Number(el?.dataset.i);
    if (Number.isNaN(i)) return;
    e.preventDefault();
    (e.currentTarget.querySelector(`[data-i="${Math.max(0, Math.min(s.qids.length - 1, i + d))}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div className="map">
      <div className="map__summary">
        <div><b className="num">{num(answered)}</b> de {num(s.qids.length)} respondidas{marked ? <> · <b className="num">{marked}</b> para revisar</> : null}</div>
        {target ? <div className="map__pace">Seu ritmo <b className="num">{mine != null ? pace(mine) : "—"}</b> por questão · meta <b className="num">{pace(target)}</b></div> : null}
        {insight ? <p className="map__insight">{insight}</p> : null}
      </div>
      <div className="cd-col" style={{ gap: 18 }} onKeyDown={key}>
        {groups.map(({ a, idx }) => (
          <div key={a.id} className="cd-grid-area">
            <div className="cd-grid-area__name">
              <span><Icon name={AREA_ICON[a.id]} size={16} />{a.label}</span>
              <span>{idx.filter(({ id }) => s.answers[id]?.choice).length}/{idx.length}</span>
            </div>
            <div className="cd-grid">
              {idx.map(({ id, i }) => {
                const st = cellState(id);
                const said = st === "ok" ? "certa" : st === "no" ? "errada" : st === "answered" ? "respondida" : "em branco";
                return (
                  <button key={id} type="button" className="cd-cell cd-hoverable" data-i={i} data-state={st} data-marked={s.marked[id] ? "" : undefined}
                    disabled={!canJump(i)} aria-current={i === s.cur ? "true" : undefined} aria-label={`Questão ${i + 1}, ${said}${s.marked[id] ? ", marcada para revisar" : ""}`}
                    onClick={() => onJump(i)}>{i + 1}</button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="cd-legend" aria-hidden>
        {immediate ? <><span><i data-k="ok" />Certa</span><span><i data-k="no" />Errada</span></> : <span><i data-k="answered" />Respondida</span>}
        <span><i />Em branco</span><span><i data-k="marked" />Marcada</span><span><i data-k="current" />Atual</span>
      </div>
      <div className="map__foot"><Button variant="filled" block onClick={onFinish}>{s.kind === "simulado" ? "Finalizar prova" : "Encerrar lista"}</Button></div>
    </div>
  );
}

/* ---------- popover Aa: tamanho e fonte do texto ---------- */
function ReadingPopover({ onClose }: { onClose: () => void }) {
  const leitura = useStore((s) => s.settings.leitura), setSettings = useStore((s) => s.setSettings);
  useEffect(() => {
    const close = (e: Event) => { if (e.type === "keydown" ? (e as KeyboardEvent).key === "Escape" : !(e.target as HTMLElement).closest(".cd-popover, [data-aa]")) onClose(); };
    addEventListener("keydown", close); addEventListener("pointerdown", close);
    return () => { removeEventListener("keydown", close); removeEventListener("pointerdown", close); };
  }, [onClose]);
  return (
    <div className="cd-popover fpop" role="dialog" aria-label="Texto da questão">
      <div className="cd-popover__label">Tamanho do texto</div>
      <SegmentedControl block aria-label="Tamanho do texto" value={leitura.scale} onChange={(v) => setSettings({ leitura: { ...leitura, scale: v } })}
        options={[{ value: 0.9, label: <span style={{ fontSize: 13 }}>A</span>, ariaLabel: "Menor" }, { value: 1, label: <span style={{ fontSize: 16 }}>A</span>, ariaLabel: "Padrão" }, { value: 1.15, label: <span style={{ fontSize: 19 }}>A</span>, ariaLabel: "Maior" }]} />
      <div className="cd-popover__label">Fonte do enunciado</div>
      <SegmentedControl block aria-label="Fonte do enunciado" value={leitura.face} onChange={(v) => setSettings({ leitura: { ...leitura, face: v } })}
        options={[{ value: "serif", label: <span style={{ fontFamily: "var(--font-reading)" }}>Literata</span> }, { value: "sans", label: "Hanken" }]} />
    </div>
  );
}

export function SessionPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const s = useStore((x) => x.sessions[id]);
  useEffect(() => { if (!s) nav("/", { replace: true }); else if (s.status === "finalizada") nav("/resultado/" + s.id, { replace: true }); }, [s, nav]);
  // o corpo de todas as questões da sessão chega antes da primeira aparecer (ao começar, retomar ou recarregar):
  // o relógio só anda depois, e a rede pode cair no meio da prova sem travar a próxima questão
  const body = useBodies(s && s.status !== "finalizada" ? s.qids : null);
  if (!s || s.status === "finalizada" || !getBank().byId[s.qids[s.cur]]) return null;
  if (!body.ready) return <BodyWait full error={body.error} retry={body.retry} label={s.qids.length > 1 ? "Carregando as questões" : "Carregando a questão"} />;
  return <SessionView s={s} />;
}

function SessionView({ s }: { s: Session }) {
  const nav = useNavigate();
  const toast = useToast();
  const compact = useCompact();
  const leitura = useStore((x) => x.settings.leitura);
  const { setAnswer, commit, setCur, toggleMark, finish, requeue } = useStore.getState();
  const { close: closeVideo } = useVideo();
  const b = getBank();
  const [aa, setAa] = useState(false);
  const [map, setMap] = useState(false);
  const [confirm, setConfirm] = useState<null | "finish" | "leave" | "stop">(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [dir, setDir] = useState(1);
  const qid = s.qids[s.cur];
  const q = useMemo(() => fullQuestion(qid)!, [qid]);
  const { elapsedSec, flush } = useClock(s, qid);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => closeVideo(), [closeVideo]);

  const isSim = s.kind === "simulado";
  const isRedo = s.source.type === "refazer";
  const immediate = s.feedback === "imediato";
  const a = s.answers[qid];
  const checked = !!a?.checked && immediate;
  const left = s.limitSec ? Math.max(0, s.limitSec - elapsedSec) : null;

  // acabou o tempo do simulado: finaliza sozinho
  useEffect(() => {
    if (left == null || left > 0 || s.status !== "ativa") return;
    flush(); finish(s.id, (x) => b.byId[x].g);
    toast({ text: "O tempo acabou. A prova foi finalizada.", icon: "clock" });
  }, [left]); // eslint-disable-line

  // sequência de acertos nesta sessão, na ordem em que foram respondidas
  const { combo, answeredN } = useMemo(() => {
    if (!immediate) return { combo: 0, answeredN: 0 };
    const xs = s.qids.map((id) => ({ id, a: s.answers[id] })).filter((x) => x.a?.checked).sort((x, y) => (y.a!.at || 0) - (x.a!.at || 0));
    let c = 0;
    for (const x of xs) { if (b.byId[x.id]?.an) continue; if (x.a!.choice === b.byId[x.id]?.g) c++; else break; }
    return { combo: c, answeredN: xs.length };
  }, [s, immediate, b]);
  // refazer: quantas ainda não foram acertadas
  const redoLeft = isRedo ? s.qids.filter((id) => !(s.answers[id]?.checked && s.answers[id]?.choice === b.byId[id]?.g)).length : 0;

  const n = s.qids.length, last = s.cur === n - 1;
  const go = (i: number) => { if (i < 0 || i >= n) return; setDir(i > s.cur ? 1 : -1); setFresh(null); setCur(s.id, i); scrollTo({ top: 0 }); closeVideo(); };
  const select = (L: string) => {
    if (checked) return;
    const struck = (a?.struck || []).filter((x) => x !== L);
    setAnswer(s.id, qid, { choice: a?.choice === L && !immediate ? null : L, struck, at: Date.now() });
    haptic("tick");
  };
  const strike = (L: string) => {
    if (checked) return;
    const st = a?.struck || [];
    const struck = st.includes(L) ? st.filter((x) => x !== L) : [...st, L];
    setAnswer(s.id, qid, { struck, choice: a?.choice === L ? null : a?.choice ?? null });
  };
  const respond = () => {
    if (!a?.choice || checked) return;
    const ok = a.choice === q.g;
    commit(s.id, qid, q.an ? null : ok);
    setFresh(qid);
    haptic(ok && isMilestone(combo + 1) ? "success" : ok ? "tick" : "error");
    setTimeout(() => {
      const el = resultRef.current?.querySelector<HTMLElement>(".qv__result");
      if (!el) return;
      el.focus({ preventScroll: true });
      const r = el.getBoundingClientRect(), limit = innerHeight - (compact ? 150 : 120);
      if (r.top > limit) scrollBy({ top: r.top - limit + 40, behavior: "smooth" });
    }, 120);
  };
  const end = () => { flush(); finish(s.id, (x) => b.byId[x].g); };
  const next = () => {
    if (isRedo && checked) {
      if (a?.choice !== q.g) {
        // errou de novo: vai para o fim da fila; a próxima assume este lugar
        setFresh(null); closeVideo(); scrollTo({ top: 0 });
        requeue(s.id, qid);
        toast({ text: s.cur === n - 1 ? "Tente de novo." : "Ela volta no fim da fila.", icon: "undo", duration: 1800 });
        return;
      }
      const after = s.qids.findIndex((x, i) => i > s.cur && !s.answers[x]?.checked);
      const any = after >= 0 ? after : s.qids.findIndex((x) => !s.answers[x]?.checked);
      if (any < 0) end(); else go(any);
      return;
    }
    if (!last) { go(s.cur + 1); return; }
    if (immediate || !isSim) { if (s.qids.every((x) => s.answers[x]?.checked) || !immediate) end(); else go(s.qids.findIndex((x) => !s.answers[x]?.checked)); }
    else setConfirm("finish");
  };
  const checkedN = s.qids.filter((x) => s.answers[x]?.checked).length;
  const leave = () => {
    if (isSim) { setConfirm("leave"); return; }
    if (immediate && checkedN) { setConfirm("stop"); return; }
    flush(); nav(-1);
    if (Object.keys(s.answers).length) toast({ text: "A lista ficou salva. Continue quando quiser.", icon: "check" });
  };
  const blank = s.qids.filter((x) => !s.answers[x]?.choice).length;
  const markedNow = !!s.marked[qid];

  const createCard = () => { flush(); nav("/flashcards/novo?q=" + encodeURIComponent(qid)); };

  // teclado: A–E ou 1–5 marca, Enter responde/segue, ← → navega, M marca para revisar
  useKey((e) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || map || confirm || aa) return;
    const letters = Object.keys(q.a), k = e.key.toUpperCase();
    if (!checked && letters.includes(k)) { e.preventDefault(); select(k); }
    else if (!checked && /^[1-5]$/.test(k) && letters[+k - 1]) { e.preventDefault(); select(letters[+k - 1]); }
    else if (e.key === "Enter" && (document.activeElement?.tagName !== "BUTTON")) { e.preventDefault(); if (immediate && !checked) respond(); else next(); }
    else if (e.key === "ArrowRight" && (!immediate || checked)) { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(s.cur - 1); }
    else if (k === "M") toggleMark(s.id, qid);
  });

  const timerTone = left == null ? undefined : left < 300 ? "danger" : left < 1800 ? "warning" : undefined;

  return (
    <div className="focus cd-root" data-kind={s.kind}>
      <header className="fbar">
        <Button variant="plain" icon="x" label={isSim ? "Pausar simulado" : "Sair da lista"} className="fbar__close" onClick={leave} />
        <div className="fbar__mid">
          {isSim ? (
            <>
              <span className="fbar__title fbar__title--sim">{s.title}</span>
              {left != null ? <span className="cd-timer fbar__timer" data-tone={timerTone} role="timer" aria-label={"Tempo restante " + clock(left)}><Icon name="clock" size={16} />{clock(left)}</span>
                : <span className="cd-timer fbar__timer" role="timer"><Icon name="clock" size={16} />{clock(elapsedSec)}</span>}
            </>
          ) : isRedo ? (
            <>
              <span className="fbar__title fbar__title--sim">Refazer erradas</span>
              <span className="redo__left num" aria-live="polite">{redoLeft ? `faltam ${redoLeft}` : "pronto"}</span>
              <div className="segs segs--bar redo__bar" aria-hidden><i style={{ transform: `scaleX(${1 - redoLeft / Math.max(1, n)})` }} /></div>
            </>
          ) : (
            <>
              <span className="fbar__qn num">Questão {s.cur + 1} de {n}</span>
              <Segments s={s} onJump={go} />
            </>
          )}
        </div>
        <div className="fbar__tools">
          {!isSim ? <span className="fbar__clock num" role="timer" aria-label={"Tempo " + clock(elapsedSec)}><Icon name="clock" size={15} />{clock(elapsedSec)}</span> : null}
          <Button variant="plain" icon="flag" label={markedNow ? "Tirar a bandeira" : "Marcar com bandeira"} aria-pressed={markedNow} className={cx("fbar__flag", markedNow && "is-on")} onClick={() => toggleMark(s.id, qid)} />
          <Button variant="plain" icon="grid" label={isSim ? "Mapa da prova" : "Mapa da lista"} onClick={() => setMap(true)} />
          <Button variant="plain" icon="text-size" label="Tamanho e fonte do texto" aria-expanded={aa} data-aa="" onClick={() => setAa(!aa)} />
        </div>
        {aa ? <ReadingPopover onClose={() => setAa(false)} /> : null}
      </header>
      {isSim ? <PaceStrip s={s} elapsedSec={elapsedSec} /> : null}
      {immediate ? <StreakTrace n={combo} answered={answeredN} /> : null}

      <main className="focus__main" ref={resultRef}>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={qid} custom={dir}
            initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -16, transition: { duration: 0.12 } }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
            <QuestionView q={q} examLabel={examLabelOf(q)} choice={a?.choice ?? null} struck={a?.struck}
              reveal={checked ? { fresh: fresh === qid } : null} onSelect={select} onStrike={strike} scale={leitura.scale} face={leitura.face}
              confidence={!isRedo} onCard={createCard} community={!isSim} />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="abar">
        <div className="abar__in">
          {immediate ? (
            <>
              <Button variant="gray" icon="chevron-left" label="Questão anterior" disabled={s.cur === 0} onClick={() => go(s.cur - 1)} className="abar__prev" />
              <div className="abar__status" aria-live="polite">
                {checked ? (
                  <motion.span key={qid + "r"} className="abar__res" data-tone={q.an ? "an" : a?.choice === q.g ? "ok" : "no"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.snappy}>
                    <Icon name={q.an ? "alert" : a?.choice === q.g ? "check" : "x"} size={18} strokeWidth={2.5} />{q.an ? "Anulada" : a?.choice === q.g ? "Acertou" : "Errou"}
                  </motion.span>
                ) : !compact ? <span className="abar__hint"><Kbd>A</Kbd>–<Kbd>{Object.keys(q.a).slice(-1)[0]}</Kbd> marcar · clique direito risca · <Kbd>↵</Kbd> responder</span> : null}
              </div>
              <div className="abar__swap">
                <Button variant="filled" size="lg" onClick={respond} disabled={!a?.choice} style={checked ? { visibility: "hidden" } : undefined} aria-hidden={checked || undefined}>Responder</Button>
                {checked ? <Button variant="filled" size="lg" iconEnd="chevron-right" onClick={next} data-autofocus="">{isRedo ? (a?.choice !== q.g ? "Tentar depois" : redoLeft ? "Próxima" : "Ver resultado") : last ? "Ver resultado" : "Próxima"}</Button> : null}
              </div>
            </>
          ) : (
            <>
              <Button variant="gray" icon="chevron-left" label="Questão anterior" disabled={s.cur === 0} onClick={() => go(s.cur - 1)} className="abar__prev" />
              {isSim ? (
                <Button variant="gray" icon="flag" className={cx("abar__mark", markedNow && "is-on")} aria-pressed={markedNow} onClick={() => toggleMark(s.id, qid)}>
                  {compact ? (markedNow ? "Marcada" : "Revisar") : markedNow ? "Marcada para revisar" : "Marcar para revisar"}
                </Button>
              ) : <span />}
              {last ? <Button variant="filled" size="lg" onClick={() => setConfirm("finish")}>Finalizar</Button>
                : <Button variant="filled" size="lg" iconEnd="chevron-right" onClick={next}>Próxima</Button>}
            </>
          )}
        </div>
      </footer>

      <Sheet open={map} onClose={() => setMap(false)} title={isSim ? "Mapa da prova" : "Mapa da lista"} subtitle={left != null ? `${clock(left)} restantes` : `Questão ${s.cur + 1} de ${n}`} width={620}>
        <ExamMap s={s} elapsedSec={elapsedSec} onJump={(i) => { setMap(false); go(i); }} onFinish={() => { setMap(false); setConfirm(isSim || !immediate ? "finish" : "stop"); }} />
      </Sheet>
      <Dialog open={confirm === "finish"} onClose={() => setConfirm(null)} onConfirm={end}
        title={blank ? `Finalizar com ${blank === 1 ? "1 questão" : blank + " questões"} em branco?` : isSim ? "Finalizar a prova?" : "Finalizar a lista?"}
        confirmLabel="Finalizar" cancelLabel="Continuar respondendo">
        {(blank ? "Questões em branco contam como erro. " : "") + (left != null ? `Ainda restam ${duration(left)} de prova. ` : "") + "Depois de finalizar, não dá para mudar as respostas."}
      </Dialog>
      <Sheet open={confirm === "stop"} onClose={() => setConfirm(null)} title="Parar por aqui?" subtitle={`Você respondeu ${checkedN} de ${n}.`} width={420}>
        <div className="stopsheet">
          <Button variant="filled" size="lg" block data-autofocus="" onClick={() => { flush(); useStore.getState().finishEarly(s.id); setConfirm(null); }}>Ver resultado {checkedN === 1 ? "da questão" : `das ${checkedN}`}</Button>
          <Button variant="gray" size="lg" block onClick={() => { flush(); setConfirm(null); nav(-1); toast({ text: "A lista ficou salva. Continue quando quiser.", icon: "check" }); }}>Sair e continuar depois</Button>
          <Button variant="plain" block onClick={() => setConfirm(null)}>Continuar respondendo</Button>
        </div>
      </Sheet>
      <Dialog open={confirm === "leave"} onClose={() => setConfirm(null)} onConfirm={() => { flush(); nav(-1); toast({ text: "Simulado pausado. O tempo parou.", icon: "pause" }); }}
        title="Pausar o simulado?" confirmLabel="Pausar e sair" cancelLabel="Continuar">
        O tempo para e você continua de onde parou, em Hoje ou em Simulados.
      </Dialog>
    </div>
  );
}
