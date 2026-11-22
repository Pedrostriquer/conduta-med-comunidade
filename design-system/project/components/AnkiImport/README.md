# AnkiImport

Importação de um baralho do Anki (.apkg) em quatro passos: soltar o arquivo, ler, escolher o que entra, importar.

**Props.** `deck`: `file` (`name`, `size`), `cards`, `images`, `subdecks`, `areas` (`[{ name, count, subdecks }]`), `note`. Também `onDone`, `initialStep` (`idle`, `review`) e `demo` (mostra um atalho para simular com o arquivo de exemplo).

- Sempre dois caminhos para o arquivo: arrastar para a zona e o botão “Escolher arquivo”. A zona só acende com um arquivo em cima.
- Arquivo errado: a zona treme uma vez e a mensagem diz o que é e como exportar do Anki.
- Progresso com número real (“Lendo cards · 9.420 de 18.904”) e ritmo constante; Cancelar sempre visível; a pessoa pode sair da tela.
- Antes de importar, mostre o que tem dentro (grupos, quantidades, imagens) e deixe tirar grupos. Diga se o arquivo não traz histórico de revisões.
- Depois: quantos entraram, “Desfazer importação” e “Começar a revisar”.
- Se a leitura acontecer no navegador, diga isso na zona (“o arquivo não sai do seu computador”).
- Os números do preview são de um baralho real do Anki: 1,69 GB, 18.904 cards, 331 baralhos, 3.901 imagens, nenhuma revisão.
