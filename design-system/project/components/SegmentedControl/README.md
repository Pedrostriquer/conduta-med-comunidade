# SegmentedControl

Escolha uma entre duas a cinco opções irmãs que trocam a vista na mesma tela.

**Props.** `options` (`[{ value, label, icon?, ariaLabel? }]`), `value`, `onChange(value)`, `size` (`sm`), `block` (largura toda), `aria-label`.

- Use para filtrar ou trocar a vista: período (7 dias, 30 dias, Tudo), lista (Questões, Erradas, Marcadas, Não feitas), tamanho do texto.
- Não use para navegar entre seções do app (isso é `TabBar`/`Sidebar`) nem para disparar ações.
- Rótulos são substantivos curtos, todos texto ou todos ícone. No celular, até 4 opções; no desktop, até 5. Mais que isso, use um menu.
- O polegar desliza com `spring-snappy` (459ms); o peso da letra não muda entre selecionado e não selecionado, para não pular. Setas trocam de opção.
