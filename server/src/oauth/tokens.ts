/* Tokens da conexão normal: só o hash vai para o banco. Access 1 h, refresh 90 dias com rotação; o refresh reusado
   derruba a família inteira. O token pessoal (cdm_) não expira e serve para Claude Code, Cursor e afins. */
import { createHash, randomBytes } from "node:crypto";
import { q, one } from "../db";
import type { Db } from "../db";
import type { UserRow } from "../http";

export const ACCESS_TTL_MS = 3_600_000;
export const REFRESH_TTL_MS = 90 * 86_400_000;
export const CODE_TTL_MS = 5 * 60_000;
export const SCOPE = "conduta";
export const PERSONAL_PREFIX = "cdm_";

export const sha256 = (s: string) => createHash("sha256").update(s).digest();
export const randomToken = (prefix = "") => prefix + randomBytes(32).toString("base64url");

/** a família do código de autorização: permite derrubar os tokens se o mesmo código for usado de novo */
export const familyOfCode = (hash: Buffer) => { const h = hash.toString("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };

export async function issueTokens(db: Db, o: { userId: string; clientId: string; label: string; scope: string; family: string }) {
  const access = randomToken("cda_"), refresh = randomToken("cdr_");
  await db.query(
    `INSERT INTO mcp_tokens (user_id, kind, token_hash, client_id, label, scope, family, expires_at) VALUES
     ($1, 'access', $2, $3, $4, $5, $6, now() + ($7 || ' milliseconds')::interval),
     ($1, 'refresh', $8, $3, $4, $5, $6, now() + ($9 || ' milliseconds')::interval)`,
    [o.userId, sha256(access), o.clientId, o.label, o.scope, o.family, String(ACCESS_TTL_MS), sha256(refresh), String(REFRESH_TTL_MS)],
  );
  return { access_token: access, token_type: "Bearer", expires_in: Math.round(ACCESS_TTL_MS / 1000), refresh_token: refresh, scope: o.scope };
}

export const revokeFamily = (db: Db, family: string) => db.query("UPDATE mcp_tokens SET revoked_at = now() WHERE family = $1 AND revoked_at IS NULL", [family]);

/** o dono do Bearer da requisição, ou null. Refresh nunca serve como credencial do /mcp. */
export async function userOfBearer(token: string): Promise<{ user: UserRow; tokenId: string } | null> {
  const kind = token.startsWith(PERSONAL_PREFIX) ? "pessoal" : "access";
  const row = await one<UserRow & { token_id: string }>(
    `SELECT u.*, t.id AS token_id FROM mcp_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.kind = $2 AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now())`,
    [sha256(token), kind],
  );
  if (!row) return null;
  const { token_id, ...user } = row;
  // uso registrado no máximo uma vez por minuto, sem segurar a resposta
  void q("UPDATE mcp_tokens SET last_used_at = now() WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')", [token_id]).catch(() => {});
  return { user: user as UserRow, tokenId: token_id };
}
