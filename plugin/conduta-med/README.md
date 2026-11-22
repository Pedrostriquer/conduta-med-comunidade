# Conduta Med

Plugin do Claude Code e do Cowork para o [Conduta Med](https://plataforma.exemplo.com.br), a plataforma de questões de residência médica. Traz o conector e as skills que ensinam o Claude a trabalhar com ele.

## Instalar

Para usar a partir desta pasta: `claude --plugin-dir plugin/conduta-med`. Para distribuir, publique num marketplace de plugins. Depois, em `/mcp`, escolha `conduta-med` e entre com a sua conta. A autorização é feita uma vez.

Sem o plugin, só o conector: `claude mcp add --transport http conduta-med https://plataforma.exemplo.com.br/mcp`.

Se a sua conta de IA é dividida com outras pessoas, use o endereço `https://plataforma.exemplo.com.br/mcp/compartilhado` no lugar do conector deste pacote: não há login, e em cada chat você informa o @usuario e o código que aparece em https://plataforma.exemplo.com.br/plugin.

## Skills

- `comecar`: vê o que falta configurar e conduz o começo.
- `diagnostico-de-erros`: lê os erros e encontra o tipo de falha.
- `montar-cronograma`: cria ou ajusta o cronograma em conversa.
- `importar-de-outra-plataforma`: configura a partir de prints de outro app.
- `flashcards-dos-erros`: cria cards do que você erra.
- `lista-do-cronograma`: monta a lista do dia.
- `explicar-questao`: explica com o gabarito e o vídeo da correção.
- `aprender-a-usar`: ensina a usar a plataforma.

Nada é alterado na sua conta sem você confirmar, e tudo o que a IA fez fica em https://plataforma.exemplo.com.br/plugin/atividade.
