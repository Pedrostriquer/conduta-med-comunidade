# ExamNavigator

Mapa do simulado: cronômetro, uma célula por questão agrupada por área, marcação para revisar e finalizar com confirmação.

**Props.** `title`, `total`, `areas` (`[{ name, from, to }]`), `answered` (números), `marked`, `current`, `remaining` (segundos), `onJump(n)`.

- A célula mostra o número sempre. Respondida: `accent`. Em branco: `surface-2`. Para revisar: canto dobrado em `warning`. Atual: anel em `ink`. A legenda fica embaixo.
- Áreas na ordem do caderno, com “18/20” à direita de cada uma.
- Cronômetro em números tabulares; abaixo de 30 minutos ganha `warning-soft`, abaixo de 5 minutos `danger-soft`. Nunca interrompa a prova com alerta de tempo.
- Finalizar abre o `Dialog` com o número de questões em branco no título e o tempo que ainda resta no corpo.
- No desktop, o mapa fica ao lado da questão; no celular, abre numa folha pela barra superior.
- Setas andam pelas células (10 por linha).
