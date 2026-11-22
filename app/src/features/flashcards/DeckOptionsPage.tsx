/* Opções do baralho. Para o aluno: três perfis prontos (Leve, Padrão, Reta final) com o custo em minutos por dia,
   e o que vale só neste baralho (pausar novos, mais cards só hoje). Quem já usa o Anki abre o "Modo Anki", com todas
   as opções do Anki 25 e os nomes originais. Cada baralho usa uma predefinição; mudar uma opção muda todos os
   baralhos que usam aquela predefinição. Salva sozinho. */
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Page, Section } from "../../app/Page";
import { Badge, Button, SegmentedControl, Stepper, Switch } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Dialog, Sheet, useToast } from "../../ds/overlay";
import { cx } from "../../lib/cx";
import { num, plural, weekdayName } from "../../lib/format";
import { spring } from "../../lib/motion";
import { useStore } from "../../state/store";
import { DEFAULT_FSRS, DEFAULT_ID, PROFILES, defaults, limitsFor, minutesPerDay, newPerDay, parseSteps, presetFor, profileOf, stepsText, todayOf, useFc } from "./config";
import type { EasyDay, Preset, ProfileId } from "./config";
import { ivlText, schedule, useDeckStore, useDecks } from "./decks";
import type { CardRec } from "./db";
import { Opt } from "./ui";

function StepsInput({ value, onChange, label }: { value: number[]; onChange: (v: number[]) => void; label: string }) {
  const [txt, setTxt] = useState(stepsText(value));
  const [err, setErr] = useState(false);
  useEffect(() => { setTxt(stepsText(value)); setErr(false); }, [value]);
  const commit = () => { const v = parseSteps(txt); if (!v) { setErr(true); return; } setErr(false); onChange(v); };
  return (
    <span className="fc-steps">
      <input className={cx("fc-input fc-input--steps", err && "is-err")} value={txt} aria-label={label} aria-invalid={err} onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
      {err ? <small className="fc-steps__err">Use 1m, 10m, 1h, 1d</small> : null}
    </span>
  );
}

const pctF = (v: number) => Math.round(v * 100) + "%";
const daysF = (v: number) => num(v) + (v === 1 ? " dia" : " dias");
const secsF = (v: number) => (v ? num(v) + " s" : "Desligado");

/** mostra o que cada botão faria com um card novo e com uma revisão de 10 dias */
function Simulation({ p }: { p: Preset }) {
  const base: CardRec = { id: "sim", deck: "", path: [], kind: "basic", fields: [], ord: 0, due: 0, ivl: 0, ease: p.startEase, reps: 0, lapses: 0, step: 0, isNew: 1, order: 0 };
  const rev: CardRec = { ...base, isNew: 0, ivl: 10, ease: 2.5, reps: 5 };
  const lab = (c: CardRec, r: "again" | "hard" | "good" | "easy") => ivlText(schedule(c, r, 0, p).due);
  const row = (name: string, c: CardRec) => (
    <div className="fc-sim__row"><span className="fc-sim__name">{name}</span>
      {(["again", "hard", "good", "easy"] as const).map((r) => <span key={r} className={"fc-sim__v is-" + r}>{lab(c, r)}</span>)}
    </div>
  );
  return (
    <div className="fc-sim" aria-label="Simulação dos intervalos">
      <div className="fc-sim__row fc-sim__row--head"><span /><span>De novo</span><span>Difícil</span><span>Bom</span><span>Fácil</span></div>
      {row("Card novo", base)}
      {row("Revisão de 10 dias", rev)}
    </div>
  );
}

/** "Me ajude a decidir" do FSRS: quanto tempo por dia custa cada retenção desejada */
function RetentionHelper({ p, open, onClose, onPick }: { p: Preset; open: boolean; onClose: () => void; onPick: (r: number) => void }) {
  const rows = useMemo(() => Array.from({ length: 12 }, (_, i) => 0.75 + i * 0.02).map((r) => ({ r: +r.toFixed(2), m: minutesPerDay({ ...p, fsrs: true, retention: r }) })), [p]);
  const max = Math.max(...rows.map((x) => x.m));
  return (
    <Sheet open={open} onClose={onClose} title="Me ajude a decidir" subtitle="Quanto você lembra contra quanto tempo isso custa por dia, com os limites deste baralho." width={560}>
      <ul className="fc-ret-help" aria-label="Retenção e tempo por dia">
        {rows.map((x) => (
          <li key={x.r}>
            <button type="button" className={cx("fc-ret-help__row cd-hoverable", Math.abs(x.r - p.retention) < 0.005 && "is-on")} onClick={() => { onPick(x.r); onClose(); }}>
              <span className="fc-ret-help__r num">{pctF(x.r)}</span>
              <span className="fc-ret-help__bar"><i style={{ width: (x.m / max) * 100 + "%" }} className={x.r > 0.95 ? "is-hot" : undefined} /></span>
              <span className="fc-ret-help__m num">≈ {num(x.m)} min</span>
              {x.r === 0.9 ? <Badge tone="accent">recomendado</Badge> : <span />}
            </button>
          </li>
        ))}
      </ul>
      <p className="fc-help">Lembrar 9 de cada 10 cards é o equilíbrio do Anki. Acima de 95% o tempo por dia cresce rápido para pouco ganho; abaixo de 80% você esquece demais entre as revisões.</p>
    </Sheet>
  );
}

const WEEK = [1, 2, 3, 4, 5, 6, 0];

export function DeckOptionsPage() {
  const { deck = "" } = useParams();
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  const { decks } = useDecks();
  const d = decks.find((x) => x.id === deck);
  const presets = useFc((s) => s.presets), deckPreset = useFc((s) => s.deckPreset);
  const paused = useFc((s) => !!s.paused[deck]);
  const own = useFc((s) => s.deckLimits[deck]);
  const t = useFc((s) => todayOf(deck, s));
  const fc = useFc();
  const lim = limitsFor(deck, fc);
  const { setPreset, addPreset, removePreset, usePreset, setPaused, setDeckLimits, bump } = useFc.getState();
  const p = useFc((s) => presetFor(deck, s));
  const settingsNew = useStore((s) => s.settings.cardsNovosPorDia);
  const [dlg, setDlg] = useState<null | "reset" | "remove">(null);
  const [nameSheet, setNameSheet] = useState<null | "dup" | "ren">(null);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(0);
  const [limTab, setLimTab] = useState<"preset" | "deck" | "hoje">("preset");
  const [helper, setHelper] = useState(false);
  const [extra, setExtra] = useState(10);
  const anki = sp.get("anki") === "1";
  const setAnki = (v: boolean) => setSp(v ? { anki: "1" } : {}, { replace: true });
  const users = useMemo(() => decks.filter((x) => (deckPreset[x.id] || DEFAULT_ID) === p.id).length, [decks, deckPreset, p.id]);
  useEffect(() => { if (saved) { const tm = setTimeout(() => setSaved(0), 1400); return () => clearTimeout(tm); } }, [saved]);

  const touch = () => { setSaved(Date.now()); useDeckStore.getState().refresh(); };
  const set = <K extends keyof Preset>(k: K, v: Preset[K]) => { setPreset({ ...p, [k]: v }); touch(); };
  const list = Object.values(presets).sort((a, b) => (a.id === DEFAULT_ID ? -1 : b.id === DEFAULT_ID ? 1 : a.name.localeCompare(b.name)));
  const cur = profileOf(p);
  const ahead = d ? d.rev + d.learn : undefined;
  const pickProfile = (id: ProfileId) => { const pr = PROFILES.find((x) => x.id === id)!; setPreset({ ...p, ...pr.set, profile: id }); touch(); };

  const crumbs = [{ label: "Flashcards", to: "/flashcards" }, { label: d?.name || "Baralho", to: "/flashcards/baralho/" + deck }];
  return (
    <Page title="Opções" subtitle={d ? `${d.name} · predefinição ${p.name}` : undefined} crumbs={crumbs}
      actions={<motion.span className="fc-saved" animate={{ opacity: saved ? 1 : 0, y: saved ? 0 : 4 }} transition={spring.snappy} aria-live="polite">{saved ? <><Icon name="check" size={16} />Salvo</> : null}</motion.span>}>
      <div className="cols">
        <div className="cols__main">
          <Section title="Como você quer estudar este baralho?">
            <div className="fc-profiles" role="radiogroup" aria-label="Perfil de estudo">
              {PROFILES.map((pr, i) => {
                const q = { ...p, ...pr.set } as Preset, on = cur === pr.id;
                return (
                  <motion.button key={pr.id} type="button" role="radio" aria-checked={on} className="fc-profile cd-hoverable" onClick={() => pickProfile(pr.id)}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay: i * 0.04 } }}>
                    <span className="fc-profile__top"><b>{pr.name}</b>{on ? <motion.span layoutId="fc-profile-check" className="fc-profile__check" transition={spring.snappy}><Icon name="check" size={14} strokeWidth={2.5} /></motion.span> : null}</span>
                    <span className="fc-profile__who">{pr.who}</span>
                    <span className="fc-profile__min num">≈ {num(minutesPerDay(q, { reviewsAhead: ahead, freshLeft: d?.fresh }))} min<small>/dia</small></span>
                    <span className="fc-profile__facts num">{num(newPerDay(q))} novos · {q.maxReviews >= 9999 ? "sem teto de revisões" : `até ${num(q.maxReviews)} revisões`} · lembrar {pctF(q.retention)}</span>
                    <span className="fc-profile__hint">{pr.hint}</span>
                  </motion.button>
                );
              })}
            </div>
            {cur === "custom" ? <p className="fc-help fc-profiles__note"><Icon name="sliders" size={15} />Você ajustou as opções no Modo Anki; escolher um perfil volta aos valores dele.</p> : null}
            {users > 1 ? <p className="fc-help fc-profiles__note"><Icon name="info" size={15} />{`A predefinição “${p.name}” vale para ${num(users)} baralhos: mudar o perfil aqui muda em todos.`}</p> : null}
          </Section>

          <Section title="Só neste baralho">
            <ul className="list">
              <Opt title="Pausar cards novos" hint={paused ? "Nada novo entra; as revisões continuam normalmente" : "Continua revisando o que você já viu, sem trazer nada novo"}>
                <Switch label="Pausar cards novos" checked={paused} onChange={(v) => { setPaused(deck, v); touch(); }} />
              </Opt>
              <Opt title="Só hoje: mais cards novos" hint={t.extraNew ? `Hoje já tem +${num(t.extraNew)}. Amanhã volta ao normal.` : "Para um dia com mais tempo. Amanhã volta ao normal."}>
                <span className="cd-row fc-today-plus">
                  <Stepper label="Quantos novos a mais hoje" value={extra} min={5} max={500} step={5} onChange={setExtra} format={(v) => "+" + num(v)} />
                  <Button variant="tinted" size="sm" disabled={paused} onClick={() => { bump(deck, { extraNew: extra }); touch(); toast({ icon: "plus", text: `+${num(extra)} novos só hoje` }); }}>Somar</Button>
                </span>
              </Opt>
            </ul>
          </Section>

          <section className="fc-anki">
            <button type="button" className="fc-anki__toggle cd-hoverable" aria-expanded={anki} onClick={() => setAnki(!anki)}>
              <span className="fc-anki__icon" aria-hidden><Icon name="sliders" size={20} /></span>
              <span className="fc-anki__text"><b>Modo Anki</b><small>Todas as opções do Anki, com os nomes originais. Para quem já usa o Anki.</small></span>
              <Icon name="chevron-down" size={18} className={cx("fc-anki__chev", anki && "is-open")} />
            </button>
            <AnimatePresence initial={false}>
              {anki ? (
                <motion.div className="fc-anki__body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth}>
                  <div className="fc-anki__inner">
                    <section className="panel fc-preset">
                      <label className="fc-field">
                        <span className="fc-field__label">Predefinição</span>
                        <select className="fc-input" value={p.id} onChange={(e) => { usePreset(deck, e.target.value); touch(); }}>
                          {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </label>
                      <p className="fc-help">{users <= 1 ? "Só este baralho usa esta predefinição." : `${num(users)} baralhos usam esta predefinição: mudar aqui muda em todos.`}</p>
                      <div className="cd-row fc-preset__btns">
                        <Button variant="gray" size="sm" icon="copy" onClick={() => { setName(p.name + " (cópia)"); setNameSheet("dup"); }}>Duplicar</Button>
                        <Button variant="gray" size="sm" icon="pencil" onClick={() => { setName(p.name); setNameSheet("ren"); }}>Renomear</Button>
                        {p.id !== DEFAULT_ID ? <Button variant="gray" size="sm" icon="trash" onClick={() => setDlg("remove")}>Excluir</Button> : null}
                        <Button variant="gray" size="sm" icon="layers" onClick={() => {
                          decks.forEach((x) => usePreset(x.id, p.id)); touch(); toast({ icon: "layers", text: `“${p.name}” agora vale para todos os baralhos` });
                        }}>Usar em todos os baralhos</Button>
                      </div>
                    </section>

                    <Section title="Limites diários" action={<SegmentedControl size="sm" aria-label="Onde vale o limite" value={limTab} onChange={setLimTab} options={[{ value: "preset", label: "Predefinição" }, { value: "deck", label: "Este baralho" }, { value: "hoje", label: "Só hoje" }]} />}>
                      <ul className="list">
                        {limTab === "preset" ? <>
                          <Opt title="Novos cards por dia" hint={p.newPerDay == null ? `Igual a Ajustes › Flashcards (${num(settingsNew)})` : "Quantos cards nunca vistos entram por dia"}>
                            <Stepper label="Novos cards por dia" value={p.newPerDay ?? settingsNew} min={0} max={9999} step={5} onChange={(v) => set("newPerDay", v)} />
                          </Opt>
                          <Opt title="Máximo de revisões por dia" hint="O que passar disso fica para amanhã">
                            <Stepper label="Máximo de revisões por dia" value={p.maxReviews} min={0} max={9999} step={10} onChange={(v) => set("maxReviews", v)} />
                          </Opt>
                        </> : limTab === "deck" ? <>
                          <Opt title="Limites próprios" hint="Este baralho ignora os limites da predefinição"><Switch label="Limites próprios" checked={!!own} onChange={(v) => { setDeckLimits(deck, v ? { newPerDay: newPerDay(p), maxReviews: p.maxReviews } : null); touch(); }} /></Opt>
                          <Opt title="Novos cards por dia" hint="Só neste baralho"><Stepper label="Novos cards por dia neste baralho" value={own?.newPerDay ?? newPerDay(p)} min={0} max={9999} step={5} onChange={(v) => { setDeckLimits(deck, { ...(own || { maxReviews: p.maxReviews }), newPerDay: v }); touch(); }} /></Opt>
                          <Opt title="Máximo de revisões por dia" hint="Só neste baralho"><Stepper label="Máximo de revisões neste baralho" value={own?.maxReviews ?? p.maxReviews} min={0} max={9999} step={10} onChange={(v) => { setDeckLimits(deck, { ...(own || { newPerDay: newPerDay(p) }), maxReviews: v }); touch(); }} /></Opt>
                        </> : <>
                          <Opt title="Novos a mais hoje" hint="Some ao limite só hoje"><Stepper label="Novos a mais hoje" value={t.extraNew} min={0} max={500} step={5} onChange={(v) => { bump(deck, { extraNew: v - t.extraNew }); touch(); }} format={(v) => "+" + num(v)} /></Opt>
                          <Opt title="Revisões a mais hoje" hint="Some ao teto só hoje"><Stepper label="Revisões a mais hoje" value={t.extraRev} min={0} max={2000} step={10} onChange={(v) => { bump(deck, { extraRev: v - t.extraRev }); touch(); }} format={(v) => "+" + num(v)} /></Opt>
                        </>}
                        <Opt title="Novos ignoram o limite de revisões" hint="Desligado, o teto de revisões também segura os novos (padrão do Anki)"><Switch label="Novos ignoram o limite de revisões" checked={p.newIgnoresReviewLimit} onChange={(v) => set("newIgnoresReviewLimit", v)} /></Opt>
                        <Opt title="Limites começam do topo" hint="Os limites dos sub-baralhos também valem quando você estuda o baralho de cima"><Switch label="Limites começam do topo" checked={p.limitsFromTop} onChange={(v) => set("limitsFromTop", v)} /></Opt>
                      </ul>
                      <p className="list__note num">Valendo hoje: {num(lim.newPerDay)} novos e até {num(lim.maxReviews)} revisões{lim.easyDay !== "normal" ? ` (hoje é dia ${lim.easyDay === "minimo" ? "mínimo" : "reduzido"})` : ""}.</p>
                    </Section>

                    <Section title="Novos cards">
                      <ul className="list">
                        <Opt title="Etapas de aprendizado" hint="Quando o card novo volta na mesma sessão, ex.: 1m 10m"><StepsInput label="Etapas de aprendizado" value={p.learnSteps} onChange={(v) => set("learnSteps", v)} /></Opt>
                        <Opt title="Intervalo de graduação" hint="Depois da última etapa, apertando Bom"><Stepper label="Intervalo de graduação" value={p.graduatingIvl} min={1} max={365} onChange={(v) => set("graduatingIvl", v)} format={daysF} /></Opt>
                        <Opt title="Intervalo fácil" hint="Apertando Fácil num card ainda aprendendo"><Stepper label="Intervalo fácil" value={p.easyIvl} min={1} max={365} onChange={(v) => set("easyIvl", v)} format={daysF} /></Opt>
                        <Opt title="Ordem de inserção" hint="Para os cards que você adicionar">
                          <SegmentedControl size="sm" aria-label="Ordem de inserção" value={p.insertOrder} onChange={(v) => set("insertOrder", v)} options={[{ value: "sequencial", label: "Sequencial" }, { value: "aleatoria", label: "Aleatória" }]} />
                        </Opt>
                      </ul>
                    </Section>

                    <Section title="Lapsos">
                      <ul className="list">
                        <Opt title="Etapas de reaprendizado" hint="Quando você erra uma revisão, o card volta nestes tempos"><StepsInput label="Etapas de reaprendizado" value={p.relearnSteps} onChange={(v) => set("relearnSteps", v)} /></Opt>
                        <Opt title="Intervalo mínimo" hint="O menor intervalo depois de reaprender"><Stepper label="Intervalo mínimo" value={p.minIvl} min={1} max={365} onChange={(v) => set("minIvl", v)} format={daysF} /></Opt>
                        <Opt title="Limite de sanguessuga" hint="Quantos erros até o card ser tratado como sanguessuga (o card que você sempre esquece)"><Stepper label="Limite de sanguessuga" value={p.leechThreshold} min={1} max={99} onChange={(v) => set("leechThreshold", v)} format={(v) => num(v) + " lapsos"} /></Opt>
                        <Opt title="Ação da sanguessuga" hint="Ganha a etiqueta “sanguessuga” nos dois casos">
                          <SegmentedControl size="sm" aria-label="Ação da sanguessuga" value={p.leechAction} onChange={(v) => set("leechAction", v)} options={[{ value: "marcar", label: "Só etiquetar" }, { value: "suspender", label: "Suspender" }]} />
                        </Opt>
                      </ul>
                    </Section>

                    <Section title="Ordem de exibição">
                      <ul className="list">
                        <Opt title="Coleta dos novos" hint="De onde os novos de hoje são tirados">
                          <select className="fc-input fc-input--sm" aria-label="Coleta dos novos" value={p.newGather} onChange={(e) => set("newGather", e.target.value as Preset["newGather"])}>
                            <option value="baralho">Por baralho</option><option value="posicao">Por posição</option><option value="aleatoria_notas">Notas aleatórias</option><option value="aleatoria_cards">Cards aleatórios</option>
                          </select>
                        </Opt>
                        <Opt title="Ordenação dos novos" hint="Em que ordem os novos aparecem">
                          <SegmentedControl size="sm" aria-label="Ordenação dos novos" value={p.newOrder} onChange={(v) => set("newOrder", v)} options={[{ value: "baralho", label: "Do baralho" }, { value: "aleatoria", label: "Aleatória" }]} />
                        </Opt>
                        <Opt title="Novos × revisões" hint="Quando os novos aparecem na sessão">
                          <SegmentedControl size="sm" aria-label="Novos e revisões" value={p.mix} onChange={(v) => set("mix", v)} options={[{ value: "misturar", label: "Misturar" }, { value: "antes", label: "Antes" }, { value: "depois", label: "Depois" }]} />
                        </Opt>
                        <Opt title="Aprendizado entre dias × revisões" hint="Cards ainda aprendendo que voltam em outro dia">
                          <SegmentedControl size="sm" aria-label="Aprendizado entre dias" value={p.interdayMix} onChange={(v) => set("interdayMix", v)} options={[{ value: "misturar", label: "Misturar" }, { value: "antes", label: "Antes" }, { value: "depois", label: "Depois" }]} />
                        </Opt>
                        <Opt title="Ordem das revisões" hint="Recuperabilidade põe primeiro o que você tem mais chance de ter esquecido">
                          <select className="fc-input fc-input--sm" aria-label="Ordem das revisões" value={p.reviewOrder} onChange={(e) => set("reviewOrder", e.target.value as Preset["reviewOrder"])}>
                            <option value="vencimento">Vencimento</option><option value="vencimento_baralho">Vencimento, depois baralho</option><option value="intervalo">Intervalo crescente</option>
                            <option value="intervalo_desc">Intervalo decrescente</option><option value="facilidade">Facilidade crescente</option><option value="recuperabilidade">Recuperabilidade crescente</option><option value="aleatoria">Aleatória</option>
                          </select>
                        </Opt>
                      </ul>
                    </Section>

                    <Section title={<span className="fc-fsrs__title">FSRS <Badge tone="accent">prévia</Badge></span>}>
                      <ul className="list">
                        <Opt title="Usar o FSRS" hint="Agenda pela memória estimada de cada card, em vez das facilidades do SM-2"><Switch label="Usar o FSRS" checked={p.fsrs} onChange={(v) => set("fsrs", v)} /></Opt>
                        <li><div className={cx("row fc-ret", !p.fsrs && "is-off")}>
                          <span className="row__main">
                            <span className="row__title">Retenção desejada</span>
                            <span className="row__sub">Chance de lembrar quando o card volta. Mais alta, mais revisões por dia.</span>
                            <span className="fc-ret__ctl">
                              <input type="range" className="fc-range" min={0.7} max={0.99} step={0.01} value={p.retention} disabled={!p.fsrs} aria-label="Retenção desejada" onChange={(e) => set("retention", Number(e.target.value))}
                                style={{ "--p": ((p.retention - 0.7) / 0.29) * 100 + "%" } as React.CSSProperties} />
                              <b className="num">{pctF(p.retention)}</b>
                              <Button variant="tinted" size="sm" disabled={!p.fsrs} onClick={() => setHelper(true)}>Me ajude a decidir</Button>
                            </span>
                          </span>
                        </div></li>
                        <li><div className={cx("row fc-params", !p.fsrs && "is-off")}>
                          <span className="row__main">
                            <span className="row__title">Parâmetros do FSRS</span>
                            <span className="row__sub">{p.fsrsOptimizedAt ? `Otimizados com o seu histórico em ${new Date(p.fsrsOptimizedAt).toLocaleDateString("pt-BR")}.` : "Os padrões do FSRS. Otimizar ajusta à sua memória usando o histórico de revisões."}</span>
                            <textarea className="fc-input fc-input--area fc-input--mono" rows={2} value={p.fsrsParams} disabled={!p.fsrs} aria-label="Parâmetros do FSRS" onChange={(e) => set("fsrsParams", e.target.value)} />
                            <span className="cd-row">
                              <Button variant="gray" size="sm" icon="bolt" disabled={!p.fsrs} onClick={() => { set("fsrsOptimizedAt", Date.now()); toast({ icon: "bolt", text: "Parâmetros otimizados (prévia: os valores não mudam nesta versão)" }); }}>Otimizar</Button>
                              <Button variant="plain" size="sm" disabled={!p.fsrs} onClick={() => set("fsrsParams", DEFAULT_FSRS)}>Voltar aos padrões</Button>
                            </span>
                          </span>
                        </div></li>
                        <Opt title="Reagendar cards ao mudar" hint="Recalcula o vencimento de todos os cards quando você muda a retenção ou os parâmetros"><Switch label="Reagendar cards ao mudar" checked={p.rescheduleOnChange} onChange={(v) => set("rescheduleOnChange", v)} /></Opt>
                        <Opt title="Retenção histórica" hint="A retenção que você tinha antes do histórico que o app conhece (para o otimizador)"><Stepper label="Retenção histórica" value={p.historicalRetention} min={0.5} max={0.99} step={0.01} onChange={(v) => set("historicalRetention", +v.toFixed(2))} format={pctF} /></Opt>
                        <Opt title="Ignorar revisões anteriores a" hint="O otimizador deixa de fora o que veio antes desta data">
                          <input type="date" className="fc-input fc-input--sm" aria-label="Ignorar revisões anteriores a" value={p.ignoreBefore} onChange={(e) => set("ignoreBefore", e.target.value)} />
                        </Opt>
                      </ul>
                      <p className="list__note">Nesta versão o FSRS é aproximado: a retenção desejada encurta ou alonga os intervalos do agendador; os parâmetros e o otimizador ainda são só visuais.</p>
                    </Section>

                    <Section title="Enterrar">
                      <ul className="list">
                        <Opt title="Enterrar irmãos novos" hint="Lacunas da mesma nota não aparecem no mesmo dia"><Switch label="Enterrar irmãos novos" checked={p.buryNew} onChange={(v) => set("buryNew", v)} /></Opt>
                        <Opt title="Enterrar irmãos de revisão" hint="O mesmo para as revisões"><Switch label="Enterrar irmãos de revisão" checked={p.buryReview} onChange={(v) => set("buryReview", v)} /></Opt>
                        <Opt title="Enterrar irmãos de aprendizado entre dias" hint="O mesmo para cards ainda aprendendo que voltam em outro dia"><Switch label="Enterrar irmãos de aprendizado entre dias" checked={p.buryInterday} onChange={(v) => set("buryInterday", v)} /></Opt>
                      </ul>
                    </Section>

                    <Section title="Áudio">
                      <ul className="list">
                        <Opt title="Não tocar o áudio sozinho" hint="Nos cards com som, só toca quando você pedir"><Switch label="Não tocar o áudio sozinho" checked={p.noAutoplay} onChange={(v) => set("noAutoplay", v)} /></Opt>
                        <Opt title="Pular o áudio da pergunta ao repetir a resposta" hint="Repetir o som toca só o da resposta"><Switch label="Pular o áudio da pergunta ao repetir a resposta" checked={p.skipQuestionOnReplay} onChange={(v) => set("skipQuestionOnReplay", v)} /></Opt>
                      </ul>
                    </Section>

                    <Section title="Cronômetros">
                      <ul className="list">
                        <Opt title="Máximo de segundos por resposta" hint="Se você se distrair, o registro conta no máximo este tempo"><Stepper label="Máximo de segundos por resposta" value={p.maxAnswerSecs} min={10} max={600} step={10} onChange={(v) => set("maxAnswerSecs", v)} format={(v) => num(v) + " s"} /></Opt>
                        <Opt title="Mostrar o cronômetro" hint="Um contador discreto no card"><Switch label="Mostrar o cronômetro" checked={p.showTimer} onChange={(v) => set("showTimer", v)} /></Opt>
                        <Opt title="Parar o cronômetro ao responder" hint="Para de contar quando a resposta aparece"><Switch label="Parar o cronômetro ao responder" checked={p.stopTimerOnAnswer} onChange={(v) => set("stopTimerOnAnswer", v)} /></Opt>
                      </ul>
                    </Section>

                    <Section title="Avanço automático">
                      <ul className="list">
                        <Opt title="Segundos para mostrar a resposta" hint="Mostra a resposta sozinho depois deste tempo"><Stepper label="Segundos para mostrar a resposta" value={p.autoQuestionSecs} min={0} max={120} step={1} onChange={(v) => set("autoQuestionSecs", v)} format={secsF} /></Opt>
                        <Opt title="Segundos para avançar" hint="Depois da resposta, avalia sozinho"><Stepper label="Segundos para avançar" value={p.autoAnswerSecs} min={0} max={120} step={1} onChange={(v) => set("autoAnswerSecs", v)} format={secsF} /></Opt>
                        <Opt title="Esperar o áudio" hint="Só conta o tempo depois que o som termina"><Switch label="Esperar o áudio" checked={p.autoWaitAudio} onChange={(v) => set("autoWaitAudio", v)} /></Opt>
                        <Opt title="Ação na pergunta">
                          <SegmentedControl size="sm" aria-label="Ação na pergunta" value={p.autoQuestionAction} onChange={(v) => set("autoQuestionAction", v)} options={[{ value: "mostrar_resposta", label: "Mostrar resposta" }, { value: "lembrete", label: "Só lembrar" }]} />
                        </Opt>
                        <Opt title="Ação na resposta">
                          <select className="fc-input fc-input--sm" aria-label="Ação na resposta" value={p.autoAnswerAction} onChange={(e) => set("autoAnswerAction", e.target.value as Preset["autoAnswerAction"])}>
                            <option value="bom">Avaliar como Bom</option><option value="de_novo">Avaliar como De novo</option><option value="enterrar">Enterrar o card</option><option value="lembrete">Só lembrar</option>
                          </select>
                        </Opt>
                      </ul>
                    </Section>

                    <Section title="Dias fáceis">
                      <div className="panel fc-easy">
                        <p className="fc-help">Dias de plantão ou de folga: em um dia reduzido entram metade dos novos; em um dia mínimo, nenhum.</p>
                        <ul className="fc-easy__days">
                          {WEEK.map((wd) => (
                            <li key={wd}>
                              <span className="fc-easy__day">{weekdayName(wd)}</span>
                              <SegmentedControl size="sm" aria-label={"Dia fácil: " + weekdayName(wd)} value={p.easyDays[wd]}
                                onChange={(v) => { const xs = [...p.easyDays] as EasyDay[]; xs[wd] = v; set("easyDays", xs); }}
                                options={[{ value: "normal", label: "Normal" }, { value: "reduzido", label: "Reduzido" }, { value: "minimo", label: "Mínimo" }]} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    </Section>

                    <Section title="Avançado">
                      <ul className="list">
                        <Opt title="Intervalo máximo" hint="O maior intervalo que um card pode ter"><Stepper label="Intervalo máximo" value={p.maxIvl} min={30} max={36500} step={30} onChange={(v) => set("maxIvl", v)} format={(v) => (v >= 365 ? (v / 365).toFixed(1).replace(".", ",") + " anos" : daysF(v))} /></Opt>
                        <Opt title="Facilidade inicial" hint="SM-2: quanto o intervalo cresce a cada Bom, no começo"><Stepper label="Facilidade inicial" value={p.startEase} min={1.3} max={5} step={0.05} onChange={(v) => set("startEase", +v.toFixed(2))} format={pctF} /></Opt>
                        <Opt title="Bônus fácil" hint="SM-2: quanto o Fácil alonga a mais"><Stepper label="Bônus fácil" value={p.easyBonus} min={1} max={5} step={0.05} onChange={(v) => set("easyBonus", +v.toFixed(2))} format={pctF} /></Opt>
                        <Opt title="Modificador de intervalo" hint="SM-2: encurta ou alonga todos os intervalos"><Stepper label="Modificador de intervalo" value={p.ivlModifier} min={0.5} max={2} step={0.05} onChange={(v) => set("ivlModifier", +v.toFixed(2))} format={pctF} /></Opt>
                        <Opt title="Intervalo difícil" hint="SM-2: quanto o Difícil multiplica o intervalo"><Stepper label="Intervalo difícil" value={p.hardMult} min={1} max={2} step={0.05} onChange={(v) => set("hardMult", +v.toFixed(2))} format={pctF} /></Opt>
                        <Opt title="Novo intervalo" hint="SM-2: quanto do intervalo sobra depois de errar"><Stepper label="Novo intervalo" value={p.lapseIvl} min={0} max={1} step={0.05} onChange={(v) => set("lapseIvl", +v.toFixed(2))} format={pctF} /></Opt>
                        <li><div className="row fc-params">
                          <span className="row__main">
                            <span className="row__title">Agendamento personalizado <Badge tone="neutral">visual</Badge></span>
                            <span className="row__sub">No Anki, um trecho de JavaScript que mexe no agendamento. Aqui fica guardado, mas ainda não roda.</span>
                            <textarea className="fc-input fc-input--area fc-input--mono" rows={3} value={p.customScheduling} placeholder="// ex.: states.good.normal.review.scheduledDays *= 1.1" aria-label="Agendamento personalizado" onChange={(e) => set("customScheduling", e.target.value)} />
                          </span>
                        </div></li>
                      </ul>
                    </Section>

                    <ul className="list">
                      <li><button type="button" className="row row--icon cd-hoverable" onClick={() => setDlg("reset")}>
                        <span className="row__icon"><Icon name="rotate" size={20} /></span>
                        <span className="row__main"><span className="row__title">Restaurar os padrões</span><span className="row__sub">Volta esta predefinição às opções padrão</span></span>
                      </button></li>
                    </ul>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        </div>

        <aside className="cols__aside">
          <section className="panel fc-today-sum">
            <span className="fc-hero__eyebrow">Hoje neste baralho</span>
            <div className="fc-today-sum__nums num">
              <div><b>{num(Math.max(0, lim.newPerDay + t.extraNew - t.new))}</b><small>novos ainda cabem</small></div>
              <div><b>{num(d ? d.rev + d.learn : 0)}</b><small>para revisar</small></div>
              <div><b>≈ {num(minutesPerDay(p, { reviewsAhead: ahead, freshLeft: d?.fresh }))}</b><small>min por dia</small></div>
            </div>
            <p className="fc-help">{paused ? "Novos pausados. " : ""}{t.new || t.rev ? `${plural(t.new + t.rev, "card estudado", "cards estudados")} hoje.` : "Nada estudado hoje ainda."}</p>
          </section>
          <section className="panel">
            <span className="fc-hero__eyebrow">Como fica cada botão</span>
            <Simulation p={p} />
          </section>
        </aside>
      </div>

      <RetentionHelper p={p} open={helper} onClose={() => setHelper(false)} onPick={(r) => set("retention", r)} />
      <Dialog open={dlg === "reset"} onClose={() => setDlg(null)} confirmLabel="Restaurar" title="Restaurar os padrões?"
        onConfirm={() => { setPreset({ ...defaults(p.id, p.name) }); useDeckStore.getState().refresh(); toast({ icon: "rotate", text: "Opções padrão restauradas" }); }}>
        As opções de “{p.name}” voltam ao padrão. O agendamento dos cards já estudados não muda.
      </Dialog>
      <Dialog open={dlg === "remove"} onClose={() => setDlg(null)} destructive confirmLabel="Excluir" title={`Excluir “${p.name}”?`}
        onConfirm={() => { removePreset(p.id); useDeckStore.getState().refresh(); }}>
        Os baralhos que usam esta predefinição voltam para a Padrão.
      </Dialog>
      <Sheet open={!!nameSheet} onClose={() => setNameSheet(null)} title={nameSheet === "dup" ? "Duplicar predefinição" : "Renomear predefinição"} width={440}
        footer={<div className="cd-row" style={{ justifyContent: "flex-end" }}><Button variant="gray" onClick={() => setNameSheet(null)}>Cancelar</Button>
          <Button variant="filled" disabled={!name.trim()} onClick={() => {
            if (nameSheet === "dup") { const id = addPreset(p, name.trim()); usePreset(deck, id); } else setPreset({ ...p, name: name.trim() });
            setNameSheet(null); setSaved(Date.now());
          }}>{nameSheet === "dup" ? "Duplicar e usar" : "Salvar"}</Button></div>}>
        <label className="fc-field"><span className="fc-field__label">Nome</span><input className="fc-input" value={name} data-autofocus="" onChange={(e) => setName(e.target.value)} /></label>
      </Sheet>
    </Page>
  );
}
