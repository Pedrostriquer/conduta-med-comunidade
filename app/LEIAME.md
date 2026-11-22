# Conduta: app (frontend)

React 19 + Vite + TypeScript, sem Next. Usa o design system da pasta `../design-system` (tokens, estilos dos componentes e fontes copiados por `npm run ds`).

## Versões

O projeto está no git (raiz do repositório: a pasta acima de `app/`). `main` guarda a versão de 27/10/2026 antes da rodada v2; a rodada v2 está no branch `ajustes-v2`.

## Rodar

```
npm install
npm run dados   # gera public/data e public/img a partir do material de provas, que fica fora deste repositório
npm run dev     # http://localhost:5180
```

`npm run dados` roda, nesta ordem:

1. `scripts/gerar_dados.py`: as provas do Conduta (`questoes.json` e `provas.json`).
2. `scripts/importar_acervo.py`, só se o acervo existir ao lado do projeto: acrescenta as questões do acervo (ids `ac-...`), os assuntos e as resoluções.
3. `scripts/gerar_amostra.mjs`: `amostra.json`, as 12 questões de quem não tem conta.
4. `scripts/dividir_banco.py`: divide o banco para o navegador. `indice.json` tem todas as questões sem o texto (id, prova, número, área, especialidade, tema, gabarito, vídeo, assunto e as marcas ok / anulada / tem figura) e `q/<prova>.json` tem o corpo das questões de cada prova (enunciado, alternativas, explicação, tabelas, caso, imagens). O formato do índice está no começo do script.

`questoes.json` continua inteiro porque o servidor lê; o navegador não pede mais. Quem rodar um dos três primeiros passos sozinho precisa rodar `python3 scripts/dividir_banco.py` em seguida.

A API roda à parte (`cd ../server && npm run dev`, porta 8300); o Vite faz o proxy. Em desenvolvimento, "Ver com dados de exemplo" na tela de entrar carrega dez semanas de estudo de um estudante fictício, sem conta e sem ir para o servidor.

## O que entra por padrão

`scripts/gerar_dados.py` marca cada questão com `ok` quando ela tem correção em vídeo com o início marcado, explicação, gabarito válido e nenhum sinal de divergência, recurso, polêmica ou marcação. São 988 das 1.141 questões não anuladas. Em Ajustes, "Incluir questões sem vídeo e polêmicas" libera o resto. Anuladas e excluídas nunca entram.

A tela não mostra a classificação do tema enquanto se responde, nem avisos de gabarito preliminar ou de revisão médica. A explicação é só o resumo; os momentos do vídeo não aparecem.

## Estrutura

| Pasta | O que tem |
|---|---|
| `src/ds/` | Componentes do design system em React: ícones, botões, controle segmentado, alternativa, anel, barras, dock de vidro líquido, barra lateral, diálogo, folha, avisos, ECG (`Pulse`), sinais vitais (`Vitals`) e o ritmo dos dias (`Rhythm`). |
| `src/data/` | Banco (carregar e indexar), montagem de listas e simulados (`select.ts`), cronograma (`plan.ts`), dados de exemplo (`demo.ts`), assuntos e resoluções (`assuntos.ts`) e o filtro de anotações de trabalho (`limpo.ts`). |
| `src/state/` | Estado do estudante (`store.ts`, Zustand guardado no navegador) e o que se calcula dele (`stats.ts`). |
| `src/features/` | Telas: Hoje, Questões (com Salvas), Assuntos (lista e resumo do assunto), Busca (página e paleta ⌘K), Simulados, Cronograma (com o assistente), Perfil (atividade e Ajustes), sessão (resolver, resultado, correção), vídeo e flashcards. |
| `src/lib/` | Formatação (números, tempos e datas em português), molas do Motion iguais às do design system, tema, markdown simples (`md.tsx`). |

## Onde o backend entra

As telas continuam lendo e gravando no navegador: `src/state/store.ts` e os outros estados no `localStorage`, os flashcards no IndexedDB (`src/features/flashcards/db.ts`, nunca entram nas estatísticas de questões). `src/sync/engine.ts` espelha tudo no servidor (ver "Sincronização" em `docs/CONTRATO-v3.md`): compara os estados para achar o que mudou, guarda a fila em `conduta-sync` e aplica o que chega sem gerar eco. Sem rede, nada muda para a pessoa.

As questões vêm de `public/data` por `src/data/bank.ts`, só depois do login, em duas partes:

- **Ao entrar:** `provas.json` e `indice.json` (cerca de 1,5 MB, 0,4 MB comprimido). Bastam para montar lista, filtros, estatísticas, cronograma e corrigir.
- **Quando a questão vai aparecer:** o arquivo da prova dela, `q/<prova>.json`. `ensureBodies(ids)` baixa só os que faltam, cada um uma vez; nas telas, `useBodies(ids)` e `useFullQuestion(id)` dizem quando chegou, e `BodyWait` (`features/sessao`) é a espera e o "Tentar de novo". Uma sessão só abre a primeira questão com o corpo de todas (ao começar, retomar ou recarregar).
- **Tipos:** `Question` é o que vem no índice; `FullQuestion` tem também o corpo. Tela que mostra enunciado ou alternativas recebe `FullQuestion`, então o compilador acusa quem usa o corpo sem esperar por ele.
- **Busca pelo texto:** roda no servidor (`POST /api/questions/search`, em `docs/CONTRATO-v3.md`), chamada por `features/busca/questions.ts` com espera entre teclas e cancelando o pedido anterior. Temas, provas e atalhos continuam saindo do índice, na hora.

Em produção, `indice.json`, `q/*`, `questoes.json`, `assuntos.json`, `assuntos/*` e `resolucoes/*` pedem conta (regra no `deploy/Caddyfile`). Sem conta só existe `amostra.json`, as 12 questões do "Experimente 3 questões". Em desenvolvimento, o modo de exemplo busca sem conta porque a API aceita isso só com `NODE_ENV=development`.

O navegador tem dono (`conduta-owner`): outra conta entrando, ou sair, apaga o que é da anterior. Sem dono, o que já existe aqui é adotado por quem entrar: é assim que as 3 questões feitas sem conta vão junto.

## Assuntos e resoluções

`scripts/importar_acervo.py` grava, além das questões, três coisas que o navegador pede sob demanda (`src/data/assuntos.ts`, com cache na memória):

- `data/assuntos.json`: a lista dos assuntos que têm resumo. Pedida ao abrir a seção Assuntos.
- `data/assuntos/<slug>.json`: o resumo do assunto. Pedido ao abrir `/assuntos/<slug>`.
- `data/resolucoes/<slug>.json`: a resolução de cada questão do assunto. Pedido só depois que a pessoa responde uma questão dele (o componente `Resolucao` só existe com a questão respondida) ou quando ela pede "Treinar este bloco" no resumo.

**Na questão** (`features/sessao/Resolucao.tsx`, dentro de `QuestionView`): o que decide, o raciocínio em passos, cada alternativa com veredito e motivo (pegadinha marcada), "Cuidado", "Para levar" e "Ver no resumo". Aparece em toda tela que mostra a questão respondida (sessão, correção, `/questao/ID`).
- Questão que já tem a explicação curta: a resolução vem recolhida se a pessoa acertou e aberta se errou. Sem explicação curta, vem sempre aberta.
- O vídeo da resolução só aparece se a questão não tem o vídeo do Conduta.
- `desatualizada`: aviso "Regra antiga: a conduta mudou depois desta prova", com o antes e o agora quando o dado traz.

**Seção Assuntos** (`features/assuntos/`): `/assuntos` lista por grande área, com busca e o progresso de cada um (feitas e acerto pela última resposta, `progressBySlug`). `/assuntos/<slug>` mostra "Em uma tela", o índice dos blocos (ao lado a partir de 1240 px; recolhível abaixo disso) e os blocos.
- `/assuntos/<slug>#<bloco>` abre no bloco. Com `?t=<trecho>` (é o que "Ver no resumo" manda), o trecho chega realçado: a linha ou o parágrafo ganha fundo e, onde o navegador tem a CSS Custom Highlight API, a frase exata fica marcada.
- "Fazer questões deste assunto" e "Treinar este bloco" abrem `PracticeSheet`, que usa o mesmo caminho de Questões (`matchQuery` → `pick` → `startList`), com novas, erradas ou todas, quantidade e correção. A sessão fica com `source: { type: "assunto", slug, bloco? }`. As questões de um bloco saem de `resumo.bloco` das resoluções.
- As figuras são SVG e entram na própria página (`FiguraView`), depois de limpas (sem script, evento nem link externo): assim herdam a cor do texto e funcionam no tema escuro. Figura que não use `currentColor` fica sobre fundo claro.

**Markdown:** `src/lib/md.tsx` (`Md` e `MdInline`) monta elementos do React a partir do texto (parágrafo, lista, tabela, título, citação, negrito, itálico, código, link http). Nenhum HTML do texto é interpretado. "bloco ES6" vira link para o bloco.

**Anotações de trabalho não vão para a tela.** Os arquivos do acervo trazem, no meio do texto, o selo de situação, referências a arquivos de conferência, códigos de questão ("sus-sp-2026#073") e rótulos como "acréscimo da auditoria". `src/data/limpo.ts` (`limpa`, `interno`) tira o rótulo, o parêntese ou a frase na hora de mostrar; o arquivo não muda. Também ficam de fora: `situacao`, `versao`, `fontes_base`, `para_o_medico_decidir`, `via`, `conferido` e as fontes sem link próprio. Texto novo de assunto deve passar por `limpa`. O melhor conserto é na origem (`enxuga` e o resumo no acervo): o filtro é rede de segurança e não pega tudo (a palavra "acervo" ainda aparece em algumas frases).

Em produção, `assuntos.json`, `assuntos/*` e `resolucoes/*` pedem conta, como o banco (regra `@banco` no `deploy/Caddyfile`). As figuras (`/img/assuntos/*`) ficam abertas.

## Flashcards do Anki

A importação lê o `.apkg` num Web Worker (`anki.worker.ts`):
- lê o zip por partes, porque há baralhos com mais de 1 GB;
- descomprime a coleção (zstd) e consulta o SQLite com sql.js;
- grava os cards e copia só as imagens usadas pelos cards escolhidos.

Formatos aceitos: pergunta e resposta (Pergunta/Resposta/Referência com lacunas), cloze do Anki e frente/verso. Oclusão de imagem fica de fora.

Testado com um baralho de 1,7 GB: 18.904 cards e 3.901 imagens lidos em cerca de 10 segundos. O grupo Preventiva (1.175 cards, 129 imagens) importou em 1 segundo.

### Telas do Anki

- **Baralho** (`/flashcards/baralho/:id`): novos, aprendendo e revisar de hoje, sub-baralhos com contagens e estudo personalizado.
- **Opções** (`/flashcards/opcoes/:id`): predefinições como no Anki, com limites diários, passos, formatura, lapsos, sanguessuga e o bloco avançado. O agendador usa essas opções.
  - "Enterrar irmãos" e "Ordem de inserção" são só visuais.
  - O FSRS é uma prévia: a retenção desejada apenas ajusta os intervalos.
- **Navegar** (`/flashcards/navegar`): busca, filtros, prévia e ações em lote (suspender, enterrar, bandeira, mover, esquecer, excluir).
- **Estatísticas** (`/flashcards/estatisticas`): vêm do log de revisões (store `revlog` do IndexedDB v2) e nunca se misturam às das questões.
- **Adicionar card** (`/flashcards/novo`): básico, invertido e lacunas, com prévia.
- **Revisão:** menu do card com bandeira, marcar, enterrar, suspender, editar e informações. Atalhos do Anki: 1–4, espaço, z, -, @, *, E, I, Ctrl+0–7.

Em desenvolvimento, `__fcSeed()` no console cria um baralho de teste ("Clínica (teste)") e `__fcSeedClear()` apaga.

## Busca e salvas

- ⌘K (ou Ctrl+K) abre a paleta em qualquer tela. Também abre pelo "Buscar" da barra lateral e da tela Questões.
- `/busca` tem filtros e cria uma lista com o que encontrou.
- Na questão, os botões de salvar e anotar ficam no cabeçalho. As salvas e anotadas aparecem em `/questoes/salvas`.

## Navegação (rodada v2)

- **Layout:** as páginas vão até 1200 px. Use `.cols` (principal mais lateral) e `.grid-auto` para aproveitar a largura; `.page--narrow` serve para leitura e formulário.
- **Trilha:** cada página interna mostra o caminho acima do título ("Simulados › Resultados › SUS-SP 2025"), com cada nível clicável (`crumbs` no `Page`). No celular, a trilha vira só o "‹ nível anterior".
- **Páginas de cada seção:** ficam em `app/nav.ts` (`SUB`). No desktop aparecem abaixo da seção, na barra lateral; no celular, como abas no topo. Por isso as páginas não repetem botões que só levam a esses destinos.
- **Conta e entrada:**
  - `/entrar` e `/criar-conta`: e-mail ou @usuario e senha, com o servidor (`state/auth.ts`).
  - `/boas-vindas`: primeiro, como começar (com a sua IA ou com 3 perguntas).
  - `/conectar`: consentimento quando uma IA pede acesso. `/termos`: termos e privacidade.
  - A regra de rota fica em `features/auth/gate.ts`.
- **Estados guardados fora do `store.ts`:**
  - `state/auth.ts`: conta (cópia para abrir sem rede) e o que a pessoa contou nas boas-vindas;
  - `state/goals.ts`: metas, sequência e dias de plantão;
  - `state/prefs.ts`: tema;
  - `features/flashcards/config.ts`: perfis e opções do Anki.
- **Conferir telas sem animação:** em desenvolvimento, abra qualquer endereço com `?semanimacao`, útil quando o navegador está em segundo plano e não desenha quadros. Vale para a aba toda; para desligar, rode `sessionStorage.removeItem("semanimacao")`.
