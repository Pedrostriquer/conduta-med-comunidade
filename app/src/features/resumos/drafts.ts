/* Rascunho no navegador: o que foi escrito fica guardado aqui até o servidor confirmar. Se a rede cair, nada se perde
   e o reenvio acontece quando a conexão volta ou na próxima abertura. */
import { docsApi } from "./api";
import { ApiError } from "../../api/client";

const PREFIX = "conduta-resumo-rascunho:";
const KEEP_GONE = 30 * 86400000;

export type Snapshot = { title: string; content: unknown; plain: string };
export type Draft = Snapshot & { base: number; at: number };

export function readDraft(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return d && typeof d === "object" && d.content ? d : null;
  } catch { return null; }
}
export function writeDraft(id: string, d: Draft) {
  try { localStorage.setItem(PREFIX + id, JSON.stringify(d)); return true; } catch { return false; }
}
export function clearDraft(id: string) {
  try { localStorage.removeItem(PREFIX + id); } catch { /* sem acesso ao armazenamento */ }
}
function draftIds(): string[] {
  try {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
    }
    return out;
  } catch { return []; }
}

/** compara ignorando a ordem das chaves: o banco guarda JSON e reordena */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const y = b as unknown[];
    return a.length === y.length && a.every((v, i) => sameJson(v, y[i]));
  }
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  const kx = Object.keys(x), ky = Object.keys(y);
  return kx.length === ky.length && kx.every((k) => k in y && sameJson(x[k], y[k]));
}

let sending = false;
/** envia o que ficou guardado de outros documentos; conflito fica para quando a pessoa abrir aquele documento */
export async function sendPendingDrafts(openId?: string) {
  if (sending || !navigator.onLine) return;
  sending = true;
  try {
    for (const id of draftIds()) {
      if (id === openId) continue;
      const d = readDraft(id);
      if (!d) { clearDraft(id); continue; }
      try {
        await docsApi.patch(id, { title: d.title, content: d.content, plain: d.plain, version: d.base });
        clearDraft(id);
      } catch (e) {
        const st = (e as ApiError).status;
        // o documento saiu daqui: pode estar na lixeira, então o texto fica pelo mesmo tempo que ela guarda
        if ((st === 404 || st === 403) && Date.now() - d.at > KEEP_GONE) clearDraft(id);
        if (st === 0) break;
      }
    }
  } finally { sending = false; }
}
