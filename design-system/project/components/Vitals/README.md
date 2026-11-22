# Vitals

Painel de desempenho no desenho de um monitor multiparamétrico: cada métrica é um canal, com valor grande, a meta no lugar do limite de alarme e o traçado dos últimos dias.

**Props.** `metrics`: `[{ label, value, unit?, goal?, trend: number[], note?, alarm?, display?, higherIsBetter? }]`, `title`.

- Até quatro canais por painel: Acerto (%), Ritmo (questões por dia), Revisões (cards por dia), Sequência (dias seguidos). Mais que isso, use `BarList` ou uma tabela.
- Canal em caixa alta e curto, como no monitor (ACERTO, RITMO). A unidade vem depois do número, menor.
- A meta aparece no canto (“meta 70”) e como linha tracejada no traçado. Abaixo da meta o valor e o traçado ficam âmbar e aparece “abaixo da meta” com ícone: o alarme nunca depende só da cor. Use `higherIsBetter: false` quando menor é melhor (tempo por questão).
- O traçado é uma curva suave sem eixos, com um ponto no valor de hoje; o leitor de tela recebe os números.
- Não use para dados que a pessoa não pode mudar estudando.
