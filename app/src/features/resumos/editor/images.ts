/* Imagem por botão, colar e arrastar: aparece na hora com a prévia e troca pelo endereço final quando o envio termina. */
import type { Editor } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";
import { docsApi } from "../api";

const OK_TYPES = /^image\/(jpeg|png|webp|gif|heic|heif)$/;
const OK_NAMES = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const MAX = 10 * 1024 * 1024;
let seq = 0;

export const imageFiles = (list: FileList | File[] | null | undefined) => [...(list || [])].filter((f) => OK_TYPES.test(f.type) || (!f.type && OK_NAMES.test(f.name)));

type Say = (text: string) => void;

function findUpload(editor: Editor, id: string) {
  let found: { pos: number; attrs: Record<string, unknown>; size: number } | null = null;
  editor.state.doc.descendants((n, pos) => {
    if (found) return false;
    if (n.type.name === "image" && n.attrs.uploadId === id) { found = { pos, attrs: n.attrs, size: n.nodeSize }; return false; }
    return true;
  });
  return found as { pos: number; attrs: Record<string, unknown>; size: number } | null;
}

export function insertImages(editor: Editor, files: File[], say: Say, at?: number) {
  let pos = at;
  for (const file of files) {
    if (file.size > MAX) { say(`${file.name} passa de 10 MB. Escolha uma imagem menor.`); continue; }
    const uploadId = `up${Date.now()}${++seq}`, preview = URL.createObjectURL(file);
    const node = { type: "image", attrs: { src: preview, uploadId, width: 100 } };
    if (pos != null) {
      editor.chain().insertContentAt(pos, node, { updateSelection: false }).run();
      pos += 1;
    } else {
      editor.chain().focus().insertContent(node).run();
      // o cursor fica depois da imagem: assim a próxima tecla ou o próximo colar não a substituem
      const f = findUpload(editor, uploadId);
      if (f) editor.view.dispatch(editor.state.tr.setSelection(Selection.near(editor.state.doc.resolve(f.pos + f.size), 1)));
    }
    docsApi.uploadImage(file).then((up) => {
      if (editor.isDestroyed) return;
      const f = findUpload(editor, uploadId);
      if (!f) return;
      const tr = editor.state.tr.setNodeMarkup(f.pos, undefined, { ...f.attrs, src: up.url, natW: up.width || null, natH: up.height || null, uploadId: null });
      tr.setMeta("addToHistory", false);
      editor.view.dispatch(tr);
    }).catch((e: Error) => {
      say(`A imagem não foi enviada. ${e.message}`);
      if (editor.isDestroyed) return;
      const f = findUpload(editor, uploadId);
      if (!f) return;
      const tr = editor.state.tr.delete(f.pos, f.pos + f.size);
      tr.setMeta("addToHistory", false);
      editor.view.dispatch(tr);
    }).finally(() => { setTimeout(() => URL.revokeObjectURL(preview), 30000); });
  }
}
