# Button

Ação com um verbo: um botão preenchido por tela para a ação que a tela existe para fazer, e os outros em cinza ou simples.

**Props.** `variant`: `filled` (principal, `accent`), `tinted` (secundária com destaque, `accent-soft`), `gray` (secundária neutra, `surface-2`), `plain` (só texto azul, para ações leves e barras de ferramenta), `destructive` (apagar algo que é seu). `size`: `sm` 32px, `md` 44px, `lg` 52px. `icon`, `iconEnd`, `kbd` (tecla de atalho), `loading`, `block` (largura toda), `href` (vira link que abre em nova aba), `label` (obrigatório em botão só com ícone). Repassa o resto para o `<button>`.

- Hierarquia por estilo, não por tamanho. No máximo um `filled` por tela: Responder, Mostrar resposta, Finalizar prova, Importar.
- Rótulo começa com verbo e diz o que acontece. Com espera, troque o rótulo pelo gerúndio e ligue `loading`: “Finalizando…”.
- `destructive` só para apagar o que é do estudante (um baralho, o progresso). Finalizar uma prova é escolha deliberada: `filled`, com confirmação no `Dialog`.
- `disabled` só quando a pessoa entende por quê (Responder sem alternativa marcada). Se não for óbvio, deixe ativo e explique ao tocar.
- Pressionar reduz para 97% em 90ms; soltar volta com `spring-snappy`. Hover e pressionado usam as camadas `hover` e `pressed`, que funcionam sobre qualquer preenchimento.
