/* Uma questão pelo endereço (/questao/ID): é para onde levam os links da IA, dos resumos e dos comentários.
   Quem já respondeu vê a última resposta, a explicação e a comunidade; quem não respondeu começa uma lista de uma questão. */
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getBank, useFullQuestion } from "../../data/bank";
import { Button } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { useStore } from "../../state/store";
import { useVideo } from "../video/VideoDock";
import { QuestionView } from "./QuestionView";
import { BodyWait } from "./BodyWait";
import { examLabelOf } from "./SessionPage";
import { startList } from "./start";

export function QuestaoPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const q = getBank().byId[id];
  const body = useFullQuestion(q ? id : null);
  const attempts = useStore((s) => s.attempts), leitura = useStore((s) => s.settings.leitura);
  const last = useMemo(() => attempts.filter((a) => a.qid === id).reduce<(typeof attempts)[number] | null>((m, a) => (!m || a.at > m.at ? a : m), null), [attempts, id]);
  const { close } = useVideo();
  const back = () => { close(); if (history.length > 1) nav(-1); else nav("/questoes"); };
  const answer = () => {
    const sid = startList({ ids: [id], title: q ? `${examLabelOf(q)} · Questão ${q.n}` : "Questão", source: { type: "busca", query: id }, feedback: "imediato" });
    nav("/sessao/" + sid);
  };
  return (
    <div className="focus cd-root">
      <header className="fbar">
        <button type="button" className="backlink cd-hoverable fbar__back" onClick={back} aria-label="Voltar">
          <Icon name="chevron-left" size={20} strokeWidth={2} /><span className="fbar__backtxt">Voltar</span>
        </button>
        <div className="fbar__mid"><span className="fbar__title">{q ? `${examLabelOf(q)} · Questão ${q.n}` : "Questão"}</span></div>
        <div className="fbar__tools" />
      </header>
      <main className="focus__main">
        {q && !body.q ? <BodyWait error={body.error} retry={body.retry} /> : q && body.q ? (
          <QuestionView q={body.q} examLabel={examLabelOf(q)} choice={last?.choice ?? null} reveal={last ? { fresh: false } : null} scale={leitura.scale} face={leitura.face}
            onCard={last ? () => nav("/flashcards/novo?q=" + encodeURIComponent(id)) : undefined} community={!!last} />
        ) : <p className="empty-note">Essa questão não está mais no banco.</p>}
      </main>
      {q ? (
        <footer className="abar">
          <div className="abar__in">
            <span />
            <Button variant={last ? "gray" : "filled"} size="lg" onClick={answer}>{last ? "Responder de novo" : "Responder esta questão"}</Button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
