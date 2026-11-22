/* Boas-vindas depois de entrar. Primeiro, como começar: com a IA que a pessoa já usa (ela monta o cronograma, até a partir
   de prints de outro app) ou com três perguntas aqui, uma por tela (prova-alvo e data, meta diária, fase; dá para pular),
   e o plano que elas desbloqueiam. Antes da 1ª questão, uma tela curta apresenta a ideia de conectar a IA, com um "Agora
   não" bem visível. O cronograma detalhado continua em /cronograma/novo. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useBank } from "../../data/bank";
import { makeDemo } from "../../data/demo";
import { buildSchedule } from "../../data/plan";
import { BANCAS } from "../../data/types";
import { Button } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Logo } from "../../ds/Logo";
import { ECG } from "../../ds/medical";
import { dayKey, diffDays, fromKey, monthName, num, plural, today } from "../../lib/format";
import type { DayKey } from "../../lib/format";
import { spring } from "../../lib/motion";
import { useAuth } from "../../state/auth";
import type { Fase } from "../../state/auth";
import { ConnectSteps, CopyButton, isConnected, usePluginSetup, usePluginStatus } from "../plugin/parts";
import { useStore } from "../../state/store";
import type { Plan } from "../../state/store";
import { computeStats } from "../../state/stats";
import { startDaily, startPlanDay } from "../sessao/start";

const DESC: Record<string, string> = {
  ENARE: "Ebserh, nacional", ENAMED: "Inep, vale no ENARE", "SUS-SP": "Secretaria de SP", "PSU-MG": "Minas Gerais", "PSU-GO": "Goiás", AMP: "Paraná",
  AMRIGS: "Rio Grande do Sul", "USP-SP": "FMUSP", "USP-RP": "Ribeirão Preto", UNIFESP: "Escola Paulista", "PSU-AL": "Alagoas", "SES-PE": "SUS-PE", "SES-DF": "Distrito Federal", Revalida: "Inep",
};
const FASES: { id: Fase; title: string; sub: string; icon: string }[] = [
  { id: "internato", title: "No internato", sub: "Estudo junto com os plantões e o rodízio", icon: "stethoscope" },
  { id: "formado", title: "Já formado", sub: "Foco total na prova de residência", icon: "target" },
  { id: "residente", title: "Já sou residente", sub: "Indo para uma especialidade (R+)", icon: "layers" },
];
const GOALS = [10, 20, 40, 60];
const MIN_PER_Q = 2.5;

/** o segundo domingo do mês: as provas de residência costumam cair num domingo */
function examDay(year: number, month: number): DayKey {
  const d = new Date(year, month, 8);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  return dayKey(d);
}
/** novembro que está a pelo menos 2 meses daqui */
function defaultWhen() {
  const t = fromKey(today());
  const y = t.getMonth() <= 8 ? t.getFullYear() : t.getFullYear() + 1;
  return { year: y, month: 10 };
}
const suggestedGoal = (days: number | null) => (days == null ? 20 : days > 270 ? 20 : days > 120 ? 40 : 60);

/** o que a IA faz, em três linhas, sem jargão */
const AI_CAN = [
  { icon: "calendar", title: "Organiza", text: "Monta e ajusta o seu cronograma e as suas listas, sempre com a sua confirmação." },
  { icon: "help", title: "Ensina a usar", text: "Pergunte como fazer qualquer coisa aqui, e ela explica e leva até o lugar certo." },
  { icon: "pulse", title: "Acha padrões", text: "Olha os seus erros e mostra onde você mais escorrega, e por quê." },
];

export function Welcome() {
  const nav = useNavigate();
  const bank = useBank()!;
  const user = useAuth((s) => s.user), saved = useAuth((s) => s.profile);
  const first = (user?.name || useStore.getState().settings.nome || "").split(/\s+/)[0];
  /** "escolha": como começar; "ia": conectar a IA; "perguntas": as 3 perguntas e o plano; "apresenta": a ideia da IA antes de começar */
  const [mode, setMode] = useState<"escolha" | "ia" | "perguntas" | "apresenta">("escolha");
  const [after, setAfter] = useState<"questao" | "hoje">("questao");
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const def = defaultWhen();
  const [bancas, setBancas] = useState<string[]>(saved?.bancas || []);
  const [year, setYear] = useState(saved?.prova ? fromKey(saved.prova).getFullYear() : def.year);
  const [month, setMonth] = useState(saved?.prova ? fromKey(saved.prova).getMonth() : def.month);
  const [unknown, setUnknown] = useState(false);
  const prova = unknown ? null : examDay(year, month);
  const daysLeft = prova ? diffDays(today(), prova) : null;
  const [meta, setMeta] = useState<number | null>(null);
  const goal = meta ?? suggestedGoal(daysLeft);
  const [fase, setFase] = useState<Fase | null>(saved?.fase || null);

  const available = useMemo(() => BANCAS.filter((b) => bank.exams.some((e) => e.banca === b)), [bank]);
  const perBanca = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of bank.exams) m.set(e.banca, (m.get(e.banca) || 0) + (bank.byExam[e.id] || []).filter((q) => q.ok).length);
    return m;
  }, [bank]);
  const t0 = fromKey(today());
  const years = [t0.getFullYear(), t0.getFullYear() + 1, t0.getFullYear() + 2];

  const draft: Plan | null = useMemo(() => {
    if (!prova || diffDays(today(), prova) < 7) return null;
    const banca = bancas[0] || "Outra";
    const d = fromKey(prova);
    return {
      banca, exame: `${banca === "Outra" ? "Prova" : banca} ${d.getFullYear() + (banca === "ENAMED" ? 0 : d.getMonth() >= 8 ? 1 : 0)}`,
      data: prova, inicio: today(), dias: [1, 2, 3, 4, 5, 6], meta: goal, simulado: { freq: diffDays(today(), prova) > 180 ? "quinzenal" : "semanal", dia: 6 }, ajustes: {}, resolvidoAte: null, criadoEm: Date.now(),
    };
  }, [prova, bancas, goal]);
  const sched = useMemo(() => (draft ? buildSchedule(draft, bank, null) : []), [draft, bank]);
  const studyDays = sched.filter((d) => d.kind === "estudo").length;
  const sims = sched.filter((d) => d.kind === "simulado").length;
  const mine = bancas.length ? bancas.reduce((s, b) => s + (perBanca.get(b) || 0), 0) : bank.all.filter((q) => q.ok).length;
  const coverage = mine ? Math.round((goal * studyDays / mine) * 100) : 0;

  const go = (d: number) => { setDir(d); setStep((s) => Math.max(0, Math.min(3, s + d))); };
  const toggle = (b: string) => setBancas((xs) => (xs.includes(b) ? xs.filter((x) => x !== b) : [...xs, b]));

  const commit = (withPlan: boolean) => {
    const st = useStore.getState();
    useAuth.getState().setProfile({ bancas, prova, fase });
    st.setSettings({ metaDiaria: goal, ...(st.settings.nome ? {} : first ? { nome: first } : {}) });
    if (withPlan && draft) st.setPlan(draft);
    st.finishOnboarding();
  };
  const firstQuestion = () => {
    commit(true);
    const st = useStore.getState();
    let id: string | null = null;
    if (st.plan) {
      const day = buildSchedule(st.plan, bank, computeStats(st.attempts, bank)).find((d) => d.key === today());
      if (day?.kind === "estudo") id = startPlanDay(day, Math.min(goal, 20));
    }
    nav("/sessao/" + (id || startDaily(Math.min(goal, 20))), { replace: true });
  };

  const steps = [
    // 0: prova-alvo e data
    <div className="onb__step" key="prova">
      {first ? <p className="onb__hello">Oi, {first}.</p> : null}
      <h1 className="onb__q">Para qual prova você está estudando?</h1>
      <p className="onb__why">Pode marcar mais de uma. As questões e os simulados dessas bancas vêm primeiro.</p>
      <div className="onb__bancas" role="group" aria-label="Bancas">
        {available.map((b) => {
          const on = bancas.includes(b);
          return (
            <button key={b} type="button" className="onb-opt cd-hoverable" aria-pressed={on} onClick={() => toggle(b)}>
              {on ? <span className="onb-opt__check" aria-hidden><Icon name="check" size={13} strokeWidth={3} /></span> : null}
              <b>{b}</b><span>{DESC[b] || ""} · {num(perBanca.get(b) || 0)} questões</span>
            </button>
          );
        })}
      </div>
      <div className="onb__when">
        <label htmlFor="onb-mes">Quando é a prova?</label>
        <select id="onb-mes" className="onb-select" value={month} disabled={unknown} onChange={(e) => setMonth(+e.target.value)} aria-label="Mês">
          {Array.from({ length: 12 }, (_, m) => <option key={m} value={m}>{monthName(m).charAt(0).toUpperCase() + monthName(m).slice(1)}</option>)}
        </select>
        <select className="onb-select" value={year} disabled={unknown} onChange={(e) => setYear(+e.target.value)} aria-label="Ano">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <label className="onb__unknown"><input type="checkbox" checked={unknown} onChange={(e) => setUnknown(e.target.checked)} />Ainda não sei a data</label>
      </div>
      {daysLeft != null && daysLeft < 7 ? <p className="onb__note">Essa data já passou ou está muito perto. Escolha a próxima prova.</p> : null}
    </div>,
    // 1: meta diária
    <div className="onb__step" key="meta">
      <h1 className="onb__q">Quantas questões por dia cabem na sua rotina?</h1>
      <p className="onb__why">{daysLeft != null && daysLeft >= 7 ? `Faltam ${num(daysLeft)} dias. ` : ""}Dá para mudar quando quiser; um dia mais curto ainda conta para a sequência.</p>
      <div className="onb__goals" role="radiogroup" aria-label="Questões por dia">
        {GOALS.map((g) => (
          <button key={g} type="button" role="radio" className="onb-opt cd-hoverable" aria-checked={goal === g} onClick={() => setMeta(g)}>
            {g === suggestedGoal(daysLeft) ? <span className="onb__tag">sugerido</span> : null}
            <b className="num">{g}</b><span>≈ {Math.round(g * MIN_PER_Q)} min</span>
          </button>
        ))}
      </div>
    </div>,
    // 2: fase
    <div className="onb__step" key="fase">
      <h1 className="onb__q">Em que fase você está?</h1>
      <p className="onb__why">Ajuda a dosar o ritmo nas semanas de plantão. Se preferir, pule.</p>
      <div className="onb__fases" role="radiogroup" aria-label="Fase">
        {FASES.map((f) => (
          <button key={f.id} type="button" role="radio" className="onb-opt cd-hoverable" aria-checked={fase === f.id} onClick={() => setFase(f.id)}>
            <Icon name={f.icon} size={22} /><div><b>{f.title}</b><span>{f.sub}</span></div>
          </button>
        ))}
      </div>
    </div>,
    // 3: o plano
    <div className="onb-plan" key="plano">
      <div className="onb-plan__hero">
        <span className="onb-plan__eyebrow">{bancas.length ? bancas.join(" · ") : "Todas as bancas"}{prova ? ` · ${monthName(fromKey(prova).getMonth())} de ${fromKey(prova).getFullYear()}` : ""}</span>
        {draft && daysLeft != null ? (
          <>
            <div className="onb-plan__big"><b className="num">{num(daysLeft)}</b><span>dias até a prova</span></div>
            <svg className="onb-plan__ecg" viewBox="0 0 288 34" preserveAspectRatio="none" aria-hidden>
              {[0, 1, 2].map((i) => <motion.path key={i} d={ECG} transform={`translate(${i * 96} 0)`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: 0.2 + i * 0.45, ease: [0.22, 1, 0.36, 1] }} />)}
            </svg>
            <p className="onb-plan__line"><b>{num(goal)} questões por dia</b>, em {num(studyDays)} dias de estudo, {coverage >= 100 ? <>passam por <b>todas as {num(mine)} questões</b> {bancas.length ? "das suas bancas" : "do banco"} e ainda sobra tempo para revisar os erros.</> : <>cobrem <b>~{coverage}%</b> das {num(mine)} questões {bancas.length ? "das suas bancas" : "do banco"} até lá.</>}</p>
          </>
        ) : (
          <>
            <div className="onb-plan__big"><b className="num">{num(goal)}</b><span>questões por dia</span></div>
            <p className="onb-plan__line">Sem data por enquanto: você começa pelas {num(mine)} questões {bancas.length ? "das suas bancas" : "do banco"} e monta o cronograma quando souber a data.</p>
          </>
        )}
      </div>
      {draft ? (
        <div className="onb-plan__facts">
          <div><b className="num">{num(studyDays)}</b><span>dias de estudo (seg a sáb)</span></div>
          <div><b className="num">{num(studyDays * goal)}</b><span>questões até a prova</span></div>
          <div><b className="num">{num(sims)}</b><span>{sims === 1 ? "simulado" : "simulados"}{draft.simulado.freq === "quinzenal" ? " quinzenais" : " aos sábados"}</span></div>
        </div>
      ) : null}
    </div>,
  ];

  const enterApp = () => { useStore.getState().finishOnboarding(); nav("/", { replace: true }); };

  if (mode === "escolha") return <StartChoice first={first} onIa={() => setMode("ia")} onAsk={() => setMode("perguntas")} />;
  if (mode === "ia") return <ConnectAi onBack={() => setMode("escolha")} onAsk={() => setMode("perguntas")} onDone={enterApp} />;
  if (mode === "apresenta") return <AiIntro onBack={() => setMode("perguntas")} onDone={() => { if (after === "questao") firstQuestion(); else { commit(true); nav("/", { replace: true }); } }} after={after} />;

  const last = step === 3;
  return (
    <div className="onb cd-root">
      <header className="onb__bar">
        <div><Button variant="plain" icon="chevron-left" label="Voltar" onClick={() => (step > 0 ? go(-1) : setMode("escolha"))} /></div>
        <div className="onb__progress" aria-label={`Passo ${Math.min(step + 1, 3)} de 3`}>{[0, 1, 2].map((i) => <i key={i} data-on={i <= step ? "" : undefined} />)}</div>
        <div>{!last ? <Button variant="plain" onClick={() => go(1)}>Pular</Button> : null}</div>
      </header>
      <main className="onb__main">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={step} custom={dir} initial={{ opacity: 0, x: 28 * dir }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 * dir }} transition={spring.smooth}>
            {steps[step]}
          </motion.div>
        </AnimatePresence>
        <div className="onb__foot">
          {!last ? (
            <Button variant="filled" size="lg" block disabled={step === 0 && !!daysLeft && daysLeft < 7} onClick={() => go(1)}>
              {step === 0 ? (bancas.length ? `Continuar com ${plural(bancas.length, "banca", "bancas")}` : "Continuar") : step === 2 && !fase ? "Ver meu plano" : "Continuar"}
            </Button>
          ) : (
            <>
              <Button variant="filled" size="lg" block iconEnd="chevron-right" onClick={() => { setAfter("questao"); setMode("apresenta"); }}>Começar pela 1ª questão</Button>
              <Button variant="gray" size="lg" block onClick={() => { setAfter("hoje"); setMode("apresenta"); }}>Ver meu Hoje</Button>
              <div className="onb-plan__links">
                <Button variant="plain" size="sm" onClick={() => { commit(false); nav("/cronograma/novo", { replace: true }); }}>Ajustar o cronograma em detalhe</Button>
                {import.meta.env.DEV ? <Button variant="plain" size="sm" onClick={() => { useStore.getState().load(makeDemo(bank)); nav("/", { replace: true }); }}>Ver com dados de exemplo</Button> : null}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------- a primeira tela: como começar ---------- */
function StartChoice({ first, onIa, onAsk }: { first: string; onIa: () => void; onAsk: () => void }) {
  return (
    <div className="onb cd-root">
      <header className="onb__bar"><div><Logo size={24} /></div></header>
      <main className="onb__main">
        <motion.div className="onb__step" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
          {first ? <p className="onb__hello">Oi, {first}.</p> : null}
          <h1 className="onb__q">Como você quer começar?</h1>
          <div className="onb-start">
            <button type="button" className="onb-opt onb-start__opt cd-hoverable" onClick={onIa}>
              <Icon name="sparkle" size={24} />
              <div><b>Configurar com a minha IA</b><span>Se você já usa ChatGPT, Claude ou outra, ela monta seu cronograma, até a partir de prints de outro app, e tudo com a sua confirmação.</span></div>
              <Icon name="chevron-right" size={18} className="onb-start__chev" />
            </button>
            <button type="button" className="onb-opt onb-start__opt cd-hoverable" onClick={onAsk}>
              <Icon name="questions" size={24} />
              <div><b>Responder 3 perguntas aqui</b><span>A prova, o ritmo e a sua fase. Leva um minuto e já mostra o seu plano.</span></div>
              <Icon name="chevron-right" size={18} className="onb-start__chev" />
            </button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

/* ---------- conectar a IA, dentro das boas-vindas ---------- */
function ConnectAi({ onBack, onAsk, onDone }: { onBack: () => void; onAsk: () => void; onDone: () => void }) {
  const { setup, error, retry } = usePluginSetup();
  const { status } = usePluginStatus();
  const connected = isConnected(status);
  return (
    <div className="onb cd-root">
      <header className="onb__bar"><div><Button variant="plain" icon="chevron-left" label="Voltar" onClick={onBack} /></div></header>
      <main className="onb__main">
        <motion.div className="onb__step" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
          <h1 className="onb__q">Conecte a sua IA</h1>
          <p className="onb__why">Depois é só conversar com ela. Conte como você estuda e qual app usava: dá até para mandar prints do seu cronograma.</p>
          {error ? (
            <div className="onb__note"><p>{error}</p><Button variant="gray" size="sm" onClick={retry}>Tentar de novo</Button></div>
          ) : setup ? (
            <div className="panel"><ConnectSteps setup={setup} connected={connected} /></div>
          ) : <div className="plg-loading" aria-busy="true"><span className="cd-spinner" aria-label="Carregando" /></div>}
          {connected ? <p className="onb__note">Continue a conversa com ela. O que ela criar aparece aqui, com um aviso.</p> : null}
        </motion.div>
        <div className="onb__foot">
          <Button variant={connected ? "filled" : "gray"} size="lg" block onClick={onDone}>{connected ? "Entrar no app" : "Entrar no app e terminar depois"}</Button>
          {!connected ? <Button variant="plain" onClick={onAsk}>Prefiro responder 3 perguntas aqui</Button> : null}
        </div>
      </main>
    </div>
  );
}

/* ---------- a ideia da plataforma, antes da 1ª questão ---------- */
function AiIntro({ onBack, onDone, after }: { onBack: () => void; onDone: () => void; after: "questao" | "hoje" }) {
  const { setup } = usePluginSetup();
  const [copied, setCopied] = useState(false);
  const go = after === "questao" ? "Continuar para a 1ª questão" : "Continuar para o Hoje";
  return (
    <div className="onb cd-root">
      <header className="onb__bar"><div><Button variant="plain" icon="chevron-left" label="Voltar" onClick={onBack} /></div></header>
      <main className="onb__main">
        <motion.div className="onb__step" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
          <h1 className="onb__q">Você pode conectar a sua IA aos seus estudos</h1>
          <p className="onb__why">Se você já usa ChatGPT, Claude ou outra, ela passa a enxergar o que você faz aqui.</p>
          <ul className="onb-ai">
            {AI_CAN.map((c, i) => (
              <motion.li key={c.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: 0.06 + i * 0.06 }}>
                <span className="onb-ai__icon" aria-hidden><Icon name={c.icon} size={20} /></span>
                <div><b>{c.title}</b><span>{c.text}</span></div>
              </motion.li>
            ))}
          </ul>
          {copied ? <p className="onb__note">Agora cole num chat novo da sua IA. Ela te guia no resto, e dá para fazer isso depois em Sua IA.</p> : null}
        </motion.div>
        <div className="onb__foot">
          {setup ? <CopyButton text={setup.prompts.normal} label="Copiar o prompt" size="lg" block title="O pedido para a sua IA" onCopied={() => setCopied(true)} /> : null}
          <Button variant="gray" size="lg" block onClick={onDone}>{copied ? go : "Agora não"}</Button>
        </div>
      </main>
    </div>
  );
}
