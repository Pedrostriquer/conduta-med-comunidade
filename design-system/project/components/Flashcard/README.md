# Flashcard

Sessão de revisão de flashcards: pilha de cartões, resposta revelada no lugar, avaliação em quatro níveis, arrastar no toque e desfazer.

**Props.** `cards`: `[{ type: "cloze" | "qa", deck, before, answer, after, choices?, front?, extra?, ref? }]` (o mesmo formato dos baralhos de pergunta e resposta: pergunta, resposta e referência, com lacunas `[…]` ou de escolha `[iniciado / terminado]`). `intervals` (`{ again, hard, good, easy }`, texto do próximo intervalo), `title`.

- Revelar não vira o cartão: a lacuna cresce até o tamanho da resposta e a resposta aparece dentro dela; explicação (itálico) e referência entram embaixo. A pergunta nunca sai da tela.
- Avaliação: De novo (texto `danger-ink`), Difícil, Bom (o único preenchido, porque é a resposta mais comum) e Fácil, todos do mesmo tamanho, cada um com o próximo intervalo e a tecla.
- Teclado: Espaço revela, 1–4 avalia, Ctrl/⌘+Z ou Z desfaz. No toque, arrastar para a esquerda é De novo e para a direita é Bom, só depois de revelar.
- Desfazer volta o cartão com a resposta à mostra e o nome da avaliação desfeita no rótulo do botão. Não peça confirmação para avaliar.
- A pilha mostra até dois cartões atrás, para dar noção de quantos faltam; o contador diz “3 de 6”.
- No fim, mostre o que foi feito (cards, % Bom ou Fácil, minutos) e quando volta. Sem confete.
