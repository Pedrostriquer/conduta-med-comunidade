/* Revisar flashcards (o Flashcard do design system): a lacuna cresce até a resposta no lugar, sem virar o cartão;
   o card avaliado sobe e o de trás assume; arrastar no toque (esquerda De novo, direita Bom); desfazer.
   Menu do card como no Anki: bandeira, marcar, enterrar, suspender, editar e informações, com os mesmos atalhos. */
import { useCardsDone } from "../../state/goals";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Kbd } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Pulse } from "../../ds/medical";
import { Sheet, useToast } from "../../ds/overlay";
import { cx } from "../../lib/cx";
import { clock, dayKey, num } from "../../lib/format";
import { useKey, useNow } from "../../lib/hooks";
import { haptic, isTyping, reduceMotion } from "../../lib/motion";
import { uid } from "../../lib/random";
import { shuffle } from "../../lib/random";
import { addLog, deckCards, deleteLog, getMedia, logs, putCard, queue as loadQueue, unburyOld } from "./db";
import type { CardRec, Rate, RevLog } from "./db";
import { presetFor, remaining, useFc } from "./config";
import type { ReviewOrder } from "./config";
import { FLAGS, endOfToday, inSub, intervalLabel, schedule, useDeckStore } from "./decks";
import { hydrateImages, renderCard } from "./render";
import { CardEditor, CardInfo } from "./CardSheets";
import { FlagDot, FlagPicker } from "./ui";

const RATES: [Rate, string, string][] = [["again", "De novo", "1"], ["hard", "Difícil", "2"], ["good", "Bom", "3"], ["easy", "Fácil", "4"]];
const DAY = 86400000;

export function Face({ card, open, urls }: { card: CardRec; open: boolean; urls: Map<string, string> }) {
  const r = useMemo(() => renderCard(card), [card]);
  const front = useRef<HTMLDivElement>(null), back = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = front.current; if (!el) return;
    el.innerHTML = r.front;
    el.querySelectorAll<HTMLElement>("[data-slot]").forEach((s) => {
      const i = Number(s.dataset.slot), sl = r.slots[i]; if (!sl) return;
      s.className = "cd-cloze";
      const hint = sl.choices ? sl.choices.map((c, j) => (j ? `<span class="cd-cloze__or">ou</span>` : "") + c).join("") : "[…]";
      s.innerHTML = `<span class="cd-cloze__q">${hint}</span><span class="cd-cloze__a">${sl.answer}</span><span class="cd-sr">lacuna</span>`;
    });
    // larguras naturais medidas com a lacuna fechada (a resposta fica fora do fluxo e sem quebra)
    el.querySelectorAll<HTMLElement>(".cd-cloze").forEach((s) => {
      s.dataset.qw = String(s.querySelector<HTMLElement>(".cd-cloze__q")?.offsetWidth || 0);
      s.dataset.aw = String(s.querySelector<HTMLElement>(".cd-cloze__a")?.offsetWidth || 0);
    });
    hydrateImages(el, card.media || card.deck, getMedia, urls);
  }, [r, card.deck, card.media, urls]);
  useLayoutEffect(() => {
    const max = (front.current?.clientWidth || 9999) - 16;
    front.current?.querySelectorAll<HTMLElement>(".cd-cloze").forEach((s) => {
      const q = s.querySelector<HTMLElement>(".cd-cloze__q"), a = s.querySelector<HTMLElement>(".cd-cloze__a");
      const aw = Number(s.dataset.aw || 0), qw = Number(s.dataset.qw || 0);
      if (open) s.setAttribute("data-open", ""); else s.removeAttribute("data-open");
      s.toggleAttribute("data-wrap", open && aw > max);
      q?.setAttribute("aria-hidden", String(open)); a?.setAttribute("aria-hidden", String(!open));
      s.style.width = Math.min(open ? Math.ceil(aw * 1.07) : qw, max) + 16 + "px"; // a resposta aberta fica em negrito
    });
    if (open && back.current) hydrateImages(back.current, card.media || card.deck, getMedia, urls);
  }, [open, r, card.deck, card.media, urls]);
  return (
    <>
      <div className="cd-fc__crumb">{card.path.join(" › ")}</div>
      <div className="cd-fc__front fc-html" ref={front} />
      {open ? (
        <div className="cd-fc__back" ref={back}>
          {r.answer ? <><hr className="cd-fc__hr" /><div className="cd-fc__answer fc-html" dangerouslySetInnerHTML={{ __html: r.answer }} /></> : null}
          {r.extra ? <div className="cd-fc__extra fc-html" dangerouslySetInnerHTML={{ __html: r.extra }} /> : null}
          {r.ref ? <div className="cd-fc__ref fc-html" dangerouslySetInnerHTML={{ __html: r.ref }} /> : null}
        </div>
      ) : null}
    </>
  );
}

const MODE_TITLE: Record<string, string> = { esquecidos: "Cards esquecidos", adiantado: "Revisão adiantada", novos: "Prévia dos novos", etiqueta: "Por etiqueta" };

/** ordem das revisões do Anki; "recuperabilidade" põe primeiro os mais atrasados em relação ao próprio intervalo */
function sortReviews(rev: CardRec[], o: ReviewOrder) {
  const now = Date.now(), late = (c: CardRec) => (now - (c.due - c.ivl * DAY)) / Math.max(1, c.ivl * DAY);
  switch (o) {
    case "aleatoria": return shuffle(rev);
    case "intervalo": return rev.sort((a, b) => a.ivl - b.ivl);
    case "intervalo_desc": return rev.sort((a, b) => b.ivl - a.ivl);
    case "facilidade": return rev.sort((a, b) => a.ease - b.ease);
    case "recuperabilidade": return rev.sort((a, b) => late(b) - late(a));
    case "vencimento_baralho": return rev.sort((a, b) => a.path.join().localeCompare(b.path.join()) || a.due - b.due);
    default: return rev.sort((a, b) => a.due - b.due);
  }
}

/** monta a fila: a de hoje (com os limites da predefinição) ou a de um estudo personalizado */
async function buildQueue(deck: string, sp: URLSearchParams): Promise<CardRec[]> {
  await unburyOld(deck);
  const p = presetFor(deck), { newLeft, revLeft } = remaining(deck), until = endOfToday();
  const sub = sp.get("sub") || "", modo = sp.get("modo"), dias = Number(sp.get("dias") || 1), n = Number(sp.get("n") || 50);
  if (modo) {
    const all = (await deckCards(deck)).filter((c) => inSub(c, sub) && (c.q ?? 0) >= 0);
    if (modo === "adiantado") return all.filter((c) => c.q === 2 && c.due <= until + dias * DAY).sort((a, b) => a.due - b.due).slice(0, n);
    if (modo === "novos") return all.filter((c) => c.q === 0).sort((a, b) => a.order - b.order).slice(0, n);
    if (modo === "etiqueta") { const t = sp.get("tag") || ""; return all.filter((c) => c.tags?.includes(t)).slice(0, n); }
    if (modo === "esquecidos") {
      const ids = new Set((await logs(deck, Date.now() - dias * DAY)).filter((l) => l.rate === "again").map((l) => l.card));
      return all.filter((c) => ids.has(c.id)).slice(0, n);
    }
  }
  let learn: CardRec[], rev: CardRec[], fresh: CardRec[];
  if (sub) {
    const all = (await deckCards(deck)).filter((c) => inSub(c, sub));
    learn = all.filter((c) => c.q === 1 && c.due <= until);
    rev = all.filter((c) => c.q === 2 && c.due <= until).sort((a, b) => a.due - b.due).slice(0, revLeft);
    fresh = all.filter((c) => c.q === 0).sort((a, b) => a.order - b.order).slice(0, newLeft);
  } else ({ learn, rev, fresh } = await loadQueue(deck, until, newLeft, revLeft));
  learn.sort((a, b) => a.due - b.due);
  rev = sortReviews(rev, p.reviewOrder);
  fresh = p.newOrder === "aleatoria" || p.newGather === "aleatoria_cards" || p.newGather === "aleatoria_notas" ? shuffle(fresh) : fresh.sort((a, b) => a.order - b.order);
  const now = Date.now(), ready = learn.filter((c) => c.due <= now), later = learn.filter((c) => c.due > now);
  let main: CardRec[];
  if (p.mix === "antes") main = [...fresh, ...rev];
  else if (p.mix === "depois") main = [...rev, ...fresh];
  else { main = []; const step = fresh.length ? Math.max(1, Math.round(rev.length / fresh.length)) : 1; let i = 0, j = 0; while (i < rev.length || j < fresh.length) { for (let k = 0; k < step && i < rev.length; k++) main.push(rev[i++]); if (j < fresh.length) main.push(fresh[j++]); } }
  return [...ready, ...main, ...later];
}

type Hist = { prev: CardRec; r: Rate; reinserted: boolean; log: string };

export function ReviewPage() {
  // ao sair da revisão, atualiza os cards do dia: é o que dispara a análise de quem escolheu "ao bater a meta"
  useEffect(() => () => { void useCardsDone.getState().refresh(); }, []);
  const { deck = "" } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const deckName = useDeckStore((s) => s.decks.find((d) => d.id === deck)?.name) || "Revisão de hoje";
  const showTimer = useFc((s) => presetFor(deck, s).showTimer);
  const bump = useFc((s) => s.bump);
  const modo = sp.get("modo"), sub = sp.get("sub");
  const back = modo || sub ? "/flashcards/baralho/" + deck : "/flashcards";
  const [q, setQ] = useState<CardRec[] | null>(null);
  const [open, setOpen] = useState(false);
  const [hist, setHist] = useState<Hist[]>([]);
  const [leaving, setLeaving] = useState<null | { html: string; dir: string; from?: string; k: number }>(null);
  const [total, setTotal] = useState(0);
  const [t0] = useState(Date.now());
  const [sheet, setSheet] = useState<null | "menu" | "edit" | "info">(null);
  const urls = useMemo(() => new Map<string, string>(), []);
  const stack = useRef<HTMLDivElement>(null), front = useRef<HTMLDivElement>(null), drag = useRef<null | { x: number; y: number; t: number; dx: number; lock: null | "x" | "y" }>(null);
  const revealBtn = useRef<HTMLButtonElement>(null), goodBtn = useRef<HTMLButtonElement>(null), swiped = useRef(false), shownAt = useRef(Date.now());

  useEffect(() => {
    buildQueue(deck, sp).then((xs) => { setQ(xs); setTotal(xs.length); });
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); useDeckStore.getState().refresh(); };
  }, [deck, sp]); // eslint-disable-line

  const card = q?.[0];
  useEffect(() => { shownAt.current = Date.now(); }, [card?.id, hist.length]);
  const now = useNow(1000, showTimer && !!card && !sheet);
  const reveal = () => { if (!open && card) { setOpen(true); setTimeout(() => { if (document.activeElement === revealBtn.current) goodBtn.current?.focus(); }, 0); } };
  const rate = (r: Rate, dir = "up", from?: string) => {
    if (!open || !card || !q) return;
    const next = schedule(card, r);
    putCard(next);
    const kind: RevLog["kind"] = card.isNew ? "new" : card.step > 0 ? (card.relearn ? "relearn" : "learn") : "review";
    const log: RevLog = { id: uid(), card: card.id, deck, at: Date.now(), rate: r, kind, ivl: next.ivl, lastIvl: card.ivl, ease: next.ease, ms: Math.min((presetFor(deck).maxAnswerSecs || 60) * 1000, Date.now() - shownAt.current) };
    addLog(log);
    if (kind === "new") bump(deck, { new: 1 }); else if (kind === "review") bump(deck, { rev: 1 });
    const again = !next.suspended && next.due - Date.now() < 20 * 60000;
    const rest = q.slice(1);
    if (again) rest.splice(Math.min(rest.length, 3), 0, next);
    setHist((h) => [...h, { prev: card, r, reinserted: again, log: log.id }]);
    const html = front.current?.innerHTML || "";
    setLeaving({ html, dir, from, k: Date.now() });
    setTimeout(() => setLeaving((l) => (l && Date.now() - l.k > 200 ? null : l)), reduceMotion() ? 0 : 280);
    setOpen(false); setQ(rest);
    haptic(r === "again" ? "error" : "tick");
    if (next.suspended && !card.suspended) toast({ icon: "ban", text: "Card suspenso: virou sanguessuga" });
    if (document.activeElement?.closest(".cd-fc__rates")) setTimeout(() => revealBtn.current?.focus(), 0);
  };
  const undo = () => {
    const last = hist[hist.length - 1]; if (!last || !q) return;
    putCard(last.prev); deleteLog(last.log);
    if (last.prev.isNew) bump(deck, { new: -1 }); else if (last.prev.step === 0) bump(deck, { rev: -1 });
    let rest = q;
    if (last.reinserted) { const i = rest.findIndex((c) => c.id === last.prev.id); if (i >= 0) rest = rest.filter((_, j) => j !== i); }
    setHist(hist.slice(0, -1)); setLeaving(null); setQ([last.prev, ...rest]); setOpen(true);
  };
  /** troca o card atual (bandeira, marcar, editar) sem mexer na fila */
  const patch = (p: Partial<CardRec>) => { if (!card || !q) return; const n = { ...card, ...p }; putCard(n); setQ([n, ...q.slice(1)]); };
  /** tira o card da fila de hoje (enterrar ou suspender), com desfazer */
  const remove = (p: Partial<CardRec>, msg: string, icon: string) => {
    if (!card || !q) return;
    const prev = card, n = { ...card, ...p };
    putCard(n); setQ(q.slice(1)); setOpen(false); setSheet(null); haptic("tick");
    toast({ icon, text: msg, action: "Desfazer", onAction: () => { putCard(prev); setQ((x) => [prev, ...(x || [])]); } });
  };
  const bury = () => remove({ buried: dayKey() }, "Card enterrado até amanhã", "moon");
  const suspend = () => remove({ suspended: 1 }, "Card suspenso", "ban");
  const mark = () => { if (!card) return; patch({ marked: card.marked ? undefined : 1 }); toast({ icon: "star", text: card.marked ? "Marca removida" : "Card marcado", duration: 1800 }); };
  const flag = (f: number) => { patch({ flag: f || undefined }); };

  useKey((e) => {
    if (isTyping(e) || sheet) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && /^[0-7]$/.test(e.key) && card) { e.preventDefault(); const f = +e.key; flag(card.flag === f ? 0 : f); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const focusedBtn = document.activeElement?.tagName === "BUTTON" && document.activeElement !== revealBtn.current;
    if ((e.key === " " || e.key === "Enter") && !open && !focusedBtn) { e.preventDefault(); reveal(); }
    else if (open && /^[1-4]$/.test(e.key)) { e.preventDefault(); rate(RATES[+e.key - 1][0]); }
    else if (e.key.toLowerCase() === "z" && !open && hist.length) undo();
    else if (e.key === "-" && card) bury();
    else if ((e.key === "@" || e.key === "!") && card) suspend();
    else if ((e.key === "*" || (e.shiftKey && e.code === "Digit8")) && card) mark();
    else if (e.key.toLowerCase() === "e" && card) setSheet("edit");
    else if (e.key.toLowerCase() === "i" && card) setSheet("info");
    else if (e.key === "Escape") nav(back);
  });
  const down = (e: React.PointerEvent) => { if (e.pointerType !== "touch" || !open) return; drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, lock: null }; };
  const move = (e: React.PointerEvent) => {
    const d = drag.current, el = front.current?.parentElement; if (!d || !el) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.lock) { if (Math.abs(dx) > 8 || Math.abs(dy) > 8) d.lock = Math.abs(dx) > Math.abs(dy) ? "x" : "y"; else return; }
    if (d.lock !== "x") return;
    d.dx = dx; el.setAttribute("data-dragging", "");
    el.style.transform = `translateX(${dx}px) rotate(${dx / 26}deg)`;
    const L = el.querySelector<HTMLElement>(".cd-fc__swipe--left"), R = el.querySelector<HTMLElement>(".cd-fc__swipe--right");
    if (L) L.style.opacity = String(Math.min(1, Math.max(0, -dx - 20) / 80));
    if (R) R.style.opacity = String(Math.min(1, Math.max(0, dx - 20) / 80));
  };
  const up = () => {
    const d = drag.current, el = front.current?.parentElement; drag.current = null; if (!d || !el || d.lock !== "x") return;
    const v = d.dx / Math.max(1, performance.now() - d.t), w = (stack.current?.offsetWidth || 320) * 0.32;
    el.removeAttribute("data-dragging");
    el.querySelectorAll<HTMLElement>(".cd-fc__swipe").forEach((s) => (s.style.opacity = "0"));
    if (Math.abs(d.dx) > w || Math.abs(v) > 0.6) { swiped.current = true; const from = el.style.transform; el.style.transform = ""; rate(d.dx < 0 ? "again" : "good", d.dx < 0 ? "left" : "right", from); }
    else { el.setAttribute("data-settle", ""); el.style.transform = ""; setTimeout(() => el.removeAttribute("data-settle"), 470); }
  };
  const tap = () => { if (swiped.current) { swiped.current = false; return; } if (!open) reveal(); };

  const title = modo ? MODE_TITLE[modo] || deckName : sub ? sub.split(" › ").pop() : deckName;
  const close = <Button variant="plain" icon="x" label="Sair da revisão" className="fbar__close" onClick={() => nav(back)} />;
  if (!q) return <div className="focus cd-root"><header className="fbar">{close}<div className="fbar__mid" /><div className="fbar__tools" /></header><div className="center-pad"><Pulse label="Carregando os cards" /></div></div>;

  if (!card) {
    const good = hist.filter((x) => x.r === "good" || x.r === "easy").length, mins = Math.max(1, Math.round((Date.now() - t0) / 60000));
    return (
      <div className="focus cd-root">
        <header className="fbar">{close}<div className="fbar__mid"><span className="fbar__title">{title}</span></div><div className="fbar__tools" /></header>
        <main className="focus__main"><div className="cd-fc">
          <div className="cd-fc__done" role="status">
            <span className="cd-done-mark"><svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
            <h3>{hist.length ? (modo ? "Estudo personalizado concluído" : "Revisão de hoje concluída") : "Nada para revisar agora"}</h3>
            <p>{hist.length ? "Os próximos cards voltam conforme o intervalo de cada um." : "Os próximos cards voltam amanhã. Se quiser adiantar, use o estudo personalizado do baralho."}</p>
            {hist.length ? (
              <div className="cd-fc__stats">
                <div><b>{num(hist.length)}</b><span>avaliações</span></div>
                <div><b>{Math.round((good / Math.max(1, hist.length)) * 100)}%</b><span>Bom ou Fácil</span></div>
                <div><b>{mins} min</b><span>de estudo</span></div>
              </div>
            ) : null}
            <div className="cd-row">
              {hist.length ? <Button variant="gray" icon="undo" onClick={undo}>Desfazer a última</Button> : <Button variant="gray" icon="bolt" onClick={() => nav("/flashcards/baralho/" + deck + "?personalizado=1")}>Estudo personalizado</Button>}
              <Button variant="filled" onClick={() => nav(back)}>{back === "/flashcards" ? "Voltar aos baralhos" : "Voltar ao baralho"}</Button>
            </div>
          </div>
        </div></main>
      </div>
    );
  }
  const last = hist[hist.length - 1];
  const done = Math.max(0, total - new Set(q.map((c) => c.id)).size);
  const flagColor = FLAGS.find((f) => f.id === card.flag)?.color;
  const state = card.isNew ? "Card novo" : card.step > 0 ? (card.relearn ? "Reaprendendo" : "Aprendendo") : "Revisão";
  return (
    <div className="focus cd-root">
      <header className="fbar">{close}<div className="fbar__mid"><span className="fbar__title">{title}</span></div>
        <div className="fbar__tools">
          <Button variant="plain" icon="undo" label={last ? "Desfazer avaliação" : "Nada para desfazer"} disabled={!last} onClick={undo} />
          <Button variant="plain" icon="more" label="Mais ações do card" onClick={() => setSheet("menu")} />
        </div>
      </header>
      <main className="focus__main">
        <div className="cd-fc">
          <div className="cd-fc__head">
            <span className="cd-fc__deck fc-rv__state">
              <i className={cx("fc-rv__dot", card.isNew ? "is-new" : card.step > 0 ? "is-learn" : "is-rev")} aria-hidden />{state}
              {card.marked ? <Icon name="star" size={14} className="fc-rv__star" label="Marcado" /> : null}
              <FlagDot flag={card.flag} />
            </span>
            {showTimer ? <span className="fc-rv__timer num" aria-label="Tempo neste card">{clock((now - shownAt.current) / 1000)}</span> : null}
            <span className="cd-fc__count">{num(Math.min(total, done + 1))} de {num(Math.max(total, done + 1))}</span>
          </div>
          <div className="cd-fc__progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Progresso da revisão"><i style={{ "--p": (done / Math.max(1, total)) * 100 + "%" } as React.CSSProperties} /></div>
          <div ref={stack} className="cd-fc__stack" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            {leaving ? <Leaving key={leaving.k} html={leaving.html} dir={leaving.dir} from={leaving.from} /> : null}
            {q.slice(1, 3).reverse().map((c, i, arr) => <div key={c.id + "b"} className="cd-fc__card" data-depth={String(arr.length - i)} aria-hidden />)}
            <div key={card.id + ":" + hist.length} className={cx("cd-fc__card", flagColor && "fc-rv__flagged")} style={flagColor ? { "--flag": flagColor } as React.CSSProperties : undefined} data-depth="0" onClick={tap} aria-live="polite">
              <span className="cd-fc__swipe cd-fc__swipe--left" aria-hidden>De novo</span>
              <span className="cd-fc__swipe cd-fc__swipe--right" aria-hidden>Bom</span>
              <div ref={front} className="fc-face"><Face card={card} open={open} urls={urls} /></div>
            </div>
          </div>
          <div className="cd-fc__bar">
            <Button ref={revealBtn} variant="gray" block className="cd-fc__reveal" kbd="Espaço" onClick={reveal} data-hidden={open ? "" : undefined} tabIndex={open ? -1 : 0}>Mostrar resposta</Button>
            <div className="cd-fc__rates" role="group" aria-label="Como foi lembrar?" data-hidden={open ? undefined : ""}>
              {RATES.map(([r, label, k]) => (
                <button key={r} ref={r === "good" ? goodBtn : null} type="button" tabIndex={open ? 0 : -1} className={cx("cd-rate", "cd-hoverable", "cd-rate--" + r)} onClick={() => rate(r)}>
                  {label}<small>{intervalLabel(card, r)}<Kbd>{k}</Kbd></small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Sheet open={sheet === "menu"} onClose={() => setSheet(null)} title="Este card" width={420}>
        <div className="fc-menu">
          <div className="fc-menu__flags"><span>Bandeira</span><FlagPicker value={card.flag} onPick={(f) => flag(f)} /></div>
          <ul className="list">
            {([
              ["star", card.marked ? "Desmarcar" : "Marcar", "*", mark],
              ["moon", "Enterrar até amanhã", "-", bury],
              ["ban", "Suspender", "@", suspend],
              ["pencil", "Editar", "E", () => setSheet("edit")],
              ["info", "Informações do card", "I", () => setSheet("info")],
            ] as [string, string, string, () => void][]).map(([icon, label, k, fn]) => (
              <li key={label}><button type="button" className="row row--icon cd-hoverable" onClick={() => { fn(); if (icon === "star") setSheet(null); }}>
                <span className="row__icon"><Icon name={icon} size={20} /></span>
                <span className="row__main"><span className="row__title">{label}</span></span>
                <span className="row__end"><Kbd>{k}</Kbd></span>
              </button></li>
            ))}
          </ul>
          <p className="list__note">Bandeiras pelo teclado: Ctrl + 1 a 7 (Ctrl + 0 tira).</p>
        </div>
      </Sheet>
      <CardEditor card={sheet === "edit" ? card : null} onClose={() => setSheet(null)} onSave={(n) => { patch(n); setSheet(null); toast({ icon: "check", text: "Card salvo", duration: 1800 }); }} />
      <CardInfo card={sheet === "info" ? card : null} onClose={() => setSheet(null)} />
    </div>
  );
}

function Leaving({ html, dir, from }: { html: string; dir: string; from?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!; el.getBoundingClientRect();
    const id = requestAnimationFrame(() => { el.style.transform = ""; el.setAttribute("data-leaving", dir === "up" ? "" : dir); });
    return () => cancelAnimationFrame(id);
  }, [dir]);
  return (
    <div ref={ref} className="cd-fc__card" data-depth="0" aria-hidden style={from ? { transform: from, transition: "none" } : undefined}>
      <div className="fc-face" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
