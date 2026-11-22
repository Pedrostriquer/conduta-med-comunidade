/* Estatísticas só dos flashcards (separadas do desempenho das questões): hoje, previsão de vencimentos,
   contagem de cards por estado, intervalos, botões apertados e o calendário de revisões. */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { Page, Section } from "../../app/Page";
import { SegmentedControl } from "../../ds/basics";
import { Pulse } from "../../ds/medical";
import { Counter } from "../../ds/progress";
import { cx } from "../../lib/cx";
import { addDays, cap, dayKey, duration, fromKey, longDate, monthShort, num, plural, shortDate, tinyDate } from "../../lib/format";
import { spring } from "../../lib/motion";
import { allCards, allDecks, deckCards, logs } from "./db";
import { DEFAULT_ID, limitsFor, presetFor, useFc } from "./config";
import type { CardRec, DeckRec, RevLog } from "./db";

const DAY = 86400000;
type Bar = { key: string; label: string; value: number; tip: string };

/** barras verticais de uma série, com dica ao passar o dedo ou o mouse */
function Bars({ data, every = 1, height = 140, label }: { data: Bar[]; every?: number; height?: number; label: string }) {
  const [hot, setHot] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="fc-bars" aria-label={label} onPointerLeave={() => setHot(null)}>
      <div className="fc-bars__plot" style={{ height }}>
        <span className="fc-bars__max num" aria-hidden>{num(max)}</span>
        {data.map((d, i) => (
          <button key={d.key} type="button" className={cx("fc-bars__col", hot === i && "is-hot")} aria-label={d.tip}
            onPointerEnter={() => setHot(i)} onFocus={() => setHot(i)} onBlur={() => setHot(null)}>
            <motion.i style={{ height: d.value ? `max(4px, ${(d.value / max) * 100}%)` : 0 }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ ...spring.smooth, delay: Math.min(0.3, i * 0.008) }} />
          </button>
        ))}
        {hot != null ? (
          <div className="fc-bars__tip" style={{ left: `${((hot + 0.5) / data.length) * 100}%` }} data-edge={hot < 3 ? "start" : hot > data.length - 4 ? "end" : undefined} role="status">
            {data[hot].tip}
          </div>
        ) : null}
      </div>
      <div className="fc-bars__axis" aria-hidden>
        {data.map((d, i) => <span key={d.key}>{i % every === 0 ? d.label : ""}</span>)}
      </div>
    </figure>
  );
}

/** barra empilhada com legenda e números (os cards por estado) */
function Stack({ parts }: { parts: { key: string; label: string; value: number; cls: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="fc-stack">
      <div className="fc-stack__bar" role="img" aria-label={parts.map((p) => `${p.label}: ${num(p.value)}`).join(", ")}>
        {parts.filter((p) => p.value).map((p, i) => (
          <motion.i key={p.key} className={p.cls} title={`${p.label}: ${num(p.value)}`} initial={{ flexGrow: 0 }} animate={{ flexGrow: p.value / total }} transition={{ ...spring.smooth, delay: i * 0.05 }} />
        ))}
      </div>
      <ul className="fc-legend">
        {parts.map((p) => (
          <li key={p.key}><i className={p.cls} aria-hidden /><span>{p.label}</span><b className="num">{num(p.value)}</b><small className="num">{Math.round((p.value / total) * 100)}%</small></li>
        ))}
      </ul>
    </div>
  );
}

/** calendário de revisões: uma célula por dia, mais escura com mais cards */
function Calendar({ perDay, weeks = 26 }: { perDay: Map<string, number>; weeks?: number }) {
  const [hot, setHot] = useState<string | null>(null);
  const t = dayKey(), wd = (fromKey(t).getDay() + 6) % 7, first = addDays(addDays(t, -wd), -(weeks - 1) * 7);
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
  const vals = [...perDay.values()].sort((a, b) => a - b), p90 = vals[Math.floor(vals.length * 0.9)] || 1;
  const lv = (n: number) => (!n ? 0 : n >= p90 ? 4 : n >= p90 * 0.6 ? 3 : n >= p90 * 0.3 ? 2 : 1);
  const n = hot ? perDay.get(hot) || 0 : 0;
  return (
    <div className="heat fc-cal">
      <div className="fc-cal__scroll">
        <div className="fc-cal__months" aria-hidden>{cols.map((c, i) => <span key={i}>{i === 0 || fromKey(c[0]).getMonth() !== fromKey(cols[i - 1][0]).getMonth() ? monthShort(fromKey(c[0]).getMonth()) : ""}</span>)}</div>
        <div className="fc-cal__grid" onPointerLeave={() => setHot(null)}>
          {cols.map((c, i) => (
            <div key={i} className="heat__col">
              {c.map((k) => <i key={k} className="heat__cell" data-l={k > t ? "x" : lv(perDay.get(k) || 0)} data-hot={k === hot ? "" : undefined} onPointerEnter={() => k <= t && setHot(k)} aria-label={`${longDate(k)}: ${num(perDay.get(k) || 0)} revisões`} />)}
            </div>
          ))}
        </div>
      </div>
      <div className="heat__legend">
        <span className="fc-cal__status" role="status">{hot ? <><b>{n ? plural(n, "revisão", "revisões") : "Sem revisão"}</b> · {cap(longDate(hot))}</> : "Passe o dedo pelos dias"}</span>
        <span className="heat__goal" aria-hidden>Menos</span>{[0, 1, 2, 3, 4].map((l) => <i key={l} className="heat__cell" data-l={l} aria-hidden />)}<span aria-hidden>Mais</span>
      </div>
    </div>
  );
}

const daysLabel = (d: number) => (d < 60 ? plural(d, "dia", "dias") : d < 730 ? `${Math.round(d / 30)} meses` : `${(d / 365).toFixed(1).replace(".", ",")} anos`);
const BUCKETS: [number, string][] = [[1, "1d"], [3, "2–3d"], [7, "4–7d"], [14, "1–2 sem"], [30, "2–4 sem"], [90, "1–3 m"], [180, "3–6 m"], [365, "6–12 m"], [Infinity, "1 a+"]];

export function StatsPage() {
  const [sp] = useSearchParams();
  const [deck, setDeck] = useState(sp.get("deck") || "");
  const [decks, setDecks] = useState<DeckRec[]>([]);
  const [cards, setCards] = useState<CardRec[] | null>(null);
  const [log, setLog] = useState<RevLog[] | null>(null);
  const [range, setRange] = useState<30 | 90 | 365>(30);
  useEffect(() => { allDecks().then(setDecks); }, []);
  useEffect(() => {
    setCards(null); setLog(null);
    (deck ? deckCards(deck) : allCards()).then(setCards);
    logs(deck || undefined, Date.now() - 366 * DAY).then(setLog);
  }, [deck]);

  const s = useMemo(() => {
    if (!cards || !log) return null;
    const t = dayKey(), now = Date.now();
    const todayLog = log.filter((l) => dayKey(l.at) === t);
    const recent = log.filter((l) => l.at >= now - range * DAY);
    // previsão: revisões que vencem em cada um dos próximos 30 dias (atrasadas contam hoje)
    const fc = new Map<string, number>();
    for (const c of cards) if ((c.q === 2 || c.q === 1)) { const k = dayKey(c.due) < t ? t : dayKey(c.due); fc.set(k, (fc.get(k) || 0) + 1); }
    const forecast: Bar[] = Array.from({ length: 30 }, (_, i) => { const k = addDays(t, i), v = fc.get(k) || 0; return { key: k, label: i === 0 ? "hoje" : tinyDate(k), value: v, tip: `${i === 0 ? "Hoje" : cap(shortDate(k))}: ${plural(v, "card", "cards")}` }; });
    const st = { fresh: 0, learn: 0, young: 0, mature: 0, susp: 0 };
    for (const c of cards) { const q = c.q ?? 2; if (q === -1 || q === -2) st.susp++; else if (q === 0) st.fresh++; else if (q === 1) st.learn++; else if (c.ivl >= 21) st.mature++; else st.young++; }
    const ivls = BUCKETS.map(() => 0);
    for (const c of cards) if (!c.isNew && c.ivl > 0) ivls[BUCKETS.findIndex(([m]) => c.ivl <= m)]++;
    const ivlBars: Bar[] = BUCKETS.map(([, lab], i) => ({ key: lab, label: lab, value: ivls[i], tip: `${lab}: ${plural(ivls[i], "card", "cards")}` }));
    const btn = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const l of recent) btn[l.rate]++;
    const perDay = new Map<string, number>();
    for (const l of log) { const k = dayKey(l.at); perDay.set(k, (perDay.get(k) || 0) + 1); }
    const days = new Set(recent.map((l) => dayKey(l.at))).size;
    let streak = 0; for (let k = perDay.has(t) ? t : addDays(t, -1); perDay.has(k); k = addDays(k, -1)) streak++;
    // planejamento: retenção real das revisões (não conta aprendendo), tempo previsto de hoje e quando os novos acabam
    const r30 = log.filter((l) => l.at >= now - 30 * DAY && l.kind === "review");
    const retention = r30.length ? 1 - r30.filter((l) => l.rate === "again").length / r30.length : null;
    const msRev = recent.filter((l) => l.kind === "review" && l.ms > 0);
    const secPerRev = msRev.length ? Math.min(60, msRev.reduce((a, l) => a + l.ms, 0) / msRev.length / 1000) : 9;
    const ids = deck ? [deck] : decks.map((d) => d.id);
    const newPerDayAll = ids.reduce((a, id) => a + limitsFor(id).newPerDay, 0);
    const newLeftToday = ids.reduce((a, id) => a + Math.max(0, limitsFor(id).newPerDay), 0);
    const dueToday = forecast[0].value;
    const minutesToday = Math.round((dueToday * secPerRev + Math.min(st.fresh, newLeftToday) * 40) / 60);
    const daysToZero = newPerDayAll ? Math.ceil(st.fresh / newPerDayAll) : null;
    return {
      plan: { retention, n30: r30.length, minutesToday, daysToZero, newPerDayAll, secPerRev },
      today: { n: todayLog.length, ms: todayLog.reduce((a, l) => a + l.ms, 0), ok: todayLog.filter((l) => l.rate !== "again").length, fresh: todayLog.filter((l) => l.kind === "new").length },
      forecast, st, ivlBars, btn, perDay, recent: recent.length, days, streak,
      due7: forecast.slice(0, 7).reduce((a, b) => a + b.value, 0),
    };
  }, [cards, log, range, deck, decks]);
  const desired = useFc((x) => presetFor(deck || decks[0]?.id || DEFAULT_ID, x).retention);

  return (
    <Page title="Estatísticas" subtitle="Só dos flashcards; não entram no desempenho das questões." crumbs={deck ? [{ label: "Flashcards", to: "/flashcards" }, { label: decks.find((d) => d.id === deck)?.name || "Baralho", to: "/flashcards/baralho/" + deck }] : undefined}
      actions={<select className="fc-input fc-input--sm" value={deck} onChange={(e) => setDeck(e.target.value)} aria-label="Baralho"><option value="">Todos os baralhos</option>{decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}>
      {!s ? <div className="center-pad"><Pulse label="Calculando" /></div> : (
        <>
          <section className="fc-tiles" aria-label="Hoje">
            {([
              [s.today.n, "revisões hoje", ""],
              [Math.round(s.today.ms / 60000), "minutos hoje", ""],
              [s.today.n ? Math.round((s.today.ok / s.today.n) * 100) : 0, "de acerto hoje", "%"],
              [s.streak, s.streak === 1 ? "dia seguido" : "dias seguidos", ""],
            ] as [number, string, string][]).map(([v, l, u], i) => (
              <motion.div key={l} className="tile" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay: i * 0.04 } }}>
                <b className="num"><Counter value={v} from={0} />{u}</b><small>{l}</small>
              </motion.div>
            ))}
          </section>
          <p className="fc-help" style={{ marginTop: 8 }}>{s.today.fresh ? `${plural(s.today.fresh, "card novo", "cards novos")} hoje · ` : ""}{s.today.ms ? `${duration(s.today.ms / 1000)} de estudo · ` : ""}acerto conta tudo que não foi De novo.</p>

          <Section title="Planejamento">
            <div className="fc-plan">
              <div className="panel fc-plan__item">
                <span className="fc-hero__eyebrow">Retenção real · 30 dias</span>
                {s.plan.retention != null ? <>
                  <b className="fc-plan__big num">{Math.round(s.plan.retention * 100)}%</b>
                  <div className="fc-plan__vs" aria-label={`Real ${Math.round(s.plan.retention * 100)}%, desejada ${Math.round(desired * 100)}%`}>
                    <span className="fc-plan__track"><motion.i className={s.plan.retention >= desired - 0.02 ? "is-ok" : "is-low"} initial={{ width: 0 }} animate={{ width: `${Math.max(0, (s.plan.retention - 0.5) / 0.5) * 100}%` }} transition={spring.smooth} />
                      <span className="fc-plan__goal" style={{ left: `${((desired - 0.5) / 0.5) * 100}%` }} /></span>
                  </div>
                  <small className="fc-help">{s.plan.retention >= desired - 0.02 ? "Dentro" : "Abaixo"} da desejada ({Math.round(desired * 100)}%), em {plural(s.plan.n30, "revisão", "revisões")}.</small>
                </> : <><b className="fc-plan__big">—</b><small className="fc-help">Aparece depois das primeiras revisões (não conta cards ainda aprendendo).</small></>}
              </div>
              <div className="panel fc-plan__item">
                <span className="fc-hero__eyebrow">Hoje deve levar</span>
                <b className="fc-plan__big num">≈ {num(s.plan.minutesToday)} min</b>
                <small className="fc-help">{plural(s.forecast[0].value, "revisão", "revisões")} a ~{Math.round(s.plan.secPerRev)} s cada, mais os novos de hoje.</small>
              </div>
              <div className="panel fc-plan__item">
                <span className="fc-hero__eyebrow">Novos acabam em</span>
                <b className="fc-plan__big num">{s.st.fresh === 0 ? "zerados" : s.plan.daysToZero == null ? "pausados" : daysLabel(s.plan.daysToZero)}</b>
                <small className="fc-help">{s.st.fresh ? `${plural(s.st.fresh, "card novo", "cards novos")}, ${num(s.plan.newPerDayAll)} por dia${s.plan.daysToZero ? ` · ${shortDate(addDays(dayKey(), s.plan.daysToZero))}` : ""}.` : "Todos os cards já foram vistos."}</small>
              </div>
            </div>
          </Section>

          <Section title="Previsão" action={<span className="fc-help num">{plural(s.due7, "card", "cards")} nos próximos 7 dias</span>}>
            <div className="panel"><Bars data={s.forecast} every={5} label="Cards que vencem por dia nos próximos 30 dias" /></div>
          </Section>

          <Section title="Cards por estado">
            <div className="panel">
              <Stack parts={[
                { key: "n", label: "Novos", value: s.st.fresh, cls: "fc-c-new" },
                { key: "l", label: "Aprendendo", value: s.st.learn, cls: "fc-c-learn" },
                { key: "y", label: "Jovens", value: s.st.young, cls: "fc-c-young" },
                { key: "m", label: "Maduros", value: s.st.mature, cls: "fc-c-mature" },
                { key: "s", label: "Fora da fila", value: s.st.susp, cls: "fc-c-susp" },
              ]} />
              <p className="fc-help" style={{ marginTop: 12 }}>Jovens têm intervalo de até 20 dias; maduros, de 21 dias ou mais. Fora da fila são os suspensos e os enterrados.</p>
            </div>
          </Section>

          <Section title="Intervalos">
            <div className="panel"><Bars data={s.ivlBars} height={120} label="Quantos cards têm cada intervalo" /></div>
          </Section>

          <Section title="Botões" action={<SegmentedControl size="sm" aria-label="Período" value={range} onChange={setRange} options={[{ value: 30, label: "1 mês" }, { value: 90, label: "3 meses" }, { value: 365, label: "1 ano" }]} />}>
            <div className="panel fc-btns">
              {(["again", "hard", "good", "easy"] as const).map((r) => {
                const v = s.btn[r], p = s.recent ? v / s.recent : 0;
                return (
                  <div key={r} className="fc-btns__row">
                    <span className="fc-btns__name">{{ again: "De novo", hard: "Difícil", good: "Bom", easy: "Fácil" }[r]}</span>
                    <span className="fc-btns__track"><motion.i className={"is-" + r} initial={{ width: 0 }} animate={{ width: p * 100 + "%" }} transition={spring.smooth} /></span>
                    <span className="fc-btns__v num"><b>{Math.round(p * 100)}%</b> · {num(v)}</span>
                  </div>
                );
              })}
              <p className="fc-help">{plural(s.recent, "avaliação", "avaliações")} em {plural(s.days, "dia", "dias")} de estudo.</p>
            </div>
          </Section>

          <Section title="Calendário">
            <div className="panel"><Calendar perDay={s.perDay} /></div>
          </Section>
        </>
      )}
    </Page>
  );
}
