/* Consentimento da conexão (OAuth): a IA manda a pessoa para cá. Sem sessão, entra aqui mesmo; com sessão, diz quem está
   pedindo acesso, em qual conta, e o que a IA poderá fazer. Permitir ou Cancelar voltam para a IA. */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, ApiError, apiPost } from "../../api/client";
import { Button } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Logo } from "../../ds/Logo";
import { useAuth } from "../../state/auth";
import { LoginForm } from "../auth/parts";

const CAN = [
  { icon: "chart", text: "Ler suas estatísticas, seu cronograma, seus flashcards e seus resumos" },
  { icon: "pencil", text: "Criar e alterar coisas, sempre pedindo a sua confirmação antes" },
  { icon: "eye", text: "Tudo o que ela fizer aparece em Sua IA, e você desconecta quando quiser" },
];

export function ConectarPage() {
  const user = useAuth((s) => s.user), status = useAuth((s) => s.status), signOut = useAuth((s) => s.signOut);
  const loc = useLocation();
  const params = useMemo(() => Object.fromEntries(new URLSearchParams(loc.search)), [loc.search]);
  const complete = !!params.client_id && !!params.redirect_uri;
  const [info, setInfo] = useState<{ clientName: string; redirectUri: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<"permitir" | "cancelar" | null>(null);

  useEffect(() => {
    if (!user || !complete) return;
    let live = true;
    api<{ clientName: string; redirectUri: string }>("/oauth/request" + loc.search)
      .then((r) => { if (live) setInfo(r); })
      .catch((e) => { if (live) setProblem(e instanceof ApiError ? e.message : "Não foi possível conferir o pedido. Tente de novo."); });
    return () => { live = false; };
  }, [user?.id, complete, loc.search]); // eslint-disable-line

  const answer = async (kind: "permitir" | "cancelar") => {
    setBusy(kind); setProblem(null);
    try {
      const { redirect } = await apiPost<{ redirect: string }>(kind === "permitir" ? "/oauth/approve" : "/oauth/deny", params);
      location.href = redirect;
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : "Não foi possível concluir. Tente de novo.");
      setBusy(null);
    }
  };

  const here = loc.pathname + loc.search;
  let body: React.ReactNode;
  if (!complete) {
    body = <Trouble text="Este link de conexão está incompleto. Volte para a sua IA e peça para conectar de novo." />;
  } else if (status === "loading" && !user) {
    body = <div className="plg-loading" aria-busy="true"><span className="cd-spinner" aria-label="Carregando" /></div>;
  } else if (!user) {
    body = (
      <>
        <h1 className="cnx__title">Entre para conectar a sua IA</h1>
        <p className="cnx__sub">Depois de entrar, você decide o que ela pode fazer.</p>
        <LoginForm onDone={() => { /* com a sessão, esta mesma tela mostra o pedido */ }} signupTo={"/criar-conta?next=" + encodeURIComponent(here)} />
      </>
    );
  } else if (problem && !info) {
    body = <Trouble text={problem} />;
  } else if (!info) {
    body = <div className="plg-loading" aria-busy="true"><span className="cd-spinner" aria-label="Carregando" /></div>;
  } else {
    body = (
      <>
        <h1 className="cnx__title">Permitir que {info.clientName} acesse seus estudos no Conduta Med?</h1>
        <div className="cnx__who">
          <span className="cnx__avatar" aria-hidden>{user.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</span>
          <span className="cnx__whotext"><b>{user.name}</b><span>@{user.handle} · {user.email}</span></span>
          <Button variant="plain" size="sm" onClick={() => signOut(here)}>Usar outra conta</Button>
        </div>
        <h2 className="cnx__caps caps">O que ela poderá fazer</h2>
        <ul className="cnx__can">
          {CAN.map((c) => <li key={c.icon}><Icon name={c.icon} size={18} /><span>{c.text}</span></li>)}
        </ul>
        {problem ? <p className="auth-err" role="alert"><Icon name="alert" size={16} /><span>{problem}</span></p> : null}
        <div className="cnx__acts">
          <Button variant="filled" size="lg" block loading={busy === "permitir"} disabled={!!busy} onClick={() => answer("permitir")}>Permitir</Button>
          <Button variant="gray" size="lg" block loading={busy === "cancelar"} disabled={!!busy} onClick={() => answer("cancelar")}>Cancelar</Button>
        </div>
      </>
    );
  }

  return (
    <div className="cnx cd-root">
      <div className="cnx__brand"><Logo size={28} /></div>
      <main className="cnx__card panel">{body}</main>
    </div>
  );
}

function Trouble({ text }: { text: string }) {
  return (
    <div className="cnx__trouble" role="alert">
      <Icon name="alert" size={24} />
      <h1 className="cnx__title">Não deu para conectar</h1>
      <p className="cnx__sub">{text}</p>
    </div>
  );
}
