Conduta é um app de estudo para a residência médica: questões de provas reais com gabarito oficial, explicação curta e a correção em vídeo aberta no segundo exato da questão, simulados cronometrados, flashcards (inclusive os importados do Anki) e um cronograma que leva até a data da prova. O nome vem da pergunta que mais aparece nessas provas: “qual é a conduta?”. A marca desenha essa decisão: um caminho que se bifurca, com o ramo escolhido em destaque.

Quem usa estuda horas seguidas, muitas vezes à noite e no celular. Tudo aqui serve a isso: texto confortável para ler muito, cor só onde carrega significado, movimento curto e nunca no caminho da próxima questão.

## Princípios

1. **A questão vem primeiro.** O enunciado, as alternativas e o cartão ocupam o centro; a interface fica na borda. Nada de enfeite na camada de conteúdo.
2. **Diga a verdade sobre a questão.** Gabarito preliminar, questão anulada, gabarito alterado depois de recurso, vídeo que discorda do gabarito: sempre visíveis, com selo, ícone e palavra. O estudante decide em que confiar.
3. **Deixe errar e voltar.** Riscar alternativa, desfazer a avaliação de um flashcard, desfazer uma importação. Confirmação só para o que não volta (finalizar uma prova).
4. **Rápido no que se repete.** Responder e avaliar acontecem centenas de vezes por dia: atalhos de teclado, animações de 90 a 240ms, nenhuma espera para seguir.
5. **Mesmo lugar, mesmo nome.** Os cinco destinos (Hoje, Questões, Provas, Flashcards, Desempenho) têm a mesma ordem e o mesmo nome na barra de abas do celular e na barra lateral do desktop.

## Escrita

Fale com quem estuda, em “você”, no português de um colega de residência que explica bem. Frases curtas, voz ativa, sem ponto de exclamação e sem emoji. Detalhes e exemplos na seção Escrita.

- Botões dizem o que acontece, começando pelo verbo: “Responder”, “Mostrar resposta”, “Importar 18.904 cards”, “Finalizar prova”.
- Resultados dizem o fato: “Você errou. Gabarito: B.” Nunca “Ops!” nem “Que pena!”.
- Números no formato brasileiro: 18.904, 0,5 mg/kg, 9:27:44. Datas por extenso: “domingo, 6 de dezembro”.
- Caixa de frase em tudo (títulos, botões, abas). Siglas como a banca escreve: ENARE, ENAMED, SUS-SP, ECG.

## Cor

Branco e cinzas frios para o conteúdo; um azul para o que se toca; cores de estado só para estado.

- Página em `bg`; cartões, questão e flashcard em `surface` com `shadow-1`. Preenchimentos embutidos (trilho do segmentado, chip inativo, célula em branco do mapa da prova) em `surface-2`.
- Texto em `ink`; metadados em `ink-2`; placeholder e contadores apagados em `ink-3`, só sobre `surface`.
- `accent` é o azul Conduta e significa “isto é interativo ou foi escolhido por você”: botão principal, alternativa marcada, célula respondida, aba atual. Texto sobre ele em `on-accent`. Azul como texto ou ícone usa `accent-ink`; fundo tingido, `accent-soft`. Não use o azul para texto que não se toca.
- Estados: `success` (verde-azulado) para acerto, `danger` (laranja-avermelhado) para erro e para De novo, `warning` (âmbar) para atenção (anulada, alterada, vídeo diverge, marcada para revisar, tempo acabando). Texto de estado sempre no par `-ink` sobre `-soft` ou `surface`.
- Acerto e erro nunca dependem só da cor: a alternativa certa leva ✓ e a palavra “Gabarito”; a errada leva ✕ e “Sua resposta”. O verde-azulado e o laranja foram escolhidos para continuarem distintos para quem tem daltonismo vermelho-verde.
- Áreas da medicina não têm cor própria. Em gráficos, uma cor só (`accent`) e o nome da área escrito.
- Modo escuro segue o sistema; não ofereça um seletor de tema dentro do app. No escuro, imagens de prova (ECG, tomografia, gráficos com fundo branco) recebem `filter: brightness(.88)`, como no `QuestionCard`.

Todo texto passa 4,5:1 sobre o fundo indicado na nota do token, nos dois temas; bordas que carregam significado (`line-strong`, `focus`) passam 3:1.

## Tipografia

Duas famílias, cada uma com um trabalho:

- **Hanken Grotesk** (`--font-sans`) é a interface: botões, rótulos, números, navegação. Foi escolhida por diferenciar I, l e 1 (o “l” tem cauda), o que importa em “IL-1”, “1 g/h” e “10 mL”.
- **Literata** (`--font-reading`) é o conteúdo: enunciado, alternativas, explicação e flashcard. É uma serifada desenhada para leitura longa em tela, com tamanho óptico. A questão lê como o caderno de prova; a interface ao redor, como app.

Use os estilos do grupo Interface para a interface e os do grupo Leitura para o conteúdo. Para números que mudam ou se alinham (cronômetro, contadores, colunas), use `font-variant-numeric: tabular-nums`. Pesos abaixo de 400 não entram. O mínimo é 11px (rótulo da barra de abas); texto corrido nunca abaixo de 15px.

O enunciado tem medida máxima de `measure` (68 caracteres) e o leitor pode mudar tamanho (90%, 100%, 115%) e trocar a serifada pela sem serifa no botão Aa do `QuestionCard`. Respeite o zoom do navegador: nada de altura fixa em caixa de texto.

## Espaço, layout e raios

- Grade de 4px. Use os tokens `space-*`: 8 entre alternativas, 16 de margem mínima no celular, 24 de padding no cartão no desktop, 32 entre seções.
- Abaixo de `breakpoint-compact` (700px): barra de abas embaixo, diálogos viram folhas que sobem da borda, botões principais ocupam a largura. A partir de `breakpoint-regular` (1000px): barra lateral. A função não muda com a largura; só o que fica visível.
- Coluna de conteúdo até `content-max` (760px), centrada.
- Raios concêntricos: o raio de dentro é o de fora menos a folga. Cartão em `radius-xl` (22) com 6 de folga leva alternativas em `radius-lg` (16); o trilho do segmentado (11) com 2 de folga leva o polegar em `radius-sm` (9). Chips, anéis e o aviso são `radius-full`.
- Área de toque mínima de `target-touch` (44px). Botões menores ganham área invisível em volta.

## Materiais e elevação

O conteúdo é sólido. Vidro só na navegação que flutua sobre o conteúdo: a dock do celular e a barra superior. Nunca em cartões, alternativas ou botões.

- **Vidro da dock**: `material` (78%) com `backdrop-filter: blur(16px) saturate(190%)`, brilho especular na borda de cima e reflexo fraco na de baixo. O conteúdo passa por baixo e tinge o vidro.
- **Vidro líquido (a lente)**: quando a seleção muda, uma lente de vidro mais clara se levanta da aba atual, desliza com mola até a nova aba ampliando o que está embaixo (os ícones aparecem maiores e em `accent-ink`), estica na direção do movimento e ganha uma franja cromática, `danger` de um lado e `accent` do outro, mais forte quanto mais rápido anda. Ao parar, encolhe e vira a pílula da aba. No Chrome e no Edge a lente também refrata o fundo de verdade (mapa de deslocamento em SVG, a técnica do liquid-glass-react); Safari e Firefox mostram o mesmo vidro sem a refração.
- Com “reduzir transparência”, o vidro vira `surface` sólido; com “reduzir movimento”, a seleção troca sem a lente.

`shadow-1` separa cartões do fundo; `shadow-2`, o que está na mão (polegar do segmentado, flashcard da frente); `shadow-3`, o que flutua (diálogo, folha, aviso). No escuro a elevação vem da superfície mais clara.

## Movimento

Cada animação tem um motivo e um tempo pelo uso. O que se repete é curto; o que acontece uma vez pode respirar. Tabela completa e curvas na seção Movimento.

- Pressionar: escala 0,97 em `duration-instant` (90ms); soltar volta com `spring-snappy`.
- Marcar alternativa, hover, chip: `duration-quick` (160ms) com `ease-out`.
- Revelar a resposta do flashcard, abrir a explicação: `duration-base` (240ms) e `spring-smooth`.
- Diálogo e folha: `spring-smooth`; saída em 160 a 240ms com `ease-exit`.
- `spring-bouncy` só no ícone de acerto e ao concluir o dia.
- Nada bloqueia a próxima ação: dá para avaliar o próximo flashcard enquanto o anterior ainda sai.
- Com “reduzir movimento” ligado, deslocamentos viram esmaecimentos de 150ms.

## Iconografia

Ícones próprios, desenhados numa grade de 24px com traço de 1,75 e pontas arredondadas, em `currentColor` (o componente `Icon`; cópias em SVG no grupo Ícones). Use a versão de traço ao lado de texto e aumente o traço para 2 na aba selecionada. Um ícone, um conceito: `questions` é questão, `exam` é prova, `cards` é flashcard, `today` é Hoje, `pulse` é Desempenho. Ícone sozinho sempre tem rótulo acessível (`label`). Sem emoji na interface.

Cada grande área tem um ícone, e só ele, já que áreas não têm cor: `stethoscope` Clínica Médica, `scalpel` Cirurgia, `pacifier` Pediatria, `uterus` Ginecologia e Obstetrícia, `shield` Preventiva. Eles aparecem em filtros, no mapa da prova e no desempenho, sempre ao lado do nome.

## Linguagem médica

A medicina entra pelo que o estudante já reconhece do plantão, nunca como enfeite (nada de cruz vermelha, coração ou caduceu):

- **Monitor.** O desempenho é lido como sinais vitais (`Vitals`): canal em caixa alta, valor grande, meta no lugar do limite de alarme e um traçado embaixo. Abaixo da meta, o valor fica âmbar com “abaixo da meta”, como um alarme.
- **ECG.** Esperas mostram um traçado de eletrocardiograma correndo (`Pulse`), no lugar de um círculo girando. O ícone de Desempenho é o mesmo traçado.
- **Áreas.** Estetoscópio, bisturi, chupeta, útero e escudo identificam as cinco áreas da prova.
- **O caderno de prova.** O enunciado em serifada, como no papel da banca, e os selos da banca (anulada, gabarito alterado, preliminar) com o vocabulário oficial.

## Acessibilidade

Teclado em tudo: A–E marca alternativa, Enter responde, Espaço revela o flashcard, 1–4 avalia, Ctrl/⌘+Z desfaz, Esc fecha. As teclas aparecem nos botões (`Kbd`) e somem em telas de toque. Foco visível com o token `focus`, 2px com 2px de folga. Detalhes na seção Acessibilidade.

## Usando os componentes

Os componentes estão em `components/bundle.js` como `window.Conduta` e precisam de React 18 na página e de `components/bundle.css` depois de `tokens.css`. Envolva telas em um elemento com a classe `cd-root`. Os dados de exemplo vêm do banco real: a questão 46 do ENAMED 2026 com a correção do Grupo outro app, e os números do arquivo outro app.apkg (18.904 cards). Os flashcards de exemplo foram escritos no mesmo formato do deck (pergunta, resposta, referência e lacunas) e não são cópia dele.

As fontes Hanken Grotesk e Literata estão sob a SIL Open Font License 1.1.
