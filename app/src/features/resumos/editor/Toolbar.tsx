/* A barra fixa do documento e a barra flutuante da seleção. As duas agem sobre o editor sem tirar o foco do texto. */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Icon } from "../../../ds/Icon";
import { cx } from "../../../lib/cx";
import { Glyph } from "../glyphs";
import { anchorOf, Menu, Popover } from "../Menu";
import type { Anchor, MenuItem } from "../Menu";
import { CALLOUT_META } from "./nodes";
import { CALLOUT_TONES, COLOR_TONES, hrefFromInput } from "./sanitize";
import type { ColorTone } from "./sanitize";
import { startQuestionSearch } from "./suggest";

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
const TONE_NAME: Record<ColorTone, string> = { cinza: "Cinza", azul: "Azul", verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho" };

function Tool({ on, label, shortcut, disabled, onClick, children, id }: { on?: boolean; label: string; shortcut?: string; disabled?: boolean; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; children: ReactNode; id?: string }) {
  return (
    <button type="button" id={id} className="rs-tool cd-hoverable" aria-pressed={on} aria-label={label} title={shortcut ? `${label} (${shortcut})` : label} disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{children}</button>
  );
}
const Sep = () => <span className="rs-tools__sep" aria-hidden />;

/** quem está ativo no ponto do cursor */
function useActive(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "p",
      bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), strike: e.isActive("strike"), code: e.isActive("code"),
      sup: e.isActive("superscript"), sub: e.isActive("subscript"), link: e.isActive("link"),
      color: (e.getAttributes("textColor").tone as string | undefined) ?? null, mark: e.isActive("highlight") ? ((e.getAttributes("highlight").tone as string) || "amarelo") : null,
      bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), task: e.isActive("taskList"), quote: e.isActive("blockquote"), codeBlock: e.isActive("codeBlock"),
      align: e.isActive({ textAlign: "center" }) ? "center" : e.isActive({ textAlign: "right" }) ? "right" : e.isActive({ textAlign: "justify" }) ? "justify" : "left",
      inTable: e.isActive("table"), callout: e.isActive("callout"), details: e.isActive("details"),
      undo: e.can().undo(), redo: e.can().redo(),
    }),
  });
}

const BLOCK_LABEL: Record<string, string> = { p: "Texto", h1: "Título 1", h2: "Título 2", h3: "Título 3" };

/** cores da paleta do tema: valem no claro e no escuro */
export function ColorPanel({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const a = useActive(editor);
  return (
    <div className="rs-colors">
      <div className="rs-colors__label">Cor do texto</div>
      <div className="rs-colors__row" role="group" aria-label="Cor do texto">
        <button type="button" className="rs-swatch cd-hoverable" aria-label="Cor padrão" title="Cor padrão" aria-pressed={!a.color} onClick={() => { editor.chain().focus().unsetMark("textColor").run(); onDone(); }}>A</button>
        {COLOR_TONES.map((t) => <button key={t} type="button" className="rs-swatch cd-hoverable" data-cor={t} aria-label={TONE_NAME[t]} title={TONE_NAME[t]} aria-pressed={a.color === t} onClick={() => { editor.chain().focus().setMark("textColor", { tone: t }).run(); onDone(); }}>A</button>)}
      </div>
      <div className="rs-colors__label">Realce</div>
      <div className="rs-colors__row" role="group" aria-label="Realce">
        <button type="button" className="rs-swatch rs-swatch--none cd-hoverable" aria-label="Sem realce" title="Sem realce" aria-pressed={!a.mark} onClick={() => { editor.chain().focus().unsetMark("highlight").run(); onDone(); }}><Icon name="ban" size={16} /></button>
        {COLOR_TONES.map((t) => <button key={t} type="button" className="rs-swatch rs-swatch--mark cd-hoverable" data-realce={t} aria-label={TONE_NAME[t]} title={TONE_NAME[t]} aria-pressed={a.mark === t} onClick={() => { editor.chain().focus().setMark("highlight", { tone: t }).run(); onDone(); }} />)}
      </div>
    </div>
  );
}

export function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const current = (editor.getAttributes("link").href as string | undefined) || "";
  const [v, setV] = useState(current);
  const [bad, setBad] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus({ preventScroll: true }); input.current?.select(); }, []);
  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = v.trim();
    if (!raw) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onDone(); return; }
    const href = hrefFromInput(raw);
    if (!href) { setBad(true); return; }
    if (editor.state.selection.empty && !editor.isActive("link")) {
      editor.chain().focus().insertContent({ type: "text", text: raw, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    onDone();
  };
  return (
    <form className="rs-linkform" onSubmit={apply}>
      <div className="search rs-linkform__field" data-bad={bad ? "" : undefined}>
        <Icon name="link" size={16} />
        <input ref={input} value={v} placeholder="Cole o endereço" aria-label="Endereço do link" aria-invalid={bad} onChange={(e) => { setV(e.target.value); setBad(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); editor.commands.focus(); onDone(); } }} />
      </div>
      {bad ? <p className="rs-linkform__err">Use um endereço http(s) ou um e-mail.</p> : null}
      <div className="rs-linkform__acts">
        {current ? <a className="rs-linkbtn" href={hrefFromInput(current) || undefined} target="_blank" rel="noopener noreferrer nofollow">Abrir</a> : null}
        {current ? <button type="button" className="rs-linkbtn" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onDone(); }}>Tirar o link</button> : null}
        <button type="submit" className="rs-linkbtn rs-linkbtn--go">Aplicar</button>
      </div>
    </form>
  );
}

type PopKind = "block" | "color" | "align" | "insert" | "link";

export function Toolbar({ editor, onPickImage }: { editor: Editor; onPickImage: () => void }) {
  const a = useActive(editor);
  const [pop, setPop] = useState<{ kind: PopKind; anchor: Anchor } | null>(null);
  // clicar de novo no botão fecha: o clique fora fecha primeiro, então lembramos quem acabou de fechar
  const closed = useRef<{ kind: PopKind; at: number } | null>(null);
  const toggle = (kind: PopKind) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const c = closed.current;
    if (c && c.kind === kind && Date.now() - c.at < 300) { closed.current = null; return; }
    setPop({ kind, anchor: anchorOf(e.currentTarget) });
  };
  const close = () => { setPop((p) => { if (p) closed.current = { kind: p.kind, at: Date.now() }; return null; }); };
  const c = () => editor.chain().focus();
  const blockMenu: MenuItem[] = [
    { label: "Texto", glyph: "text", checked: a.block === "p", onSelect: () => { c().setParagraph().run(); } },
    { label: "Título 1", checked: a.block === "h1", hint: "#", onSelect: () => { c().setHeading({ level: 1 }).run(); } },
    { label: "Título 2", checked: a.block === "h2", hint: "##", onSelect: () => { c().setHeading({ level: 2 }).run(); } },
    { label: "Título 3", checked: a.block === "h3", hint: "###", onSelect: () => { c().setHeading({ level: 3 }).run(); } },
  ];
  const alignMenu: MenuItem[] = (["left", "center", "right", "justify"] as const).map((v) => ({
    label: { left: "À esquerda", center: "No centro", right: "À direita", justify: "Justificado" }[v], glyph: "align-" + v, checked: a.align === v,
    onSelect: () => { c().setTextAlign(v).run(); },
  }));
  const insertMenu: MenuItem[] = [
    ...CALLOUT_TONES.map((t): MenuItem => ({ label: CALLOUT_META[t].label, icon: CALLOUT_META[t].icon, glyph: CALLOUT_META[t].glyph, onSelect: () => { if (a.callout) c().updateAttributes("callout", { tone: t }).run(); else c().wrapIn("callout", { tone: t }).run(); } })),
    ...(a.callout ? [{ label: "Tirar do bloco colorido", icon: "x", onSelect: () => { c().lift("callout").run(); } }] : []),
    "sep",
    { label: "Bloco recolhível", glyph: "details", checked: a.details || undefined, onSelect: () => { if (a.details) c().unsetDetails().run(); else c().setDetails().updateAttributes("details", { open: true }).run(); } },
    { label: "Citação", glyph: "quote", hint: ">", checked: a.quote || undefined, onSelect: () => { c().toggleBlockquote().run(); } },
    { label: "Bloco de código", glyph: "code-block", hint: "```", checked: a.codeBlock || undefined, onSelect: () => { c().toggleCodeBlock().run(); } },
    { label: "Divisória", glyph: "divider", hint: "---", onSelect: () => { c().setHorizontalRule().run(); } },
  ];
  return (
    <div className="rs-tools" role="toolbar" aria-label="Formatação">
      <div className="rs-tools__row">
        <Tool label="Desfazer" shortcut={MOD + "Z"} disabled={!a.undo} onClick={() => c().undo().run()}><Icon name="undo" size={18} /></Tool>
        <Tool label="Refazer" shortcut={MOD + "Shift+Z"} disabled={!a.redo} onClick={() => c().redo().run()}><Icon name="redo" size={18} /></Tool>
        <Sep />
        <button type="button" className="rs-tool rs-tool--wide rs-tool--block cd-hoverable" aria-haspopup="menu" aria-label={`Tipo de texto: ${BLOCK_LABEL[a.block]}`} onMouseDown={(e) => e.preventDefault()} onClick={toggle("block")}>
          <span>{BLOCK_LABEL[a.block]}</span><Icon name="chevron-down" size={14} strokeWidth={2} />
        </button>
        <Sep />
        <Tool label="Negrito" shortcut={MOD + "B"} on={a.bold} onClick={() => c().toggleBold().run()}><Glyph name="bold" size={18} /></Tool>
        <Tool label="Itálico" shortcut={MOD + "I"} on={a.italic} onClick={() => c().toggleItalic().run()}><Glyph name="italic" size={18} /></Tool>
        <Tool label="Sublinhado" shortcut={MOD + "U"} on={a.underline} onClick={() => c().toggleUnderline().run()}><Glyph name="underline" size={18} /></Tool>
        <Tool label="Tachado" shortcut={MOD + "Shift+S"} on={a.strike} onClick={() => c().toggleStrike().run()}><Icon name="strike" size={18} /></Tool>
        <Tool label="Sobrescrito" on={a.sup} onClick={() => c().toggleSuperscript().run()}><span className="rs-tool__txt">x²</span></Tool>
        <Tool label="Subscrito" on={a.sub} onClick={() => c().toggleSubscript().run()}><span className="rs-tool__txt">x₂</span></Tool>
        <Tool label="Código" shortcut={MOD + "E"} on={a.code} onClick={() => c().toggleCode().run()}><Glyph name="code" size={18} /></Tool>
        <Tool label="Cor e realce" on={!!a.color || !!a.mark} onClick={toggle("color")}>
          <span className="rs-tool__color" data-cor={a.color || undefined}><Glyph name="color" size={18} /></span>
        </Tool>
        <Tool label="Link" on={a.link} onClick={toggle("link")}><Icon name="link" size={18} /></Tool>
        <Sep />
        <Tool label="Lista com marcadores" on={a.bullet} onClick={() => c().toggleBulletList().run()}><Glyph name="list" size={18} /></Tool>
        <Tool label="Lista numerada" on={a.ordered} onClick={() => c().toggleOrderedList().run()}><Glyph name="list-ordered" size={18} /></Tool>
        <Tool label="Lista de tarefas" on={a.task} onClick={() => c().toggleTaskList().run()}><Glyph name="list-task" size={18} /></Tool>
        <Tool label="Alinhamento" on={a.align !== "left"} onClick={toggle("align")}><Glyph name={"align-" + a.align} size={18} /></Tool>
        <Sep />
        <Tool label="Imagem" onClick={onPickImage}><Icon name="image" size={18} /></Tool>
        <Tool label="Tabela" on={a.inTable} onClick={() => { if (!a.inTable) c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); }}><Glyph name="table" size={18} /></Tool>
        <Tool label="Questão do banco" onClick={() => startQuestionSearch(editor)}><Icon name="questions" size={18} /></Tool>
        <button type="button" className="rs-tool rs-tool--wide cd-hoverable" aria-haspopup="menu" aria-label="Mais blocos" onMouseDown={(e) => e.preventDefault()} onClick={toggle("insert")}>
          <Icon name="plus" size={16} /><span>Blocos</span><Icon name="chevron-down" size={14} strokeWidth={2} />
        </button>
      </div>
      {a.inTable ? (
        <div className="rs-tools__row rs-tools__row--ctx" role="group" aria-label="Tabela">
          <button type="button" className="rs-tool rs-tool--text cd-hoverable" onMouseDown={(e) => e.preventDefault()} onClick={() => c().addRowBefore().run()}>Linha acima</button>
          <button type="button" className="rs-tool rs-tool--text cd-hoverable" onMouseDown={(e) => e.preventDefault()} onClick={() => c().addRowAfter().run()}>Linha abaixo</button>
          <button type="button" className="rs-tool rs-tool--text cd-hoverable" onMouseDown={(e) => e.preventDefault()} onClick={() => c().addColumnBefore().run()}>Coluna antes</button>
          <button type="button" className="rs-tool rs-tool--text cd-hoverable" onMouseDown={(e) => e.preventDefault()} onClick={() => c().addColumnAfter().run()}>Coluna depois</button>
          <Sep />
          <button type="button" className="rs-tool rs-tool--text cd-hoverable" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteRow().run()}>Tirar linha</button>
          <button type="button" className="rs-tool rs-tool--text cd-hoverable" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteColumn().run()}>Tirar coluna</button>
          <Sep />
          <button type="button" className="rs-tool rs-tool--text cd-hoverable" onMouseDown={(e) => e.preventDefault()} onClick={() => c().toggleHeaderRow().run()}>Cabeçalho</button>
          <button type="button" className={cx("rs-tool rs-tool--text cd-hoverable", "rs-danger")} onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteTable().run()}>Apagar tabela</button>
        </div>
      ) : null}
      {pop?.kind === "block" ? <Menu anchor={pop.anchor} items={blockMenu} onClose={close} label="Tipo de texto" autoFocus={false} /> : null}
      {pop?.kind === "align" ? <Menu anchor={pop.anchor} items={alignMenu} onClose={close} label="Alinhamento" autoFocus={false} /> : null}
      {pop?.kind === "insert" ? <Menu anchor={pop.anchor} items={insertMenu} onClose={close} label="Mais blocos" autoFocus={false} align="end" /> : null}
      {pop?.kind === "color" ? <Popover anchor={pop.anchor} onClose={close} label="Cor e realce"><ColorPanel editor={editor} onDone={close} /></Popover> : null}
      {pop?.kind === "link" ? <Popover anchor={pop.anchor} onClose={close} label="Link" keepFocus={false}><LinkForm editor={editor} onDone={close} /></Popover> : null}
    </div>
  );
}

const showBubble = ({ editor, state, from, to }: { editor: Editor; state: Editor["state"]; from: number; to: number }) => {
  if (!editor.isEditable || !editor.isFocused && !document.activeElement?.closest(".rs-bubble")) return false;
  if (state.selection.empty || from === to) return false;
  if (editor.isActive("codeBlock") || editor.isActive("image")) return false;
  return state.doc.textBetween(from, to, " ").trim().length > 0;
};
const BUBBLE_OPTS = { placement: "top" as const, offset: 8, flip: true, shift: { padding: 8 } };

export function SelectionBar({ editor }: { editor: Editor }) {
  const a = useActive(editor);
  const [pop, setPop] = useState<{ kind: "color" | "link"; anchor: Anchor } | null>(null);
  const c = () => editor.chain().focus();
  return (
    <BubbleMenu editor={editor} pluginKey="rsSelection" shouldShow={showBubble} options={BUBBLE_OPTS} className="rs-bubble cd-root" role="toolbar" aria-label="Formatar a seleção">
      <Tool label="Negrito" shortcut={MOD + "B"} on={a.bold} onClick={() => c().toggleBold().run()}><Glyph name="bold" size={17} /></Tool>
      <Tool label="Itálico" shortcut={MOD + "I"} on={a.italic} onClick={() => c().toggleItalic().run()}><Glyph name="italic" size={17} /></Tool>
      <Tool label="Sublinhado" shortcut={MOD + "U"} on={a.underline} onClick={() => c().toggleUnderline().run()}><Glyph name="underline" size={17} /></Tool>
      <Tool label="Tachado" on={a.strike} onClick={() => c().toggleStrike().run()}><Icon name="strike" size={17} /></Tool>
      <Tool label="Sobrescrito" on={a.sup} onClick={() => c().toggleSuperscript().run()}><span className="rs-tool__txt">x²</span></Tool>
      <Tool label="Subscrito" on={a.sub} onClick={() => c().toggleSubscript().run()}><span className="rs-tool__txt">x₂</span></Tool>
      <Tool label="Código" on={a.code} onClick={() => c().toggleCode().run()}><Glyph name="code" size={17} /></Tool>
      <span className="rs-tools__sep" aria-hidden />
      <Tool label="Cor e realce" on={!!a.color || !!a.mark} onClick={(e) => setPop({ kind: "color", anchor: anchorOf(e.currentTarget) })}><span className="rs-tool__color" data-cor={a.color || undefined}><Glyph name="color" size={17} /></span></Tool>
      <Tool label="Link" on={a.link} onClick={(e) => setPop({ kind: "link", anchor: anchorOf(e.currentTarget) })}><Icon name="link" size={17} /></Tool>
      {pop?.kind === "color" ? <Popover anchor={pop.anchor} onClose={() => setPop(null)} label="Cor e realce"><ColorPanel editor={editor} onDone={() => setPop(null)} /></Popover> : null}
      {pop?.kind === "link" ? <Popover anchor={pop.anchor} onClose={() => setPop(null)} label="Link" keepFocus={false}><LinkForm editor={editor} onDone={() => setPop(null)} /></Popover> : null}
    </BubbleMenu>
  );
}
