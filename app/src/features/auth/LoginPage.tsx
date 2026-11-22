/* Entrar: a promessa e a prova (números do banco) de um lado, o login do outro. Quem chega pelo link do suporte
   (?redefinir=TOKEN) cria uma senha nova aqui mesmo e já entra; com &nova=1 é a conta que o admin criou para a pessoa. */
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { loadBank } from "../../data/bank";
import { makeDemo } from "../../data/demo";
import { Button } from "../../ds/basics";
import { spring } from "../../lib/motion";
import { useAuth } from "../../state/auth";
import { useStore } from "../../state/store";
import { safeNext } from "./gate";
import { AuthStory, AuthTerms, LoginForm, ResetForm } from "./parts";

export function LoginPage() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const token = sp.get("redefinir"), next = safeNext(sp.get("next"));

  // só em desenvolvimento: o app inteiro com um estudante fictício, sem conta
  const demo = async () => {
    const bank = await loadBank();
    if (!bank) return;
    useStore.getState().load(makeDemo(bank));
    useAuth.getState().enterDemo();
    nav("/", { replace: true });
  };

  return (
    <div className="auth cd-root">
      <AuthStory />
      <main className="auth__panel">
        <motion.div className="auth__card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: 0.1 }}>
          {token ? <ResetForm token={token} fresh={sp.get("nova") === "1"} onDone={() => nav("/", { replace: true })} onBack={() => setSp({}, { replace: true })} /> : (
            <>
              <h2>Entrar no Conduta Med</h2>
              <p className="auth__hint">Continue de onde parou, em qualquer aparelho.</p>
              <LoginForm onDone={() => nav(next || "/", { replace: true })} signupTo={next ? "/criar-conta?next=" + encodeURIComponent(next) : "/criar-conta"} />
            </>
          )}
          <AuthTerms />
        </motion.div>
        {import.meta.env.DEV ? <Button variant="plain" size="sm" className="auth__demo" onClick={demo}>Ver com dados de exemplo</Button> : null}
      </main>
    </div>
  );
}
