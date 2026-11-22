/* Modo de conta compartilhada: quem divide uma conta de IA não deixa login salvo no conector. A pessoa informa
   @usuario e um código de uso único que aparece só no app; a IA recebe uma sessão curta e repassa em cada ferramenta.
   Mensagem igual para usuário inexistente, código errado e modo desligado, e comparação em tempo constante. */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { one, q, tx } from "../db";
import { env } from "../env";
import type { UserRow } from "../http";
import { sha256 } from "../oauth/tokens";

export const CODE_TTL_MS = 10 * 60_000;
export const SESSION_IDLE_MS = 2 * 3_600_000;
export const SESSION_MAX_MS = 24 * 3_600_000;
export const MAX_CODE_FAILS = 5;
export const LOCK_MS = 15 * 60_000;
/** atenção: Claude e ChatGPT chamam da nuvem deles, então este limite é dividido por quem usa a mesma IA */
// as IAs conectam da nuvem delas, então um IP soma os erros de muita gente: a trava que protege é a da conta
export const MAX_IP_FAILS = 300;
export const IP_WINDOW_MS = 3_600_000;
/** sem 0/O nem 1/I */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 8;

export class SharedError extends Error {}

/** a página que abre direto no código de acesso: é o link que a IA manda */
export const codeLink = () => `${env.publicUrl}/plugin/codigo`;
const where = codeLink;
export const expiredMessage = () => `Esta sessão do Conduta Med acabou (2 horas sem uso ou 24 horas no total). Peça para a pessoa abrir ${where()}, copiar o código de acesso e dizer aqui. Depois chame conduta_entrar com o @usuario e o código novo.`;
const denied = () => `Usuário ou código não conferem. Peça para a pessoa conferir o @usuario e o código em ${where()}: o código muda a cada uso e vale 10 minutos, e o modo de conta compartilhada precisa estar ligado.`;
const locked = () => `Muitos códigos errados para este usuário. Espere 15 minutos e tente de novo com o código que aparece em ${where()}.`;
const ipLocked = () => `Muitos códigos errados a partir daqui. Espere uma hora e tente de novo.`;

/* ---------- códigos ---------- */
export function newCode() {
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}
const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
const toRow = (r: { code: string; expires_at: Date }, handle: string) => ({ code: r.code, expiresAt: new Date(r.expires_at).getTime(), handle });

/** o código válido da pessoa; gera um se não houver. `rotate` troca na hora e zera a trava: é o próprio dono pedindo. */
export async function currentCode(user: Pick<UserRow, "id" | "handle">, rotate = false) {
  if (!rotate) {
    const cur = await one<{ code: string; expires_at: Date }>("SELECT code, expires_at FROM mcp_access_codes WHERE user_id = $1 AND code <> '' AND expires_at > now()", [user.id]);
    if (cur) return toRow(cur, user.handle);
  }
  const reset = rotate ? ", failures = 0, locked_until = NULL" : "";
  const row = await one<{ code: string; expires_at: Date }>(
    `INSERT INTO mcp_access_codes (user_id, code, expires_at) VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)
     ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at${reset} RETURNING code, expires_at`,
    [user.id, newCode(), String(CODE_TTL_MS)],
  );
  return toRow(row!, user.handle);
}

/* ---------- travas de quem erra ---------- */
const ipFails = new Map<string, number[]>();
const ghostFails = new Map<string, { n: number; until: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ipFails) if (!v.length || now - v[v.length - 1] > IP_WINDOW_MS) ipFails.delete(k);
  for (const [k, v] of ghostFails) if (v.until < now) ghostFails.delete(k);
}, 600_000).unref();
const recentIp = (ip: string) => (ipFails.get(ip) || []).filter((t) => Date.now() - t < IP_WINDOW_MS);
const noteIpFail = (ip: string) => ipFails.set(ip, [...recentIp(ip), Date.now()]);
/** só para os testes começarem do zero */
export const resetSharedLimits = () => { ipFails.clear(); ghostFails.clear(); };

// compara os HMACs, de tamanho fixo: o tempo não diz quantos caracteres bateram
const macOf = (s: string) => createHmac("sha256", env.confirmSecret).update(s).digest();
const sameCode = (a: string, b: string) => timingSafeEqual(macOf(a), macOf(b));

/** usuário que não existe também trava depois de 5 erros: quem testa não descobre quem existe */
function ghostAttempt(handle: string, ip: string): never {
  const now = Date.now(), g = ghostFails.get(handle);
  if (g && g.n >= MAX_CODE_FAILS && g.until > now) throw new SharedError(locked());
  sameCode(newCode(), newCode());
  noteIpFail(ip);
  ghostFails.set(handle, { n: g && g.until > now ? g.n + 1 : 1, until: now + LOCK_MS });
  throw new SharedError(denied());
}

/* ---------- entrar e sair ---------- */
export async function enter(handleRaw: string, codeRaw: string, ip: string) {
  if (recentIp(ip).length >= MAX_IP_FAILS) throw new SharedError(ipLocked());
  const handle = handleRaw.trim().replace(/^@/, "").toLowerCase(), code = normalizeCode(codeRaw);
  const user = await one<UserRow>("SELECT * FROM users WHERE lower(handle) = $1", [handle]);
  if (!user) ghostAttempt(handle, ip);
  const res = await tx(async (db) => {
    const { rows: [row] } = await db.query<{ code: string; live: boolean; failures: number; locked: boolean; lock_over: boolean }>(
      `SELECT code, expires_at > now() AS live, failures, coalesce(locked_until > now(), false) AS locked, locked_until IS NOT NULL AND locked_until <= now() AS lock_over
       FROM mcp_access_codes WHERE user_id = $1 FOR UPDATE`, [user.id]);
    if (row?.locked) return "locked" as const;
    if (!user.shared_mode) return "denied" as const;
    const ok = sameCode(row && row.live ? row.code : newCode(), code);
    if (ok) {
      await db.query("DELETE FROM mcp_access_codes WHERE user_id = $1", [user.id]);
      return "ok" as const;
    }
    const failures = (row && !row.lock_over ? row.failures : 0) + 1, lock = failures >= MAX_CODE_FAILS;
    // sem código ativo a linha entra com código vazio, que nunca confere: é só para contar os erros
    await db.query(
      `INSERT INTO mcp_access_codes (user_id, code, expires_at, failures, locked_until) VALUES ($1, '', now(), $2, CASE WHEN $3::boolean THEN now() + ($4 || ' milliseconds')::interval END)
       ON CONFLICT (user_id) DO UPDATE SET failures = EXCLUDED.failures, locked_until = EXCLUDED.locked_until`,
      [user.id, failures, lock, String(LOCK_MS)],
    );
    return "denied" as const;
  });
  if (res === "locked") throw new SharedError(locked());
  if (res === "denied") { noteIpFail(ip); throw new SharedError(denied()); }
  const token = "cds_" + randomBytes(32).toString("base64url");
  const ses = await one<{ id: string; expires_at: Date }>(
    "INSERT INTO mcp_shared_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval) RETURNING id, expires_at",
    [sha256(token), user.id, String(SESSION_MAX_MS)],
  );
  return { token, user, sessionId: ses!.id, expiresAt: new Date(ses!.expires_at).getTime() };
}

/** a pessoa dona da sessão; renova o tempo de uso. Sessão vencida, encerrada ou com o modo desligado dá o mesmo pedido de código novo. */
export async function userOfSession(token: string): Promise<UserRow> {
  const row = await one<UserRow & { ses_id: string }>(
    `SELECT u.*, s.id AS ses_id FROM mcp_shared_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.ended_at IS NULL AND s.expires_at > now() AND s.last_used_at > now() - ($2 || ' milliseconds')::interval AND u.shared_mode`,
    [sha256(token), String(SESSION_IDLE_MS)],
  );
  if (!row) throw new SharedError(expiredMessage());
  const { ses_id, ...user } = row;
  await q("UPDATE mcp_shared_sessions SET last_used_at = now() WHERE id = $1", [ses_id]);
  return user as UserRow;
}

export async function leave(token: string) {
  await q("UPDATE mcp_shared_sessions SET ended_at = now() WHERE token_hash = $1 AND ended_at IS NULL", [sha256(token)]);
}
