# Icon

Ícones de interface desenhados para o Conduta, numa grade de 24px com traço de 1,75 e pontas arredondadas.

**Props.** `name` (veja a grade no preview), `size` (padrão 20), `strokeWidth` (padrão 1,75; use 2 na aba selecionada), `label` (obrigatório quando o ícone está sozinho; sem ele o ícone é decorativo), `filled` (só `flag`).

- O ícone herda a cor do texto (`currentColor`). Ao lado de texto, use o mesmo tamanho visual da letra maiúscula: 16 a 18 com texto de 13 a 15px; 20 com 16px; 24 na barra de abas.
- Um ícone, um conceito, no app inteiro: `questions` é questão, `exam` é prova, `cards` é flashcard, `today` é Hoje, `pulse` é Desempenho, `video` é correção em vídeo, `void` é anulada, `swap` é gabarito alterado, `hourglass` é gabarito preliminar, `strike` é riscar alternativa.
- Áreas: `stethoscope` Clínica Médica, `scalpel` Cirurgia, `pacifier` Pediatria, `uterus` Ginecologia e Obstetrícia, `shield` Preventiva. O mapa está em `Conduta.AREA_ICON`.
- `play` e `more` são preenchidos; os outros, de traço.
- Não use emoji nem ícones de outras bibliotecas ao lado destes.
