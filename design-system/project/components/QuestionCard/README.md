# QuestionCard

A questão inteira: banca e tema, selos, enunciado, alternativas, responder, resultado, explicação e correção em vídeo.

**Props.** `question`: `exam`, `number`, `path` (caminho do tema), `badges` (kinds do `Badge`), `stem`, `image`/`imageAlt`, `alternatives` (`{A: …}`), `answer`, `answerNote`, `status` (`anulada`), `explanation`, `explanationNote`, `video` (props do `VideoCorrection`). Também `onAnswer(letter, correct)`, `onNext`, `nextLabel`, `initialChoice`, `initialAnswered`.

- O enunciado é conteúdo: Literata 18px, medida de 68 caracteres, sem caixa nem cor em volta. A interface (banca, tema, ferramentas) fica no topo, pequena.
- Responder fica desligado até marcar. Depois, o resultado abre no próprio cartão (sem modal), o foco vai para ele e a página rola só o necessário. O botão vira “Próxima questão”.
- O resultado diz o fato e a fonte: “Você errou. Gabarito: B.” e, embaixo, de onde vem o gabarito quando não é definitivo.
- A explicação é curta (3 a 5 frases), em Literata 16px, com a nota de como foi escrita e se teve revisão médica.
- Ferramentas no topo: Aa (tamanho 90/100/115% e fonte serifada ou sem serifa) e marcar para revisar (bandeira âmbar quando ligada).
- Imagens de prova ocupam a largura do cartão; no escuro, brilho de 88%.
- Teclado: A–E ou 1–5 marca, ↑↓ anda, Enter responde.
