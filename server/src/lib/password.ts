/* Senhas com argon2id (o padrão da biblioteca), nos parâmetros mínimos recomendados pela OWASP. */
import { hash, verify } from "@node-rs/argon2";

const PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };
export const hashPassword = (p: string) => hash(p, PARAMS);

let dummy: Promise<string> | null = null;
/** confere a senha; sem hash gasta o mesmo tempo, para o login não revelar se a conta existe */
export async function checkPassword(storedHash: string | null | undefined, password: string) {
  if (!storedHash) {
    dummy ??= hashPassword("conta-que-nao-existe");
    await verify(await dummy, password).catch(() => false);
    return false;
  }
  return verify(storedHash, password).catch(() => false);
}
