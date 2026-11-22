/* O banco próprio da sincronização: a fila de saída (sobrevive a fechar a aba e a ficar sem rede), o índice das imagens
   que já estão no servidor (`fc_media`) e a fila das imagens por enviar. Se o IndexedDB falhar, o motor segue só na memória. */
const NAME = "conduta-sync";
export type OutRow = { key: string; c: string; id: string; at: number };
export type MediaRef = { hash: string; ext: string };

let dbp: Promise<IDBDatabase> | null = null;
function open() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore("outbox", { keyPath: "key" });
        db.createObjectStore("media");
        db.createObjectStore("mediaq");
      };
      r.onsuccess = () => {
        r.result.onversionchange = () => { r.result.close(); dbp = null; };
        res(r.result);
      };
      r.onerror = () => { dbp = null; rej(r.error); };
    });
  }
  return dbp;
}
const done = (t: IDBTransaction) => new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function outboxAll() {
  const db = await open();
  return req(db.transaction("outbox").objectStore("outbox").getAll()) as Promise<OutRow[]>;
}
/** grava e apaga na mesma transação: a ordem das operações na fila é a ordem das chamadas */
export async function outboxWrite(put: OutRow[], del: string[]) {
  if (!put.length && !del.length) return;
  const db = await open(), t = db.transaction("outbox", "readwrite"), s = t.objectStore("outbox");
  put.forEach((r) => s.put(r));
  del.forEach((k) => s.delete(k));
  return done(t);
}

export async function mediaGet(key: string) {
  const db = await open();
  return req(db.transaction("media").objectStore("media").get(key)) as Promise<MediaRef | undefined>;
}
export async function mediaGetMany(keys: string[]) {
  const out = new Map<string, MediaRef>();
  if (!keys.length) return out;
  const db = await open(), s = db.transaction("media").objectStore("media");
  await Promise.all(keys.map(async (k) => { const v = await req(s.get(k)) as MediaRef | undefined; if (v) out.set(k, v); }));
  return out;
}
export async function mediaWrite(put: [string, MediaRef][], del: string[]) {
  if (!put.length && !del.length) return;
  const db = await open(), t = db.transaction("media", "readwrite"), s = t.objectStore("media");
  put.forEach(([k, v]) => s.put(v, k));
  del.forEach((k) => s.delete(k));
  return done(t);
}
export async function mediaIndexKeys() {
  const db = await open();
  return req(db.transaction("media").objectStore("media").getAllKeys()) as Promise<string[]>;
}

export async function queueAll() {
  const db = await open();
  return req(db.transaction("mediaq").objectStore("mediaq").getAllKeys()) as Promise<string[]>;
}
export async function queueWrite(put: string[], del: string[]) {
  if (!put.length && !del.length) return;
  const db = await open(), t = db.transaction("mediaq", "readwrite"), s = t.objectStore("mediaq");
  put.forEach((k) => s.put(1, k));
  del.forEach((k) => s.delete(k));
  return done(t);
}

export async function closeSyncDb() {
  if (!dbp) return;
  try { (await dbp).close(); } catch { /* já estava fechado */ }
  dbp = null;
}
