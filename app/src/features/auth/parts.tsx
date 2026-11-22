/* Peças da entrada: o lado da promessa e os formulários de entrar, esqueci a senha e senha nova. */
import { useEffect, useState } from "react";
import type { FormEvent, InputHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ApiError, apiGet, apiPost } from "../../api/client";
import { Button } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Logo } from "../../ds/Logo";
import { num } from "../../lib/format";
import { spring } from "../../lib/motion";
import { useAuth } from "../../state/auth";

const rise = (d: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { ...spring.smooth, delay: d } });
export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Algo deu errado. Tente de novo.");

type Stats = { questoes: number; provas: number; bancas: number };

/** os números que provam o que o app tem, públicos */
function usePublicStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    const c = new AbortController();
    apiGet<Stats>("/public/stats", c.signal).then(setStats).catch(() => { /* sem os números a tela segue igual */ });
    return () => c.abort();
  }, []);
  return stats;
}

/* ---------- o lado da promessa, igual em entrar e criar conta ---------- */
export function AuthStory() {
  const proof = usePublicStats();
  return (
    <aside className="auth__story">
      <motion.div className="auth__brand" {...rise(0)}><Logo size={30} /></motion.div>
      <div className="auth__pitch">
        <motion.h1 {...rise(0.08)}>Questões reais de residência, com a conduta comentada em vídeo.</motion.h1>
        <motion.p className="auth__lead" {...rise(0.16)}>Você responde, vê por que errou e o professor explica no minuto exato da questão. Um cronograma leva até o dia da prova.</motion.p>
        {proof ? (
          <motion.dl className="auth__proof" {...rise(0.24)}>
            <div><dt>questões prontas</dt><dd className="num">{num(proof.questoes)}</dd></div>
            <div><dt>provas completas</dt><dd className="num">{num(proof.provas)}</dd></div>
            <div><dt>bancas</dt><dd className="num">{num(proof.bancas)}</dd></div>
          </motion.dl>
        ) : null}
      </div>
    </aside>
  );
}

export function AuthTerms({ children = "Ao continuar, você concorda com os" }: { children?: ReactNode }) {
  return <p className="auth__terms">{children} <Link to="/termos">Termos de uso e privacidade</Link>. Não publicamos nada em seu nome.</p>;
}

/* ---------- campos ---------- */
export function FormError({ children }: { children: ReactNode }) {
  return children ? <p className="auth-err" role="alert"><Icon name="alert" size={16} /><span>{children}</span></p> : null;
}

export function PasswordField({ label = "Senha", hint, ...rest }: { label?: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <label className="auth-field">
      <span>{label}</span>
      <span className="auth-pass">
        <input {...rest} type={show ? "text" : "password"} />
        <button type="button" className="auth-pass__toggle" aria-label={show ? "Ocultar a senha" : "Mostrar a senha"} aria-pressed={show} onClick={() => setShow(!show)}>
          {show ? "Ocultar" : "Mostrar"}
        </button>
      </span>
      {hint ? <small className="auth-field__hint">{hint}</small> : null}
    </label>
  );
}

/* ---------- entrar, esqueci a senha ---------- */
export function LoginForm({ onDone, signupTo = "/criar-conta" }: { onDone: () => void; signupTo?: string }) {
  const signIn = useAuth((s) => s.signIn);
  const [login, setLogin] = useState(""), [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password) { setErr(!login.trim() ? "Informe seu e-mail ou @usuario." : "Informe sua senha."); return; }
    setErr(null); setBusy(true);
    try { await signIn(login.trim(), password); onDone(); }
    catch (x) { setErr(errorText(x)); setBusy(false); }
  };
  if (forgot) return <ForgotForm initial={login.includes("@") && !login.startsWith("@") ? login.trim() : ""} onBack={() => setForgot(false)} />;
  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <label className="auth-field"><span>E-mail ou @usuario</span>
        <input autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={login} onChange={(e) => setLogin(e.target.value)} />
      </label>
      <PasswordField autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <FormError>{err}</FormError>
      <Button variant="filled" size="lg" block type="submit" loading={busy}>Entrar</Button>
      <div className="auth-links">
        <button type="button" className="auth-link" onClick={() => setForgot(true)}>Esqueci a senha</button>
        <Link className="auth-link" to={signupTo}>Criar conta</Link>
      </div>
    </form>
  );
}

function ForgotForm({ initial, onBack }: { initial: string; onBack: () => void }) {
  const [email, setEmail] = useState(initial);
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [byCode, setByCode] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr("Confira o e-mail."); return; }
    setErr(null); setBusy(true);
    try { const r = await apiPost<{ mode: "codigo" | "admin" }>("/auth/forgot", { email: email.trim() }); setByCode(r.mode === "codigo"); setSent(true); }
    catch (x) { setErr(errorText(x)); }
    setBusy(false);
  };
  if (sent && byCode) return <CodeForm email={email.trim()} onBack={onBack} />;
  if (sent) {
    return (
      <motion.div className="auth-sent" role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
        <span className="auth-sent__icon" aria-hidden><Icon name="check" size={18} strokeWidth={2.5} /></span>
        <div>
          <b>Pedido recebido</b>
          <p>Ainda não enviamos e-mail automático: o pedido vai para o suporte, que manda para {email.trim()} um link para criar uma senha nova. Se esse e-mail não tiver conta, nada acontece.</p>
          <Button variant="tinted" size="sm" onClick={onBack}>Voltar para entrar</Button>
        </div>
      </motion.div>
    );
  }
  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <p className="auth__hint">Diga o e-mail da sua conta para receber as instruções de como criar uma senha nova.</p>
      <label className="auth-field"><span>E-mail</span>
        <input type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <FormError>{err}</FormError>
      <Button variant="filled" size="lg" block type="submit" loading={busy}>Continuar</Button>
      <Button variant="plain" block onClick={onBack}>Voltar para entrar</Button>
    </form>
  );
}

/** com e-mail ligado: o código de 6 números que chegou e a senha nova, na mesma tela */
function CodeForm({ email, onBack }: { email: string; onBack: () => void }) {
  const [code, setCode] = useState(""), [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false), [ok, setOk] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) { setErr("O código tem 6 números."); return; }
    if (password.length < 8) { setErr("A senha precisa ter ao menos 8 caracteres."); return; }
    setErr(null); setBusy(true);
    try { await apiPost("/auth/reset-code", { email, code: code.trim(), password }); setOk(true); }
    catch (x) { setErr(errorText(x)); }
    setBusy(false);
  };
  if (ok) {
    return (
      <>
        <p className="auth__hint">Senha trocada. Agora é só entrar com a senha nova.</p>
        <Button variant="filled" size="lg" block onClick={onBack}>Entrar</Button>
      </>
    );
  }
  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <p className="auth__hint">Se {email} tiver conta, enviamos um código de 6 números. Ele vale por 15 minutos; confira também o spam.</p>
      <label className="auth-field"><span>Código</span>
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      </label>
      <PasswordField label="Senha nova" autoComplete="new-password" hint="Pelo menos 8 caracteres." value={password} onChange={(e) => setPassword(e.target.value)} />
      <FormError>{err}</FormError>
      <Button variant="filled" size="lg" block type="submit" loading={busy}>Trocar a senha</Button>
      <Button variant="plain" block onClick={onBack}>Voltar para entrar</Button>
    </form>
  );
}

/** quem chega pelo link do suporte; `fresh` = conta que o admin acabou de criar (?nova=1). Salvou, já entra: `onDone` leva para o app */
export function ResetForm({ token, fresh, onDone, onBack }: { token: string; fresh?: boolean; onDone: () => void; onBack: () => void }) {
  const resetPassword = useAuth((s) => s.resetPassword);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setErr("A senha precisa ter ao menos 8 caracteres."); return; }
    setErr(null); setBusy(true);
    try { await resetPassword(token, password); onDone(); }
    catch (x) { setErr(errorText(x)); setBusy(false); }
  };
  return (
    <>
      <h2>{fresh ? "Crie sua senha" : "Crie uma senha nova"}</h2>
      <p className="auth__hint">{fresh ? "Sua conta no Conduta Med já está pronta. Escolha uma senha para entrar." : "Ela passa a valer em todos os seus aparelhos."}</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        <PasswordField label={fresh ? "Senha" : "Senha nova"} autoComplete="new-password" autoFocus hint="Pelo menos 8 caracteres." value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError>{err}</FormError>
        <Button variant="filled" size="lg" block type="submit" loading={busy}>{fresh ? "Criar senha e entrar" : "Salvar a senha nova"}</Button>
        <Button variant="plain" block onClick={onBack}>Voltar para entrar</Button>
      </form>
    </>
  );
}
