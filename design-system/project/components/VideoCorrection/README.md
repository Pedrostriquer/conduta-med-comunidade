# VideoCorrection

Link para a correção em vídeo que abre o YouTube no segundo em que a questão começa, com os momentos-chave marcados.

**Props.** `url` (link do vídeo sem `t`), `start` e `end` (segundos do trecho da questão), `channel`, `title`, `moments` (`[{ t, text }]`, em segundos; o componente ordena), `warning` (texto quando o vídeo discorda do gabarito).

- O link principal leva a `&t=<start>s` e mostra o horário no rótulo (“começa em 9:27:44”). Cada momento abre no seu segundo.
- A barra mostra o trecho da questão (início e fim reais) com um ponto por momento, na posição certa; passar o mouse num momento acende o ponto.
- Quando `video.diverge` é verdadeiro, passe `warning`: “No vídeo a resposta é D; o gabarito oficial é C.” O aviso fica acima dos momentos, em âmbar.
- Abre em nova aba, no player do YouTube; não incorpore um player próprio. Não toque nada automaticamente.
- Os momentos vêm de `correcoes_video[].dicas` do banco; escreva-os como frases completas e curtas.
