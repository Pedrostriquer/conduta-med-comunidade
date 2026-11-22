/* Leitura de um resumo de outra pessoa: mesmo esquema e mesmo estilo do editor, sem edição.
   O conteúdo passa pela limpeza e é desenhado pelo Tiptap; nunca vira HTML cru. */
import { useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { normalizeDoc, schemaExtensions } from "./extensions";

export default function DocReader({ content }: { content: unknown }) {
  const extensions = useMemo(() => schemaExtensions(false), []);
  const start = useMemo(() => normalizeDoc(content), [content]);
  const editor = useEditor({
    extensions,
    content: start,
    editable: false,
    editorProps: { attributes: { class: "rs-prose rs-prose--read", "aria-label": "Texto do resumo" } },
  }, [start]);
  if (!editor) return null;
  return <EditorContent editor={editor} className="rs-body" />;
}
