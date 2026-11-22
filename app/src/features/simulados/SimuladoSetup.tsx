/* Configurar a prova em dois modos claros:
   Simulado (cronometrado, como no dia; gabarito e vídeos ao final) ou Treino (sem pressa, correção a cada questão).
   Depois o formato: a prova original ou embaralhada (mesmo conteúdo, outros anos). */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Exam } from "../../data/types";
import { useStore } from "../../state/store";
import { Button, Stepper, Switch } from "../../ds/basics";
import { Sheet } from "../../ds/overlay";
import { Icon } from "../../ds/Icon";
import { duration, num, pace, shortDate } from "../../lib/format";
import { cx } from "../../lib/cx";
import { simDefaultMinutes, simQuestions, startSimulado } from "../sessao/start";
import { useBank } from "../../data/bank";
import { ProportionSheet, ProportionSummary } from "./ProportionSheet";

/** 20/10/2024 → 20 de outubro de 2024 */
function extensoDate(s: string) {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  const k = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return `${shortDate(k)} de ${m[3]}`;
}

export function Option({ on, icon, title, desc, onClick, children }: { on: boolean; icon: string; title: string; desc: React.ReactNode; onClick: () => void; children?: React.ReactNode }) {
  return (
    <div className={cx("opt", on && "is-on")}>
      <button type="button" role="radio" aria-checked={on} className="opt__btn cd-hoverable" onClick={onClick}>
        <span className="opt__icon" aria-hidden><Icon name={icon} size={22} /></span>
        <span className="opt__text"><span className="opt__title">{title}</span><span className="opt__desc">{desc}</span></span>
        <span className="opt__radio" aria-hidden><Icon name="check" size={14} strokeWidth={3} /></span>
      </button>
      {on && children ? <div className="opt__more">{children}</div> : null}
    </div>
  );
}

type Mode = "simulado" | "treino";

export function SimuladoSetup({ exam, open, onClose, planDay, formato: preset }: { exam: Exam | null; open: boolean; onClose: () => void; planDay?: string; formato?: "original" | "embaralhada" }) {
  const nav = useNavigate();
  // o padrão vem de Ajustes (correção nos simulados: ao final = Simulado, a cada questão = Treino)
  const fb = useStore((s) => s.settings.feedbackSimulado);
  const def: Mode = fb === "imediato" ? "treino" : "simulado";
  const [mode, setMode] = useState<Mode>(def);
  const [formato, setFormato] = useState<"original" | "embaralhada">(preset || "original");
  const [sameBanca, setSameBanca] = useState(false);
  const [timedTraining, setTimedTraining] = useState(false);
  const bank = useBank();
  const incluirTodas = useStore((s) => s.settings.incluirTodas);
  const [problematicas, setProblematicas] = useState(incluirTodas);
  const [anuladas, setAnuladas] = useState(false);
  const [editShares, setEditShares] = useState(false);
  const counts = useMemo(() => (exam ? { original: simQuestions(exam, "original", false, { problematicas, anuladas }).length, embaralhada: exam.total } : { original: 0, embaralhada: 0 }), [exam, problematicas, anuladas]);
  const extras = useMemo(() => {
    if (!exam || !bank) return { problem: 0, annulled: 0 };
    return { problem: (bank.byExam[exam.id] || []).filter((q) => !q.ok).length, annulled: (bank.annulledByExam[exam.id] || []).length };
  }, [exam, bank]);
  const n = counts[formato];
  const [minutes, setMinutes] = useState(300);
  useEffect(() => { if (exam) setMinutes(simDefaultMinutes(exam, n)); }, [exam, n]);
  useEffect(() => { if (open) { setMode(def); setFormato(preset || "original"); setTimedTraining(false); setProblematicas(incluirTodas); setAnuladas(false); } }, [open, preset, def, incluirTodas]);
  if (!exam) return null;
  const timed = mode === "simulado" || timedTraining;
  const start = () => {
    const id = startSimulado({ exam, formato, sameBanca, problematicas, anuladas, minutes: timed ? minutes : null, feedback: mode === "simulado" ? "final" : "imediato", planDay });
    onClose();
    nav("/sessao/" + id);
  };
  return (
    <Sheet open={open} onClose={onClose} title={exam.nome} subtitle={exam.aplicacao ? `Prova aplicada em ${extensoDate(exam.aplicacao)}` : undefined}
      footer={<Button variant="filled" size="lg" onClick={start} data-autofocus="">{mode === "simulado" ? "Começar simulado" : "Começar treino"}</Button>}>
      <div className="setup">
        <div className="setup__modes" role="radiogroup" aria-label="Modo">
          <button type="button" role="radio" aria-checked={mode === "simulado"} className="smode cd-hoverable" onClick={() => setMode("simulado")}>
            <span className="smode__icon" aria-hidden><Icon name="clock" size={22} /></span>
            <span className="smode__title">Simulado</span>
            <span className="smode__desc">Cronometrado, como no dia. Gabarito, explicação e vídeo depois de finalizar.</span>
          </button>
          <button type="button" role="radio" aria-checked={mode === "treino"} className="smode cd-hoverable" onClick={() => setMode("treino")}>
            <span className="smode__icon" aria-hidden><Icon name="check" size={22} /></span>
            <span className="smode__title">Treino</span>
            <span className="smode__desc">Sem pressa. A correção aparece logo depois de cada resposta.</span>
          </button>
        </div>
        <div className="setup__group" role="radiogroup" aria-label="Formato">
          <div className="setup__label">Formato</div>
          <Option on={formato === "original"} icon="exam" title="Prova original" desc={<><span className="num">{num(counts.original)}</span> questões, na ordem da prova</>} onClick={() => setFormato("original")} />
          <Option on={formato === "embaralhada"} icon="shuffle" title="Embaralhada" desc={<><span className="num">{num(counts.embaralhada)}</span> questões com o mesmo conteúdo, de outros anos</>} onClick={() => setFormato("embaralhada")}>
            <label className="setup__switch">
              <span>Só questões do {exam.banca}</span>
              <Switch checked={sameBanca} onChange={setSameBanca} label={`Só questões do ${exam.banca}`} />
            </label>
            <ProportionSummary banca={exam.banca} onEdit={() => setEditShares(true)} />
          </Option>
        </div>
        <div className="setup__group">
          <div className="setup__label">Questões</div>
          <div className="setup__time">
            <label className="setup__switch setup__switch--hint">
              <span>Incluir as problemáticas<small>{formato === "original" ? <><b className="num">{num(extras.problem)}</b> nesta prova: </> : null}gabarito discutido, sem vídeo ou desatualizadas.</small></span>
              <Switch checked={problematicas} onChange={setProblematicas} label="Incluir as problemáticas" />
            </label>
            <label className="setup__switch setup__switch--hint">
              <span>Incluir as anuladas<small>{formato === "original" ? <><b className="num">{num(extras.annulled)}</b> nesta prova. </> : null}Como no dia da prova: você só descobre no final, e elas não contam na nota.</small></span>
              <Switch checked={anuladas} onChange={setAnuladas} label="Incluir as anuladas" />
            </label>
          </div>
        </div>
        <div className="setup__group">
          <div className="setup__label">Tempo</div>
          <div className="setup__time">
            {mode === "treino" ? (
              <label className="setup__switch">
                <span>Cronometrar mesmo assim</span>
                <Switch checked={timedTraining} onChange={setTimedTraining} label="Cronometrar o treino" />
              </label>
            ) : null}
            <div aria-disabled={!timed || undefined} className={cx("setup__stepper", !timed && "is-off")}>
              <Stepper label="Tempo de prova" value={minutes} min={10} max={600} step={5} onChange={setMinutes} format={(v) => duration(v * 60)} />
              <span className="setup__pace">{!timed ? "Sem cronômetro" : <>cerca de <b className="num">{pace((minutes * 60) / Math.max(1, n))}</b> por questão</>}</span>
            </div>
          </div>
          <p className="setup__hint">
            {mode === "simulado" ? "Você não vê se acertou enquanto faz. No fim, refaz as que errou até acertar e confere gabarito e vídeos." : "Bom para estudar uma prova inteira: errou, já vê o porquê e o vídeo."}
          </p>
        </div>
      </div>
      <ProportionSheet banca={exam.banca} open={editShares} onClose={() => setEditShares(false)} />
    </Sheet>
  );
}
