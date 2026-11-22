/* Contas: cadastro, entrada, sessão por cookie, troca e recuperação de senha. `loadUser` roda em toda requisição da API. */
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { one, q, tx } from "../db";
import { env } from "../env";
import { clientIp, hit, HttpError, invalid, meOf, requireUser } from "../http";
import type { AppEnv, UserRow } from "../http";
import { createFeedback } from "../lib/feedback-store";
import { mailReady, resetCodeMail, sendMail } from "../lib/mail";
import { recordError } from "../lib/monitor";
import { assertHandle, handleProblem, normalizeHandle, suggestHandle } from "../lib/handles";
import { checkPassword, hashPassword } from "../lib/password";
import { jsonBody, pgCode, pgConstraint, zText } from "../lib/validate";

const COOKIE = "cd_sess";
const MAX_AGE = 30 * 86_400;
const MINUTE = 60_000, HOUR = 3_600_000;

export const sha256 = (s: string) => createHash("sha256").update(s).digest();
export const codeHash = (userId: string, code: string) => createHmac("sha256", env.confirmSecret).update(`${userId}:${code}`).digest();

/** gera o código de seis números, guarda só o hash e manda por e-mail */
export async function issueResetCode(user: { id: string; email: string; name: string }) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await q(
    `INSERT INTO password_codes (user_id, code_hash, attempts, expires_at) VALUES ($1, $2, 0, now() + interval '15 minutes')
     ON CONFLICT (user_id) DO UPDATE SET code_hash = $2, attempts = 0, expires_at = now() + interval '15 minutes'`,
    [user.id, codeHash(user.id, code)],
  );
  await sendMail({ to: user.email, ...resetCodeMail(user.name, code) });
}
const cookieOpts = { httpOnly: true, sameSite: "Lax", secure: env.prod, path: "/", maxAge: MAX_AGE } as const;

/** carrega a pessoa da sessão numa consulta só; renova a sessão no máximo uma vez por hora */
export const loadUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", null);
  const token = getCookie(c, COOKIE);
  if (token && token.length <= 64) {
    const hash = sha256(token);
    const row = await one<UserRow & { renew: boolean }>(
      "SELECT u.*, s.last_seen_at < now() - interval '1 hour' AS renew FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()",
      [hash],
    );
    if (row) {
      const { renew, ...user } = row;
      c.set("user", user);
      if (renew) {
        await q("UPDATE sessions SET last_seen_at = now(), expires_at = now() + interval '30 days' WHERE token_hash = $1", [hash]);
        setCookie(c, COOKIE, token, cookieOpts);
      }
    }
  }
  await next();
};

async function startSession(c: Context<AppEnv>, userId: string) {
  const token = randomBytes(32).toString("base64url");
  await q("INSERT INTO sessions (token_hash, user_id, user_agent, expires_at) VALUES ($1, $2, $3, now() + interval '30 days')", [sha256(token), userId, c.req.header("user-agent")?.slice(0, 300) ?? null]);
  setCookie(c, COOKIE, token, cookieOpts);
}

const roleFor = (email: string) => (env.adminEmails.includes(email) ? "admin" : "user");
export const zEmail = zText().toLowerCase().pipe(z.email("Confira o e-mail.")).refine((e) => e.length <= 254, "Confira o e-mail.");
const zPassword = z.string().min(8, "A senha precisa ter ao menos 8 caracteres.").max(200, "A senha pode ter até 200 caracteres.");

export const zName = zText().min(1, "Diga seu nome.").max(80, "O nome pode ter até 80 caracteres.");

const signupSchema = z.object({
  name: zName,
  email: zEmail,
  password: zPassword,
  handle: z.string().optional(),
});

const r = new Hono<AppEnv>();

r.post("/auth/signup", async (c) => {
  const b = await jsonBody(c, signupSchema);
  const asked = b.handle?.trim() ? assertHandle(b.handle) : null;
  hit(`signup:${clientIp(c)}`, 5, HOUR);
  const passwordHash = await hashPassword(b.password);
  let handle = asked ?? (await suggestHandle(b.name));
  for (let tries = 0; ; tries++) {
    try {
      const user = await one<UserRow>(
        "INSERT INTO users (email, password_hash, name, handle, role) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [b.email, passwordHash, b.name, handle, roleFor(b.email)],
      );
      await startSession(c, user!.id);
      return c.json({ user: meOf(user!) });
    } catch (e) {
      if (pgCode(e) !== "23505") throw e;
      if (pgConstraint(e) === "users_email_key") throw new HttpError("conflito", "Já existe uma conta com este e-mail. Entre ou recupere a senha.");
      if (asked) throw new HttpError("conflito", "Este @ já está em uso. Escolha outro.");
      if (tries >= 3) throw e;
      // duas pessoas pegaram o mesmo @ sugerido ao mesmo tempo
      handle = (await suggestHandle(b.name)).slice(0, 20) + Math.floor(1000 + Math.random() * 9000);
    }
  }
});

const WRONG_LOGIN = "E-mail, @ ou senha incorretos.";

r.post("/auth/login", async (c) => {
  const b = await jsonBody(c, z.object({ login: zText().min(1, "Informe seu e-mail ou @.").max(254, WRONG_LOGIN), password: z.string().min(1, "Informe sua senha.").max(200, WRONG_LOGIN) }));
  const login = b.login.toLowerCase();
  hit(`login:${clientIp(c)}:${login}`, 10, 15 * MINUTE);
  // cada tentativa gasta CPU e memória no argon2, mesmo com contas diferentes
  hit(`login-ip:${clientIp(c)}`, 100, 15 * MINUTE);
  const isEmail = login.includes("@") && !login.startsWith("@");
  const user = await one<UserRow>(isEmail ? "SELECT * FROM users WHERE lower(email) = $1" : "SELECT * FROM users WHERE lower(handle) = $1", [isEmail ? login : normalizeHandle(login)]);
  if (!(await checkPassword(user?.password_hash, b.password))) throw new HttpError("nao_autenticado", WRONG_LOGIN);
  let u = user!;
  if (u.role !== "admin" && roleFor(u.email.toLowerCase()) === "admin") u = (await one<UserRow>("UPDATE users SET role = 'admin' WHERE id = $1 RETURNING *", [u.id]))!;
  await startSession(c, u.id);
  return c.json({ user: meOf(u) });
});

r.post("/auth/logout", async (c) => {
  const token = getCookie(c, COOKIE);
  if (token) await q("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  deleteCookie(c, COOKIE, { path: "/", secure: env.prod });
  return c.body(null, 204);
});

r.get("/auth/me", (c) => {
  const u = c.get("user");
  return c.json({ user: u ? meOf(u) : null });
});

// chamado pelo Caddy a cada acesso ao banco de questões: `loadUser` já fez todo o trabalho
r.get("/auth/check", (c) => c.body(null, c.get("user") ? 204 : 401));

r.post("/auth/password", async (c) => {
  const u = requireUser(c);
  const b = await jsonBody(c, z.object({ current: z.string().max(200), next: zPassword }));
  hit(`password:${u.id}`, 10, 15 * MINUTE);
  if (!(await checkPassword(u.password_hash, b.current))) throw invalid("A senha atual não confere.");
  const next = await hashPassword(b.next);
  await tx(async (db) => {
    await db.query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1", [u.id, next]);
    await db.query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [u.id, sha256(getCookie(c, COOKIE) || "")]);
    await db.query("DELETE FROM password_resets WHERE user_id = $1", [u.id]);
  });
  return c.body(null, 204);
});

const askAdmin = (userId: string, email: string) => createFeedback(userId, { kind: "senha", title: "Pedido de nova senha", body: `Pedido de nova senha para ${email}.`, meta: { email } }, "app");

// com e-mail configurado, manda um código; sem, o pedido vira uma mensagem para o admin gerar o link.
// A resposta é igual exista a conta ou não, e o envio não segura a resposta para o tempo também não entregar.
r.post("/auth/forgot", async (c) => {
  const b = await jsonBody(c, z.object({ email: z.string().max(300) }));
  hit(`forgot:${clientIp(c)}`, 3, HOUR);
  const mode = (await mailReady()) ? "codigo" : "admin";
  const email = zEmail.safeParse(b.email);
  if (!email.success) return c.json({ mode });
  const u = await one<{ id: string; email: string; name: string; has_open: boolean }>(
    `SELECT u.id, u.email, u.name, EXISTS (SELECT 1 FROM feedback f WHERE f.user_id = u.id AND f.kind = 'senha' AND f.status = 'novo' AND f.created_at > now() - interval '24 hours') AS has_open
     FROM users u WHERE lower(u.email) = $1`,
    [email.data],
  );
  if (u && mode === "codigo") {
    issueResetCode(u).catch(async (e) => { recordError(e, c); if (!u.has_open) await askAdmin(u.id, email.data).catch(() => {}); });
  } else if (u && !u.has_open) await askAdmin(u.id, email.data);
  return c.json({ mode });
});

// cinco tentativas por código: seis dígitos dão conta só assim
r.post("/auth/reset-code", async (c) => {
  const b = await jsonBody(c, z.object({ email: z.string().max(300), code: z.string().trim().regex(/^\d{6}$/, "O código tem 6 números."), password: zPassword }));
  hit(`reset-code:${clientIp(c)}`, 20, HOUR);
  const gone = invalid("Este código não vale mais. Peça um novo.");
  const email = zEmail.safeParse(b.email);
  if (!email.success) throw gone;
  const row = await one<{ user_id: string; code_hash: Buffer; attempts: number }>(
    "SELECT c.user_id, c.code_hash, c.attempts FROM password_codes c JOIN users u ON u.id = c.user_id WHERE lower(u.email) = $1 AND c.expires_at > now()", [email.data],
  );
  if (!row || row.attempts >= 5) throw gone;
  if (!row.code_hash.equals(codeHash(row.user_id, b.code))) {
    await q("UPDATE password_codes SET attempts = attempts + 1 WHERE user_id = $1", [row.user_id]);
    throw invalid(row.attempts >= 4 ? "Este código não vale mais. Peça um novo." : "Código incorreto.");
  }
  const next = await hashPassword(b.password);
  await tx(async (db) => {
    await db.query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1", [row.user_id, next]);
    await db.query("DELETE FROM sessions WHERE user_id = $1", [row.user_id]);
    await db.query("DELETE FROM password_codes WHERE user_id = $1", [row.user_id]);
    await db.query("DELETE FROM password_resets WHERE user_id = $1", [row.user_id]);
  });
  return c.body(null, 204);
});

r.post("/auth/reset", async (c) => {
  const b = await jsonBody(c, z.object({ token: z.string().min(1).max(200), password: zPassword }));
  hit(`reset:${clientIp(c)}`, 20, HOUR);
  const expired = invalid("Este link não vale mais. Peça um novo.");
  const hash = sha256(b.token);
  if (!(await one("SELECT 1 FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()", [hash]))) throw expired;
  const next = await hashPassword(b.password);
  const user = await tx(async (db) => {
    const used = await one<{ user_id: string }>("UPDATE password_resets SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id", [hash], db);
    if (!used) throw expired;
    await db.query("DELETE FROM sessions WHERE user_id = $1", [used.user_id]);
    return one<UserRow>("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1 RETURNING *", [used.user_id, next], db);
  });
  // quem tem o link já provou que é a pessoa: entra direto, sem digitar a senha de novo
  await startSession(c, user!.id);
  return c.json({ user: meOf(user!) });
});

r.get("/handles/:handle/available", async (c) => {
  const h = normalizeHandle(c.req.param("handle"));
  if (handleProblem(h)) return c.json({ available: false });
  const owner = await one<{ id: string }>("SELECT id FROM users WHERE lower(handle) = $1", [h]);
  return c.json({ available: !owner || owner.id === c.get("user")?.id });
});

export default r;
