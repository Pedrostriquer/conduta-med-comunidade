/* @usuario: minúsculo, 3 a 24 caracteres, a-z 0-9 . _ , sem palavras reservadas. */
import { q } from "../db";
import type { Db } from "../db";
import { invalid } from "../http";

const RESERVED = new Set([
  "admin", "administrador", "adm", "suporte", "ajuda", "conduta", "condutamed", "conduta.med", "conduta_med", "api", "plugin", "mcp", "oauth", "root", "sistema", "moderador", "moderacao", "equipe", "oficial",
  "me", "eu", "search", "busca", "entrar", "sair", "criar-conta", "conectar", "perfil", "pessoas", "resumos", "questoes", "uploads", "null", "undefined",
]);

export const normalizeHandle = (s: string) => s.trim().replace(/^@/, "").toLowerCase();

/** devolve o problema em uma frase, ou null se o @ serve */
export function handleProblem(h: string): string | null {
  if (h.length < 3 || h.length > 24) return "O @ precisa ter de 3 a 24 caracteres.";
  if (!/^[a-z0-9._]+$/.test(h)) return "O @ só pode ter letras minúsculas sem acento, números, ponto e sublinhado.";
  if (!/[a-z0-9]/.test(h)) return "O @ precisa ter ao menos uma letra ou número.";
  if (RESERVED.has(h)) return "Este @ é reservado. Escolha outro.";
  return null;
}
export function assertHandle(raw: string) {
  const h = normalizeHandle(raw), p = handleProblem(h);
  if (p) throw invalid(p);
  return h;
}

/** base do @ a partir do nome: "João da Silva" vira "joao.da.silva" */
function baseOf(name: string) {
  const b = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 20).replace(/\.+$/, "");
  return b.length >= 3 ? b : b ? `${b}.med` : "estudante";
}
/** primeiro @ livre: o nome, depois o nome com um número. Uma consulta só. */
export async function suggestHandle(name: string, db?: Db) {
  const base = baseOf(name), candidates = [base, ...Array.from({ length: 98 }, (_, i) => `${base}${i + 2}`)].filter((h) => !RESERVED.has(h));
  const taken = new Set((await q<{ h: string }>("SELECT lower(handle) AS h FROM users WHERE lower(handle) = ANY($1)", [candidates], db)).map((r) => r.h));
  return candidates.find((h) => !taken.has(h)) ?? `${base}${1000 + Math.floor(Math.random() * 9000)}`;
}
