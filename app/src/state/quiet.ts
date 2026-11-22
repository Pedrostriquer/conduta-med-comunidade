/* Mudança que não nasceu da pessoa nesta aba (veio do servidor ou de outra aba): os estados são atualizados dentro de
   `quietly` e o motor de sincronização não manda de volta. Tudo aqui acontece sem pausa (síncrono). */
let depth = 0;
export function quietly<T>(fn: () => T): T {
  depth++;
  try { return fn(); } finally { depth--; }
}
export const isQuiet = () => depth > 0;
