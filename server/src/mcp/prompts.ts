/* Os roteiros prontos: viram MCP Prompts e, por scripts/gerar-skills.ts, as skills de plugin/conduta-med. Fonte única. */
export type PromptDef = { name: string; title: string; description: string; args?: { name: string; description: string }[]; text: (a: Record<string, string | undefined>) => string };

const opt = (label: string, v?: string) => (v ? `\n${label}: ${v}` : "");

export const PROMPTS: PromptDef[] = [
  {
    name: "comecar", title: "Começar", description: "Abre a conversa com o Conduta Med: vê quem está conectado, o que falta configurar e conduz o começo. Use quando a pessoa disser que quer começar, configurar ou não souber o que fazer.",
    text: () => `Chame conduta_inicio para saber quem é e como anda.
Se a conta for nova: pergunte o que a pessoa quer fazer agora e ajude nisso. Em poucas linhas, diga o que você consegue fazer aqui (achar padrões nos erros, explicar questões com a resolução e o vídeo, estudar um assunto pelo resumo, montar listas e flashcards, ensinar a usar a plataforma). Cronograma, meta e perfil são opcionais: ofereça, sem insistir.
Se a conta não for nova: resuma o dia de hoje em duas linhas e sugira o próximo passo.
Uma pergunta por vez. Nada de jargão. Nada é gravado sem o sim da pessoa.`,
  },
  {
    name: "diagnostico_de_erros", title: "Diagnóstico dos erros", description: "Lê as questões que a pessoa errou e encontra o tipo de falha: diagnóstico, mecanismo, tratamento, conduta ou leitura. Use quando ela perguntar por que erra, onde está fraca ou pedir uma análise.",
    args: [{ name: "area", description: "Área para focar (clinica, cirurgia, go, pediatria, preventiva). Opcional." }],
    text: (a) => `Faça um diagnóstico de verdade dos erros desta pessoa.${opt("Foco na área", a.area)}
1. Chame conduta_padroes_de_erro e veja onde os erros se concentram: áreas, temas, bancas, reincidência, autoavaliação e tempo.
2. Chame conduta_erros (umas 15 a 30 questões, as mais recentes ou das áreas que mais pesam) e leia enunciado, alternativas, o que ela marcou e a explicação.
3. Classifique cada erro: diagnóstico (não reconheceu o quadro), mecanismo (não entendeu por que acontece), tratamento, conduta (sabia a doença, errou o próximo passo) ou leitura/distração (sabia, leu errado; tempo curto ou autoavaliação de distração ajudam a ver).
4. Mostre o padrão em poucas linhas, com duas ou três questões de exemplo, e separe o que é falta de conteúdo do que é falta de raciocínio ou atenção.
5. Sugira no máximo três ações concretas: uma lista, flashcards do que erra sempre, um ajuste no cronograma.
6. Pergunte se pode guardar a classificação nas questões, como erro:diagnostico, com conduta_etiquetar_questoes.`,
  },
  {
    name: "montar_cronograma", title: "Montar o cronograma", description: "Conduz a criação ou o ajuste do cronograma de estudos em conversa. Use quando a pessoa quiser criar, mudar ou entender o cronograma.",
    text: () => `Ajude a pessoa a montar ou ajustar o cronograma.
1. Chame conduta_ver_cronograma para saber se já existe um.
2. Pergunte o que faltar, uma coisa por vez: qual prova e banca, data, quais dias estuda, quantas questões por dia ou quantas horas, se tem plantão fixo, férias, e se quer simulados. Se ela não souber o quanto consegue, sugira um ritmo realista.
3. Chame conduta_salvar_cronograma sem token: a prévia mostra quantas questões por dia, dias de estudo e simulados. Explique em palavras simples e veja se parece possível para a rotina dela. Ajuste se precisar.
4. Só com o sim, repita com o token. Dê o link do cronograma.`,
  },
  {
    name: "importar_de_outra_plataforma", title: "Trazer de outra plataforma", description: "Lê prints ou a descrição de um cronograma de outro app ou de uma planilha e configura no Conduta Med, com confirmação. Use quando a pessoa disser que usava outro app ou mandar prints.",
    args: [{ name: "plataforma", description: "Nome do app ou planilha que a pessoa usava. Opcional." }],
    text: (a) => `A pessoa quer trazer o que tinha em outro lugar para o Conduta Med.${opt("Ela usava", a.plataforma)}
1. Peça os prints ou a explicação, se ainda não mandou. Leia com calma.
2. Diga o que entendeu, em lista curta: prova, banca, data, dias de estudo, meta por dia ou horas, plantões, férias, simulados.
3. Separe em duas partes: o que dá para trazer e o que não dá. O cronograma daqui é gerado pelos temas que mais caem nas bancas, então não dá para copiar a ordem exata dos temas dia a dia nem o progresso do outro app. Questões respondidas lá também não vêm. Baralho do Anki vem pelo botão Importar em Flashcards.
4. Pergunte só o que faltar, uma coisa por vez.
5. Chame conduta_salvar_cronograma sem token, mostre a prévia e compare com o que ela tinha. Só com o sim, repita com o token.
6. Ofereça terminar o perfil e, se ela já tiver erros aqui, olhar os pontos fracos.`,
  },
  {
    name: "flashcards_dos_erros", title: "Flashcards dos erros", description: "Cria flashcards a partir das questões que a pessoa errou, num baralho com nome. Use quando ela pedir cards dos erros ou quiser fixar o que erra sempre.",
    args: [{ name: "baralho", description: "Nome do baralho. Opcional; o padrão é Meus erros." }, { name: "area", description: "Área para focar. Opcional." }],
    text: (a) => `Crie flashcards do que esta pessoa erra.${opt("Baralho", a.baralho)}${opt("Área", a.area)}
1. Chame conduta_erros e conduta_ver_flashcards com filtro errados, para saber o que ela erra e não repetir o que já tem.
2. No máximo 2 cards por questão, só com o que a faria acertar uma questão parecida. Frente curta e direta, ou lacuna {{c1::assim}}; verso com a resposta e uma linha do porquê.
3. Use o gabarito, a explicação e, se precisar, conduta_transcricao_explicacao. Não invente dose nem critério. Passe o questao_id de cada card.
4. Pergunte o nome do baralho, se não souber. Chame conduta_criar_flashcards sem token: a prévia lista os cards. Só com o sim, repita com o token.
5. Dê o link do baralho e explique que os cards entram como novos.`,
  },
  {
    name: "lista_do_cronograma", title: "Lista do cronograma", description: "Sugere e cria a lista de questões do dia com base no cronograma e nos pontos fracos. Use quando a pessoa perguntar o que fazer hoje ou pedir uma lista.",
    args: [{ name: "dia", description: "Dia no formato AAAA-MM-DD. Opcional; o padrão é hoje." }, { name: "quantidade", description: "Quantas questões. Opcional." }],
    text: (a) => `Monte a lista de questões pelo cronograma.${opt("Dia", a.dia)}${opt("Quantidade", a.quantidade)}
1. Chame conduta_sugerir_lista: ela olha os temas do dia, o que a pessoa ainda não fez e os pontos fracos.
2. Diga em uma ou duas linhas o que vai cair e por quê, sem revelar gabarito nem o conteúdo das questões. Pergunte se quer mudar algo.
3. Chame conduta_criar_lista sem token, mostre a prévia e, com o sim, repita com o token. Mande o link para começar.`,
  },
  {
    name: "explicar_questao", title: "Explicar uma questão", description: "Explica uma questão com o gabarito, a explicação e a transcrição do vídeo da correção naquele minuto. Use quando a pessoa pedir para entender uma questão.",
    args: [{ name: "id", description: "Id da questão, como PROVA-2026-Q001, ou prova e número. Opcional." }],
    text: (a) => `Explique esta questão para a pessoa.${opt("Questão", a.id)}
1. Se não souber qual é, pergunte a prova e o número ou um pedaço do enunciado e use conduta_buscar_questoes.
2. Chame conduta_ler_questao (traz a resolução completa e o assunto, quando houver) e conduta_transcricao_explicacao. Veja também o histórico dela na questão.
3. Explique: o que a questão pede, a pista que resolve, por que a certa é certa e por que a que ela marcou está errada. Baseie-se na explicação e no que o professor diz no vídeo, e deixe claro quando for só o seu conhecimento.
4. Dê o link do vídeo no segundo exato e, se houver, o link do trecho do resumo do assunto. Termine com uma pergunta curta para ver se ficou claro.`,
  },
  {
    name: "aprender_a_usar", title: "Aprender a usar", description: "Ensina a usar o Conduta Med, com o caminho e o link de cada coisa. Use quando a pessoa perguntar onde fica ou como faz algo na plataforma.",
    args: [{ name: "duvida", description: "O que a pessoa quer saber. Opcional." }],
    text: (a) => `Ensine a pessoa a usar o Conduta Med.${opt("Dúvida", a.duvida)}
1. Chame conduta_guia com o tópico certo (geral, comecar, questoes, assuntos, simulados, flashcards, resumos, treino, cronograma, analises, perfil, comunidade, suporte, plugin).
2. Responda com o caminho e o link, um passo por vez, esperando ela fazer.
3. Se algo ainda não existe, diga com clareza e pergunte se pode mandar a ideia para o criador com conduta_enviar_sugestao.
Quando der para você mesmo fazer por ela (montar cronograma, lista, flashcards), ofereça.`,
  },
];
