"""Escreve project/components/<Comp>/README.md (guia de uso de cada componente)."""
import os

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
G = {}

G["Logo"] = """A marca do Conduta: um caminho que se bifurca, com o ramo escolhido em destaque e um ponto no destino.

`Logo` mostra a marca com a palavra “conduta” em Hanken Grotesk 700, minúscula, com −0,035em de espaçamento. `Mark` mostra só o símbolo.

**Props.** `size` (px, padrão 32), `wordmark` (false mostra só o símbolo), `mono` (versão de uma cor: o quadrado em `currentColor` e o desenho na cor de `surface`).

- Use o `Logo` completo na barra lateral e em telas de entrada; o `Mark` sozinho em ícone de app, favicon e onde houver menos de 120px.
- Respiro mínimo em volta: metade do tamanho do símbolo.
- O quadrado é sempre `accent`; não troque a cor nem ponha a marca sobre foto.
- Abaixo de 16px, use o favicon em SVG do grupo Logos.
"""

G["Icon"] = """Ícones de interface desenhados para o Conduta, numa grade de 24px com traço de 1,75 e pontas arredondadas.

**Props.** `name` (veja a grade no preview), `size` (padrão 20), `strokeWidth` (padrão 1,75; use 2 na aba selecionada), `label` (obrigatório quando o ícone está sozinho; sem ele o ícone é decorativo), `filled` (só `flag`).

- O ícone herda a cor do texto (`currentColor`). Ao lado de texto, use o mesmo tamanho visual da letra maiúscula: 16 a 18 com texto de 13 a 15px; 20 com 16px; 24 na barra de abas.
- Um ícone, um conceito, no app inteiro: `questions` é questão, `exam` é prova, `cards` é flashcard, `today` é Hoje, `pulse` é Desempenho, `video` é correção em vídeo, `void` é anulada, `swap` é gabarito alterado, `hourglass` é gabarito preliminar, `strike` é riscar alternativa.
- Áreas: `stethoscope` Clínica Médica, `scalpel` Cirurgia, `pacifier` Pediatria, `uterus` Ginecologia e Obstetrícia, `shield` Preventiva. O mapa está em `Conduta.AREA_ICON`.
- `play` e `more` são preenchidos; os outros, de traço.
- Não use emoji nem ícones de outras bibliotecas ao lado destes.
"""

G["Button"] = """Ação com um verbo: um botão preenchido por tela para a ação que a tela existe para fazer, e os outros em cinza ou simples.

**Props.** `variant`: `filled` (principal, `accent`), `tinted` (secundária com destaque, `accent-soft`), `gray` (secundária neutra, `surface-2`), `plain` (só texto azul, para ações leves e barras de ferramenta), `destructive` (apagar algo que é seu). `size`: `sm` 32px, `md` 44px, `lg` 52px. `icon`, `iconEnd`, `kbd` (tecla de atalho), `loading`, `block` (largura toda), `href` (vira link que abre em nova aba), `label` (obrigatório em botão só com ícone). Repassa o resto para o `<button>`.

- Hierarquia por estilo, não por tamanho. No máximo um `filled` por tela: Responder, Mostrar resposta, Finalizar prova, Importar.
- Rótulo começa com verbo e diz o que acontece. Com espera, troque o rótulo pelo gerúndio e ligue `loading`: “Finalizando…”.
- `destructive` só para apagar o que é do estudante (um baralho, o progresso). Finalizar uma prova é escolha deliberada: `filled`, com confirmação no `Dialog`.
- `disabled` só quando a pessoa entende por quê (Responder sem alternativa marcada). Se não for óbvio, deixe ativo e explique ao tocar.
- Pressionar reduz para 97% em 90ms; soltar volta com `spring-snappy`. Hover e pressionado usam as camadas `hover` e `pressed`, que funcionam sobre qualquer preenchimento.
"""

G["SegmentedControl"] = """Escolha uma entre duas a cinco opções irmãs que trocam a vista na mesma tela.

**Props.** `options` (`[{ value, label, icon?, ariaLabel? }]`), `value`, `onChange(value)`, `size` (`sm`), `block` (largura toda), `aria-label`.

- Use para filtrar ou trocar a vista: período (7 dias, 30 dias, Tudo), lista (Questões, Erradas, Marcadas, Não feitas), tamanho do texto.
- Não use para navegar entre seções do app (isso é `TabBar`/`Sidebar`) nem para disparar ações.
- Rótulos são substantivos curtos, todos texto ou todos ícone. No celular, até 4 opções; no desktop, até 5. Mais que isso, use um menu.
- O polegar desliza com `spring-snappy` (459ms); o peso da letra não muda entre selecionado e não selecionado, para não pular. Setas trocam de opção.
"""

G["Chip"] = """Filtro que liga e desliga, sozinho ou somado a outros.

**Props.** `pressed`, `onChange(pressed)`, `count` (número ao lado do rótulo), `icon` (use o ícone da área nos filtros de área), `children` (rótulo).

- Use em filtros de banca, área, tema e situação (Não feitas, Erradas, Com vídeo). Chips se somam: cada um é independente.
- Ligado, o chip ganha `accent-soft`, texto `accent-ink` e um ✓ que entra deslizando: o estado não depende só da cor.
- O número é quantas questões o filtro traz sozinho, não o total combinado.
- Muitos chips: uma linha que rola na horizontal no celular; nunca quebre em mais de duas linhas.
- Se a combinação zerar a lista, diga qual filtro tirar (ver Escrita).
"""

G["Badge"] = """Selo de uma ou duas palavras, com ícone, que diz algo verdadeiro sobre uma questão.

**Props.** `kind`: `anulada`, `alterada`, `diverge`, `polemica`, `preliminar`, `desatualizada`, `recurso`, `revisao` (cada um já traz tom, ícone e texto). Ou monte o seu com `tone` (`neutral`, `accent`, `success`, `danger`, `warning`), `icon` e `children`.

- Os selos vêm dos dados do banco: `status_oficial` (anulada, alterada), `gabarito_tipo` (preliminar), `video.diverge` (vídeo diverge do gabarito) e `sinal_problematica` do vídeo (polêmica, cabe recurso, desatualizada).
- Âmbar (`warning`) é para o que muda a nota ou a confiança no gabarito; cinza, para contexto.
- Fica no topo da questão, antes do enunciado, e nunca é só cor: sempre ícone e palavra.
- Não use selo como botão nem para contar coisas.
"""

G["Alternative"] = """Uma alternativa da questão (A a E), com os estados de antes e depois de responder.

**Props.** `letter`, `children` (texto), `checked`, `struck` (riscada), `result` (`correct`, `wrong`, `other`, `void` depois de responder), `tag` (“Gabarito”, “Sua resposta”), `onSelect(letter)`, `onStrike(letter)`, `tabIndex`.

- A linha inteira é o alvo (mínimo 52px de altura). Texto em Literata 17px, que escala com o controle Aa.
- Marcada: fundo `accent-soft`, borda `accent` de 1,5px, letra preenchida com mola.
- Riscar é para eliminar o que você já descartou: botão à direita (sempre visível no toque, no hover com mouse) ou clique direito. Riscada fica em `ink-3`, com o traço em todas as linhas do texto. Marcar uma riscada tira o risco.
- Depois de responder: a certa ganha ✓ e `success-soft`; a sua errada, ✕ e `danger-soft`; as outras ficam a 55%. Ninguém mais clica.
- Provas têm 4 (ENAMED) ou 5 alternativas (ENARE, SUS-SP): o componente não assume quantidade.
- Use sempre dentro de um `radiogroup` (o `QuestionCard` já faz isso).
"""

G["QuestionCard"] = """A questão inteira: banca e tema, selos, enunciado, alternativas, responder, resultado, explicação e correção em vídeo.

**Props.** `question`: `exam`, `number`, `path` (caminho do tema), `badges` (kinds do `Badge`), `stem`, `image`/`imageAlt`, `alternatives` (`{A: …}`), `answer`, `answerNote`, `status` (`anulada`), `explanation`, `explanationNote`, `video` (props do `VideoCorrection`). Também `onAnswer(letter, correct)`, `onNext`, `nextLabel`, `initialChoice`, `initialAnswered`.

- O enunciado é conteúdo: Literata 18px, medida de 68 caracteres, sem caixa nem cor em volta. A interface (banca, tema, ferramentas) fica no topo, pequena.
- Responder fica desligado até marcar. Depois, o resultado abre no próprio cartão (sem modal), o foco vai para ele e a página rola só o necessário. O botão vira “Próxima questão”.
- O resultado diz o fato e a fonte: “Você errou. Gabarito: B.” e, embaixo, de onde vem o gabarito quando não é definitivo.
- A explicação é curta (3 a 5 frases), em Literata 16px, com a nota de como foi escrita e se teve revisão médica.
- Ferramentas no topo: Aa (tamanho 90/100/115% e fonte serifada ou sem serifa) e marcar para revisar (bandeira âmbar quando ligada).
- Imagens de prova ocupam a largura do cartão; no escuro, brilho de 88%.
- Teclado: A–E ou 1–5 marca, ↑↓ anda, Enter responde.
"""

G["VideoCorrection"] = """Link para a correção em vídeo que abre o YouTube no segundo em que a questão começa, com os momentos-chave marcados.

**Props.** `url` (link do vídeo sem `t`), `start` e `end` (segundos do trecho da questão), `channel`, `title`, `moments` (`[{ t, text }]`, em segundos; o componente ordena), `warning` (texto quando o vídeo discorda do gabarito).

- O link principal leva a `&t=<start>s` e mostra o horário no rótulo (“começa em 9:27:44”). Cada momento abre no seu segundo.
- A barra mostra o trecho da questão (início e fim reais) com um ponto por momento, na posição certa; passar o mouse num momento acende o ponto.
- Quando `video.diverge` é verdadeiro, passe `warning`: “No vídeo a resposta é D; o gabarito oficial é C.” O aviso fica acima dos momentos, em âmbar.
- Abre em nova aba, no player do YouTube; não incorpore um player próprio. Não toque nada automaticamente.
- Os momentos vêm de `correcoes_video[].dicas` do banco; escreva-os como frases completas e curtas.
"""

G["Flashcard"] = """Sessão de revisão de flashcards: pilha de cartões, resposta revelada no lugar, avaliação em quatro níveis, arrastar no toque e desfazer.

**Props.** `cards`: `[{ type: "cloze" | "qa", deck, before, answer, after, choices?, front?, extra?, ref? }]` (o mesmo formato dos baralhos de pergunta e resposta: pergunta, resposta e referência, com lacunas `[…]` ou de escolha `[iniciado / terminado]`). `intervals` (`{ again, hard, good, easy }`, texto do próximo intervalo), `title`.

- Revelar não vira o cartão: a lacuna cresce até o tamanho da resposta e a resposta aparece dentro dela; explicação (itálico) e referência entram embaixo. A pergunta nunca sai da tela.
- Avaliação: De novo (texto `danger-ink`), Difícil, Bom (o único preenchido, porque é a resposta mais comum) e Fácil, todos do mesmo tamanho, cada um com o próximo intervalo e a tecla.
- Teclado: Espaço revela, 1–4 avalia, Ctrl/⌘+Z ou Z desfaz. No toque, arrastar para a esquerda é De novo e para a direita é Bom, só depois de revelar.
- Desfazer volta o cartão com a resposta à mostra e o nome da avaliação desfeita no rótulo do botão. Não peça confirmação para avaliar.
- A pilha mostra até dois cartões atrás, para dar noção de quantos faltam; o contador diz “3 de 6”.
- No fim, mostre o que foi feito (cards, % Bom ou Fácil, minutos) e quando volta. Sem confete.
"""

G["AnkiImport"] = """Importação de um baralho do Anki (.apkg) em quatro passos: soltar o arquivo, ler, escolher o que entra, importar.

**Props.** `deck`: `file` (`name`, `size`), `cards`, `images`, `subdecks`, `areas` (`[{ name, count, subdecks }]`), `note`. Também `onDone`, `initialStep` (`idle`, `review`) e `demo` (mostra um atalho para simular com o arquivo de exemplo).

- Sempre dois caminhos para o arquivo: arrastar para a zona e o botão “Escolher arquivo”. A zona só acende com um arquivo em cima.
- Arquivo errado: a zona treme uma vez e a mensagem diz o que é e como exportar do Anki.
- Progresso com número real (“Lendo cards · 9.420 de 18.904”) e ritmo constante; Cancelar sempre visível; a pessoa pode sair da tela.
- Antes de importar, mostre o que tem dentro (grupos, quantidades, imagens) e deixe tirar grupos. Diga se o arquivo não traz histórico de revisões.
- Depois: quantos entraram, “Desfazer importação” e “Começar a revisar”.
- Se a leitura acontecer no navegador, diga isso na zona (“o arquivo não sai do seu computador”).
- Os números do preview são de um baralho real do Anki: 1,69 GB, 18.904 cards, 331 baralhos, 3.901 imagens, nenhuma revisão.
"""

G["ExamNavigator"] = """Mapa do simulado: cronômetro, uma célula por questão agrupada por área, marcação para revisar e finalizar com confirmação.

**Props.** `title`, `total`, `areas` (`[{ name, from, to }]`), `answered` (números), `marked`, `current`, `remaining` (segundos), `onJump(n)`.

- A célula mostra o número sempre. Respondida: `accent`. Em branco: `surface-2`. Para revisar: canto dobrado em `warning`. Atual: anel em `ink`. A legenda fica embaixo.
- Áreas na ordem do caderno, com “18/20” à direita de cada uma.
- Cronômetro em números tabulares; abaixo de 30 minutos ganha `warning-soft`, abaixo de 5 minutos `danger-soft`. Nunca interrompa a prova com alerta de tempo.
- Finalizar abre o `Dialog` com o número de questões em branco no título e o tempo que ainda resta no corpo.
- No desktop, o mapa fica ao lado da questão; no celular, abre numa folha pela barra superior.
- Setas andam pelas células (10 por linha).
"""

G["Dialog"] = """Pergunta que precisa de resposta antes de seguir, para o que não dá para desfazer: diálogo no centro no desktop, folha que sobe da borda no celular.

**Props.** `open`, `title`, `children` (corpo), `confirmLabel`, `cancelLabel` (padrão “Cancelar”), `destructive`, `onConfirm`, `onClose`.

- Só para ações sem volta: finalizar prova, apagar baralho, zerar progresso. Avaliar card, marcar questão e importar não pedem confirmação (têm desfazer).
- Título é a pergunta com o número que importa: “Finalizar com 12 questões em branco?”. Corpo diz a consequência em uma ou duas frases.
- Dois botões, verbos: o de seguir em frente à direita (ou embaixo, no celular, em largura total), o de voltar à esquerda (ou em cima).
- Esc, clicar fora e “Continuar respondendo” fecham sem fazer nada. O foco fica preso dentro e volta para quem abriu.
- Entrada com `spring-smooth`; saída em 160ms (diálogo) ou 240ms (folha).
- Um por vez.
"""

G["StudyPlan"] = """Cronograma: quantos dias faltam para a prova, a semana e as tarefas de hoje.

**Props.** `exam`, `daysLeft`, `dateLabel`, `planDone` (0 a 1), `week` (`[{ wd, n, label, today, exam, done, total }]`), `tasks` (`[{ id, kind: "questoes" | "flashcards" | "prova" | "erros", title, meta, done, action? }]`), `onStart`.

- O número de dias é o único `display` da tela, em números tabulares. O anel mostra quanto do plano já foi feito.
- A semana começa no domingo. Hoje tem o número em `accent-ink`; o dia escolhido, preenchido. Pontos embaixo: tarefas do dia (feitas em `success`); dia de simulado, uma barra azul.
- Tarefa: título com quantidade e tema (“40 questões de Cardiologia”), tipo e tempo estimado embaixo, botão tingido para começar. Marcar feita preenche o círculo com ✓ (240ms); o texto fica em `ink-2` e não é riscado.
- Pergunte a data da prova dentro do cronograma, com um padrão, não no cadastro.
"""

G["ProgressRing"] = """Anel de progresso para algo que continua na tela: plano, tarefas do dia, metas.

**Props.** `value` (0 a 1), `size`, `stroke`, `text` (substitui a porcentagem), `caption`, `tone` (`success` quando completo), `label` (texto para leitor de tela), `children: false` (só o anel).

- Use para progresso que fica; para algo que está carregando, use `Meter` com número.
- Rótulo no centro com o valor e uma palavra embaixo (“do plano”). Em tamanhos abaixo de 40px, sem rótulo, com `label`.
- Quando muda, o arco anda em 520ms com `ease-out`. Não anime ao abrir a tela.
"""

G["Meter"] = """Barra de quantidade sobre um total conhecido, com o rótulo e os dois números.

**Props.** `label`, `value`, `max`, `valueLabel` (substitui “x de y”), `tone` (`success`, `warning`).

- Sempre com o número escrito; a barra é a pista visual, não a informação.
- Para importação e leitura, o valor anda em ritmo constante e o rótulo diz o que está acontecendo (“Lendo cards”).
- `warning` quando chega perto de um limite (tempo de prova); `success` quando o total é bom de ser alcançado.
"""

G["BarList"] = """Comparação entre categorias em barras horizontais, com uma frase de resumo em cima e a meta marcada.

**Props.** `summary` (a conclusão, em uma frase), `rows` (`[{ name, value, n? }]`, valor em %), `goal` (%, opcional).

- Comece pela frase: “Você acerta mais em Pediatria e menos em Preventiva.” O gráfico confirma.
- Uma cor só (`accent`); o ícone e o nome da área escritos (o ícone sai sozinho para as cinco áreas; outros itens aceitam `icon`); o valor à direita. Escala fixa de 0 a 100%.
- A meta é uma linha vertical em `ink` atravessando todas as barras.
- Mais de 8 linhas: use uma tabela ordenável.
"""

G["TabBar"] = """Navegação principal no celular: uma dock de vidro líquido que flutua sobre o conteúdo, com uma lente de vidro que leva a seleção de uma aba à outra.

**Props.** `items` (padrão: Hoje, Questões, Provas, Flashcards, Desempenho; cada item aceita `badge`), `current`, `onChange(id)`, `minimized` (dock compacta, só ícones), `static` (dentro do fluxo, para documentação).

- **Sempre os mesmos cinco destinos**, na mesma ordem e com os mesmos nomes da `Sidebar`. Uma palavra por aba.
- **Toque ou arraste.** Ao tocar, a lente se levanta da aba atual e desliza até a tocada. Ao arrastar o dedo pela dock, a lente segue o dedo com mola e, ao soltar, pousa na aba mais próxima. A navegação acontece no toque, sem esperar a lente terminar.
- **O vidro.** A dock usa `material` com desfoque e saturação; a lente é mais clara, amplia o que está embaixo e tem franja cromática (`danger` e `accent`) que cresce com a velocidade. No Chrome e no Edge a lente refrata o fundo com um mapa de deslocamento em SVG (a técnica do liquid-glass-react); Safari e Firefox mostram o vidro sem refração. A aparência em repouso é igual em todos.
- **Selos.** `badge: "dot"` para algo novo dentro do destino (uma prova nova no banco); um texto curto (`"NOVO"`) para um destino novo; um número só para o que pede ação hoje. Nada de contar cards para revisar: isso mora na tela Hoje.
- **Rolar.** Passe `minimized` quando a pessoa rola para baixo e tire quando volta a rolar para cima: a dock encolhe de 64 para 52px e mostra só os ícones.
- **Some** só embaixo de um simulado em andamento, que ocupa a tela toda.
- **Acessibilidade.** Cada aba é um botão com `aria-current="page"` na atual; ← e → trocam de aba; com “reduzir movimento”, a seleção troca sem lente; com “reduzir transparência”, o vidro vira sólido.
"""

G["Sidebar"] = """Navegação principal no desktop (a partir de 1000px): marca no topo e os mesmos cinco destinos da `TabBar`, agrupados.

**Props.** `items`, `groups` (`[{ label, ids }]`; padrão Estudar e Acompanhar), `current`, `onChange(id)`. Itens podem ter `count`.

- Mesmos nomes e ordem da barra de abas. Dois níveis no máximo.
- Item atual: `accent-soft` com texto `accent-ink` semibold. Hover: camada `hover`.
- O número à direita é informação de inventário (1.200 questões), não alerta.
- Largura `sidebar-width` (248px); fundo `bg` com uma linha `line` à direita.
"""

G["Pulse"] = """Indicador de espera desenhado como um traçado de ECG que corre, como num monitor: para leituras, correções e sincronizações que levam mais de um segundo.

**Props.** `size` (largura em px; a altura acompanha), `tone` (`success` para algo que terminou e segue ativo, como “sincronizado”), `label` (o que está acontecendo, para leitor de tela).

- Use ao lado de um texto que diga o que está acontecendo: “Corrigindo sua prova…”, “Lendo cards”. Sozinho, o traçado não explica nada.
- Quando dá para saber quanto falta, use `Meter` com o número; `Pulse` é para quando não dá.
- Um batimento a cada 1,4s. Com “reduzir movimento”, o traçado fica parado.
- Dentro de botões, continue usando o `loading` do `Button` (o traçado não lê em 16px).
"""

G["Vitals"] = """Painel de desempenho no desenho de um monitor multiparamétrico: cada métrica é um canal, com valor grande, a meta no lugar do limite de alarme e o traçado dos últimos dias.

**Props.** `metrics`: `[{ label, value, unit?, goal?, trend: number[], note?, alarm?, display?, higherIsBetter? }]`, `title`.

- Até quatro canais por painel: Acerto (%), Ritmo (questões por dia), Revisões (cards por dia), Sequência (dias seguidos). Mais que isso, use `BarList` ou uma tabela.
- Canal em caixa alta e curto, como no monitor (ACERTO, RITMO). A unidade vem depois do número, menor.
- A meta aparece no canto (“meta 70”) e como linha tracejada no traçado. Abaixo da meta o valor e o traçado ficam âmbar e aparece “abaixo da meta” com ícone: o alarme nunca depende só da cor. Use `higherIsBetter: false` quando menor é melhor (tempo por questão).
- O traçado é uma curva suave sem eixos, com um ponto no valor de hoje; o leitor de tela recebe os números.
- Não use para dados que a pessoa não pode mudar estudando.
"""

G["Toast"] = """Aviso curto no rodapé que confirma o que acabou de acontecer e oferece desfazer.

**Props.** `children` (texto), `icon`, `action`, `onAction`, `kbd`, `closing`, `style`.

- Uma linha, no particípio: “Avaliado como Bom”, “18.904 cards importados”, “Questão 38 marcada para revisar”.
- No máximo uma ação, e ela é quase sempre Desfazer.
- Fundo invertido (`inverse`), centralizado embaixo, acima da barra de abas. Entra com `spring-snappy`, sai em 160ms.
- Avisos com Desfazer ficam até a próxima ação, não somem por tempo. Os outros saem em 4 segundos.
- Erros que pedem ação não são toast: ficam junto do problema.
"""

for nome, txt in G.items():
    d = os.path.join(RAIZ, "project", "components", nome)
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "README.md"), "w").write("# " + nome + "\n\n" + txt)
print(len(G), "guias")
