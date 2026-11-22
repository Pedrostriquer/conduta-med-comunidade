/* Montar uma lista com as questões de um assunto (ou de um bloco do resumo): o mesmo caminho de Questões
   (matchQuery → pick → startList), com novas/erradas/todas, quantidade e correção. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBank } from "../../data/bank";
import { matchQuery, pick } from "../../data/select";
import type { ListFilter } from "../../data/select";
import { useStore } from "../../state/store";
import type { Feedback } from "../../state/store";
import { useStats } from "../../state/stats";
import { Button, SegmentedControl, Stepper } from "../../ds/basics";
import { Sheet } from "../../ds/overlay";
import { Counter } from "../../ds/progress";
import { num, plural } from "../../lib/format";
import { startList } from "../sessao/start";

export type Practice = { title: string; subtitle?: string; ids: string[]; slug: string; bloco?: string };

export function PracticeSheet({ target, onClose }: { target: Practice | null; onClose: () => void }) {
  const nav = useNavigate();
  const bank = useBank()!;
  const st = useStats(bank);
  const settings = useStore((s) => s.settings);
  // a folha fecha com animação: guarda o último alvo para o conteúdo não sumir antes
  const [last, setLast] = useState<Practice | null>(target);
  useEffect(() => { if (target) setLast(target); }, [target]);
  const t = target || last;
  const [status, setStatus] = useState<ListFilter>("novas");
  const [n, setN] = useState(20);
  const [feedback, setFeedback] = useState<Feedback>(settings.feedbackLista);

  const by = useMemo(() => {
    const ids = t?.ids || [];
    const of = (filter: ListFilter) => matchQuery(bank, settings.incluirTodas, { only: ids, filter }, st);
    return { novas: of("novas"), erradas: of("erradas"), todas: of("todas") };
  }, [t, bank, settings.incluirTodas, st]);
  // ao abrir: novas se houver; senão, todas
  useEffect(() => { if (target) { setStatus(by.novas.length ? "novas" : "todas"); setN(20); setFeedback(settings.feedbackLista); } }, [target]); // eslint-disable-line

  const avail = by[status], count = avail.length, take = Math.min(n, count);
  const start = () => {
    if (!t || !take) return;
    const sid = startList({ ids: pick(avail, take), title: t.title, source: { type: "assunto", slug: t.slug, ...(t.bloco ? { bloco: t.bloco } : {}) }, feedback });
    onClose();
    nav("/sessao/" + sid);
  };
  const opt = (value: ListFilter, label: string) => ({ value, label: <>{label} <span className="seg-count num">{num(by[value].length)}</span></> });

  return (
    <Sheet open={!!target} onClose={onClose} title="Fazer questões" subtitle={t?.subtitle ? `${t.title} · ${t.subtitle}` : t?.title} width={460} className="as-sheet"
      footer={<Button variant="filled" size="lg" block disabled={!take} onClick={start}>{take ? `Começar ${plural(take, "questão", "questões")}` : "Nenhuma questão aqui"}</Button>}>
      <div className="qsum as-practice">
        <div className="qsum__count" aria-live="polite">
          <span className="qsum__big"><Counter value={count} duration={0.36} /></span>
          <span className="qsum__cap">{count === 1 ? "questão disponível" : "questões disponíveis"}</span>
        </div>
        <SegmentedControl block aria-label="Quais questões" value={status} onChange={setStatus} options={[opt("novas", "Novas"), opt("erradas", "Erradas"), opt("todas", "Todas")]} />
        <div className="qsum__row">
          <span className="qsum__label">Quantidade</span>
          <Stepper label="Quantidade de questões" value={Math.min(n, Math.max(5, count))} min={5} max={Math.max(5, Math.min(100, count))} step={5} onChange={setN} />
        </div>
        <div className="qsum__row">
          <span className="qsum__label">Correção</span>
          <SegmentedControl size="sm" aria-label="Correção" value={feedback} onChange={setFeedback} options={[{ value: "imediato", label: "Na hora" }, { value: "final", label: "No final" }]} />
        </div>
      </div>
    </Sheet>
  );
}
