# Pulse

Indicador de espera desenhado como um traçado de ECG que corre, como num monitor: para leituras, correções e sincronizações que levam mais de um segundo.

**Props.** `size` (largura em px; a altura acompanha), `tone` (`success` para algo que terminou e segue ativo, como “sincronizado”), `label` (o que está acontecendo, para leitor de tela).

- Use ao lado de um texto que diga o que está acontecendo: “Corrigindo sua prova…”, “Lendo cards”. Sozinho, o traçado não explica nada.
- Quando dá para saber quanto falta, use `Meter` com o número; `Pulse` é para quando não dá.
- Um batimento a cada 1,4s. Com “reduzir movimento”, o traçado fica parado.
- Dentro de botões, continue usando o `loading` do `Button` (o traçado não lê em 16px).
