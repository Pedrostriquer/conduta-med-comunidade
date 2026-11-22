# Design system Conduta

Fonte do design system publicado em https://claude.ai/artifact/N2TPh5wtvKJhpLvEYXXDAK (privado até ser compartilhado pelo menu Compartilhar da página).

| Pasta | O que tem |
|---|---|
| `project/` | Exatamente o que vai para o artefato: `README.md` (brand book), `movimento.md`, `escrita.md`, `acessibilidade.md`, `tokens.json`, `fonts/`, `components/` (bundle React em `bundle.js`/`bundle.css`, tipos em `index.d.ts`, um `README.md` e um `preview.html` por componente, a capa em `Cover/`), `assets/` (logos e ícones em SVG) e o índice `design-system.json`. |
| `scripts/` | `cores.py` (paleta em OKLCH, converte para hex e confere contraste), `tokens.py` (gera `tokens.json`), `tokens_css.py` (compila os tokens para testar localmente), `previews.py` + `dados.js` (gera os previews com a questão real e o deck), `leiames.py` (guias dos componentes). |
| `lab/` | Bancada local: `ver.html?c=QuestionCard&w=500&t=light,dark` mostra um preview com os tokens, nos dois temas. Servidor: configuração `design-system` em `.claude/launch.json` (porta 8770). |
| `build/` | Saídas intermediárias (cores, tokens.css local, ícones exportados, fonte estática usada para contornar a palavra “conduta”). |

Para mudar uma cor: edite `scripts/cores.py`, rode `python3 -I scripts/cores.py && python3 -I scripts/tokens.py && python3 -I scripts/tokens_css.py` e publique `project/tokens.json`.

Fontes: Hanken Grotesk e Literata (SIL Open Font License 1.1), subconjunto latino baixado do Google Fonts.
