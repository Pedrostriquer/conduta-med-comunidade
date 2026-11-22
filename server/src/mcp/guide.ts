/* "Onde fica cada coisa": o texto de conduta_guia e dos recursos conduta://guia/<topico>. Tirado das telas reais do app
   (app/src/app/nav.ts, App.tsx e features/*). Mudou a tela, mude aqui: é o que a IA usa para ensinar. */
import { env } from "../env";

export const TOPICS = ["geral", "comecar", "questoes", "assuntos", "simulados", "flashcards", "resumos", "treino", "cronograma", "analises", "perfil", "comunidade", "suporte", "plugin"] as const;
export type Topic = (typeof TOPICS)[number];

export const TOPIC_TITLES: Record<Topic, string> = {
  geral: "Visão geral", comecar: "Primeiros passos de quem acabou de chegar", questoes: "Questões e listas", assuntos: "Assuntos (resumos por assunto)", treino: "Treino de anatomia e ECG", analises: "Análises com IA", simulados: "Simulados", flashcards: "Flashcards", resumos: "Resumos",
  cronograma: "Cronograma, metas e sequência", perfil: "Perfil e ajustes", comunidade: "Comentários, marcações e pessoas", suporte: "Suporte e sugestões", plugin: "Sua IA conectada",
};

/** endereços completos: a IA manda o link pronto para a pessoa tocar */
export const link = (path: string) => `${env.publicUrl}${path}`;

export function guideText(t: Topic): string {
  const L = link;
  switch (t) {
    case "geral": return `# Conduta Med: visão geral
Plataforma comunitária e gratuita de questões de residência médica. No computador, a barra lateral tem todas as seções; no celular, a barra de baixo mostra Hoje, Questões, Simulados, Cronograma e Perfil, e o resto (Flashcards, Assuntos, Resumos, Treino, Pessoas, Análises, Sua IA, Suporte) fica dentro do Perfil.

- Hoje (${L("/")}): o que fazer agora, a lista do dia, a meta e a sequência. Conta nova vê "Primeiros passos".
- Questões (${L("/questoes")}): montar lista, salvas (${L("/questoes/salvas")}) e busca (${L("/busca")}). Muitas questões têm resolução completa, além do vídeo da correção.
- Assuntos (${L("/assuntos")}): o resumo de cada assunto do jeito que a prova cobra, com as questões dele.
- Simulados (${L("/simulados")}): provas reais; resultados em ${L("/simulados/resultados")}.
- Cronograma (${L("/cronograma")}): opcional. Calendário até a prova; metas e sequência em ${L("/cronograma/metas")}.
- Flashcards (${L("/flashcards")}): baralhos, importar do Anki, criar cards e revisar.
- Resumos (${L("/resumos")}): os documentos e pastas da própria pessoa, como num caderno.
- Treino (${L("/treino")}): jogo de digitar o nome de ossos, músculos e ritmos de ECG, com corpo 3D.
- Pessoas (${L("/pessoas")}): achar colegas e pedir para seguir.
- Análises com IA (${L("/analises")}): leituras do desempenho geradas pela plataforma.
- Perfil (${L("/perfil")}): desempenho, editar perfil e ajustes (inclusive trocar a senha).
- Sua IA (${L("/plugin")}): conectar a IA e ver o que ela fez.
- Suporte (${L("/suporte")}): falar com o criador.

Ainda não existe: login com Google, aplicativo nas lojas, feed, ranking e notificação do que os outros publicam. Uma questão abre pela busca, por uma lista ou pelo link que conduta_ler_questao devolve.`;

    case "comecar": return `# Primeiros passos
Ninguém é obrigado a configurar nada para começar: depois de criar a conta, a pessoa já cai em Hoje (${L("/")}) e pode fazer questões na hora. Prova-alvo, meta diária e cronograma são opcionais e podem ficar para depois; muitas provas nem estão no banco ainda, e tudo bem.

Caminhos comuns, conforme o que a pessoa quer:
- Só quer treinar: ${L("/questoes")}, escolher área ou tema e começar. Ou abrir um assunto em ${L("/assuntos")} e tocar em "Fazer questões deste assunto".
- Quer uma prova real cronometrada: ${L("/simulados")}.
- Quer organizar a rotina: cronograma em ${L("/cronograma")} (cinco perguntas em ${L("/cronograma/novo")}), ou pedir para a IA montar, inclusive a partir de prints de outro app.
- Usa Anki: Importar em ${L("/flashcards")} recebe o arquivo .apkg.
- Quer estudar teoria: ${L("/assuntos")} tem os resumos por assunto; ${L("/resumos")} é o caderno dela.
- Quer variar: ${L("/treino")} tem o treino de anatomia e ECG.
As boas-vindas guiadas (prova, data, meta) continuam em ${L("/boas-vindas")} para quem quiser.`;
    case "questoes": return `# Questões e listas
Montar lista: ${L("/questoes")}. Escolha de onde vêm as questões:
- Por tema: árvore área › especialidade › tema, com a contagem de cada um.
- Pelas que errou, pelos pontos fracos ou de uma prova inteira.
Filtros: Banca, Ano e Status (Novas, Erradas, Salvas, Todas); o resto fica em "Mais filtros". Depois, a quantidade e a correção: "Na hora" ou "No final".

Responder (a lista abre em ${L("/sessao/ID")}):
- Enquanto a pessoa responde, a classificação da questão fica escondida, para não dar pista.
- Depois de responder aparecem o gabarito, a explicação curta e, quando houver, a resolução completa (o que decide a questão, o raciocínio e por que cada alternativa está certa ou errada, com o link para o trecho do resumo do assunto) e a correção em vídeo no minuto da questão. Quando mais de um canal corrigiu a questão, aparecem todos os vídeos, com o crédito de cada canal.
- Autoavaliação depois de responder: quem acertou marca Sabia ou Chutei; quem errou marca Não sabia ou Foi distração. Isso agenda a volta da questão: Sabia em 21 dias, Chutei ou distração em 7, Não sabia em 2.
- Marcador para salvar e botão Anotar em cada questão.

Depois da lista, o resultado (${L("/resultado/ID")}) mostra as áreas e oferece "Refazer as que errei": corrige na hora e a que errar de novo volta para o fim da fila até acertar todas.

Salvas e anotações: ${L("/questoes/salvas")}. Busca por palavras do enunciado ou das alternativas: ${L("/busca")} (aceita ${L("/busca?q=termo")}).
Por padrão entram só as questões com vídeo e sem polêmica; quem quiser todas liga "Incluir questões sem vídeo e polêmicas" em ${L("/perfil/ajustes")}.`;

    case "simulados": return `# Simulados
Provas: ${L("/simulados")}, com filtros de banca e ano. Ao escolher uma prova, dois modos:
- Simulado: cronometrado, como no dia. Gabarito, explicação e vídeo só depois de finalizar. Em branco conta como erro e, finalizado, não dá mais para mudar as respostas.
- Treino: sem pressa, com correção a cada questão.
Formato original (as questões daquela prova) ou embaralhado (mesma quantidade e conteúdo, com questões de outros anos; dá para limitar à mesma banca).
Resultados: ${L("/simulados/resultados")}. Cada resultado abre a correção questão por questão (${L("/correcao/ID")}).
O padrão entre Simulado e Treino vem de "Correção nos simulados" em ${L("/perfil/ajustes")}. O cronograma pode marcar dias de simulado sozinho.`;

    case "flashcards": return `# Flashcards
As revisões de flashcards não entram no desempenho das questões.
- Baralhos: ${L("/flashcards")}. Botão Importar recebe arquivo .apkg do Anki, com imagens e sub-baralhos.
- Criar cards: ${L("/flashcards/novo")}: escrever (básico, invertido ou lacunas {{c1::assim}}), colar planilha CSV/TSV ou partir de uma questão.
- Gerar com IA: ${L("/flashcards/ia")}: rascunhos a partir das questões erradas, que a pessoa aceita ou não.
- Compartilhados: ${L("/flashcards/compartilhados")}: publicar um baralho ou assinar o de um colega; quem assina recebe as versões novas sem perder o progresso.
- Navegar: ${L("/flashcards/navegar")}: procurar e editar cards, suspender, marcar. Estatísticas: ${L("/flashcards/estatisticas")}: retenção real, previsão de revisões e botões apertados.
- Um baralho: ${L("/flashcards/baralho/ID")}; opções: ${L("/flashcards/opcoes/ID")}; revisar: ${L("/flashcards/revisar/ID")}.

Opções do baralho: três perfis prontos.
- Leve (internato pesado, plantões): 10 novos por dia, até 100 revisões, lembrar 85%.
- Padrão (rotina regular): 20 novos por dia, até 200 revisões, lembrar 90%.
- Reta final (últimas semanas): 3 novos por dia, sem teto de revisões, lembrar 92%, os mais esquecidos primeiro.
O "Modo Anki" da mesma tela abre as opções completas. "Sanguessuga" é o card que a pessoa erra muitas vezes (8 por padrão).
Botões da revisão: De novo, Difícil, Bom, Fácil. Cards criados pela IA entram como novos no fim da fila, marcados como gerados por IA.`;

    case "resumos": return `# Resumos
${L("/resumos")}: documentos e pastas dentro de pastas, com editor de texto (títulos, listas, tarefas, tabelas, citações e imagens). Um resumo abre em ${L("/resumos/ID")}. Lixeira, por 30 dias: ${L("/resumos/lixeira")}.
Cada pasta ou documento pode ser privado, para seguidores ou público; compartilhar uma pasta vale para o que há dentro. Dá para copiar para os seus resumos o que um colega compartilhou, pelo perfil dele.
A IA pode listar, ler e criar resumos e pastas. Não edita nem apaga os que já existem.`;

    case "cronograma": return `# Cronograma, metas e sequência
O cronograma é opcional: dá para estudar sem ele. Calendário: ${L("/cronograma")}. Sem plano, começa por cinco perguntas em ${L("/cronograma/novo")}: prova, data, dias de estudo, ritmo e simulados.
Ajustar tudo: ${L("/cronograma?ajustar=1")}, com o impacto aparecendo antes de aplicar: banca principal e outras bancas, data da prova, início, dias da semana, meta diária ou questões por dia da semana ou horas por dia, plantões (dia leve, só o mínimo), férias e pausas, ênfase por área (menos, normal, mais), fases (Base, Revisão e Reta final), teto de questões num dia e cards por dia de cada baralho.
Como funciona: na Base passa por todos os temas, na ordem do que mais cai nas bancas escolhidas; na Revisão volta aos que a pessoa mais erra; na Reta final há mais simulados e revisão de erros. Se um dia fica para trás, o app oferece redistribuir o atraso nos dias seguintes.
Metas e sequência: ${L("/cronograma/metas")}. A sequência conta dias com o mínimo cumprido (questões ou cards; 10 questões ou 20 cards por padrão). Dias de plantão preservam a sequência: ganha 2 por mês, guarda até 6.
A IA pode ler, criar e ajustar o cronograma, sempre mostrando antes o que vai mudar. Não existe importação automática de outra plataforma: a pessoa manda prints, a IA lê e configura aqui.`;

    case "assuntos": return `# Assuntos
${L("/assuntos")}: o resumo de cada assunto do jeito que a prova cobra, escrito a partir das questões que caem. Busca por nome e filtro por área.
Um assunto (${L("/assuntos/SLUG")}) abre com "Em uma tela" (o essencial em poucas linhas) e o índice dos blocos. Cada bloco traz "Como cai" (quantas questões, bancas e as perguntas que mais se repetem), o essencial, figuras, números, quadros de consulta rápida, passos e fluxos de conduta, pistas do enunciado, onde as fontes divergem, o que cai pouco, vídeos de professores explicando e as fontes.
O botão "Fazer questões deste assunto" monta uma lista só com as questões dele, escolhendo quais (novas, erradas, todas), a quantidade e a correção. O progresso da pessoa no assunto aparece na página.
Na resolução de uma questão, o link leva direto ao trecho do resumo que a resolve. Ainda não há resumo de todos os temas.
A IA lê os assuntos com conduta_assuntos e pode estudar um bloco junto com a pessoa. Os Assuntos são da plataforma; os resumos pessoais da pessoa ficam em Resumos.`;

    case "treino": return `# Treino de anatomia e ECG
${L("/treino")}: um jogo de digitar. A estrutura acende (no corpo 3D ou no traçado do ECG), a pessoa digita o nome e ela some. Bom para fixar nomes e reconhecer ritmos.
Três modos: Ossos, Músculos e ECG. Em Ossos e Músculos dá para escolher a região tocando no corpo 3D ou na lista ao lado; "Principal" mostra o que a faculdade e as provas cobram, "Completo" mostra tudo. No ECG há os ritmos principais e um "para ir além" (outros ritmos, sobrecargas, isquemia, eletrólitos).
Jeitos de jogar, trocáveis a qualquer hora no topo: Automático (começa mostrando o nome e vai tirando a ajuda conforme acerta), Nome, Parte e Memória. O botão Revelar (ou a tecla Tab) mostra a resposta sem contar como erro. Nenhum nível é travado. Há também o desafio do dia e um aquecimento rápido.
O progresso fica salvo na conta e aparece em qualquer aparelho.
Explorar (${L("/treino/explorar")}): o corpo 3D em camadas (ossos, músculos e órgãos) para girar, tocar e ver o nome, isolar, esconder e buscar uma peça.
Os modelos 3D vêm do BodyParts3D (licença CC BY-SA), com o crédito na tela. Os traçados de ECG são desenhados por fórmula, não são exames reais.`;

    case "analises": return `# Análises com IA
${L("/analises")}: leituras do desempenho da pessoa feitas pela plataforma (onde erra, ritmo, questões repetidas), cada uma em ${L("/analises/ID")}. Usam um crédito mensal de IA da própria plataforma, mostrado em porcentagem. São diferentes da IA conectada: aqui a pessoa não precisa conectar nada.`;

    case "perfil": return `# Perfil e ajustes
- Visão geral: ${L("/perfil")}: resumo, atividade e progresso nas provas.
- Desempenho: ${L("/perfil/desempenho")}: acerto, ritmo e áreas por período.
- Editar perfil: ${L("/perfil/editar")}: nome, @usuario, faculdade, semestre, formado, cidade, bio e foto; quem vê o quê (público, seguidores ou privado).
- Ajustes: ${L("/perfil/ajustes")}: conta (trocar a senha, sair, apagar a conta), correção nas listas e nos simulados, vídeo no app ou no YouTube, incluir questões sem vídeo, meta diária, tema, tamanho e fonte do texto, cards novos por dia e lembrete diário.
Cadastro pede só nome, e-mail e senha; o resto é opcional e a IA pode preencher, com a confirmação da pessoa. Foto e senha só no app. Esqueceu a senha: "Esqueci a senha" na tela de entrar.`;

    case "comunidade": return `# Comentários, marcações e pessoas
Comentários: na própria questão, só depois de responder, para não dar a resposta (no simulado, só na correção). Dá para curtir e responder. Texto puro, sem imagem.
Marcar questão: desatualizada, problema no enunciado, gabarito suspeito, imagem ruim ou outro motivo. O criador vê as marcações.
Pessoas: ${L("/pessoas")} para buscar; ${L("/pessoas/seguindo")}; pedidos em ${L("/pessoas/solicitacoes")}; perfil de alguém em ${L("/u/usuario")}. Seguir sempre pede o aceite da outra pessoa e não gera feed nem notificação de conteúdo.
Quem mostra o quê é escolha de cada um em ${L("/perfil/editar")}. A IA conectada vê os números de comentários e marcações de uma questão, mas não comenta nem segue ninguém.`;

    case "suporte": return `# Suporte e sugestões
${L("/suporte")}: mandar sugestão, pedir uma prova, avisar de problema, e ver as respostas do criador.
Pela IA: se a pessoa reclamar de algo ou sentir falta de uma função ou de uma prova, pergunte se pode mandar para o criador e use conduta_enviar_sugestao. Só com a licença dela.`;

    case "plugin": return `# Sua IA conectada
${L("/plugin")}: conectar e ver o estado da conexão. ${L("/plugin/atividade")}: tudo que a IA fez. Instruções completas, para a IA ler e guiar a pessoa: ${L("/ia.md")}.

Qual dos dois jeitos usar, pela pergunta "mais alguém usa este mesmo login da IA?":
- Não, o login é só meu: conexão normal, endereço ${L("/mcp")}. Entra uma vez e não pede mais nada.
- Sim, outras pessoas entram com o mesmo login (assinatura dividida com amigos, colegas ou família, o que é muito comum, ou uma conta de trabalho com login comum): conexão de conta compartilhada, endereço ${L("/mcp/compartilhado")}. Não tem a ver com plano "Team" ou empresarial: o que conta é se outra pessoa usa o mesmo login. Assim ninguém que divide a conta vê os estudos dela. Em cada chat ela informa o @usuario e o código de acesso, que aparece pronto para copiar em ${L("/plugin/codigo")} (mande este link). O código muda a cada uso e vale 10 minutos. A sessão cai com 2 horas sem uso ou 24 horas no total, e aí pede um código novo.
Na dúvida, pergunte. Quem divide a assinatura e usa a conexão normal deixa os estudos abertos para quem mais usa aquele login.

No Claude (site ou aplicativo de computador) há um atalho: o botão "Adicionar ao Claude" em ${L("/plugin")} abre a tela de conector já preenchida; é só tocar em Continuar e depois em Conectar.
Toda alteração passa por uma prévia e só acontece com o sim da pessoa. O que a IA grava chega ao app na próxima sincronização, com um aviso.
Dá para encerrar uma conexão ou uma sessão a qualquer momento em ${L("/plugin")}.`;
  }
}
