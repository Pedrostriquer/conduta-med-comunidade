/* O editor de um resumo: título grande separado do corpo, barra fixa compacta, barra da seleção, menu "/" e salvamento automático. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { Fragment, Slice } from "@tiptap/pm/model";
import { dropPoint } from "@tiptap/pm/transform";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Doc } from "../../../api/types";
import { Button } from "../../../ds/basics";
import { Icon } from "../../../ds/Icon";
import { Sheet, useToast } from "../../../ds/overlay";
import { plural } from "../../../lib/format";
import { docsApi } from "../api";
import { Glyph } from "../glyphs";
import { anchorOf, Menu } from "../Menu";
import type { Anchor } from "../Menu";
import { Trail, trailFor, VIS_ICON } from "../parts";
import { patchNode, putNode, setOpenFlush, useDocs, useTreeIndex } from "../store";
import { endPosition, nodeTitle, pathOf } from "../tree";
import { useResumos } from "../ui";
import type { Snapshot } from "../drafts";
import { normalizeDoc, schemaExtensions } from "./extensions";
import { imageFiles, insertImages } from "./images";
import { downloadMarkdown } from "./markdown";
import { plainText, withoutUploading } from "./sanitize";
import type { J } from "./sanitize";
import { DocSaver, openDoc } from "./saver";
import type { SaveState } from "./saver";
import { createPop, questionExtension, slashExtension, SlashRow, SuggestPopup } from "./suggest";
import type { QuestionHit, SlashItem } from "./suggest";
import { SelectionBar, Toolbar } from "./Toolbar";

const wordsOf = (t: string) => { const s = t.trim(); return s ? s.split(/\s+/).length : 0; };
const hhmm = (at: number) => {
  const d = new Date(at), today = new Date();
  const same = d.toDateString() === today.toDateString();
  return same ? `às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : `em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
};

function SaveBadge({ state, onConflict }: { state: SaveState; onConflict: () => void }) {
  let text: string, icon: string | null = null, tone: string | undefined;
  switch (state.kind) {
    case "saved": text = `Salvo ${hhmm(state.at)}`; icon = "check"; break;
    case "pending": case "saving": text = "Salvando"; break;
    case "offline": text = "Sem conexão, guardado aqui"; icon = "alert"; tone = "warning"; break;
    case "conflict": text = "Mudou em outro lugar"; icon = "alert"; tone = "warning"; break;
    case "gone": text = "Este resumo saiu daqui. O texto ficou guardado"; icon = "alert"; tone = "danger"; break;
    default: text = state.message; icon = "alert"; tone = "danger";
  }
  const inner = <>{icon ? <Icon name={icon} size={14} strokeWidth={2} /> : <span className="rs-save__dot" aria-hidden />}{text}</>;
  if (state.kind === "conflict") return <button type="button" className="rs-save rs-save--btn" data-tone={tone} onClick={onConflict}>{inner}</button>;
  return <span className="rs-save" role="status" data-tone={tone}>{inner}</span>;
}

function printDoc() {
  const html = document.documentElement, theme = html.dataset.theme;
  html.dataset.theme = "light"; // papel é branco: imprime com a tinta do tema claro
  const back = () => { if (theme) html.dataset.theme = theme; removeEventListener("afterprint", back); };
  addEventListener("afterprint", back);
  requestAnimationFrame(() => window.print());
}

type Conflict = { server: Doc; mine: Snapshot };

export default function DocEditor({ doc }: { doc: Doc }) {
  const ui = useResumos();
  const toast = useToast();
  const ix = useTreeIndex();
  const node = useDocs((s) => s.nodes.find((n) => n.id === doc.id));
  const start = useMemo(() => openDoc(doc), [doc]);
  const [title, setTitle] = useState(start.title);
  const titleRef = useRef(start.title);
  const titleEl = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [save, setSave] = useState<SaveState>({ kind: start.dirty ? "pending" : "saved", at: doc.updatedAt } as SaveState);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [menu, setMenu] = useState<Anchor | null>(null);
  const [words, setWords] = useState(() => wordsOf(plainText(start.content as J)));
  const say = useCallback((text: string) => toast({ text, icon: "alert" }), [toast]);

  const slashPop = useMemo(() => createPop<SlashItem>(), []);
  const questionPop = useMemo(() => createPop<QuestionHit>(), []);
  const pickImage = useCallback(() => file.current?.click(), []);
  const extensions = useMemo(() => [
    ...schemaExtensions(true),
    Placeholder.configure({
      includeChildren: true,
      // quem decide onde aparece é o CSS: parágrafo só no primeiro nível do texto
      placeholder: ({ node: n }) => (n.type.name === "heading" ? "Título" : n.type.name === "detailsSummary" ? "Título do bloco" : n.type.name === "paragraph" ? "Escreva, ou digite / para ver os blocos" : ""),
    }),
    slashExtension(slashPop, { pickImage }),
    questionExtension(questionPop),
  ], [slashPop, questionPop, pickImage]);

  const edRef = useRef<Editor | null>(null);
  const lastSnap = useRef<Snapshot>({ title: start.title, content: start.content, plain: "" });
  const snapshot = useCallback((): Snapshot => {
    const e = edRef.current;
    if (e && !e.isDestroyed) lastSnap.current = { title: titleRef.current, content: withoutUploading(e.getJSON() as J), plain: e.getText({ blockSeparator: "\n" }) };
    else lastSnap.current = { ...lastSnap.current, title: titleRef.current };
    return lastSnap.current;
  }, []);
  const [saver] = useState(() => new DocSaver({
    id: doc.id, version: doc.version, updatedAt: doc.updatedAt, initial: { title: doc.title, content: normalizeDoc(doc.content), plain: "" },
    read: snapshot,
    onState: setSave,
    onSaved: (d) => { patchNode(d.id, { updatedAt: d.updatedAt, title: titleRef.current }); },
    onConflict: (server, mine) => { setConflict({ server, mine }); setConflictOpen(true); },
  }));

  const editor = useEditor({
    extensions,
    content: start.content,
    editorProps: {
      attributes: { class: "rs-prose", "aria-label": "Texto do resumo", role: "textbox", "aria-multiline": "true" },
      handleKeyDown: (view, e) => {
        const sel = view.state.selection;
        if (!sel.empty || sel.from > 1) return false;
        if (e.key === "ArrowUp" || (e.key === "Backspace" && view.state.doc.childCount === 1 && !view.state.doc.textContent)) {
          e.preventDefault();
          titleEl.current?.focus();
          return true;
        }
        return false;
      },
      handlePaste: (_v, e) => {
        const d = e.clipboardData;
        const imgs = imageFiles(d?.files);
        if (!imgs.length || !edRef.current) return false;
        // Word e Excel mandam texto e imagem juntos: aí vale o texto
        if ((d?.getData("text/plain") || "").trim()) return false;
        e.preventDefault();
        insertImages(edRef.current, imgs, say);
        return true;
      },
      handleDrop: (view, e, _s, moved) => {
        const imgs = moved ? [] : imageFiles((e as DragEvent).dataTransfer?.files);
        if (!imgs.length || !edRef.current) return false;
        e.preventDefault();
        const p = view.posAtCoords({ left: (e as DragEvent).clientX, top: (e as DragEvent).clientY });
        // imagem é bloco: cai entre parágrafos, sem cortar o texto ao meio
        const doc = view.state.doc, probe = new Slice(Fragment.from(view.state.schema.nodes.image.create()), 0, 0);
        insertImages(edRef.current, imgs, say, p ? dropPoint(doc, p.pos, probe) ?? p.pos : undefined);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => { saver.touch(); setWords(wordsOf(e.getText({ blockSeparator: "\n" }))); },
  });
  edRef.current = editor;

  // salvar: começa com a página, termina ao sair dela
  useEffect(() => {
    saver.start();
    setOpenFlush(() => saver.flush());
    if (start.conflict) { saver.block(start.base); setConflict({ server: doc, mine: snapshot() }); setConflictOpen(true); }
    else if (start.dirty) saver.touch();
    return () => { setOpenFlush(null); void saver.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saver]);

  const sizeTitle = useCallback(() => {
    const el = titleEl.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);
  useLayoutEffect(sizeTitle, [title, sizeTitle]);
  useEffect(() => { addEventListener("resize", sizeTitle); return () => removeEventListener("resize", sizeTitle); }, [sizeTitle]);
  useEffect(() => { if (!start.title.trim() && !start.dirty) titleEl.current?.focus(); }, [start]);
  // renomeado pela árvore: acompanha, a não ser que a pessoa esteja escrevendo o título agora
  const nodeTitleNow = node?.title;
  useEffect(() => {
    if (nodeTitleNow == null || nodeTitleNow === titleRef.current || document.activeElement === titleEl.current || saver.busy) return;
    titleRef.current = nodeTitleNow;
    setTitle(nodeTitleNow);
  }, [nodeTitleNow, saver]);

  const changeTitle = (v: string) => {
    const clean = v.replace(/\n+/g, " ");
    titleRef.current = clean;
    setTitle(clean);
    patchNode(doc.id, { title: clean });
    saver.touch();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void saver.flush(); } };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [saver]);

  const resolve = {
    mine: async () => { const c = conflict; setConflict(null); setConflictOpen(false); if (c) await saver.keepMine(c.server); },
    server: () => {
      const c = conflict; setConflict(null); setConflictOpen(false);
      if (!c || !editor) return;
      const content = normalizeDoc(c.server.content);
      editor.commands.setContent(content, { emitUpdate: false });
      titleRef.current = c.server.title;
      setTitle(c.server.title);
      patchNode(doc.id, { title: c.server.title, updatedAt: c.server.updatedAt });
      saver.useServer(c.server, { title: c.server.title, content, plain: editor.getText({ blockSeparator: "\n" }) });
      setWords(wordsOf(editor.getText({ blockSeparator: "\n" })));
    },
    both: async () => {
      const c = conflict; if (!c) return;
      const mine = snapshot();
      try {
        const copy = await docsApi.create({ kind: "doc", parentId: node?.parentId ?? null, title: `${mine.title.trim() || "Sem título"} (minha versão)`, content: mine.content, plain: mine.plain, position: endPosition(ix, node?.parentId ?? null) });
        putNode(copy);
        resolve.server();
        toast({ text: "Sua versão virou uma cópia nesta mesma pasta.", icon: "copy" });
      } catch (e) { toast({ text: (e as Error).message, icon: "alert" }); }
    },
  };

  const upPath = pathOf(ix, doc.id).slice(0, -1);
  const shown = node ?? doc;
  const shareLabel = shown.visibility !== "privado" ? "Compartilhado" : shown.sharedByParent ? "Pela pasta" : "Compartilhar";
  if (!editor) return null;
  return (
    <article className="rs-doc">
      <div className="rs-docbar">
        <Trail items={trailFor(upPath)} here={title.trim() || "Sem título"} />
        <div className="rs-docbar__end">
          <SaveBadge state={save} onConflict={() => setConflictOpen(true)} />
          <Button variant="plain" size="sm" icon={shown.visibility !== "privado" ? VIS_ICON[shown.visibility] : shown.sharedByParent ? "users" : "share"} onClick={() => ui.openShare(doc.id)}>{shareLabel}</Button>
          <Button variant="plain" size="sm" icon="more" label="Mais opções do resumo" onClick={(e) => setMenu(anchorOf(e.currentTarget))} />
        </div>
      </div>
      <Toolbar editor={editor} onPickImage={pickImage} />
      <div className="rs-sheet">
        <button type="button" className="rs-doc__icon" data-empty={shown.icon ? undefined : ""} onClick={() => ui.openIcon(doc.id)} aria-label={shown.icon ? "Trocar o ícone" : "Adicionar ícone"}>
          {shown.icon ? <span aria-hidden>{shown.icon}</span> : <><Glyph name="smile" size={16} /><span>Adicionar ícone</span></>}
        </button>
        <h1 className="rs-print-title">{title.trim() || "Sem título"}</h1>
        <textarea ref={titleEl} className="rs-title" rows={1} value={title} placeholder="Sem título" aria-label="Título do resumo" maxLength={300} spellCheck
          onChange={(e) => changeTitle(e.target.value)}
          onKeyDown={(e) => {
            const el = e.currentTarget;
            if (e.key === "Enter" || (e.key === "ArrowDown" && el.selectionStart === el.value.length)) { e.preventDefault(); editor.view.focus(); editor.commands.focus("start"); }
          }} />
        <EditorContent editor={editor} className="rs-body" />
        <footer className="rs-doc__foot">
          <span className="num">{words ? plural(words, "palavra", "palavras") : "Nenhuma palavra ainda"}</span>
          {shown.origin === "ia" ? <span className="rs-doc__ia"><Icon name="sparkle" size={13} />Criado pela sua IA</span> : null}
        </footer>
      </div>
      <SelectionBar editor={editor} />
      <SuggestPopup pop={slashPop} label="Blocos" keyOf={(i) => i.id} render={(i) => <SlashRow item={i} />} empty={() => "Nenhum bloco com esse nome."} />
      <SuggestPopup pop={questionPop} label="Questões do banco" keyOf={(h) => h.q.id}
        render={(h) => <span className="rs-suggest__main"><span className="rs-suggest__label">{h.tag}</span><span className="rs-suggest__hint rs-suggest__hint--wrap">{h.snip}</span></span>}
        empty={(q) => (q.trim() ? "Nenhuma questão encontrada." : "Digite o código, a prova e o número (enare 2024 12) ou um trecho do enunciado.")} />
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" multiple hidden
        onChange={(e) => { const imgs = imageFiles(e.target.files); e.target.value = ""; if (imgs.length) insertImages(editor, imgs, say); }} />
      {menu ? (
        <Menu anchor={menu} align="end" label="Opções do resumo" onClose={() => setMenu(null)} items={[
          { label: "Ícone", glyph: "smile", onSelect: () => ui.openIcon(doc.id) },
          { label: "Duplicar", icon: "copy", onSelect: () => { void ui.acts.duplicate(doc.id); } },
          { label: "Mover para…", glyph: "move", onSelect: () => ui.openMove(doc.id) },
          "sep",
          { label: "Exportar em Markdown", glyph: "download", onSelect: () => downloadMarkdown(title, withoutUploading(editor.getJSON() as J)) },
          { label: "Imprimir", glyph: "print", onSelect: printDoc },
          "sep",
          { label: "Excluir", icon: "trash", danger: true, onSelect: () => { void ui.acts.remove(doc.id); } },
        ]} />
      ) : null}
      <Sheet open={!!conflict && conflictOpen} onClose={() => setConflictOpen(false)} title="Este resumo mudou em outro lugar" subtitle="Enquanto você escrevia aqui, outra versão foi salva: em outro aparelho, em outra aba ou pela sua IA. Nada se perdeu." width={580}
        footer={<>
          <Button variant="gray" onClick={() => void resolve.both()}>Guardar as duas</Button>
          <Button variant="gray" onClick={resolve.server}>Ficar com a do servidor</Button>
          <Button variant="filled" onClick={() => void resolve.mine()}>Ficar com a minha</Button>
        </>}>
        {conflict ? (
          <div className="rs-versions">
            <div className="rs-version"><b>A sua</b><span className="num">{plural(wordsOf(plainText(conflict.mine.content as J)), "palavra", "palavras")}</span><span>{nodeTitle({ title: conflict.mine.title, kind: "doc" })}</span></div>
            <div className="rs-version"><b>A do servidor</b><span className="num">{plural(wordsOf(plainText(normalizeDoc(conflict.server.content) as J)), "palavra", "palavras")}, salva {hhmm(conflict.server.updatedAt)}</span><span>{nodeTitle(conflict.server)}</span></div>
            <p className="rs-versions__note">“Guardar as duas” cria uma cópia com o seu texto na mesma pasta e abre aqui a do servidor.</p>
          </div>
        ) : null}
      </Sheet>
    </article>
  );
}
