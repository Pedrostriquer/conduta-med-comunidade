/* Segredos guardados no banco, cifrados com AES-256-GCM: a chave da API e a senha do e-mail não ficam em arquivo nenhum
   nem em cópia de segurança em texto puro. Quem decifra é a SECRETS_KEY, que fica só no ambiente do servidor. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { one, q } from "../db";
import { env } from "../env";
import { ms } from "../http";

export type SecretName = "anthropic" | "openai" | "openrouter" | "mail_password";
const key = () => createHash("sha256").update("conduta-segredos-v1:" + env.secretsKey).digest();
const cache = new Map<string, string | null>();

export function seal(name: string, value: string) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(name));
  const ciphertext = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return { ciphertext, iv, tag: c.getAuthTag() };
}
export function unseal(name: string, r: { ciphertext: Buffer; iv: Buffer; tag: Buffer }) {
  const d = createDecipheriv("aes-256-gcm", key(), r.iv);
  d.setAAD(Buffer.from(name));
  d.setAuthTag(r.tag);
  return Buffer.concat([d.update(r.ciphertext), d.final()]).toString("utf8");
}

/** quem cadastra vê depois só o começo e o fim, para saber qual chave está lá */
const hintOf = (name: SecretName, v: string) => (name === "anthropic" || name === "openai" || name === "openrouter" ? `${v.slice(0, 7)}…${v.slice(-4)}` : `…${v.slice(-2)}`);

/** `hint`: o que mostrar no lugar do valor (padrão: o começo e o fim dele) */
export async function setSecret(name: SecretName, value: string, by: string | null, hint?: string) {
  const s = seal(name, value);
  await q(
    `INSERT INTO app_secrets (name, ciphertext, iv, tag, hint, updated_by) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (name) DO UPDATE SET ciphertext = $2, iv = $3, tag = $4, hint = $5, updated_by = $6, updated_at = now()`,
    [name, s.ciphertext, s.iv, s.tag, hint ?? hintOf(name, value), by],
  );
  cache.set(name, value);
}
export async function deleteSecret(name: SecretName) {
  await q("DELETE FROM app_secrets WHERE name = $1", [name]);
  cache.set(name, null);
}
export async function getSecret(name: SecretName): Promise<string | null> {
  if (cache.has(name)) return cache.get(name)!;
  const r = await one<{ ciphertext: Buffer; iv: Buffer; tag: Buffer }>("SELECT ciphertext, iv, tag FROM app_secrets WHERE name = $1", [name]);
  let v: string | null = null;
  if (r) {
    try { v = unseal(name, r); } catch { console.error(`não consegui decifrar o segredo ${name}: a SECRETS_KEY mudou?`); }
  }
  cache.set(name, v);
  return v;
}
/** o que dá para mostrar: nunca o valor */
export async function secretInfo(name: SecretName) {
  const r = await one<{ hint: string; updated_at: Date }>("SELECT hint, updated_at FROM app_secrets WHERE name = $1", [name]);
  return r ? { set: true, hint: r.hint, updatedAt: ms(r.updated_at) } : { set: false, hint: "", updatedAt: null };
}
export const clearSecretCache = () => cache.clear();
/** relê do banco na próxima vez: para um segredo que outro processo pode ter trocado */
export const forgetSecret = (name: SecretName) => { cache.delete(name); };
