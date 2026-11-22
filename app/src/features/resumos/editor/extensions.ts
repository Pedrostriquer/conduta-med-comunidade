/* O esquema do documento: o mesmo na edição e na leitura, para o resumo ficar igual para quem escreve e para quem lê. */
import { Mark, mergeAttributes, Node, getSchema } from "@tiptap/core";
import type { AnyExtension, JSONContent } from "@tiptap/core";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { Node as PMNode } from "@tiptap/pm/model";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { CalloutView, FigureView, QuestionView } from "./nodes";
import { CALLOUT_TONES, COLOR_TONES, safeHref, safeImageSrc, sanitizeContent, textFallback } from "./sanitize";
import type { J } from "./sanitize";

const colorOf = (v: string | null) => (COLOR_TONES.includes(v as (typeof COLOR_TONES)[number]) ? v : null);

/** cor do texto: guarda só o nome da cor da paleta; quem desenha é o tema */
const TextColor = Mark.create({
  name: "textColor",
  addAttributes() {
    return { tone: { default: null, parseHTML: (el) => colorOf(el.getAttribute("data-cor")), renderHTML: (a) => (a.tone ? { "data-cor": a.tone } : {}) } };
  },
  parseHTML() { return [{ tag: "span[data-cor]" }]; },
  renderHTML({ HTMLAttributes }) { return ["span", mergeAttributes(HTMLAttributes), 0]; },
});

/** realce: mesma ideia, com os fundos suaves do tema */
const Highlight = Mark.create({
  name: "highlight",
  addAttributes() {
    return { tone: { default: "amarelo", parseHTML: (el) => colorOf(el.getAttribute("data-realce")) || "amarelo", renderHTML: (a) => ({ "data-realce": a.tone }) } };
  },
  parseHTML() { return [{ tag: "mark" }]; },
  renderHTML({ HTMLAttributes }) { return ["mark", mergeAttributes(HTMLAttributes), 0]; },
  addKeyboardShortcuts() {
    return { "Mod-Shift-h": () => this.editor.commands.toggleMark(this.name) };
  },
});

/** bloco colorido: conduta, atenção, dica ou dado */
const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: "conduta",
        parseHTML: (el) => { const v = el.getAttribute("data-callout"); return CALLOUT_TONES.includes(v as (typeof CALLOUT_TONES)[number]) ? v : "conduta"; },
        renderHTML: (a) => ({ "data-callout": a.tone }),
      },
    };
  },
  parseHTML() { return [{ tag: "div[data-callout]" }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { class: "rs-callout" }), 0]; },
  addNodeView() { return ReactNodeViewRenderer(CalloutView); },
});

/** imagem enviada para o Conduta, com legenda e largura em % da coluna */
const Figure = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: "" }, alt: { default: "" }, caption: { default: "" }, width: { default: 100 },
      natW: { default: null }, natH: { default: null },
      uploadId: { default: null, rendered: false, parseHTML: () => null },
    };
  },
  parseHTML() {
    return [
      {
        tag: "figure[data-imagem]",
        getAttrs: (el) => {
          const img = el.querySelector("img"), src = safeImageSrc(img?.getAttribute("src"));
          if (!src) return false;
          const w = Number(el.getAttribute("data-largura"));
          return { src, alt: img?.getAttribute("alt") || "", caption: el.querySelector("figcaption")?.textContent || "", width: w >= 10 && w <= 100 ? w : 100, natW: Number(img?.getAttribute("width")) || null, natH: Number(img?.getAttribute("height")) || null };
        },
      },
      { tag: "img[src]", getAttrs: (el) => { const src = safeImageSrc(el.getAttribute("src")); return src ? { src, alt: el.getAttribute("alt") || "" } : false; } },
    ];
  },
  renderHTML({ node }) {
    const { src, alt, caption, width, natW, natH } = node.attrs;
    const img = ["img", { src: safeImageSrc(src) || "", alt: alt || "", ...(natW ? { width: natW } : {}), ...(natH ? { height: natH } : {}) }];
    return ["figure", { "data-imagem": "", "data-largura": width, class: "rs-fig" }, img, ...(caption ? [["figcaption", {}, caption]] : [])] as never;
  },
  renderText({ node }) { return node.attrs.caption || ""; },
  addNodeView() { return ReactNodeViewRenderer(FigureView); },
});

/** chip que abre uma questão do banco */
const QuestionRef = Node.create({
  name: "questionRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      qid: { default: "", parseHTML: (el) => el.getAttribute("data-questao") || "", renderHTML: (a) => ({ "data-questao": a.qid }) },
      label: { default: "", parseHTML: (el) => el.textContent || "", rendered: false },
    };
  },
  parseHTML() { return [{ tag: "span[data-questao]" }]; },
  renderHTML({ node, HTMLAttributes }) { return ["span", mergeAttributes(HTMLAttributes, { class: "rs-qref" }), node.attrs.label || node.attrs.qid]; },
  renderText({ node }) { return node.attrs.label || node.attrs.qid; },
  addNodeView() { return ReactNodeViewRenderer(QuestionView, { as: "span" }); },
});

/** o esquema comum; `editable` liga o que só faz sentido escrevendo */
export function schemaExtensions(editable: boolean): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: editable,
        linkOnPaste: editable,
        enableClickSelection: false,
        protocols: ["http", "https", "mailto"],
        defaultProtocol: "https",
        isAllowedUri: (uri) => !!safeHref(uri),
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow", class: "rs-link" },
      },
      dropcursor: { color: "var(--accent)", width: 2 },
      trailingNode: editable ? undefined : false,
    }),
    Superscript, Subscript, TextColor, Highlight,
    TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
    TaskList,
    TaskItem.configure({ nested: true, onReadOnlyChecked: () => false }),
    Table.configure({ resizable: editable, renderWrapper: true, cellMinWidth: 72, lastColumnResizable: true, allowTableNodeSelection: false }),
    TableRow, TableHeader, TableCell,
    Details.configure({ persist: true, openClassName: "is-open", HTMLAttributes: { class: "rs-details" } }),
    DetailsSummary, DetailsContent,
    Callout, Figure, QuestionRef,
  ];
}

let schemaCache: ReturnType<typeof getSchema> | null = null;
/** conteúdo limpo e conferido contra o esquema, pronto para abrir */
export function normalizeDoc(raw: unknown): JSONContent {
  const clean = sanitizeContent(raw);
  schemaCache ||= getSchema(schemaExtensions(false));
  try {
    PMNode.fromJSON(schemaCache, clean).check();
    return clean as JSONContent;
  } catch {
    return textFallback(clean) as JSONContent;
  }
}
export type { J };
