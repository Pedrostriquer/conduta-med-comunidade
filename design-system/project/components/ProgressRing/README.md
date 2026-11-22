# ProgressRing

Anel de progresso para algo que continua na tela: plano, tarefas do dia, metas.

**Props.** `value` (0 a 1), `size`, `stroke`, `text` (substitui a porcentagem), `caption`, `tone` (`success` quando completo), `label` (texto para leitor de tela), `children: false` (só o anel).

- Use para progresso que fica; para algo que está carregando, use `Meter` com número.
- Rótulo no centro com o valor e uma palavra embaixo (“do plano”). Em tamanhos abaixo de 40px, sem rótulo, com `label`.
- Quando muda, o arco anda em 520ms com `ease-out`. Não anime ao abrir a tela.
