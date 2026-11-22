# Movimento

Movimento no Conduta explica o que mudou e de onde veio. Ele nunca é a única forma de saber o que aconteceu (sempre há texto, ícone ou mudança de estado) e nunca faz ninguém esperar.

## O tempo certo para cada coisa

A regra: quanto mais vezes a interação acontece num dia, mais curta e discreta ela é. Um estudante avalia centenas de flashcards e responde dezenas de questões; uma animação longa ali vira atrito. Uma prova finalizada acontece uma vez; ali o movimento pode respirar.

| Momento | Frequência | Duração | Curva | Componente |
|---|---|---|---|---|
| Pressionar qualquer botão (escala 0,97) | muitas vezes | `duration-instant` 90ms | `ease-out` | `Button`, `Chip`, avaliação |
| Soltar o botão | muitas vezes | 459ms (assenta) | `spring-snappy` | todos os botões |
| Hover, mudar cor de chip ou célula | muitas vezes | `duration-quick` 160ms | `ease-out` | `Chip`, `Alternative`, `ExamNavigator` |
| Marcar alternativa (letra se preenche) | muitas vezes | 459ms | `spring-snappy` | `Alternative` |
| Riscar alternativa (texto apaga e o traço aparece em todas as linhas) | algumas vezes | `duration-base` 240ms | `ease-out` | `Alternative` |
| Revelar a resposta do flashcard | muitas vezes | 240ms + lacuna 616ms | `spring-smooth` | `Flashcard` |
| Flashcard avaliado sai | muitas vezes | 160ms | `ease-exit` | `Flashcard` |
| Próximo flashcard sobe da pilha | muitas vezes | 459ms | `spring-snappy` | `Flashcard` |
| Polegar do controle segmentado | algumas vezes | 459ms | `spring-snappy` | `SegmentedControl` |
| Abrir resultado e explicação | uma vez por questão | 616ms | `spring-smooth` | `QuestionCard` |
| Ícone de acerto/erro aparece | uma vez por questão | 738ms | `spring-bouncy` | `QuestionCard` |
| Aviso (toast) entra / sai | eventual | 459ms / 160ms | `spring-snappy` / `ease-exit` | `Toast` |
| Diálogo ou folha entra / sai | raro | 616ms / 160–240ms | `spring-smooth` / `ease-exit` | `Dialog` |
| Lente da dock se levanta | a cada troca de aba | cerca de 90ms | física (aproximação exponencial) | `TabBar` |
| Lente desliza até a aba | a cada troca de aba | cerca de 350ms | mola física (rigidez 540, amortecimento 0,66) | `TabBar` |
| Lente pousa e vira pílula | a cada troca de aba | 240ms | `ease-out` | `TabBar` |
| Dock encolhe ao rolar para baixo | eventual | 360ms | `spring-snappy` | `TabBar` |
| ECG correndo numa espera | contínuo | 1400ms por batimento | linear | `Pulse` |
| Anel do cronograma ao concluir o dia | raro | `duration-slow` 520ms | `ease-out` | `ProgressRing` |

As durações das molas são o tempo de assentamento; a parte que o olho percebe acaba antes (90% do caminho em cerca de 200ms na `spring-snappy`).

## As curvas

- `ease-out` — `cubic-bezier(0.22, 1, 0.36, 1)`. Arranca rápido e assenta devagar. É a padrão para tudo que entra ou responde ao toque.
- `ease-in-out` — `cubic-bezier(0.65, 0, 0.35, 1)`. Para algo que já está na tela e muda de lugar.
- `ease-exit` — `cubic-bezier(0.4, 0, 1, 1)`. Saídas: o elemento some acelerando, sem pedir atenção.
- `spring-smooth`, `spring-snappy`, `spring-bouncy` — molas calculadas como no SwiftUI (`spring(duration:bounce:)`) e convertidas para `linear()` do CSS. Sem quique, 15% e 30% de quique. Use sempre a duração indicada no token, ou a mola é cortada no meio.

## Coreografias

**Revelar o flashcard.** A pergunta não sai do lugar: a lacuna `[…]` cresce até a largura da resposta (616ms, `spring-smooth`) e a resposta aparece dentro dela saindo de um desfoque de 6px (240ms, 60ms de atraso). Depois entram, de 50 em 50ms, a explicação e a referência, subindo 6px. Não há virada 3D: virar o cartão esconde a pergunta e obriga a reler.

**Avaliar.** O cartão sobe 14px e some em 160ms; o de trás, que já esperava a 95,5% do tamanho e 10px abaixo, assume com `spring-snappy`. Os botões de avaliação dão lugar ao “Mostrar resposta” com esmaecimento de 160ms. Dá para apertar a próxima tecla no meio da animação.

**Arrastar (só no toque).** O cartão segue o dedo e gira 1° a cada 26px. Passou de 32% da largura, ou soltou rápido (mais de 0,6px/ms): esquerda é De novo, direita é Bom, e o cartão sai para o lado em 240ms. Antes disso, volta com `spring-snappy`. Arrastar só funciona com a resposta à mostra, e os quatro botões continuam lá.

**Trocar de aba (vidro líquido).** A lente nasce na aba atual, cresce para 110% em cerca de 90ms e desliza até a aba tocada numa mola física (rigidez 540, amortecimento 0,66), que é a mesma coisa que segue o dedo quando a pessoa arrasta pela dock. Enquanto anda, estica até 26% na horizontal e achata na vertical, proporcional à velocidade, e a franja cromática acende; o que fica embaixo dela aparece ampliado e azul, e os itens originais somem nessa faixa. Ao parar, a lente encolhe para 84% e esmaece em 240ms enquanto a pílula aparece por baixo. A navegação acontece no toque, sem esperar a lente.

**Rolar.** Rolando para baixo mais de 4px, a dock encolhe de 64 para 52px e os rótulos somem; rolando para cima, volta.

**Responder a questão.** A letra escolhida vira ✓ ou ✕ com mola; a alternativa certa ganha `success-soft`, a errada `danger-soft`, as outras ficam com 55% de opacidade. O bloco de resultado abre a altura de 0 até o conteúdo (`grid-template-rows` 0fr → 1fr) e o foco vai para ele. Se ele estiver fora da tela, a página rola só o necessário.

## Movimento reduzido

Com `prefers-reduced-motion: reduce`, todo deslocamento, escala e desfoque vira esmaecimento linear de 150ms, as animações de entrada terminam em 1ms e o cartão avaliado só desaparece. Nenhuma informação depende de movimento.

## O que não fazer

- Animar o que acontece toda hora com mais de 240ms.
- Quique fora de acerto e conclusão do dia.
- Animar a entrada da página inteira ou de listas item por item.
- Esperar a animação terminar para aceitar o próximo toque.
- Usar `transition: all`.
