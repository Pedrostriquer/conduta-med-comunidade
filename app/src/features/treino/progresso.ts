/* Leituras do progresso do treino que precisam do catálogo: resumo por nível, o que rever e o "do dia". */
import { CONJUNTOS } from "./catalogo";
import type { Conjunto, ItemDef } from "./catalogo";
import { DOMINADO, hoje } from "./estado";
import type { Registro } from "./estado";
import { embaralha } from "./motor";

export { DOMINADO, hoje, useTreino } from "./estado";
export type { Dia, Quadro, Registro } from "./estado";

/** o progresso é por região: o mesmo item vale em qualquer nível dela */
export const chave = (c: Conjunto, item: string) => c.grupo + "/" + item;

export type Resumo = { total: number; vistos: number; dominados: number; rever: number };
export function resumoDe(itens: Record<string, Registro>, c: Conjunto, lista: ItemDef[], agora = Date.now()): Resumo {
  const r = { total: lista.length, vistos: 0, dominados: 0, rever: 0 };
  for (const it of lista) {
    const g = itens[chave(c, it.id)];
    if (!g) continue;
    r.vistos++;
    if (g.n >= DOMINADO) r.dominados++;
    if (g.rever && g.rever <= agora) r.rever++;
  }
  return r;
}
export const resumo = (itens: Record<string, Registro>, c: Conjunto, agora = Date.now()) => resumoDe(itens, c, c.itens, agora);
/** os itens do nível que estão na hora de rever */
export function paraRever(itens: Record<string, Registro>, c: Conjunto, agora = Date.now()): ItemDef[] {
  return c.itens.filter((it) => { const g = itens[chave(c, it.id)]; return g && g.rever && g.rever <= agora; });
}

/** o "do dia": o mesmo para todo mundo em cada data. Um nível do principal por dia, cinco itens dele. */
export function doDia(data = hoje()): { conjunto: Conjunto; itens: ItemDef[] } {
  let h = 2166136261;
  for (const ch of data) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => { h = (h + 0x6d2b79f5) | 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const lista = CONJUNTOS.filter((c) => c.principal);
  const c = lista[Math.floor(rnd() * lista.length)];
  return { conjunto: c, itens: embaralha(c.itens, rnd).slice(0, 5) };
}
