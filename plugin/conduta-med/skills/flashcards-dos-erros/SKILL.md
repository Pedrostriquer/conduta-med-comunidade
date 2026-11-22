---
name: flashcards-dos-erros
description: "Cria flashcards a partir das questões que a pessoa errou, num baralho com nome. Use quando ela pedir cards dos erros ou quiser fixar o que erra sempre."
---

# Flashcards dos erros

Crie flashcards do que esta pessoa erra.
1. Chame conduta_erros e conduta_ver_flashcards com filtro errados, para saber o que ela erra e não repetir o que já tem.
2. No máximo 2 cards por questão, só com o que a faria acertar uma questão parecida. Frente curta e direta, ou lacuna {{c1::assim}}; verso com a resposta e uma linha do porquê.
3. Use o gabarito, a explicação e, se precisar, conduta_transcricao_explicacao. Não invente dose nem critério. Passe o questao_id de cada card.
4. Pergunte o nome do baralho, se não souber. Chame conduta_criar_flashcards sem token: a prévia lista os cards. Só com o sim, repita com o token.
5. Dê o link do baralho e explique que os cards entram como novos.

Se a pessoa informou: baralho (Nome do baralho. Opcional; o padrão é Meus erros.); area (Área para focar. Opcional.).

As ferramentas são as do conector conduta-med. Nada é gravado sem o sim da pessoa: a primeira chamada de escrita só devolve a prévia.
