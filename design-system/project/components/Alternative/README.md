# Alternative

Uma alternativa da questão (A a E), com os estados de antes e depois de responder.

**Props.** `letter`, `children` (texto), `checked`, `struck` (riscada), `result` (`correct`, `wrong`, `other`, `void` depois de responder), `tag` (“Gabarito”, “Sua resposta”), `onSelect(letter)`, `onStrike(letter)`, `tabIndex`.

- A linha inteira é o alvo (mínimo 52px de altura). Texto em Literata 17px, que escala com o controle Aa.
- Marcada: fundo `accent-soft`, borda `accent` de 1,5px, letra preenchida com mola.
- Riscar é para eliminar o que você já descartou: botão à direita (sempre visível no toque, no hover com mouse) ou clique direito. Riscada fica em `ink-3`, com o traço em todas as linhas do texto. Marcar uma riscada tira o risco.
- Depois de responder: a certa ganha ✓ e `success-soft`; a sua errada, ✕ e `danger-soft`; as outras ficam a 55%. Ninguém mais clica.
- Provas têm 4 (ENAMED) ou 5 alternativas (ENARE, SUS-SP): o componente não assume quantidade.
- Use sempre dentro de um `radiogroup` (o `QuestionCard` já faz isso).
