/* Conferir gabarito e vídeos depois da prova (ou rever uma lista): a questão com a sua resposta e o gabarito,
   a explicação curta e o vídeo no ponto da questão. Erradas primeiro; dá para ver as marcadas ou todas.
   A barra mostra de onde veio (Resultado › Correção) e volta para o resultado. Para refazer as erradas, ver startRedo. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { fullQuestion, getBank, useBodies } from "../../data/bank";
import { useStore } from "../../state/store";
import { Button, SegmentedControl } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { useToast } from "../../ds/overlay";
import { useKey } from "../../lib/hooks";
import { isTyping } from "../../lib/motion";
import { num } from "../../lib/format";
import { useVideo } from "../video/VideoDock";
import { QuestionView } from "./QuestionView";
import { BodyWait } from "./BodyWait";
import { examLabelOf } from "./SessionPage";
import { sessionAnswers } from "./start";

type F = "erradas" | "marcadas" | "todas";

export function CorrecaoPage() {
  const { id = "" } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate(), toast = useToast();
  const s = useStore((x) => x.sessions[id]);
  const leitura = useStore((x) => x.settings.leitura);
  const markReviewed = useStore((x) => x.markReviewed);
  const { close: closeVideo } = useVideo();
  const b = getBank();
  const f = (sp.get("f") as F) || "erradas";
  const [i, setI] = useState(() => Math.max(0, Number(sp.get("i")) || 0));
  const [dir, setDir] = useState(1);
  useEffect(() => { if (!s) nav("/", { replace: true }); }, [s, nav]);
  useEffect(() => () => closeVideo(), [closeVideo]);

  const attempts = useStore((x) => x.attempts);
  const answers = useMemo(() => (s ? sessionAnswers(s, attempts) : {}), [s, attempts]);
  const lists = useMemo(() => {
    if (!s) return { erradas: [], marcadas: [], todas: [] } as Record<F, string[]>;
    const todas = s.qids;
    return { erradas: todas.filter((q) => !b.byId[q].an && answers[q]?.choice !== b.byId[q].g), marcadas: todas.filter((q) => s.marked[q]), todas };
  }, [s, b, answers]);
  const ids = lists[f];
  const body = useBodies(ids);
  const qid = ids[Math.min(i, ids.length - 1)];
  useEffect(() => { if (s && qid) markReviewed(s.id, qid); }, [s?.id, qid]); // eslint-disable-line

  const go = (n: number) => { if (n < 0 || n >= ids.length) return; setDir(n > i ? 1 : -1); setI(n); scrollTo({ top: 0 }); closeVideo(); };
  const done = () => { nav("/resultado/" + id, { replace: true }); toast({ text: "Correção concluída.", icon: "check" }); };
  useKey((e) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey) return;
    if (e.key === "ArrowRight") { e.preventDefault(); if (i < ids.length - 1) go(i + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
  });
  if (!s) return null;
  const q = qid && body.ready ? fullQuestion(qid) : null;
  const opts = ([["erradas", "Erradas"], ["marcadas", "Marcadas"], ["todas", "Todas"]] as const)
    .filter(([k]) => k !== "marcadas" || lists.marcadas.length)
    .map(([k, l]) => ({ value: k as F, label: <>{l} <span className="seg-count num">{num(lists[k].length)}</span></> }));
  return (
    <div className="focus cd-root">
      <header className="fbar">
        <button type="button" className="backlink cd-hoverable fbar__back" onClick={() => nav("/resultado/" + id)} aria-label={"Voltar ao resultado de " + s.title}>
          <Icon name="chevron-left" size={20} strokeWidth={2} /><span className="fbar__backtxt">Resultado</span>
        </button>
        <div className="fbar__mid">
          <nav className="ftrail" aria-label="Você está em">
            <span className="ftrail__up">{s.title}</span><Icon name="chevron-right" size={13} strokeWidth={2} className="ftrail__sep" />
            <span className="fbar__title">Gabarito e vídeos</span>
          </nav>
          {ids.length ? <span className="fbar__count num">{Math.min(i, ids.length - 1) + 1} de {ids.length}</span> : null}
        </div>
        <div className="fbar__tools" />
      </header>
      <div className="fsub"><SegmentedControl size="sm" aria-label="Quais questões" value={f} onChange={(v) => { setSp({ f: v }, { replace: true }); setI(0); }} options={opts} /></div>
      <main className="focus__main">
        {qid && b.byId[qid] && !q ? <BodyWait error={body.error} retry={body.retry} /> : q ? (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={qid} initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -16, transition: { duration: 0.12 } }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
              <QuestionView q={q} examLabel={examLabelOf(q)} choice={answers[qid]?.choice ?? null} struck={answers[qid]?.struck} reveal={{ fresh: false }} scale={leitura.scale} face={leitura.face}
                onCard={() => nav("/flashcards/novo?q=" + encodeURIComponent(qid))} community />
            </motion.div>
          </AnimatePresence>
        ) : <p className="empty-note">Nenhuma questão aqui.</p>}
      </main>
      <footer className="abar">
        <div className="abar__in">
          <Button variant="gray" icon="chevron-left" label="Anterior" disabled={i === 0} onClick={() => go(i - 1)} className="abar__prev" />
          <span />
          {i < ids.length - 1 ? <Button variant="filled" size="lg" iconEnd="chevron-right" onClick={() => go(i + 1)}>Próxima</Button>
            : <Button variant="filled" size="lg" onClick={done}>Concluir correção</Button>}
        </div>
      </footer>
    </div>
  );
}
