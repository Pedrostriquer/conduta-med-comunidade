/* Montar (ou editar) o cronograma em cinco perguntas. No fim, o plano aparece com os números que importam. */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useBank } from "../../data/bank";
import { buildSchedule } from "../../data/plan";
import { BANCAS } from "../../data/types";
import { useStore } from "../../state/store";
import type { Plan } from "../../state/store";
import { useStats } from "../../state/stats";
import { Button, Chip, SegmentedControl, Stepper } from "../../ds/basics";
import { Counter } from "../../ds/progress";
import { Pulse } from "../../ds/medical";
import { Icon } from "../../ds/Icon";
import { addDays, cap, diffDays, duration, fromKey, longDate, num, plural, today, weekdayName, weekdayShort } from "../../lib/format";
import type { DayKey } from "../../lib/format";
import { spring } from "../../lib/motion";
import { cx } from "../../lib/cx";
import { Month } from "./Calendar";

const STEPS = ["prova", "data", "dias", "ritmo", "simulados"] as const;
type Step = (typeof STEPS)[number];

const BANCA_DESC: Record<string, string> = { ENARE: "Exame nacional da Ebserh", ENAMED: "Prova do Inep, vale para o ENARE", "SUS-SP": "Residência da Secretaria de SP", "PSU-MG": "Seleção unificada de Minas Gerais", "PSU-GO": "Seleção unificada de Goiás (AGRM/AREMG)", AMP: "Exame da Associação Médica do Paraná", AMRIGS: "Prova unificada do Sul (AMRIGS, Fundatec)", "USP-SP": "Residência da FMUSP (FUVEST)", "USP-RP": "Residência do HC de Ribeirão Preto", UNIFESP: "Residência da Escola Paulista de Medicina", "PSU-AL": "Seleção unificada de Alagoas (Strix)", "SES-PE": "Residência do SUS-PE (IAUPE)", "SES-DF": "Residência da SES do Distrito Federal (IADES)", Revalida: "Prova do Inep, no formato do ENAMED", Outra: "Usa todas as provas do banco" };

export function PlanWizard() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const editing = sp.get("editar") === "1";
  const bank = useBank()!;
  const st = useStats(bank);
  const store = useStore();
  const prev = editing ? store.plan : null;
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [banca, setBanca] = useState<string>(prev?.banca || "");
  const [data, setData] = useState<DayKey | null>(prev?.data || null);
  const [dias, setDias] = useState<number[]>(prev?.dias || [1, 2, 3, 4, 5, 6]);
  const [meta, setMeta] = useState(prev?.meta || 40);
  const [freq, setFreq] = useState<Plan["simulado"]["freq"]>(prev?.simulado.freq || "semanal");
  const [simDia, setSimDia] = useState(prev?.simulado.dia ?? 6);
  const [phase, setPhase] = useState<"ask" | "making" | "made">("ask");
  const t = today();

  const draft: Plan | null = useMemo(() => (banca && data ? {
    banca, exame: `${banca === "Outra" ? "Prova" : banca} ${fromKey(data).getFullYear() + (banca === "ENAMED" ? 0 : fromKey(data).getMonth() >= 8 ? 1 : 0)}`,
    data, inicio: prev?.inicio && prev.inicio <= t ? prev.inicio : t, dias, meta, simulado: { freq, dia: simDia },
    ajustes: prev?.ajustes || {}, resolvidoAte: prev?.resolvidoAte || null, criadoEm: prev?.criadoEm || Date.now(),
  } : null), [banca, data, dias, meta, freq, simDia, prev, t]);
  const sched = useMemo(() => (draft ? buildSchedule({ ...draft, inicio: t }, bank, st) : []), [draft, bank, st, t]);
  const studyDays = sched.filter((d) => d.kind === "estudo").length;
  const simCount = sched.filter((d) => d.kind === "simulado").length;
  const total = studyDays * meta;

  const cur: Step = STEPS[step];
  const can = cur === "prova" ? !!banca : cur === "data" ? !!data : cur === "dias" ? dias.length > 0 : true;
  const go = (d: number) => {
    if (d > 0 && step === STEPS.length - 1) {
      setPhase("making");
      setTimeout(() => setPhase("made"), 1400);
      return;
    }
    setDir(d); setStep(Math.max(0, Math.min(STEPS.length - 1, step + d)));
  };
  const save = (more?: boolean) => {
    if (!draft) return;
    store.setPlan(draft);
    if (!store.onboarded) store.finishOnboarding();
    nav(more ? "/cronograma?ajustar=1" : "/cronograma", { replace: true });
  };
  const close = () => (store.onboarded ? nav(-1) : nav("/boas-vindas", { replace: true }));

  if (phase !== "ask" && draft) {
    return (
      <div className="focus wizard cd-root">
        <main className="wizard__made">
          <AnimatePresence mode="wait">
            {phase === "making" ? (
              <motion.div key="m" className="wizard__making" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.16 } }}>
                <Pulse size={120} label="Montando o cronograma" />
                <p>Montando seu cronograma…</p>
              </motion.div>
            ) : (
              <motion.div key="d" className="wizard__done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
                <span className="cd-done-mark"><svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
                <h1>Seu cronograma está pronto</h1>
                <p className="wizard__sub">{draft.exame} · {cap(longDate(draft.data, true))}</p>
                <div className="wizard__nums">
                  <div><b><Counter value={studyDays} from={0} /></b><span>dias de estudo</span></div>
                  <div><b><Counter value={total} from={0} /></b><span>questões</span></div>
                  <div><b><Counter value={simCount} from={0} /></b><span>simulados</span></div>
                </div>
                <p className="wizard__how">Os temas seguem o que mais cai {banca === "Outra" ? "nas provas do banco" : `no ${banca}`}, alternando as áreas. Depois de passar por todos, o plano volta aos que você mais erra. Se um dia ficar para trás, você escolhe como recuperar.</p>
                <div className="wizard__actions">
                  <Button variant="filled" size="lg" onClick={() => save()} data-autofocus="">Ver cronograma</Button>
                  <Button variant="plain" onClick={() => save(true)}>Personalizar: horas, plantões, férias, flashcards</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    );
  }

  const daysLeft = data ? diffDays(t, data) : 0;
  return (
    <div className="focus wizard cd-root">
      <header className="fbar">
        <Button variant="plain" icon={step ? "chevron-left" : "x"} label={step ? "Voltar" : "Fechar"} className="fbar__close" onClick={() => (step ? go(-1) : close())} />
        <div className="fbar__mid"><div className="wizard__dots" aria-label={`Passo ${step + 1} de ${STEPS.length}`}>{STEPS.map((s, i) => <i key={s} data-on={i <= step ? "" : undefined} />)}</div></div>
        <div className="fbar__tools" />
      </header>
      <main className="focus__main wizard__main">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.section key={cur} className="wizard__step" custom={dir}
            initial={{ opacity: 0, x: dir * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -30, transition: { duration: 0.14 } }} transition={spring.smooth}>
            {cur === "prova" ? (
              <>
                <h1 className="wizard__q">Para qual prova você está estudando?</h1>
                <div className="wizard__opts" role="radiogroup">
                  {[...BANCAS, "Outra"].map((b) => {
                    const n = bank.exams.filter((e) => b === "Outra" || e.banca === b).length;
                    return (
                      <button key={b} type="button" role="radio" aria-checked={banca === b} className="bigopt cd-hoverable" onClick={() => setBanca(b)}>
                        <span className="bigopt__title">{b}</span>
                        <span className="bigopt__sub">{BANCA_DESC[b]}{b !== "Outra" ? ` · ${plural(n, "prova", "provas")} no banco` : ""}</span>
                        <span className="opt__radio" aria-hidden><Icon name="check" size={14} strokeWidth={3} /></span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
            {cur === "data" ? (
              <>
                <h1 className="wizard__q">Quando é a prova?</h1>
                <p className="wizard__lead">{data ? <><b>{cap(longDate(data, true))}</b> · faltam <b className="num">{daysLeft}</b> dias</> : "Escolha o dia no calendário."}</p>
                <div className="panel wizard__cal"><Month value={data} onPick={setData} min={addDays(t, 7)} max={addDays(t, 540)} initial={data || addDays(t, 45)} label="Data da prova" /></div>
              </>
            ) : null}
            {cur === "dias" ? (
              <>
                <h1 className="wizard__q">Em quais dias você estuda?</h1>
                <p className="wizard__lead">Nos outros, o plano deixa folga.</p>
                <div className="wdays" role="group" aria-label="Dias da semana">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                    const on = dias.includes(d);
                    return (
                      <button key={d} type="button" aria-pressed={on} className="wday cd-hoverable" onClick={() => setDias(on ? dias.filter((x) => x !== d) : [...dias, d].sort())} aria-label={weekdayName(d)}>
                        {weekdayShort(d)}
                      </button>
                    );
                  })}
                </div>
                <div className="chips">
                  <Chip pressed={dias.join() === "1,2,3,4,5"} onChange={() => setDias([1, 2, 3, 4, 5])}>Segunda a sexta</Chip>
                  <Chip pressed={dias.join() === "1,2,3,4,5,6"} onChange={() => setDias([1, 2, 3, 4, 5, 6])}>Segunda a sábado</Chip>
                  <Chip pressed={dias.length === 7} onChange={() => setDias([0, 1, 2, 3, 4, 5, 6])}>Todos</Chip>
                </div>
              </>
            ) : null}
            {cur === "ritmo" ? (
              <>
                <h1 className="wizard__q">Quantas questões por dia?</h1>
                <p className="wizard__lead">Conte uns 2 min e meio por questão, com a correção.</p>
                <div className="panel wizard__ritmo">
                  <Stepper label="Questões por dia" value={meta} min={10} max={150} step={5} onChange={setMeta} />
                  <span className="wizard__est">cerca de <b>{duration(meta * 150)}</b> por dia</span>
                </div>
                <div className="chips">{[20, 30, 40, 60, 80].map((v) => <Chip key={v} pressed={meta === v} onChange={() => setMeta(v)}>{v}</Chip>)}</div>
                <p className="wizard__sum">Até a prova: <b className="num">{num(total)}</b> questões em <b className="num">{studyDays}</b> dias de estudo.</p>
              </>
            ) : null}
            {cur === "simulados" ? (
              <>
                <h1 className="wizard__q">E os simulados?</h1>
                <p className="wizard__lead">Prova inteira, no tempo da prova. No dia do simulado não há questões avulsas.</p>
                <SegmentedControl block aria-label="Frequência" value={freq} onChange={setFreq} options={[{ value: "semanal", label: "Toda semana" }, { value: "quinzenal", label: "A cada duas" }, { value: "nenhum", label: "Sem simulado" }]} />
                <div className={cx("wizard__simday", freq === "nenhum" && "is-off")}>
                  <div className="setup__label">Em qual dia</div>
                  <div className="wdays" role="radiogroup" aria-label="Dia do simulado">
                    {[1, 2, 3, 4, 5, 6, 0].filter((d) => dias.includes(d)).map((d) => (
                      <button key={d} type="button" role="radio" aria-checked={simDia === d} className="wday cd-hoverable" disabled={freq === "nenhum"} onClick={() => setSimDia(d)} aria-label={weekdayName(d)}>{weekdayShort(d)}</button>
                    ))}
                  </div>
                </div>
                <p className="wizard__sum">{freq === "nenhum" ? "Sem simulados no plano." : <><b className="num">{simCount}</b> simulados até a prova, com mais um por semana na reta final.</>}</p>
              </>
            ) : null}
          </motion.section>
        </AnimatePresence>
      </main>
      <footer className="abar">
        <div className="abar__in abar__in--end">
          <Button variant="filled" size="lg" disabled={!can} onClick={() => go(1)} iconEnd={step < STEPS.length - 1 ? "chevron-right" : undefined}>{step < STEPS.length - 1 ? "Continuar" : editing ? "Atualizar cronograma" : "Montar cronograma"}</Button>
        </div>
      </footer>
    </div>
  );
}
