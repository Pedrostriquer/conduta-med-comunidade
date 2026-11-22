# BarList

Comparação entre categorias em barras horizontais, com uma frase de resumo em cima e a meta marcada.

**Props.** `summary` (a conclusão, em uma frase), `rows` (`[{ name, value, n? }]`, valor em %), `goal` (%, opcional).

- Comece pela frase: “Você acerta mais em Pediatria e menos em Preventiva.” O gráfico confirma.
- Uma cor só (`accent`); o ícone e o nome da área escritos (o ícone sai sozinho para as cinco áreas; outros itens aceitam `icon`); o valor à direita. Escala fixa de 0 a 100%.
- A meta é uma linha vertical em `ink` atravessando todas as barras.
- Mais de 8 linhas: use uma tabela ordenável.
