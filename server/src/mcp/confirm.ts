/* Confirmação das escritas: a primeira chamada só mostra a prévia e devolve um token. O token é um HMAC de pessoa,
   ferramenta, hash dos argumentos e validade: qualquer argumento diferente, ou depois de 10 minutos, é recusado.
   Cada token vale uma vez: a IA que repete a chamada não duplica o que já foi criado. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

export const CONFIRM_TTL_MS = 10 * 60_000;

/** mesma estrutura, mesmo texto: as chaves são ordenadas e o que é undefined some */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => canonical(x === undefined ? null : x)).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
const argsHash = (args: unknown) => createHash("sha256").update(canonical(args)).digest("hex");
const mac = (userId: string, tool: string, args: unknown, exp: number) => createHmac("sha256", env.confirmSecret).update(`${userId}|${tool}|${argsHash(args)}|${exp}`).digest("base64url");

export function signConfirm(userId: string, tool: string, args: unknown, now = Date.now()) {
  const exp = now + CONFIRM_TTL_MS;
  return `${exp}.${mac(userId, tool, args, exp)}`;
}

export type ConfirmProblem = "formato" | "vencido" | "diferente" | "ja_usado";

const used = new Map<string, number>();
setInterval(() => { const now = Date.now(); for (const [k, exp] of used) if (exp < now) used.delete(k); }, 600_000).unref();

/** null quando o token confere; aí ele fica gasto */
export function checkConfirm(token: string, userId: string, tool: string, args: unknown, now = Date.now()): ConfirmProblem | null {
  const [expS, sig] = token.split(".");
  const exp = Number(expS);
  if (!sig || !Number.isFinite(exp)) return "formato";
  const expected = Buffer.from(mac(userId, tool, args, exp)), got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return "diferente";
  if (exp < now) return "vencido";
  if (used.has(token)) return "ja_usado";
  used.set(token, exp);
  return null;
}

export const CONFIRM_MESSAGES: Record<ConfirmProblem, string> = {
  formato: "Este token de confirmação não é válido. Chame a ferramenta de novo sem token_confirmacao para gerar outra prévia.",
  vencido: "A confirmação venceu (vale 10 minutos). Chame a ferramenta de novo sem token_confirmacao, mostre a nova prévia e peça o sim da pessoa.",
  diferente: "O token não bate com estes argumentos: algo mudou depois da prévia. Chame de novo sem token_confirmacao, mostre a nova prévia e peça o sim da pessoa.",
  ja_usado: "Esta confirmação já foi usada: a alteração já foi feita. Não repita. Se a pessoa quiser fazer de novo, gere outra prévia.",
};
