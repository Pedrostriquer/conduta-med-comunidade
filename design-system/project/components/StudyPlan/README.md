# StudyPlan

Cronograma: quantos dias faltam para a prova, a semana e as tarefas de hoje.

**Props.** `exam`, `daysLeft`, `dateLabel`, `planDone` (0 a 1), `week` (`[{ wd, n, label, today, exam, done, total }]`), `tasks` (`[{ id, kind: "questoes" | "flashcards" | "prova" | "erros", title, meta, done, action? }]`), `onStart`.

- O número de dias é o único `display` da tela, em números tabulares. O anel mostra quanto do plano já foi feito.
- A semana começa no domingo. Hoje tem o número em `accent-ink`; o dia escolhido, preenchido. Pontos embaixo: tarefas do dia (feitas em `success`); dia de simulado, uma barra azul.
- Tarefa: título com quantidade e tema (“40 questões de Cardiologia”), tipo e tempo estimado embaixo, botão tingido para começar. Marcar feita preenche o círculo com ✓ (240ms); o texto fica em `ink-2` e não é riscado.
- Pergunte a data da prova dentro do cronograma, com um padrão, não no cadastro.
