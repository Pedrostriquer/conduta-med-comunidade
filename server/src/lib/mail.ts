/* E-mail da plataforma: por enquanto uma conta do Gmail com senha de app, cadastrada no painel. Sem isso configurado,
   "esqueci a senha" continua caindo na caixa do admin. Em teste, `setMailer` troca o envio de verdade. */
import nodemailer from "nodemailer";
import { getSecret } from "./secrets";
import { getSetting } from "./settings";

export type Outgoing = { to: string; subject: string; text: string; html: string };
type Mailer = (m: Outgoing) => Promise<void>;
let fake: Mailer | null = null;
export const setMailer = (m: Mailer | null) => { fake = m; };

export async function mailReady() {
  if (fake) return true;
  const cfg = await getSetting("mail");
  return !!cfg.from && !!(await getSecret("mail_password"));
}

async function transport() {
  const cfg = await getSetting("mail"), pass = await getSecret("mail_password");
  if (!cfg.from || !pass) throw new Error("E-mail não configurado.");
  return { cfg, t: nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.port === 465, auth: { user: cfg.from, pass }, connectionTimeout: 15_000, socketTimeout: 20_000 }) };
}

export async function sendMail(m: Outgoing) {
  if (fake) return fake(m);
  const { cfg, t } = await transport();
  await t.sendMail({ from: { name: cfg.name, address: cfg.from }, to: m.to, subject: m.subject, text: m.text, html: m.html });
}

/** confere usuário e senha sem mandar nada */
export async function verifyMail() {
  if (fake) return;
  const { t } = await transport();
  await t.verify();
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function resetCodeMail(name: string, code: string): Omit<Outgoing, "to"> {
  const first = name.trim().split(/\s+/)[0] || "";
  return {
    subject: `${code} é o seu código do Conduta Med`,
    text: `Oi${first ? `, ${first}` : ""}.\n\nSeu código para criar uma senha nova é ${code}. Ele vale por 15 minutos.\n\nSe não foi você quem pediu, pode ignorar este e-mail: sua senha continua a mesma.\n`,
    html: `<p>Oi${first ? `, ${esc(first)}` : ""}.</p><p>Seu código para criar uma senha nova é:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>Ele vale por 15 minutos.</p><p style="color:#666">Se não foi você quem pediu, pode ignorar este e-mail: sua senha continua a mesma.</p>`,
  };
}
