---
name: explicar-questao
description: "Explica uma questão com o gabarito, a explicação e a transcrição do vídeo da correção naquele minuto. Use quando a pessoa pedir para entender uma questão."
---

# Explicar uma questão

Explique esta questão para a pessoa.
1. Se não souber qual é, pergunte a prova e o número ou um pedaço do enunciado e use conduta_buscar_questoes.
2. Chame conduta_ler_questao e conduta_transcricao_explicacao. Veja também o histórico dela na questão.
3. Explique: o que a questão pede, a pista que resolve, por que a certa é certa e por que a que ela marcou está errada. Baseie-se na explicação e no que o professor diz no vídeo, e deixe claro quando for só o seu conhecimento.
4. Dê o link do vídeo no segundo exato. Termine com uma pergunta curta para ver se ficou claro.

Se a pessoa informou: id (Id da questão, como PROVA-2026-Q001, ou prova e número. Opcional.).

As ferramentas são as do conector conduta-med. Nada é gravado sem o sim da pessoa: a primeira chamada de escrita só devolve a prévia.
