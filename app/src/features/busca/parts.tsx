/* Peças da busca usadas na paleta, na página Busca e nas salvas: texto com o termo marcado,
   o marcador de salvar e o começo de uma sessão a partir de questões soltas. */
import { motion, useAnimationControls } from "motion/react";
import { getBank } from "../../data/bank";
import { useStore } from "../../state/store";
import type { SessionSource } from "../../state/store";
import { Icon } from "../../ds/Icon";
import { useToast } from "../../ds/overlay";
import { haptic, spring } from "../../lib/motion";
import { cx } from "../../lib/cx";
import { startList } from "../sessao/start";
import { examTag, marks } from "./search";

export function Marked({ text, ts }: { text: string; ts: string[] }) {
  return <>{marks(text, ts).map((p, i) => (p.m ? <mark key={i} className="hl">{p.t}</mark> : <span key={i}>{p.t}</span>))}</>;
}

/** uma questão (correção na hora) ou várias como lista; devolve o id da sessão */
export function startFound(ids: string[], title: string, source: SessionSource) {
  // questões soltas abertas antes pela busca não ficam "em andamento": respondidas viram resultado, as outras saem
  const st = useStore.getState();
  for (const s of Object.values(st.sessions)) {
    if (s.status !== "ativa" || s.qids.length !== 1 || (s.source.type !== "busca" && s.source.type !== "salvas")) continue;
    if (s.answers[s.qids[0]]?.checked) st.finishEarly(s.id); else st.removeSession(s.id);
  }
  if (ids.length === 1) {
    const q = getBank().byId[ids[0]];
    return startList({ ids, title: `${examTag(getBank(), q)} · Questão ${q.n}`, source, feedback: "imediato" });
  }
  return startList({ ids, title, source });
}

/** marcador de salvar: o ícone enche e dá um pulinho ao salvar */
export function SaveToggle({ qid, size = "md", withLabel }: { qid: string; size?: "sm" | "md"; withLabel?: boolean }) {
  const on = useStore((s) => !!s.saved[qid]);
  const toast = useToast();
  const ctl = useAnimationControls();
  const click = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (e.detail > 0) e.currentTarget.blur(); // com o mouse, o foco não fica no marcador (Enter segue respondendo)
    const now = useStore.getState().toggleSaved(qid);
    haptic("tick");
    if (now) ctl.start({ scale: [1, 1.32, 1], rotate: [0, -8, 0], transition: spring.bouncy });
    toast({ text: now ? "Questão salva." : "Questão tirada das salvas.", icon: "bookmark", duration: 2400 });
  };
  return (
    <button type="button" className={cx("bm cd-hoverable", size === "sm" && "bm--sm", withLabel && "bm--label")} data-on={on ? "" : undefined} aria-pressed={on}
      aria-label={withLabel ? undefined : on ? "Tirar das salvas" : "Salvar questão"} onClick={click}>
      <motion.span className="bm__icon" animate={ctl}><Icon name="bookmark" size={size === "sm" ? 18 : 20} /></motion.span>
      {withLabel ? <span>{on ? "Salva" : "Salvar"}</span> : null}
    </button>
  );
}
