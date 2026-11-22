/* Logo depois de criar a conta: um passo opcional para conectar a IA que a pessoa já usa. Primeiro a pergunta que
   decide a conexão (mais alguém usa o mesmo login?), depois o botão do Claude ou o pedido para colar em outra IA.
   "Pular por agora" leva para Hoje; dá para fazer depois em Sua IA. */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Chip } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Logo } from "../../ds/Logo";
import { ClaudeShortcut, ConnectSteps, CopyButton, isConnected, usePluginSetup, usePluginStatus } from "./parts";

export function PassoIaPage() {
  const nav = useNavigate();
  const { setup, error, retry } = usePluginSetup();
  const { status } = usePluginStatus();
  const [shared, setShared] = useState<boolean | null>(null);
  const connected = isConnected(status);
  const done = () => nav("/", { replace: true });

  return (
    <div className="cnx cd-root">
      <div className="cnx__brand"><Logo size={28} /></div>
      <main className="cnx__card cnx__card--wide panel">
        <span className="caps">Opcional</span>
        <h1 className="cnx__title">Quer conectar a sua IA?</h1>
        <p className="cnx__sub">Com o Claude ou o ChatGPT ligados ao Conduta Med, ela acha padrões nos seus erros, explica questões e ensina a usar tudo aqui. Nada muda sem você confirmar. Dá para fazer depois, em Sua IA.</p>

        {error ? (
          <div className="empty plg-error"><Icon name="alert" size={22} /><p>{error}</p><Button variant="gray" onClick={retry}>Tentar de novo</Button></div>
        ) : !setup ? <div className="plg-loading" aria-busy="true"><span className="cd-spinner" aria-label="Carregando" /></div> : (
          <>
            <h2 className="plg-modes__q">Mais alguém entra com o mesmo login da sua IA?</h2>
            <div className="chips" role="group" aria-label="Mais alguém entra com o mesmo login da sua IA?">
              <Chip pressed={shared === false} onChange={() => setShared(false)}>Não, só eu</Chip>
              <Chip pressed={shared === true} onChange={() => setShared(true)}>Sim, divido o login</Chip>
            </div>
            {shared === false ? <ConnectSteps setup={setup} connected={connected} /> : null}
            {shared === true ? (
              <div className="plg-passo-shared">
                <p className="cnx__sub">Assim ninguém mais que usa esse login vê os seus estudos. O conector não guarda login: em cada chat você informa o seu @ e um código que muda a cada uso.</p>
                <h3>No Claude</h3>
                <ClaudeShortcut href={setup.claudeLinks.compartilhado} shared />
                <h3>Em outra IA</h3>
                <p className="fc-help">Cole este pedido num chat novo e ela te guia.</p>
                <CopyButton variant="gray" text={setup.prompts.compartilhado} label="Copiar o pedido" title="O pedido para a sua IA" />
                <p className="fc-help">O seu código fica em <Link to="/plugin/codigo">Sua IA › código</Link>. A IA também manda esse link quando pedir o código.</p>
              </div>
            ) : null}
          </>
        )}

        <div className="cnx__acts">
          {connected ? <Button variant="filled" size="lg" block onClick={done}>Pronto, continuar</Button>
            : <Button variant={shared === null ? "gray" : "plain"} size="lg" block onClick={done}>Pular por agora</Button>}
        </div>
      </main>
    </div>
  );
}
