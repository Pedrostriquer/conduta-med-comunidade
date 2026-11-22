/* Ajustar o cronograma: tudo o que dá para personalizar, em seções, com o impacto calculado ao lado antes de aplicar.
   O assistente (/cronograma/novo) continua sendo o caminho curto para montar; aqui é o caminho completo para afinar. */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useBank } from "../../data/bank";
import { buildSchedule, planImpact, PHASES } from "../../data/plan";
import { AREAS, BANCAS } from "../../data/types";
import { useStore } from "../../state/store";
import type { Plan } from "../../state/store";
import { useStats } from "../../state/stats";
import { DEFAULT_PREFS, DEFAULT_RULES, EVENT_LABEL, SEC_PER_CARD, useGoals, usePlanPrefs } from "../../state/goals";
import type { DayEventKind, PlanPrefs } from "../../state/goals";
import { RuleFields } from "./Events";
import { ProportionSheet, ProportionSummary } from "../simulados/ProportionSheet";
import { useDecks } from "../flashcards/decks";
import { Page } from "../../app/Page";
import { Button, Chip, SegmentedControl, Stepper, Switch } from "../../ds/basics";
import { Dialog, useToast } from "../../ds/overlay";
import { Icon } from "../../ds/Icon";
import { addDays, cap, diffDays, duration, fromKey, longDate, num, plural, shortDate, today, weekdayName, weekdayShort } from "../../lib/format";
import type { DayKey } from "../../lib/format";
import { cx } from "../../lib/cx";

const WEEK = [1, 2, 3, 4, 5, 6, 0];
const hours = (h: number) => (h % 1 ? `${Math.floor(h)}h30` : `${h}h`);
/** "na segunda", "no sábado" */
const naDia = (d: number) => (d === 0 || d === 6 ? "no " : "na ") + weekdayName(d);

function Block({ title, sub, children, id }: { title: string; sub?: string; children: ReactNode; id?: string }) {
  return (
    <section className="pe-block panel" id={id}>
      <header className="pe-block__head"><h2 className="sec__title">{title}</h2>{sub ? <p>{sub}</p> : null}</header>
      {children}
    </section>
  );
}
function Row({ label, hint, children, stack }: { label: string; hint?: ReactNode; children: ReactNode; stack?: boolean }) {
  return (
    <div className={cx("pe-row", stack && "pe-row--stack")}>
      <div className="pe-row__l"><span>{label}</span>{hint ? <small>{hint}</small> : null}</div>
      <div className="pe-row__c">{children}</div>
    </div>
  );
}

export function PlanEditor() {
  const nav = useNavigate();
  const toast = useToast();
  const bank = useBank()!;
  const st = useStats(bank);
  const store = useStore();
  const plan = store.plan!;
  const curPrefs = usePlanPrefs(plan);
  const curCards = useGoals((s) => s.cardGoals);
  const regras = useGoals((s) => s.regras), setRegra = useGoals((s) => s.setRegra);
  const [editShares, setEditShares] = useState(false);
  const { decks } = useDecks();
  const t = today();

  const [p, setP] = useState<Plan>(plan);
  const [f, setF] = useState<PlanPrefs>(curPrefs);
  const [cards, setCards] = useState<Record<string, number>>(curCards);
  const [pausa, setPausa] = useState<{ de: DayKey; ate: DayKey; nome: string }>({ de: addDays(t, 14), ate: addDays(t, 20), nome: "" });
  const [remove, setRemove] = useState(false);
  const up = (x: Partial<Plan>) => setP((o) => ({ ...o, ...x }));
  /** ao trocar o jeito de medir, cada dia começa com o equivalente à meta atual */
  const setRitmo = (v: PlanPrefs["ritmo"]) => setF((o) => {
    const cardsMin = Object.values(cards).reduce((a, b) => a + b, 0) * SEC_PER_CARD / 60;
    const porDia = { ...o.porDia }, horas = { ...o.horas };
    for (const d of p.dias) {
      if (porDia[d] == null) porDia[d] = p.meta;
      if (horas[d] == null) horas[d] = Math.max(0.5, Math.round(((p.meta * o.minPorQuestao + cardsMin) / 60) * 2) / 2);
    }
    return { ...o, ritmo: v, porDia, horas };
  });
  const upF = (x: Partial<PlanPrefs>) => setF((o) => ({ ...o, ...x }));

  const before = useMemo(() => planImpact(buildSchedule(plan, bank, st, curPrefs, curCards), curPrefs, Object.values(curCards).reduce((s, n) => s + n, 0)), [plan, bank, st, curPrefs, curCards]);
  const draftDays = useMemo(() => buildSchedule(p, bank, st, f, cards), [p, bank, st, f, cards]);
  const after = useMemo(() => planImpact(draftDays, f, Object.values(cards).reduce((s, n) => s + n, 0)), [draftDays, f, cards]);
  const phaseDates = PHASES.map((ph) => {
    const xs = draftDays.filter((d) => (d.kind === "estudo" || d.kind === "simulado") && d.phase === ph.id);
    return xs.length ? `${shortDate(xs[0].key)} – ${shortDate(xs[xs.length - 1].key)}` : "—";
  });
  const dirty = JSON.stringify([p, f, cards]) !== JSON.stringify([plan, curPrefs, curCards]);

  const apply = () => {
    const exame = p.banca !== plan.banca || p.data !== plan.data
      ? `${p.banca === "Outra" ? "Prova" : p.banca} ${fromKey(p.data).getFullYear() + (p.banca === "ENAMED" ? 0 : fromKey(p.data).getMonth() >= 8 ? 1 : 0)}`
      : plan.exame;
    const next = { ...p, exame };
    store.setPlan(next);
    useGoals.getState().setPrefs(next, f);
    const g = useGoals.getState();
    for (const id of new Set([...Object.keys(curCards), ...Object.keys(cards)])) g.setCardGoal(id, cards[id] || null);
    toast({ text: `Cronograma atualizado: ≈ ${num(after.avgQ)} questões por dia.`, icon: "check" });
    nav("/cronograma");
  };

  const delta = (a: number, b: number, fmt: (n: number) => string = num) => (a === b ? null : <span className={cx("pe-delta", b > a ? "is-up" : "is-down")}>{b > a ? "+" : "−"}{fmt(Math.abs(b - a))}</span>);
  const impactRows: [string, number, number, (n: number) => string][] = [
    ["Questões por dia (média)", before.avgQ, after.avgQ, num],
    ["Maior dia", before.maxQ, after.maxQ, num],
    ["Carga média por dia", before.avgMin, after.avgMin, (m) => duration(m * 60)],
    ["Cards por dia", before.cards, after.cards, num],
    ["Dias de estudo", before.studyDays, after.studyDays, num],
    ["Simulados", before.sims, after.sims, num],
    ["Dias de plantão", before.light, after.light, num],
    ["Questões até a prova", before.questions, after.questions, num],
  ];

  return (
    <Page title="Ajustar cronograma" subtitle="Personalize o plano; o impacto aparece ao lado antes de aplicar." crumbs={[{ label: "Cronograma", to: "/cronograma" }]}>
      <div className="cols cols--wide-aside cols--editor">
        <div className="cols__main">
          <Block title="Prova" sub="A data e as bancas que pesam na escolha dos temas e dos simulados.">
            <Row label="Banca principal">
              <select className="pe-select" value={p.banca} onChange={(e) => up({ banca: e.target.value })} aria-label="Banca principal">
                {[...BANCAS, "Outra"].map((b) => <option key={b} value={b}>{b === "Outra" ? "Outra (todas as provas)" : b}</option>)}
              </select>
            </Row>
            <Row stack label="Outras bancas-alvo" hint="Somam a incidência dos temas na escolha das questões e dos simulados">
              <div className="chips">
                {BANCAS.filter((b) => b !== p.banca).map((b) => <Chip key={b} pressed={f.bancas.includes(b)} onChange={() => upF({ bancas: f.bancas.includes(b) ? f.bancas.filter((x) => x !== b) : [...f.bancas, b] })}>{b}</Chip>)}
              </div>
            </Row>
            <Row label="Data da prova" hint={`faltam ${num(diffDays(t, p.data))} dias`}>
              <input type="date" className="pe-date" value={p.data} min={addDays(t, 7)} onChange={(e) => e.target.value && up({ data: e.target.value })} aria-label="Data da prova" />
            </Row>
            <Row label="Início do plano">
              <input type="date" className="pe-date" value={p.inicio} max={addDays(p.data, -7)} onChange={(e) => e.target.value && up({ inicio: e.target.value })} aria-label="Início do plano" />
            </Row>
          </Block>

          <Block title="Rotina" sub="Quando você estuda e quanto cabe em cada dia.">
            <Row label="Dias de estudo">
              <div className="wdays" role="group" aria-label="Dias de estudo">
                {WEEK.map((d) => {
                  const on = p.dias.includes(d);
                  return <button key={d} type="button" aria-pressed={on} className="wday cd-hoverable" aria-label={weekdayName(d)} onClick={() => up({ dias: on ? p.dias.filter((x) => x !== d) : [...p.dias, d].sort() })}>{weekdayShort(d)}</button>;
                })}
              </div>
            </Row>
            <Row label="Como medir o dia">
              <SegmentedControl size="sm" aria-label="Ritmo" value={f.ritmo} onChange={(v) => setRitmo(v)} options={[{ value: "meta", label: "Mesma meta" }, { value: "dia", label: "Por dia" }, { value: "horas", label: "Por horas" }]} />
            </Row>
            {f.ritmo === "meta" ? (
              <Row label="Questões por dia" hint={`≈ ${duration(p.meta * f.minPorQuestao * 60)} por dia`}>
                <Stepper label="Questões por dia" value={p.meta} min={5} max={200} step={5} onChange={(v) => up({ meta: v })} />
              </Row>
            ) : (
              <div className="pe-week">
                {WEEK.filter((d) => p.dias.includes(d)).map((d) => (
                  <div key={d} className={cx("pe-week__d", f.plantoes.includes(d) && "is-light")}>
                    <span className="pe-week__wd">{weekdayShort(d)}</span>
                    {f.ritmo === "dia" ? (
                      <Stepper label={`Questões ${naDia(d)}`} value={f.porDia[d] ?? p.meta} min={0} max={200} step={5} onChange={(v) => upF({ porDia: { ...f.porDia, [d]: v } })} />
                    ) : (
                      <Stepper label={`Horas ${naDia(d)}`} value={f.horas[d] ?? 2} min={0} max={12} step={0.5} format={hours} onChange={(v) => upF({ horas: { ...f.horas, [d]: v } })} />
                    )}
                  </div>
                ))}
              </div>
            )}
            <Row label="Tempo por questão" hint="Com a leitura da correção">
              <Stepper label="Minutos por questão" value={f.minPorQuestao} min={1} max={5} step={0.5} format={(v) => `${String(v).replace(".", ",")} min`} onChange={(v) => upF({ minPorQuestao: v })} />
            </Row>
            <Row label="Plantões" hint="Dias leves: só o mínimo para a sequência contar">
              <div className="wdays" role="group" aria-label="Dias de plantão">
                {WEEK.filter((d) => p.dias.includes(d)).map((d) => {
                  const on = f.plantoes.includes(d);
                  return <button key={d} type="button" aria-pressed={on} className="wday wday--light cd-hoverable" aria-label={`Plantão ${naDia(d)}`} onClick={() => upF({ plantoes: on ? f.plantoes.filter((x) => x !== d) : [...f.plantoes, d] })}>{weekdayShort(d)}</button>;
                })}
              </div>
            </Row>
            <div className="pe-pausas">
              <div className="pe-row__l"><span>Férias e pausas</span><small>Dias sem estudo; o plano redistribui o resto</small></div>
              {f.pausas.length ? (
                <ul className="pe-pausas__list">
                  {f.pausas.map((z, i) => (
                    <li key={i}>
                      <Icon name="calendar" size={16} />
                      <span><b>{z.nome || "Pausa"}</b> · {shortDate(z.de)} a {shortDate(z.ate)} · {plural(diffDays(z.de, z.ate) + 1, "dia", "dias")}</span>
                      <Button variant="plain" size="sm" icon="trash" label="Tirar pausa" onClick={() => upF({ pausas: f.pausas.filter((_, j) => j !== i) })} />
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="pe-pausas__add">
                <input className="pe-text" placeholder="Nome (ex.: Férias)" value={pausa.nome} onChange={(e) => setPausa({ ...pausa, nome: e.target.value })} aria-label="Nome da pausa" />
                <input type="date" className="pe-date" value={pausa.de} min={t} max={p.data} onChange={(e) => e.target.value && setPausa({ ...pausa, de: e.target.value, ate: pausa.ate < e.target.value ? e.target.value : pausa.ate })} aria-label="Começo da pausa" />
                <input type="date" className="pe-date" value={pausa.ate} min={pausa.de} max={p.data} onChange={(e) => e.target.value && setPausa({ ...pausa, ate: e.target.value })} aria-label="Fim da pausa" />
                <Button variant="gray" size="sm" icon="plus" onClick={() => { upF({ pausas: [...f.pausas, { de: pausa.de, ate: pausa.ate, nome: pausa.nome.trim() || undefined }].sort((a, b) => (a.de < b.de ? -1 : 1)) }); setPausa({ ...pausa, nome: "" }); }}>Adicionar</Button>
              </div>
            </div>
          </Block>

          <Block title="Conteúdo" sub="Onde pôr mais peso e quando cada fase começa.">
            {AREAS.map((a) => (
              <Row key={a.id} label={a.label}>
                <SegmentedControl size="sm" aria-label={`Ênfase em ${a.label}`} value={String(f.areas[a.id] ?? 1)} onChange={(v) => upF({ areas: { ...f.areas, [a.id]: Number(v) } })}
                  options={[{ value: "0.5", label: "Menos" }, { value: "1", label: "Normal" }, { value: "1.5", label: "Mais" }]} />
              </Row>
            ))}
            <div className="pe-phases">
              <div className="pe-phases__bar" aria-hidden>
                <i className="ph-0" style={{ flex: f.fases[0] }} /><i className="ph-1" style={{ flex: f.fases[1] - f.fases[0] }} /><i className="ph-2" style={{ flex: 1 - f.fases[1] }} />
              </div>
              <div className="pe-phases__legend">
                {PHASES.map((ph, i) => <span key={ph.id}><i className={`ph-dot ph-${ph.id}`} /><b>{ph.name}</b> {phaseDates[i]}</span>)}
              </div>
              <label className="pe-range">
                <span>Base até <b className="num">{Math.round(f.fases[0] * 100)}%</b> do plano</span>
                <input type="range" min={30} max={85} step={5} value={Math.round(f.fases[0] * 100)} onChange={(e) => { const a = Number(e.target.value) / 100; upF({ fases: [a, Math.max(a + 0.05, f.fases[1])] }); }} />
              </label>
              <label className="pe-range">
                <span>Revisão até <b className="num">{Math.round(f.fases[1] * 100)}%</b> (o resto é reta final)</span>
                <input type="range" min={40} max={97} step={1} value={Math.round(f.fases[1] * 100)} onChange={(e) => { const b = Number(e.target.value) / 100; upF({ fases: [Math.min(f.fases[0], b - 0.05), b] }); }} />
              </label>
            </div>
          </Block>

          <Block title="Plantões e compromissos" sub="O que estudar em cada tipo de dia marcado no calendário. Marque os dias em Calendário, no próprio dia.">
            {(Object.keys(EVENT_LABEL) as DayEventKind[]).map((k) => (
              <div key={k} className="pe-rule">
                <div className="setup__label">{EVENT_LABEL[k]}</div>
                <RuleFields rule={regras[k] || DEFAULT_RULES[k]} onChange={(r) => setRegra(k, r)} />
              </div>
            ))}
          </Block>

          <Block title="Proporção da prova" sub="Quanto cada área pesa, por banca. A plataforma estima pelas provas que temos; se discordar, ajuste. Vale aqui e nos simulados embaralhados.">
            <ProportionSummary banca={p.banca === "Outra" ? "ENARE" : p.banca} onEdit={() => setEditShares(true)} />
            <ProportionSheet banca={p.banca === "Outra" ? "ENARE" : p.banca} open={editShares} onClose={() => setEditShares(false)} />
          </Block>

          <Block title="Limites" sub="Para nada acumular quando um dia fica para trás.">
            <Row label="Teto por dia" hint={f.teto ? "Nenhum dia passa disso, nem ao recuperar atraso" : "Sem teto"}>
              <div className="pe-inline">
                <Switch label="Usar teto" checked={f.teto != null} onChange={(v) => upF({ teto: v ? Math.max(p.meta + 20, 60) : null })} />
                {f.teto != null ? <Stepper label="Teto de questões" value={f.teto} min={10} max={300} step={5} onChange={(v) => upF({ teto: v })} /> : null}
              </div>
            </Row>
          </Block>

          <Block title="Flashcards no plano" sub="Os cards de cada baralho entram na lista do dia e na carga.">
            {decks.length ? decks.map((d) => {
              const on = !!cards[d.id];
              return (
                <Row key={d.id} label={d.name} hint={`${num(d.cards)} cards · ${num(d.due)} na fila hoje`}>
                  <div className="pe-inline">
                    <Switch label={`Incluir ${d.name}`} checked={on} onChange={(v) => setCards((c) => { const x = { ...c }; if (v) x[d.id] = 20; else delete x[d.id]; return x; })} />
                    {on ? <Stepper label="Cards por dia" value={cards[d.id]} min={5} max={500} step={5} onChange={(v) => setCards((c) => ({ ...c, [d.id]: v }))} /> : null}
                  </div>
                </Row>
              );
            }) : (
              <div className="pe-empty"><Icon name="cards" size={18} /><span>Nenhum baralho ainda. Importe do Anki ou crie cards e eles aparecem aqui.</span><Button variant="tinted" size="sm" onClick={() => nav("/flashcards")}>Ir para Flashcards</Button></div>
            )}
            {Object.keys(cards).length ? <p className="pe-note">≈ {duration(Object.values(cards).reduce((s, n) => s + n, 0) * SEC_PER_CARD)} por dia de cards.</p> : null}
          </Block>

          <Block title="Simulados" sub="Prova inteira, no tempo da prova. No dia do simulado não há questões avulsas.">
            <Row label="Frequência">
              <SegmentedControl size="sm" aria-label="Frequência" value={p.simulado.freq} onChange={(v) => up({ simulado: { ...p.simulado, freq: v } })} options={[{ value: "semanal", label: "Toda semana" }, { value: "quinzenal", label: "A cada duas" }, { value: "nenhum", label: "Sem" }]} />
            </Row>
            {p.simulado.freq !== "nenhum" ? (
              <Row label="Dia do simulado">
                <div className="wdays" role="radiogroup" aria-label="Dia do simulado">
                  {WEEK.filter((d) => p.dias.includes(d)).map((d) => <button key={d} type="button" role="radio" aria-checked={p.simulado.dia === d} className="wday cd-hoverable" aria-label={weekdayName(d)} onClick={() => up({ simulado: { ...p.simulado, dia: d } })}>{weekdayShort(d)}</button>)}
                </div>
              </Row>
            ) : null}
          </Block>

          <div className="pe-foot">
            <Button variant="plain" onClick={() => nav("/cronograma/novo?editar=1")}>Refazer pelo assistente</Button>
            <Button variant="plain" className="pe-danger" icon="trash" onClick={() => setRemove(true)}>Apagar cronograma</Button>
          </div>
        </div>

        <aside className="cols__aside">
          <section className="panel pe-impact" aria-live="polite">
            <h2 className="sec__title">Impacto</h2>
            <p className="pe-impact__lead">{dirty ? <>Vira <b className="num">{num(after.avgQ)}</b> questões por dia, ≈ <b>{duration(after.avgMin * 60)}</b>.</> : "Mude algo ao lado para ver como o plano fica."}</p>
            <dl className="pe-impact__list">
              {impactRows.map(([l, a, b, fmt]) => (
                <div key={l}><dt>{l}</dt><dd className="num">{fmt(b)}{delta(a, b, fmt)}</dd></div>
              ))}
            </dl>
            {after.maxQ > 120 && !f.teto ? <p className="pe-warn"><Icon name="alert" size={16} />Algum dia passa de {num(after.maxQ)} questões. Um teto ajuda a não acumular.</p> : null}
            <div className="pe-impact__actions">
              <Button variant="filled" block disabled={!dirty || !p.dias.length} onClick={apply}>Aplicar mudanças</Button>
              <Button variant="plain" block disabled={!dirty} onClick={() => { setP(plan); setF(curPrefs); setCards(curCards); }}>Descartar</Button>
            </div>
            <p className="pe-note">{cap(longDate(p.data, true))}. Os ajustes de atraso já feitos continuam valendo.</p>
          </section>
        </aside>
      </div>
      <Dialog open={remove} onClose={() => setRemove(false)} destructive confirmLabel="Apagar" title="Apagar o cronograma?"
        onConfirm={() => { store.setPlan(null); nav("/cronograma"); }}>
        As questões que você já fez continuam no seu histórico. Dá para montar um novo a qualquer momento.
      </Dialog>
    </Page>
  );
}

export { DEFAULT_PREFS };
