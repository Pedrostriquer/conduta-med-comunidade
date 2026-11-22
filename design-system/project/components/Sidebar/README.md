# Sidebar

Navegação principal no desktop (a partir de 1000px): marca no topo e os mesmos cinco destinos da `TabBar`, agrupados.

**Props.** `items`, `groups` (`[{ label, ids }]`; padrão Estudar e Acompanhar), `current`, `onChange(id)`. Itens podem ter `count`.

- Mesmos nomes e ordem da barra de abas. Dois níveis no máximo.
- Item atual: `accent-soft` com texto `accent-ink` semibold. Hover: camada `hover`.
- O número à direita é informação de inventário (1.200 questões), não alerta.
- Largura `sidebar-width` (248px); fundo `bg` com uma linha `line` à direita.
