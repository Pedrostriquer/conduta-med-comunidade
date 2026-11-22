# Acessibilidade

O Conduta é usado por horas seguidas, à noite, no celular e no notebook. Acessibilidade aqui é conforto de leitura e controle total pelo teclado, além do mínimo legal.

## Contraste

- Todo par de texto declarado nas notas dos tokens passa 4,5:1 nos dois temas (a maioria passa 7:1). `ink` sobre `surface` dá 17,5:1 no claro e 15,3:1 no escuro.
- Bordas que carregam significado (`line-strong` em alternativas, campos e checkboxes) e o anel de `focus` passam 3:1 sobre `surface`, `bg` e `accent-soft`.
- `warning` (âmbar) nunca é texto sobre branco: como texto, use `warning-ink`.
- Rótulo branco sobre `accent` passa 5,3:1 no claro e 4,8:1 no escuro; o hover escurece nos dois temas para não perder contraste.

## Cor não é a única pista

| Estado | Além da cor |
|---|---|
| Alternativa marcada | Letra preenchida, borda de 1,5px |
| Alternativa certa / errada | ✓ ou ✕ no lugar da letra, palavra “Gabarito” ou “Sua resposta” |
| Questão anulada, alterada, vídeo diverge | Ícone próprio e o nome no selo |
| Célula do mapa da prova | Número; respondida tem preenchimento; marcada tem canto dobrado; atual tem anel |
| Chip ativo | ✓ entra à esquerda do rótulo |
| Tarefa feita | Círculo preenchido com ✓ |
| Tempo acabando | Muda o fundo e o leitor de tela anuncia o tempo |

## Teclado

| Onde | Tecla | Ação |
|---|---|---|
| Questão | A–E ou 1–5 | Marcar alternativa |
| Questão | ↑ ↓ | Mover entre alternativas |
| Questão | Enter | Responder |
| Questão | clique direito | Riscar alternativa (também pelo botão de riscar) |
| Flashcard | Espaço ou Enter | Mostrar resposta |
| Flashcard | 1, 2, 3, 4 | De novo, Difícil, Bom, Fácil |
| Flashcard | Ctrl/⌘ + Z (ou Z) | Desfazer a última avaliação |
| Mapa da prova | setas | Andar pelas células (10 por linha) |
| Diálogo | Esc | Fechar (equivale a “Continuar respondendo”) |
| Controle segmentado | ← → | Trocar de opção |
| Dock (celular) | ← → | Trocar de aba |

- Atalhos de uma tecla só valem fora de campos de texto, e Espaço não rouba o clique de um botão focado.
- Não use Ctrl+Alt (no teclado ABNT2, AltGr é Ctrl+Alt). Não reaproveite Ctrl/⌘+F, que é do navegador.
- As teclas aparecem nos botões (`Kbd`) e somem em telas sem ponteiro fino.
- Depois de revelar, o foco vai de “Mostrar resposta” para “Bom”; depois de avaliar, volta para “Mostrar resposta”. Depois de responder a questão, o foco vai para o resultado. O diálogo prende o foco e devolve ao fechar.

## Toque

- Alvo mínimo de 44 × 44px; botões pequenos ganham área invisível em volta (`cd-hit`).
- Gestos são atalho, nunca o único caminho: arrastar o flashcard tem os quatro botões ao lado; riscar alternativa tem botão.
- Arrastar só funciona com toque (no trackpad, dois dedos para o lado é voltar página).

## Leitor de tela

- Alternativas são `radio` dentro de `radiogroup`; o mapa da prova lê “Questão 38, em branco, marcada para revisar”.
- O resultado tem `role="status"`; a importação expõe `progressbar` com valor; o cronômetro tem `role="timer"` e rótulo com o tempo.
- O ícone sozinho leva rótulo (`label`); o decorativo, `aria-hidden`.

## Movimento, tamanho e tema

- `prefers-reduced-motion`: tudo vira esmaecimento de 150ms (ver Movimento).
- `prefers-reduced-transparency`: o vidro da dock vira `surface` sólido e a lente perde a refração.
- O controle Aa da questão aumenta o texto em 15% e troca a serifada pela sem serifa. O zoom do navegador funciona até 200% sem cortar texto.
- O tema segue o sistema.
