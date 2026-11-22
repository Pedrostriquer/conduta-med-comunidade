# Badge

Selo de uma ou duas palavras, com ícone, que diz algo verdadeiro sobre uma questão.

**Props.** `kind`: `anulada`, `alterada`, `diverge`, `polemica`, `preliminar`, `desatualizada`, `recurso`, `revisao` (cada um já traz tom, ícone e texto). Ou monte o seu com `tone` (`neutral`, `accent`, `success`, `danger`, `warning`), `icon` e `children`.

- Os selos vêm dos dados do banco: `status_oficial` (anulada, alterada), `gabarito_tipo` (preliminar), `video.diverge` (vídeo diverge do gabarito) e `sinal_problematica` do vídeo (polêmica, cabe recurso, desatualizada).
- Âmbar (`warning`) é para o que muda a nota ou a confiança no gabarito; cinza, para contexto.
- Fica no topo da questão, antes do enunciado, e nunca é só cor: sempre ícone e palavra.
- Não use selo como botão nem para contar coisas.
