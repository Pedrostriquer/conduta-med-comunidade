/* O que aparece no meio do texto: imagem com legenda e alça, bloco colorido e o chip de questão.
   São os mesmos na edição e na leitura; só a edição mostra os controles. */
import { useRef, useState } from "react";
import { NodeSelection } from "@tiptap/pm/state";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useNavigate } from "react-router-dom";
import { getBank, useBank } from "../../../data/bank";
import { Icon } from "../../../ds/Icon";
import { useToast } from "../../../ds/overlay";
import { cx } from "../../../lib/cx";
import { examTag } from "../../busca/search";
import { Glyph } from "../glyphs";
import { anchorOf, Menu } from "../Menu";
import type { Anchor } from "../Menu";
import { CALLOUT_TONES } from "./sanitize";
import type { CalloutTone } from "./sanitize";

/* ---------- Imagem ---------- */
export function FigureView({ node, editor, updateAttributes, selected, deleteNode, getPos }: NodeViewProps) {
  const { src, alt, caption, width, natW, natH, uploadId } = node.attrs as { src: string; alt: string; caption: string; width: number; natW: number | null; natH: number | null; uploadId: string | null };
  const editable = editor.isEditable;
  const fig = useRef<HTMLElement>(null);
  const [live, setLive] = useState<number | null>(null);
  const [broken, setBroken] = useState(false);
  const pct = live ?? width ?? 100;

  const resize = (e: React.PointerEvent, side: 1 | -1) => {
    e.preventDefault(); e.stopPropagation();
    const box = fig.current?.parentElement?.getBoundingClientRect();
    const start = fig.current?.getBoundingClientRect();
    if (!box || !start) return;
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    let last = pct;
    const move = (ev: PointerEvent) => {
      // cresce para os dois lados, porque a imagem fica centrada
      const w = start.width + (ev.clientX - sx) * side * 2;
      last = Math.max(15, Math.min(100, Math.round((w / box.width) * 100)));
      setLive(last);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      setLive(null);
      updateAttributes({ width: last });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };
  const select = () => {
    if (!editable) return;
    const p = getPos();
    if (typeof p !== "number") return;
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, p)));
    editor.view.focus();
  };
  return (
    <NodeViewWrapper as="figure" ref={fig} className={cx("rs-fig", selected && "is-selected", uploadId && "is-uploading")} style={{ width: pct + "%" }} data-drag-handle={editable && !uploadId ? "" : undefined}>
      <div className="rs-fig__media" style={natW && natH ? { aspectRatio: `${natW} / ${natH}` } : undefined} onClick={select}>
        {broken ? <span className="rs-fig__broken"><Icon name="image" size={24} />{uploadId ? "Prévia indisponível" : "Imagem indisponível"}</span>
          : <img src={src} alt={alt || caption || ""} draggable={false} loading="lazy" onError={() => setBroken(true)} />}
        {uploadId ? <span className="rs-fig__wait" role="status"><span className="cd-spinner" aria-hidden />Enviando a imagem…</span> : null}
        {editable && !uploadId ? (
          <>
            <span className="rs-fig__handle rs-fig__handle--l" title="Arraste para mudar a largura" onPointerDown={(e) => resize(e, -1)} />
            <span className="rs-fig__handle rs-fig__handle--r" title="Arraste para mudar a largura" onPointerDown={(e) => resize(e, 1)} />
            <button type="button" className="rs-fig__x cd-hoverable" aria-label="Remover a imagem" title="Remover a imagem" onClick={(e) => { e.stopPropagation(); deleteNode(); }}><Icon name="trash" size={16} /></button>
          </>
        ) : null}
      </div>
      {editable ? (
        <input className="rs-fig__cap" value={caption || ""} placeholder="Legenda (opcional)" aria-label="Legenda da imagem" maxLength={500}
          onChange={(e) => updateAttributes({ caption: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const p = getPos();
              if (typeof p === "number") editor.chain().focus(p + node.nodeSize).run();
            }
          }} />
      ) : caption ? <figcaption className="rs-fig__cap">{caption}</figcaption> : null}
    </NodeViewWrapper>
  );
}

/* ---------- Bloco colorido ---------- */
export const CALLOUT_META: Record<CalloutTone, { label: string; icon?: string; glyph?: string }> = {
  conduta: { label: "Conduta", icon: "stethoscope" },
  atencao: { label: "Atenção", icon: "alert" },
  dica: { label: "Dica", glyph: "bulb" },
  dado: { label: "Dado", icon: "chart" },
};
const ToneIcon = ({ tone, size = 18 }: { tone: CalloutTone; size?: number }) => {
  const m = CALLOUT_META[tone];
  return m.glyph ? <Glyph name={m.glyph} size={size} /> : <Icon name={m.icon!} size={size} />;
};

export function CalloutView({ node, editor, updateAttributes }: NodeViewProps) {
  const tone = (CALLOUT_TONES.includes(node.attrs.tone) ? node.attrs.tone : "conduta") as CalloutTone;
  const [menu, setMenu] = useState<Anchor | null>(null);
  const m = CALLOUT_META[tone];
  return (
    <NodeViewWrapper className="rs-callout" data-callout={tone}>
      <div className="rs-callout__head" contentEditable={false}>
        {editor.isEditable ? (
          <button type="button" className="rs-callout__tone cd-hoverable" aria-label={`Tipo do bloco: ${m.label}. Trocar`} onClick={(e) => setMenu(anchorOf(e.currentTarget))}>
            <ToneIcon tone={tone} /><span>{m.label}</span><Icon name="chevron-down" size={14} strokeWidth={2} />
          </button>
        ) : <span className="rs-callout__tone"><ToneIcon tone={tone} /><span>{m.label}</span></span>}
      </div>
      <NodeViewContent className="rs-callout__body" />
      {menu ? (
        <Menu anchor={menu} label="Tipo do bloco" autoFocus={false} onClose={() => setMenu(null)}
          items={CALLOUT_TONES.map((t) => ({ label: CALLOUT_META[t].label, icon: CALLOUT_META[t].icon, glyph: CALLOUT_META[t].glyph, checked: t === tone, onSelect: () => updateAttributes({ tone: t }) }))} />
      ) : null}
    </NodeViewWrapper>
  );
}

/* ---------- Chip de questão ---------- */
export function QuestionView({ node, selected }: NodeViewProps) {
  const { qid, label } = node.attrs as { qid: string; label: string };
  const bank = useBank();
  const nav = useNavigate();
  const toast = useToast();
  const q = bank?.byId[qid];
  const text = q && bank ? `${examTag(bank, q)} · Questão ${q.n}` : label || qid;
  const open = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!q) { toast({ text: "Esta questão não está mais no banco.", icon: "alert" }); return; }
    nav("/questao/" + encodeURIComponent(q.id));
  };
  return (
    <NodeViewWrapper as="span" className={cx("rs-qref", selected && "is-selected", !q && "is-missing")}>
      <button type="button" className="rs-qref__btn" title={q ? "Abrir a questão" : "Questão indisponível"} onClick={open} contentEditable={false}>
        <Icon name="questions" size={14} /><span>{text}</span>
      </button>
    </NodeViewWrapper>
  );
}

export const labelFor = (qid: string) => {
  const b = getBank(), q = b.byId[qid];
  return q ? `${examTag(b, q)} · Questão ${q.n}` : qid;
};
