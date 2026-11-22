/* Salvamento automático: rascunho no navegador a cada pausa e envio ao servidor 800 ms depois da última tecla.
   Sem rede, o rascunho segura o texto e reenvia quando a conexão volta. Conflito de versão nunca sobrescreve sozinho. */
import { ApiError } from "../../../api/client";
import type { Doc } from "../../../api/types";
import { docsApi, liveVersion } from "../api";
import { clearDraft, readDraft, sameJson, writeDraft } from "../drafts";
import type { Snapshot } from "../drafts";
import { normalizeDoc } from "./extensions";

export type SaveState =
  | { kind: "saved"; at: number }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "offline" }
  | { kind: "conflict" }
  | { kind: "gone" }
  | { kind: "error"; message: string };

type Opts = {
  id: string; version: number; updatedAt: number; initial: Snapshot;
  read: () => Snapshot;
  onState: (s: SaveState) => void;
  onSaved: (d: Doc) => void;
  onConflict: (server: Doc, mine: Snapshot) => void;
};

const keyOf = (s: Snapshot) => JSON.stringify([s.title, s.content]);
const DELAY = 800, DRAFT_DELAY = 250, RETRY = 15000;

export class DocSaver {
  private timer = 0; private draftTimer = 0; private retryTimer = 0;
  private dirty = false; private inflight: Promise<void> | null = null;
  private blocked = false; private last: string; private savedAt: number;
  private live = false;
  /** em conflito, o rascunho continua dizendo de qual versão partiu: é isso que faz o aviso voltar se a página recarregar */
  private conflictBase: number | null = null;
  private o: Opts;

  constructor(o: Opts) {
    this.o = o;
    this.last = keyOf(o.initial);
    this.savedAt = o.updatedAt;
    liveVersion.set(o.id, o.version);
  }
  get version() { return liveVersion.get(this.o.id) ?? this.o.version; }
  get busy() { return this.dirty || !!this.inflight; }

  /** algo mudou */
  touch() {
    this.dirty = true;
    if (this.blocked) { this.schedDraft(); return; }
    this.o.onState({ kind: "pending" });
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { void this.flush(); }, DELAY);
    this.schedDraft();
  }
  private schedDraft() {
    window.clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => this.keepDraft(), DRAFT_DELAY);
  }
  private keepDraft(snap = this.o.read()) {
    window.clearTimeout(this.draftTimer);
    writeDraft(this.o.id, { ...snap, base: this.conflictBase ?? this.version, at: Date.now() });
  }

  flush(): Promise<void> {
    window.clearTimeout(this.timer);
    if (this.blocked) return this.inflight ?? Promise.resolve();
    if (this.inflight) return this.inflight.then(() => (this.dirty ? this.flush() : undefined));
    if (!this.dirty) return Promise.resolve();
    const snap = this.o.read(), key = keyOf(snap);
    this.dirty = false;
    if (key === this.last) {
      window.clearTimeout(this.draftTimer);
      clearDraft(this.o.id);
      this.o.onState({ kind: "saved", at: this.savedAt });
      return Promise.resolve();
    }
    this.keepDraft(snap);
    this.o.onState({ kind: "saving" });
    this.inflight = docsApi.patch(this.o.id, { title: snap.title, content: snap.content, plain: snap.plain, version: this.version })
      .then((doc) => {
        this.last = key;
        this.savedAt = doc.updatedAt || Date.now();
        window.clearTimeout(this.retryTimer);
        if (!this.dirty) { window.clearTimeout(this.draftTimer); clearDraft(this.o.id); this.o.onState({ kind: "saved", at: this.savedAt }); }
        this.o.onSaved(doc);
      })
      .catch((e: ApiError) => this.failed(e))
      .finally(() => { this.inflight = null; });
    return this.inflight;
  }

  private failed(e: ApiError) {
    this.dirty = true;
    if (e.status === 409) this.conflictBase = this.version;
    this.keepDraft();
    if (e.status === 409) {
      this.blocked = true;
      this.o.onState({ kind: "conflict" });
      const server = e.extra?.doc as Doc | undefined;
      if (server) this.o.onConflict(server, this.o.read());
      else docsApi.get(this.o.id).then((d) => this.o.onConflict(d, this.o.read())).catch(() => undefined);
      return;
    }
    if (e.status === 404 || e.status === 403) { this.dirty = false; this.o.onState({ kind: "gone" }); return; }
    if (e.status === 0) { this.o.onState({ kind: "offline" }); this.retryLater(); return; }
    if (e.status === 429 || e.status >= 500) { this.o.onState({ kind: "error", message: "Não deu para salvar agora. Guardado aqui, tentando de novo." }); this.retryLater(); return; }
    if (e.status === 401) { this.o.onState({ kind: "error", message: "Sua sessão expirou. Guardado aqui: entre de novo para salvar." }); return; }
    this.o.onState({ kind: "error", message: e.message });
  }
  private retryLater() {
    window.clearTimeout(this.retryTimer);
    if (!this.live) return;
    this.retryTimer = window.setTimeout(() => { void this.flush(); }, RETRY);
  }

  /** começa em conflito: há rascunho sobre uma versão que mudou no servidor */
  block(base: number) { this.blocked = true; this.dirty = true; this.conflictBase = base; this.o.onState({ kind: "conflict" }); }
  /** ficar com o texto daqui, por cima da versão atual do servidor */
  keepMine(server: Doc) {
    liveVersion.set(this.o.id, server.version);
    this.blocked = false; this.dirty = true; this.conflictBase = null;
    return this.flush();
  }
  /** ficar com o texto do servidor, que já foi posto no editor */
  useServer(server: Doc, snap: Snapshot) {
    liveVersion.set(this.o.id, server.version);
    window.clearTimeout(this.timer); window.clearTimeout(this.draftTimer);
    this.blocked = false; this.dirty = false; this.conflictBase = null;
    this.last = keyOf(snap);
    this.savedAt = server.updatedAt;
    clearDraft(this.o.id);
    this.o.onState({ kind: "saved", at: this.savedAt });
  }

  private online = () => { void this.flush(); };
  private hidden = () => { if (document.visibilityState === "hidden") { if (this.dirty) this.keepDraft(); void this.flush(); } };
  /** a página está indo embora: o rascunho já fica, e o envio tenta sobreviver ao fechamento */
  private leaving = () => {
    if (!this.dirty || this.blocked) return;
    window.clearTimeout(this.timer);
    const snap = this.o.read();
    this.keepDraft(snap);
    const body = JSON.stringify({ title: snap.title, content: snap.content, plain: snap.plain, version: this.version });
    if (body.length > 60000) return; // o navegador limita; o rascunho reenvia na próxima abertura
    void fetch(`/api/docs/${encodeURIComponent(this.o.id)}`, { method: "PATCH", keepalive: true, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body })
      .then((r) => (r.ok ? r.json() : null))
      .then((r: { doc?: Doc } | null) => {
        if (!r?.doc) return;
        liveVersion.set(this.o.id, r.doc.version);
        this.last = keyOf(snap); this.dirty = false;
        clearDraft(this.o.id);
      }).catch(() => undefined);
  };
  start() {
    this.live = true;
    addEventListener("online", this.online);
    addEventListener("pagehide", this.leaving);
    document.addEventListener("visibilitychange", this.hidden);
    if (this.dirty && !this.blocked) this.touch();
  }
  stop() {
    this.live = false;
    removeEventListener("online", this.online);
    removeEventListener("pagehide", this.leaving);
    document.removeEventListener("visibilitychange", this.hidden);
    window.clearTimeout(this.retryTimer);
    return this.flush();
  }
}

/** o que abrir: o documento do servidor ou o rascunho guardado aqui, e se os dois divergiram */
export function openDoc(doc: Doc): { title: string; content: ReturnType<typeof normalizeDoc>; dirty: boolean; conflict: boolean; base: number } {
  const fresh = { title: doc.title, content: normalizeDoc(doc.content), dirty: false, conflict: false, base: doc.version };
  const d = readDraft(doc.id);
  if (!d) return fresh;
  const content = normalizeDoc(d.content);
  if (d.title === doc.title && sameJson(content, fresh.content)) { clearDraft(doc.id); return fresh; }
  return { title: d.title, content, dirty: true, conflict: d.base !== doc.version, base: d.base };
}
