# Chip

Filtro que liga e desliga, sozinho ou somado a outros.

**Props.** `pressed`, `onChange(pressed)`, `count` (número ao lado do rótulo), `icon` (use o ícone da área nos filtros de área), `children` (rótulo).

- Use em filtros de banca, área, tema e situação (Não feitas, Erradas, Com vídeo). Chips se somam: cada um é independente.
- Ligado, o chip ganha `accent-soft`, texto `accent-ink` e um ✓ que entra deslizando: o estado não depende só da cor.
- O número é quantas questões o filtro traz sozinho, não o total combinado.
- Muitos chips: uma linha que rola na horizontal no celular; nunca quebre em mais de duas linhas.
- Se a combinação zerar a lista, diga qual filtro tirar (ver Escrita).
