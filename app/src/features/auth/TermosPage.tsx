/* Termos de uso e privacidade: curto e direto, sem juridiquês. Aberta para quem ainda não tem conta. */
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../ds/basics";
import { Logo } from "../../ds/Logo";
import { useAuth } from "../../state/auth";

export function TermosPage() {
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  return (
    <div className="termos cd-root">
      <header className="termos__bar">
        <Link to={user ? "/" : "/entrar"} aria-label="Voltar para o início"><Logo size={26} /></Link>
        <Button variant="plain" icon="chevron-left" onClick={() => (history.length > 1 ? nav(-1) : nav(user ? "/" : "/entrar"))}>Voltar</Button>
      </header>
      <main className="termos__main">
        <h1>Termos de uso e privacidade</h1>
        <p className="termos__lead">O Conduta Med é um lugar para estudar para a prova de residência. Aqui está, em poucas linhas, o que guardamos e o que você controla.</p>

        <section>
          <h2>O que guardamos</h2>
          <ul>
            <li>Sua conta: nome, e-mail, @usuario e a senha, que é guardada de forma que nem nós conseguimos ler.</li>
            <li>Seu estudo: respostas, listas, simulados, cronograma, metas, flashcards, resumos e anotações. Fica também no seu navegador, para o app funcionar sem internet, e no nosso servidor, para você encontrar tudo em outro aparelho.</li>
            <li>O que você quiser contar no perfil: faculdade, semestre, cidade e uma frase sobre você. Nada disso é obrigatório.</li>
            <li>Como você usa a plataforma: quais telas abriu, em que ordem e por quanto tempo, sem o que está nelas. Quem cuida do Conduta Med vê isso para entender o uso e resolver problemas. A sequência de telas é apagada depois de 90 dias; fica só o tempo total de cada dia.</li>
            <li>Se você usar as análises com IA: o que foi enviado ao modelo fica 30 dias, e a análise fica até você apagar a conta. O texto enviado passa pela Anthropic, que opera o modelo, e não usa isso para treinar os modelos dela.</li>
            <li>Cópias de segurança do banco de dados, feitas todo dia e apagadas depois de 14 dias.</li>
          </ul>
          <p>Não usamos anúncios nem rastreadores de terceiros. Os vídeos de correção vêm do YouTube, que recebe o acesso quando você abre um vídeo.</p>
        </section>

        <section>
          <h2>O que é público</h2>
          <p><b>Comentários nas questões são públicos</b> para quem tem conta, com o seu nome e @usuario. Escreva pensando nisso, e não conte dados de pacientes. Você pode apagar um comentário seu quando quiser.</p>
          <p>Quem tem conta só vê um comentário depois de responder à questão, para ninguém receber a resposta antes da hora.</p>
        </section>

        <section>
          <h2>Seu perfil tem níveis de privacidade</h2>
          <ul>
            <li><b>Público:</b> qualquer pessoa com conta pode ver.</li>
            <li><b>Só seguidores:</b> só quem você aceitou. Seguir sempre depende do seu aceite.</li>
            <li><b>Privado:</b> só você. Ninguém encontra o seu perfil, mesmo que algum item esteja marcado como público.</li>
          </ul>
          <p>Estatísticas, faculdade, atividade e cronograma têm escolha própria, em Perfil › Editar perfil. Quem não tem conta não vê nada.</p>
        </section>

        <section>
          <h2>Sua IA</h2>
          <p>Se você conectar uma IA (ChatGPT, Claude ou outra), ela lê os seus estudos para te ajudar. Para criar ou mudar qualquer coisa, ela sempre pede a sua confirmação antes. Tudo o que ela faz aparece em <b>Sua IA › O que a IA fez</b>, e você pode desconectar a qualquer momento. O que você conversa com ela segue as regras do serviço de IA que você escolheu.</p>
        </section>

        <section>
          <h2>Como apagar a sua conta</h2>
          <p>Em <b>Perfil › Ajustes › Conta › Apagar conta</b>. Você confirma com a senha e a conta sai do servidor com o que é seu. As cópias de segurança somem em até 14 dias. Em <b>Ajustes › Dados</b> dá para baixar tudo antes em um arquivo.</p>
        </section>

        <section>
          <h2>Como falar com a gente</h2>
          <p>Pela página <b>Suporte</b>, dentro do app. Se você perdeu o acesso, use <b>Esqueci a senha</b> na tela de entrar: você recebe as instruções para criar uma senha nova.</p>
        </section>

        <section>
          <h2>O combinado</h2>
          <p>Use com bom senso: nada de ofender, de se passar por outra pessoa ou de copiar o conteúdo para outro serviço. Podemos esconder comentários e encerrar contas que não respeitem isso. O conteúdo é material de estudo e não substitui julgamento clínico nem orientação profissional.</p>
        </section>
      </main>
    </div>
  );
}
