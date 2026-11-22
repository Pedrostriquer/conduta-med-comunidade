# Toast

Aviso curto no rodapé que confirma o que acabou de acontecer e oferece desfazer.

**Props.** `children` (texto), `icon`, `action`, `onAction`, `kbd`, `closing`, `style`.

- Uma linha, no particípio: “Avaliado como Bom”, “18.904 cards importados”, “Questão 38 marcada para revisar”.
- No máximo uma ação, e ela é quase sempre Desfazer.
- Fundo invertido (`inverse`), centralizado embaixo, acima da barra de abas. Entra com `spring-snappy`, sai em 160ms.
- Avisos com Desfazer ficam até a próxima ação, não somem por tempo. Os outros saem em 4 segundos.
- Erros que pedem ação não são toast: ficam junto do problema.
