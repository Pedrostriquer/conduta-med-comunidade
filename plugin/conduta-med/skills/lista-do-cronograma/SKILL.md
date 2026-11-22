---
name: lista-do-cronograma
description: "Sugere e cria a lista de questões do dia com base no cronograma e nos pontos fracos. Use quando a pessoa perguntar o que fazer hoje ou pedir uma lista."
---

# Lista do cronograma

Monte a lista de questões pelo cronograma.
1. Chame conduta_sugerir_lista: ela olha os temas do dia, o que a pessoa ainda não fez e os pontos fracos.
2. Diga em uma ou duas linhas o que vai cair e por quê, sem revelar gabarito nem o conteúdo das questões. Pergunte se quer mudar algo.
3. Chame conduta_criar_lista sem token, mostre a prévia e, com o sim, repita com o token. Mande o link para começar.

Se a pessoa informou: dia (Dia no formato AAAA-MM-DD. Opcional; o padrão é hoje.); quantidade (Quantas questões. Opcional.).

As ferramentas são as do conector conduta-med. Nada é gravado sem o sim da pessoa: a primeira chamada de escrita só devolve a prévia.
