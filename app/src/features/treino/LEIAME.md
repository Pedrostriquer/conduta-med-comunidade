# Treino de digitar

Uma estrutura acende, a pessoa digita o nome, a estrutura se desfaz e vem a próxima. Três modos, mais o Explorar:

| Modo | Principal | Completo (a mais) | Total |
|---|---|---|---|
| **Ossos** | 64 itens em 8 níveis | 72 itens em 10 níveis | 136 |
| **Músculos** | 95 itens em 11 níveis | 80 itens em 11 níveis | 175 |
| **ECG** | 28 itens em 4 níveis ("o que cai") | 22 itens em 4 tópicos ("para ir além") | 50 |

Rotas: `/treino` (escolha), `/treino/<nível>` (jogo), `/treino/<nível>?m=rever` (aquecimento), `/treino/dia` (do dia),
`/treino/explorar` (o corpo 3D sem jogo).

| Região | Principal | Completo (a mais) |
|---|---|---|
| Ossos · Crânio e face | 15 | 0 |
| Ossos · Coluna vertebral | 8 | 22 (cada vértebra de C3 a L5) |
| Ossos · Tórax | 8 | 11 (cada costela da 2ª à 12ª) |
| Ossos · Membro superior | 18 | 19 (cada metacarpo e cada falange) |
| Ossos · Membro inferior | 15 | 20 (cada metatarso, cada falange, sesamoide) |
| Músculos · Cabeça e pescoço | 17 | 26 |
| Músculos · Ombro e braço | 10 | 0 |
| Músculos · Antebraço (e mão) | 17 | 13 |
| Músculos · Tórax e abdome | 8 | 7 (inclui os três intercostais) |
| Músculos · Dorso | 10 | 10 |
| Músculos · Quadril | 8 | 8 (inclui o assoalho da pelve) |
| Músculos · Coxa | 15 (os 5 dos adutores entraram no principal) | 0 |
| Músculos · Perna (e pé) | 10 | 16 |

## Como funciona

- **A pessoa escolhe quanto quer ver do nome**, no seletor do topo, e pode trocar e repetir quando quiser:
  - *Automático* (padrão): dosa item por item. Item novo aparece com o nome; a cada acerto mostra menos (nome → parte →
    nada) e o item volta alguns itens adiante até sair de memória; se erra, volta a mostrar mais. Onde começar cada item
    vem do progresso salvo (`f`).
  - *Nome*: o nome aparece apagado e ela copia. Tecla errada não entra.
  - *Parte*: primeira letra, número de letras e uma pista. Enter confere.
  - *Memória*: nada. Enter confere.
- **Revelar** (botão ou Tab) está sempre lá quando o nome não está à vista: mostra o nome para a pessoa digitar e seguir.
  Conta como "precisou ver": não avança o domínio do item, não conta como erro, e o item volta daqui a pouco.
- Quem erra vê o nome e a explicação, e o item volta três posições adiante.
- **Nada é travado**: todo nível está liberado desde o começo; a tela de escolha só marca o que já foi dominado.
- **Principal / Completo**: na tela de escolha. Principal é o que a faculdade e as provas cobram; Completo acrescenta tudo
  o mais que o modelo tem como peça separada (no ECG, o grupo "para ir além").
- **Aquecimento**: só de memória, com os itens do nível que estão na hora de rever.
- **Do dia**: cinco itens de memória de um nível do principal sorteado pela data, uma tentativa cada; Revelar vale um
  quadrado amarelo.
- A resposta é aceita sem acento, sem diferenciar maiúsculas e com hífen ou espaço; sinônimos em `catalogo.ts` (`ac`).
- No 3D: arrastar gira, a roda do mouse (ou a pinça) aproxima. O osso acertado se desfaz e volta como fantasma.

## Escolher no corpo e Explorar

- **Corpo de escolha** (`CorpoEscolha.tsx`): em Ossos e Músculos, um corpo inteiro e leve (`corpo.bin`, 400 KB: uma peça
  por zona do esqueleto e o contorno da pele). A pessoa gira e clica na zona; a lista de regiões ao lado faz o mesmo e é
  a alternativa acessível. Os membros esquerdos desse arquivo são o espelho dos direitos.
- **Explorar** (`ExplorarPage.tsx`): camadas (ossos, músculos, órgãos), clicar numa estrutura para ver o nome e uma
  linha, isolar, esconder para ver o que está embaixo, e busca por nome. O corpo leve abre na hora; os ossos detalhados
  de uma região só são baixados quando a pessoa a escolhe; os músculos da região e os órgãos (`orgaos.bin`, 39 peças),
  só quando a camada é ligada. Onde há par, o detalhe é do lado direito; o esquerdo fica no contorno leve.
- Tomografia e cortes de exame não entraram: ficaram para depois.

## Progresso

`estado.ts` guarda por item (chave `<região>/<item>`, comum a todos os níveis da região): degraus de memória seguidos
(`n`), acertos, erros, última resposta, próxima revisão e `f` (quanto mostrar no automático). Revisão espaçada simples:
1, 3, 7, 16, 35 e 90 dias; erro de memória volta ao começo e pede revisão em 10 minutos; "precisou ver" não sobe nem
desce. A partir de dois acertos de memória seguidos o item conta como dominado.

- **Fica na conta**: o navegador guarda em `conduta-treino` e a sincronização do app espelha no servidor, coleção
  `treino` (um registro por item e o registro `dia`). Ver `docs/CONTRATO-v3.md`. O servidor confere o formato.
- O treino **não entra** nas estatísticas de questões.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `catalogo.ts` | todo o conteúdo: regiões, níveis, itens, sinônimos, apoio, pista, peças do modelo, vista e, nos níveis do completo, a malha do BodyParts3D (`en`) |
| `motor.ts` | modos de ajuda, fila, conferência, Revelar; avisa cada resposta |
| `estado.ts`, `progresso.ts` | o progresso (o primeiro sem depender do catálogo, para a sincronização) e as leituras dele |
| `som.ts` | sons feitos com Web Audio; não há arquivo de áudio |
| `JogoPage.tsx`, `Teclado.tsx`, `Palcos.tsx` | a tela do jogo e os dois palcos |
| `cena3d.ts` | a cena 3D do jogo |
| `corpo3d.ts`, `atlas.ts` | o corpo 3D de escolher e de explorar; nomes das peças, regiões e órgãos |
| `CorpoEscolha.tsx`, `ExplorarPage.tsx`, `TreinoPage.tsx` | escolha e Explorar |
| `ecg.ts` | parâmetros de cada ritmo e a geração dos traçados |
| `../../../scripts/treino_pecas.mjs` | as peças dos modelos escritos à mão (ossos de cada região, corpo, órgãos) |
| `../../../scripts/treino_modelos.mjs` | gera `public/treino/*.bin`; os níveis do completo saem do próprio catálogo |

`cena3d.ts` e `corpo3d.ts` são os únicos que importam o `three`; só são baixados quando a tela abre.

## Modelos 3D: fonte, licença e pesos

- **Fonte**: BodyParts3D, © The Database Center for Life Science (DBCLS), versão 3.0, peças individuais em STL, baixadas
  em 15/11/2026 do espelho público `github.com/Kevin-Mattheus-Moerman/BodyParts3D` (`assets/BodyParts3D_data/stl/`), que
  redistribui os arquivos oficiais com a mesma licença. O espelho tem malha para 934 das 1.523 peças da lista.
- **Licença**: CC BY-SA 2.1 Japão. Exige crédito ("BodyParts3D, © The Database Center for Life Science licensed under
  CC Attribution-Share Alike 2.1 Japan") e que derivados mantenham a licença: os `public/treino/*.bin` seguem CC BY-SA.
- **Crédito na tela**: no canto do palco, no Explorar e por extenso na tela de escolha. **Z-Anatomy** não foi usado.
- **Lado**: onde há par, o direito.
- **Originais**: 407 STL, 722 MB, em `app/assets-origem/anatomia/` (fora do git).
- **Redução de malha**: `meshoptimizer` (devDependency). Cada arquivo tem um orçamento de 52 mil triângulos; cada peça
  tem um teto (1.500 por osso, 2.600 por músculo, 1.700 por órgão) e, se a soma passar, todas encolhem na mesma
  proporção. Os intercostais vão de cerca de 800 mil triângulos cada para menos de 3 mil.
- **Carga**: um arquivo por nível (ou por região de ossos), baixado só quando o nível abre. 31 arquivos, 9,6 MB no
  total, cada um entre 119 e 461 KB.
- **Para gerar de novo**: `node scripts/treino_modelos.mjs` (todos) ou com os ids; `--lista` diz quais STL faltam baixar.
  Precisa do Node 24, que lê o `catalogo.ts` direto.

| Arquivos | Peso |
|---|---|
| Ossos: `cranio`, `coluna`, `torax`, `membro-superior`, `mao`, `mao-ossos`, `membro-inferior`, `pe`, `pe-ossos` | 318, 384, 461, 160, 138, 285, 119, 147, 292 KB |
| Músculos, principal: `m-cabeca`, `m-ombro`, `m-antebraco`, `m-tronco`, `m-dorso`, `m-quadril`, `m-coxa`, `m-perna` | 461, 349, 442, 372, 437, 316, 307, 294 KB |
| Músculos, completo: `musculos-cabeca-3` a `-5`, `-antebraco-3` e `-4`, `-tronco-2`, `-dorso-2`, `-quadril-2`, `-coxa-2`, `-perna-2` a `-4` | 460, 461, 460, 191, 214, 350, 437, 316, 193, 180, 180, 202 KB |
| `corpo` (escolha e Explorar) e `orgaos` (camada do Explorar) | 400 e 460 KB |

**O que ficou de fora**, embora o BodyParts3D tenha: dentes, discos intervertebrais um a um, ligamentos, membranas
interósseas, trato iliotibial, aponeurose epicrânica, músculos papilares, e, no Explorar, vasos pequenos, nervos e as
partes do cérebro (só cerebelo e tronco encefálico entraram). O cóccix não existe como peça separada.

## ECG

Os traçados são **sintéticos**: gerados por fórmula em `ecg.ts`, a 250 amostras por segundo, e desenhados a 25 mm/s e
10 mm/mV. Não são registros de pacientes. Na tela aparece só "traçados sintéticos".

**Rascunho, não conferido por médico**: os parâmetros dos ritmos, a forma dos traçados, as pistas e os textos de apoio
(também os dos ossos e músculos) precisam de revisão médica antes de irem para quem estuda.

### Como o gerador é montado

No espírito do ECGSYN (McSharry PE, Clifford GD, Tarassenko L, Smith LA. *A dynamical model for generating synthetic
electrocardiogram signals.* IEEE Trans Biomed Eng. 2003;50(3):289-294; código no PhysioNet): cada batimento é uma soma
de ondas em sino para P, Q, R, S e T, mais as extras (delta, J, R'). Aqui as ondas são somadas direto no tempo, sem
integrar o sistema dinâmico do artigo. Cada ritmo é uma linha da tabela `RITMOS` com **parâmetros clínicos**:
frequência, intervalo PR, duração do QRS, QT corrigido (Bazett), amplitude de cada onda, desnível e forma do ST,
variação do RR e a regra do bloqueio. Ritmos sem batimento definido (FA, flutter, TV, FV, torsades, assistolia) têm
gerador próprio, também parametrizado pela frequência. Padrões que dependem de derivação mostram a derivação certa no
canto (V1 no bloqueio de ramo direito e no Brugada, V6 no bloqueio de ramo esquerdo, V4 na hipercalemia, V5 no digital).

### De onde vieram os critérios

Preenchidos a partir das referências abaixo **como o modelo as conhece, sem conferência com o texto original nesta
sessão**. É exatamente isso que a revisão médica precisa checar.

- **SBC 2022**: Samesima N, et al. Diretriz da Sociedade Brasileira de Cardiologia sobre a Análise e Emissão de Laudos
  Eletrocardiográficos – 2022. Arq Bras Cardiol. 2022.
- **AHA/ACCF/HRS 2007–2009**: Recommendations for the Standardization and Interpretation of the Electrocardiogram
  (partes I a VI).
- **ACLS**: AHA Guidelines for CPR and Emergency Cardiovascular Care, 2020 (ritmos de parada).

| Ritmo | Parâmetros usados | Critério de origem |
|---|---|---|
| ritmo sinusal | 68/min, P antes de cada QRS, PR 0,16 s, QRS 0,09 s, QTc 0,41 s | SBC 2022: sinusal de 50 a 100/min, PR 0,12 a 0,20 s, QRS < 0,12 s |
| bradicardia sinusal | 44/min | SBC 2022: sinusal < 50/min |
| taquicardia sinusal | 128/min | SBC 2022: sinusal > 100/min |
| arritmia sinusal | RR varia ±24% com a respiração | SBC 2022: variação do RR com P sinusal |
| fibrilação atrial | sem P, ondas f, RR irregular, média 105/min | SBC 2022: ausência de P, RR irregular |
| flutter atrial | ondas F a 300/min em dente de serra, condução 4:1 | SBC 2022: ondas F de 240 a 340/min |
| taquicardia supraventricular | 186/min, QRS estreito, sem P visível | AHA: taquicardia regular de QRS estreito, 150 a 250/min |
| BAV de 1º grau | PR 0,32 s, toda P conduz | SBC 2022: PR > 0,20 s |
| Mobitz I | PR 0,18 → 0,27 → 0,35 s e P bloqueada (4:3) | SBC 2022: aumento progressivo do PR até P bloqueada |
| Mobitz II | PR fixo 0,18 s, P bloqueada a cada 3, QRS 0,11 s | SBC 2022: P bloqueada sem aumento do PR |
| bloqueio AV total | P a 84/min, escape largo a 36/min, sem relação | SBC 2022: dissociação AV com frequência atrial maior |
| bloqueio de ramo direito | V1, QRS 0,14 s, rSR', T negativa | SBC 2022: QRS ≥ 0,12 s, rSR' em V1 |
| bloqueio de ramo esquerdo | V6, QRS 0,15 s, R larga entalhada sem q, T oposta | SBC 2022: QRS ≥ 0,12 s, R alargada e entalhada em V5 e V6, sem q |
| extrassístoles ventriculares | batimento precoce de 0,15 s sem P a cada 4, pausa compensadora | SBC 2022 |
| taquicardia ventricular | 176/min, complexos largos e iguais | SBC 2022: 3 ou mais batimentos ventriculares > 100/min |
| torsades de pointes | 246/min, amplitude em fusos com inversão de polaridade | SBC 2022: TV polimórfica com QT longo |
| fibrilação ventricular | ondulação caótica de 3 a 8 Hz | ACLS: ritmo chocável, sem QRS |
| assistolia | linha de base | ACLS: ritmo não chocável |
| atividade elétrica sem pulso | ritmo organizado a 58/min com o aviso "paciente sem pulso" | ACLS: é um diagnóstico clínico, não um traçado |
| ritmo idioventricular | 34/min, QRS 0,16 s, sem P | SBC 2022: escape ventricular de 20 a 40/min |
| infarto com supra de ST | DII, supra de 0,34 mV convexo, onda Q | 4ª Definição Universal de Infarto (2018): supra ≥ 1 mm em duas derivações contíguas |
| hipercalemia | V4, T alta, estreita e simétrica, P achatada, PR 0,21 s, QRS 0,115 s | SBC 2022 |
| Wolff-Parkinson-White | PR 0,09 s, onda delta, QRS 0,13 s | SBC 2022: PR < 0,12 s, onda delta, QRS alargado |
| Brugada | V1, supra em corcova de 0,42 mV no ponto J com T negativa | consenso de 2013 (HRS/EHRA/APHRS): padrão tipo 1, supra ≥ 2 mm |
| QT longo | 58/min, QTc 0,58 s | SBC 2022: QTc > 0,45 s (homens) e > 0,47 s (mulheres) |
| pericardite | supra côncavo de 0,17 mV, infra de PR, 92/min | ESC 2015 (doenças do pericárdio) |
| hipotermia | 42/min, onda J de 0,36 mV, QTc 0,52 s | SBC 2022: onda J (de Osborn) |
| intoxicação digitálica | V5, infra de ST em colher, T achatada, QTc 0,35 s, PR 0,20 s | SBC 2022: ação digitálica |

**Para ir além** (22 itens, fora do núcleo, em 4 tópicos; mesmos avisos: sintético, rascunho, critérios de memória). Só entrou o
que dá para reconhecer numa derivação; infarto por parede e bloqueio divisional posteroinferior ficaram de fora por isso.

| Tópico | Itens | Parâmetros principais |
|---|---|---|
| Outros ritmos | taquicardia atrial multifocal, ritmo juncional, marcapasso migratório, BAV 2:1, extrassístoles atriais, bigeminismo ventricular, ritmo idioventricular acelerado, marcapasso artificial | P de formas e PR variáveis com RR irregular (124/min e 72/min); P invertida com PR 0,09 s a 48/min; uma P bloqueada a cada duas; batimento atrial precoce a cada 4; ESV a cada 2; QRS 0,16 s a 78/min; espícula + QRS 0,17 s |
| Sobrecargas e bloqueio divisional | SAE, SAD, SVE, SVD, bloqueio divisional anterossuperior | P de 0,15 s entalhada; P de 0,34 mV; R de 2,7 mV em V5 com strain; R > S em V1 com T negativa; rS em DII |
| Isquemia | Wellens, de Winter, isquemia subendocárdica, infarto antigo | T de -0,6 mV simétrica em V3; infra ascendente de 0,26 mV com T de 1,05 mV em V3; infra reto de 0,22 mV em V5; Q larga de 0,5 mV em DIII |
| Eletrólitos e outros | hipocalemia, hipercalcemia, hipocalcemia, tromboembolismo pulmonar, repolarização precoce | T de 0,07 mV com U de 0,24 mV; QTc 0,31 s; QTc 0,53 s com T normal; 116/min com Q e T negativa em DIII; ponto J entalhado com supra côncavo em V4 |

Nesta rodada a onda J da hipotermia (0,62 mV, mais larga) e a onda delta do WPW (0,5 mV, QRS 0,15 s) foram reforçadas.

## Conteúdo anatômico

Nomes em português do Brasil pela Terminologia Anatômica (escafoide, semilunar, piramidal, fíbula, patela, latíssimo do
dorso, esternocleidomastóideo…), com os nomes antigos aceitos na resposta (lunato, perônio, rótula, grande dorsal…).
Os músculos são os mais cobrados em anatomia na graduação, não todos os que existem. Textos de apoio e pistas são
rascunho, não conferido por médico.

## O que é adaptação

A mecânica (rodadas, som feito na hora, composição da tela, aquecimento, "do dia") segue a referência que o autor
indicou. O código, os textos, os dados e os modelos são daqui: nada foi copiado dos arquivos do site de referência.
