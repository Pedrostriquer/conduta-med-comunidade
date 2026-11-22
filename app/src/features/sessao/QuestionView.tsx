/* A questão: enunciado (Literata, como o caderno de prova), tabela, imagem, alternativas e, depois de responder,
   o resultado, a explicação curta, a resolução completa (quando o assunto tem: ver Resolucao.tsx) e a correção em vídeo. Sem a classificação do tema enquanto se responde.
   Riscar alternativa: botão, clique direito ou toque longo. Depois de responder: autoavaliação (quando a questão volta)
   e "Criar flashcard". */
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { FullQuestion } from "../../data/types";
import { Alternative } from "../../ds/Alternative";
import type { AltResult } from "../../ds/Alternative";
import { Icon } from "../../ds/Icon";
import { spring } from "../../lib/motion";
import { VideoCard } from "../video/VideoDock";
import { RETURN_DAYS, useStore } from "../../state/store";
import type { Confidence } from "../../state/store";
import { Button } from "../../ds/basics";
import { cx } from "../../lib/cx";
import { SaveToggle } from "../busca/parts";
import { NoteSheet } from "../busca/NoteSheet";
import { FlagButton } from "../comunidade/FlagSheet";
import { QuestionCommunity } from "../comunidade/QuestionCommunity";
import { Resolucao } from "./Resolucao";

export type Reveal = null | { fresh: boolean };

const CONF: Record<"right" | "wrong", { k: Confidence; label: string }[]> = {
  right: [{ k: "sabia", label: "Sabia" }, { k: "chutei", label: "Chutei" }],
  wrong: [{ k: "naosabia", label: "Não sabia" }, { k: "distracao", label: "Foi distração" }],
};

/** autoavaliação depois de responder: agenda a volta da questão (Sabia 21 dias, Chutei ou distração 7, Não sabia 2) */
function ConfidenceRow({ qid, right }: { qid: string; right: boolean }) {
  const cur = useStore((s) => s.reviews[qid]?.kind ?? null), rate = useStore((s) => s.rate);
  const opts = CONF[right ? "right" : "wrong"];
  const picked = opts.find((o) => o.k === cur);
  return (
    <div className="qconf" role="group" aria-label="Como foi responder esta questão?">
      <span className="qconf__label">Como foi?</span>
      {opts.map((o) => (
        <button key={o.k} type="button" className="qconf__opt cd-hoverable" aria-pressed={cur === o.k}
          onClick={(e) => { if (e.detail > 0) e.currentTarget.blur(); rate(qid, cur === o.k ? null : o.k); }}>{o.label}</button>
      ))}
      <span className="qconf__note">{picked ? `Volta em ${RETURN_DAYS[picked.k]} dias para revisar.` : right ? "Se chutou, ela volta antes." : "Ela volta para você refazer."}</span>
    </div>
  );
}

function Table({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows;
  return (
    <div className="qv__table-wrap">
      <table className="qv__table">
        <thead><tr>{head.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
        <tbody>{body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Figure({ src }: { src: string }) {
  const [open, setOpen] = useState(false);
  // as figuras do Conduta vêm como "img/..." e as do acervo como "/img/acervo/..."
  const url = src.startsWith("/") ? src : "/" + src;
  return (
    <>
      <button type="button" className="qv__figure" onClick={() => setOpen(true)} aria-label="Ampliar imagem">
        <motion.img layoutId={"img-" + src} src={url} alt="" transition={spring.smooth} />
        <span className="qv__zoom" aria-hidden><Icon name="expand" size={16} /></span>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div className="lightbox" onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.24 }}
            role="dialog" aria-label="Imagem ampliada" onKeyDown={(e) => e.key === "Escape" && setOpen(false)} tabIndex={-1}>
            <motion.img layoutId={"img-" + src} src={url} alt="" transition={spring.smooth} />
            <span className="lightbox__hint">Toque para fechar</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function QuestionView({ q, choice, struck = [], reveal, onSelect, onStrike, scale = 1, face = "serif", examLabel, confidence, onCard, community }: {
  q: FullQuestion; choice: string | null; struck?: string[]; reveal: Reveal;
  onSelect?: (l: string) => void; onStrike?: (l: string) => void; scale?: number; face?: "serif" | "sans"; examLabel: string;
  /** mostrar a autoavaliação depois de responder */
  confidence?: boolean;
  /** "Criar flashcard" depois de responder */
  onCard?: () => void;
  /** comentários, avisos e etiquetas depois de responder (em simulado, só na correção) */
  community?: boolean;
}) {
  const letters = Object.keys(q.a);
  const note = useStore((s) => s.notes[q.id]);
  const [noting, setNoting] = useState(false);
  // aberta com o mouse, a folha não devolve o foco ao botão (senão Enter reabriria em vez de responder)
  const byMouse = useRef(false);
  const openNote = (e: React.MouseEvent) => { byMouse.current = e.detail > 0; setNoting(true); };
  const closeNote = () => { setNoting(false); if (byMouse.current) setTimeout(() => (document.activeElement as HTMLElement | null)?.blur(), 40); };
  const answered = !!reveal;
  // toque longo numa alternativa risca (no celular não há clique direito); o toque que segue não marca
  const press = useRef<{ t: number; x: number; y: number; fired: boolean } | null>(null), touch = useRef(false);
  const pdown = (e: React.PointerEvent<HTMLDivElement>) => {
    touch.current = e.pointerType === "touch";
    if (!touch.current || answered || !onStrike) return;
    const alt = (e.target as HTMLElement).closest(".cd-alt");
    if (!alt || (e.target as HTMLElement).closest(".cd-alt__strike")) return;
    const i = [...e.currentTarget.querySelectorAll(".cd-alt")].indexOf(alt);
    const L = letters[i];
    const rec = { t: 0, x: e.clientX, y: e.clientY, fired: false };
    rec.t = window.setTimeout(() => { rec.fired = true; onStrike(L); navigator.vibrate?.(8); }, 480);
    press.current = rec;
  };
  const pclear = () => { if (press.current) window.clearTimeout(press.current.t); };
  const pmove = (e: React.PointerEvent) => { const p = press.current; if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) pclear(); };
  const swallowClick = (e: React.MouseEvent) => { if (press.current?.fired) { e.stopPropagation(); e.preventDefault(); press.current = null; } };
  const right = choice === q.g;
  const tone = q.an ? "warning" : right ? "success" : "danger";
  const title = q.an ? "Questão anulada pela banca. Não conta na nota." : right ? "Você acertou." : choice ? `Você errou. Gabarito: ${q.g}.` : `Em branco. Gabarito: ${q.g}.`;
  const arrows = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!d || answered || !onSelect) return;
    e.preventDefault();
    const i = letters.indexOf(choice || letters[0]), n = (i + d + letters.length) % letters.length;
    onSelect(letters[n]);
    e.currentTarget.querySelectorAll<HTMLElement>(".cd-alt")[n]?.focus();
  };
  return (
    <article className="qv cd-root" data-face={face} style={{ "--reading-scale": scale } as React.CSSProperties} aria-label={`${examLabel}, questão ${q.n}`}>
      <div className="qv__head">
        <div className="qv__meta">{examLabel}<span aria-hidden>·</span><span className="num">Questão {q.n}</span></div>
        <div className="qv__acts">
          <button type="button" className="bm cd-hoverable" data-on={note ? "" : undefined} aria-label={note ? "Editar anotação" : "Anotar questão"} onClick={openNote}>
            <span className="bm__icon"><Icon name="note" size={20} /></span>
          </button>
          <SaveToggle qid={q.id} />
          <FlagButton qid={q.id} subtitle={`${examLabel} · Questão ${q.n}`} />
        </div>
      </div>
      <p className="qv__stem">{q.e}</p>
      {q.t?.map((rows, i) => <Table key={i} rows={rows} />)}
      {q.i?.map((src) => <Figure key={src} src={src} />)}
      <div className="cd-alts qv__alts" role="radiogroup" aria-label="Alternativas" onKeyDown={arrows} data-fresh={reveal?.fresh ? "" : undefined}
        onPointerDown={pdown} onPointerUp={pclear} onPointerCancel={pclear} onPointerMove={pmove} onClickCapture={swallowClick}
        onContextMenuCapture={(e) => { if (touch.current) { e.preventDefault(); e.stopPropagation(); } }}>
        {letters.map((L) => {
          const res: AltResult = !answered ? null : q.an ? "other" : L === q.g ? "correct" : L === choice ? "wrong" : "other";
          const tag = !answered ? null : L === q.g ? (L === choice ? "Sua resposta" : "Gabarito") : L === choice ? "Sua resposta" : null;
          return (
            <Alternative key={L} letter={L} checked={choice === L} struck={struck.includes(L)} result={res} tag={tag}
              tabIndex={answered ? -1 : choice ? (choice === L ? 0 : -1) : L === letters[0] ? 0 : -1}
              onSelect={onSelect ? (x) => onSelect(x) : undefined} onStrike={onStrike}>
              {q.a[L]}
            </Alternative>
          );
        })}
      </div>
      <div className="cd-reveal" data-open={answered ? "" : undefined} aria-hidden={!answered}>
        <div>
          {answered ? (
            <>
              <div className="cd-q__result qv__result" data-tone={tone} role="status" tabIndex={-1}>
                <span className="cd-q__result-icon"><Icon name={q.an ? "alert" : right ? "check" : "x"} size={16} strokeWidth={2.5} /></span>
                <div><div className="cd-q__result-title">{title}</div></div>
              </div>
              {q.x ? (
                <div className="cd-q__why">
                  <h3>{q.an ? "Sobre esta questão" : `Por que ${q.g}`}</h3>
                  <p>{q.x}</p>
                </div>
              ) : null}
              {q.as ? <Resolucao key={"rz:" + q.id} q={q} choice={choice} examLabel={examLabel} /> : null}
              {!q.x && !q.as && !q.v && !q.an ? (
                <p className="qv__nores"><Icon name="clock" size={15} />Esta questão ainda não tem resolução nem correção em vídeo. As resoluções estão chegando assunto por assunto.</p>
              ) : null}
              {confidence && choice && !q.an ? <ConfidenceRow qid={q.id} right={right} /> : null}
              {onCard && !q.an ? (
                <div className={cx("qv__after")}>
                  <Button variant="gray" size="sm" icon="cards" onClick={onCard}>Criar flashcard</Button>
                  {!note ? <Button variant="plain" size="sm" icon="note" onClick={openNote}>Anotar</Button> : null}
                </div>
              ) : null}
              {note ? (
                <button type="button" className="qnote cd-hoverable" onClick={openNote} aria-label="Sua anotação. Editar">
                  <span className="qnote__label"><Icon name="note" size={15} />Sua anotação</span>
                  <span className="qnote__text">{note.text}</span>
                </button>
              ) : null}
              {q.v ? <div className="qv__video"><VideoCard clip={{ id: q.v.id, s: q.v.s, f: q.v.f, channel: q.v.c, title: `${examLabel} · Questão ${q.n}` }} /></div> : null}
              {community ? <QuestionCommunity key={q.id} qid={q.id} /> : null}
            </>
          ) : null}
        </div>
      </div>
      <NoteSheet qid={q.id} open={noting} onClose={closeNote} subtitle={`${examLabel} · Questão ${q.n}`} />
    </article>
  );
}
