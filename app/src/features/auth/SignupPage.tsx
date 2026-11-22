/* Criar conta: nome, e-mail e senha. Faculdade, semestre e o resto ficam para depois, no perfil. */
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { ApiError, apiGet } from "../../api/client";
import { Button } from "../../ds/basics";
import { spring } from "../../lib/motion";
import { useAuth } from "../../state/auth";
import { safeNext } from "./gate";
import { AuthStory, AuthTerms, errorText, FormError, PasswordField } from "./parts";

/** como o servidor sugere o @ a partir do nome: minúsculas, sem acento, separado por ponto */
const handleFrom = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 24);

/** o @ que a pessoa vai ter: o que vem do nome, ou o primeiro com número que estiver livre */
function useSuggestedHandle(name: string) {
  const [handle, setHandle] = useState<string | null>(null);
  useEffect(() => {
    const base = handleFrom(name);
    if (base.length < 3) { setHandle(null); return; }
    let live = true;
    const t = setTimeout(async () => {
      for (const h of [base, ...[2, 3, 4, 5, 6].map((n) => base.slice(0, 22) + n)]) {
        try {
          const { available } = await apiGet<{ available: boolean }>("/handles/" + encodeURIComponent(h) + "/available");
          if (!live) return;
          if (available) { setHandle(h); return; }
        } catch { if (live) setHandle(null); return; }
      }
      if (live) setHandle(null);
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [name]);
  return handle;
}

export function SignupPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = safeNext(sp.get("next"));
  const signUp = useAuth((s) => s.signUp);
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const handle = useSuggestedHandle(name);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = !name.trim() ? "Diga seu nome." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "Confira o e-mail." : password.length < 8 ? "A senha precisa ter ao menos 8 caracteres." : null;
    if (problem) { setErr(problem); return; }
    setErr(null); setBusy(true);
    const account = { name: name.trim(), email: email.trim(), password };
    try {
      // alguém pode ter pegado o @ nos últimos segundos: aí o servidor sugere outro, e dá para trocar depois
      await signUp({ ...account, ...(handle ? { handle } : {}) }).catch((x) => {
        if (handle && x instanceof ApiError && x.code === "conflito" && x.message.includes("@ já")) return signUp(account);
        throw x;
      });
      // sem destino pedido: o passo opcional de conectar a IA, que leva a Hoje
      nav(next || "/comecar/ia", { replace: true });
    } catch (x) { setErr(errorText(x)); setBusy(false); }
  };
  return (
    <div className="auth cd-root">
      <AuthStory />
      <main className="auth__panel">
        <motion.div className="auth__card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: 0.1 }}>
          <h2>Criar sua conta</h2>
          <p className="auth__hint">Só isso. O resto você decide depois, se quiser.</p>
          <form className="auth-form" onSubmit={submit} noValidate>
            <label className="auth-field"><span>Nome</span>
              <input autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              <small className="auth-field__hint" aria-live="polite">{handle ? <>Seu usuário fica <b>@{handle}</b>. Dá para trocar depois.</> : " "}</small>
            </label>
            <label className="auth-field"><span>E-mail</span>
              <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <PasswordField autoComplete="new-password" hint="Pelo menos 8 caracteres." value={password} onChange={(e) => setPassword(e.target.value)} />
            <FormError>{err}</FormError>
            <Button variant="filled" size="lg" block type="submit" loading={busy}>Criar conta</Button>
            <div className="auth-links auth-links--center">
              <span>Já tem conta?</span> <Link className="auth-link" to={next ? "/entrar?next=" + encodeURIComponent(next) : "/entrar"}>Entrar</Link>
            </div>
          </form>
          <AuthTerms>Ao criar a conta, você concorda com os</AuthTerms>
        </motion.div>
      </main>
    </div>
  );
}
