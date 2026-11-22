# Meter

Barra de quantidade sobre um total conhecido, com o rótulo e os dois números.

**Props.** `label`, `value`, `max`, `valueLabel` (substitui “x de y”), `tone` (`success`, `warning`).

- Sempre com o número escrito; a barra é a pista visual, não a informação.
- Para importação e leitura, o valor anda em ritmo constante e o rótulo diz o que está acontecendo (“Lendo cards”).
- `warning` quando chega perto de um limite (tempo de prova); `success` quando o total é bom de ser alcançado.
