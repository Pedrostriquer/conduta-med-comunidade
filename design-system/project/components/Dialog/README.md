# Dialog

Pergunta que precisa de resposta antes de seguir, para o que não dá para desfazer: diálogo no centro no desktop, folha que sobe da borda no celular.

**Props.** `open`, `title`, `children` (corpo), `confirmLabel`, `cancelLabel` (padrão “Cancelar”), `destructive`, `onConfirm`, `onClose`.

- Só para ações sem volta: finalizar prova, apagar baralho, zerar progresso. Avaliar card, marcar questão e importar não pedem confirmação (têm desfazer).
- Título é a pergunta com o número que importa: “Finalizar com 12 questões em branco?”. Corpo diz a consequência em uma ou duas frases.
- Dois botões, verbos: o de seguir em frente à direita (ou embaixo, no celular, em largura total), o de voltar à esquerda (ou em cima).
- Esc, clicar fora e “Continuar respondendo” fecham sem fazer nada. O foco fica preso dentro e volta para quem abriu.
- Entrada com `spring-smooth`; saída em 160ms (diálogo) ou 240ms (folha).
- Um por vez.
