# TabBar

Navegação principal no celular: uma dock de vidro líquido que flutua sobre o conteúdo, com uma lente de vidro que leva a seleção de uma aba à outra.

**Props.** `items` (padrão: Hoje, Questões, Provas, Flashcards, Desempenho; cada item aceita `badge`), `current`, `onChange(id)`, `minimized` (dock compacta, só ícones), `static` (dentro do fluxo, para documentação).

- **Sempre os mesmos cinco destinos**, na mesma ordem e com os mesmos nomes da `Sidebar`. Uma palavra por aba.
- **Toque ou arraste.** Ao tocar, a lente se levanta da aba atual e desliza até a tocada. Ao arrastar o dedo pela dock, a lente segue o dedo com mola e, ao soltar, pousa na aba mais próxima. A navegação acontece no toque, sem esperar a lente terminar.
- **O vidro.** A dock usa `material` com desfoque e saturação; a lente é mais clara, amplia o que está embaixo e tem franja cromática (`danger` e `accent`) que cresce com a velocidade. No Chrome e no Edge a lente refrata o fundo com um mapa de deslocamento em SVG (a técnica do liquid-glass-react); Safari e Firefox mostram o vidro sem refração. A aparência em repouso é igual em todos.
- **Selos.** `badge: "dot"` para algo novo dentro do destino (uma prova nova no banco); um texto curto (`"NOVO"`) para um destino novo; um número só para o que pede ação hoje. Nada de contar cards para revisar: isso mora na tela Hoje.
- **Rolar.** Passe `minimized` quando a pessoa rola para baixo e tire quando volta a rolar para cima: a dock encolhe de 64 para 52px e mostra só os ícones.
- **Some** só embaixo de um simulado em andamento, que ocupa a tela toda.
- **Acessibilidade.** Cada aba é um botão com `aria-current="page"` na atual; ← e → trocam de aba; com “reduzir movimento”, a seleção troca sem lente; com “reduzir transparência”, o vidro vira sólido.
