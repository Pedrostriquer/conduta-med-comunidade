# Como contribuir

Obrigado por querer ajudar. O Conduta Med é um projeto comunitário: contribuições de código, de design, de texto de interface e de acessibilidade são bem-vindas.

## Issues

- Antes de abrir, procure se já existe uma issue parecida.
- Para um defeito, diga o que você fez, o que esperava e o que aconteceu. Inclua navegador, sistema e, se puder, um print ou o erro do console.
- Para uma ideia nova, conte o problema que ela resolve para quem estuda antes de propor a solução.
- Falhas de segurança **não** vão em issue pública: veja o [SECURITY.md](SECURITY.md).

## Pull requests

1. Para mudanças grandes (uma tela nova, uma mudança no esquema do banco, uma dependência nova), abra uma issue antes e combine o caminho.
2. Faça um fork, crie um ramo a partir de `main` e mantenha o pull request focado em uma coisa só.
3. Rode os testes e a checagem de tipos (abaixo) antes de enviar.
4. Descreva o que mudou e por quê. Se mexeu na interface, mande um print no tema claro e no escuro.

## Estilo do código

Siga o que já existe no arquivo que você está mexendo. O que vale em todo o projeto:

- **TypeScript estrito** no app, no painel e no servidor. Sem `any` novo quando der para evitar.
- **Comentários e textos em português do Brasil**, diretos. Cada arquivo começa com um comentário curto dizendo para que ele serve.
- **Texto de interface** simples, sem jargão técnico ou de IA, em caixa de frase ("Montar lista", não "Montar Lista"). O guia está em `design-system/project/escrita.md`.
- **Cores, espaços e tipografia só pelos tokens** do design system (`var(--accent)`, `var(--space-4)`...). Para mudar um token, mude em `design-system/` e rode `npm run ds` no app e no painel; os arquivos `tokens.css` e `ds.css` copiados não se editam à mão.
- **Servidor**: rotas em Hono, entrada validada com Zod, SQL escrito à mão com `pg` (sem ORM). Mudança no banco é uma migração nova e numerada em `server/migrations/`; migração já publicada não se edita.
- **Scripts em Python** usam só a biblioteca padrão.
- **Dependências** com versão fixa no `package.json`. Pense duas vezes antes de adicionar uma.
- Formatação: dois espaços, aspas duplas, ponto e vírgula. Linhas podem ser longas; prefira clareza a quebrar tudo.

## Testes

```bash
cd server && npm test          # Vitest contra o banco conduta_test (veja o README)
cd server && npm run typecheck
cd app && npm run build        # checa os tipos e compila
```

Os testes do servidor usam os dados de exemplo de `exemplo/` (carregue com `python3 exemplo/carregar.py`). Novos testes devem usar só esses dados ou dados criados no próprio teste.

## O que não será aceito

- **Conteúdo de prova real**: enunciados, gabaritos, explicações, resoluções, resumos, imagens ou ids de questões de provas reais, nem em teste, exemplo ou comentário. O repositório tem só código e dados fictícios.
- **Material de terceiros** sem licença compatível: textos, imagens, vídeos, baralhos, transcrições ou dados de cursos, bancos de questões e sites.
- **Código de coleta automática** de conteúdo de outros sites.
- **Segredos**: chaves de API, senhas, tokens, endereços de servidor ou dados pessoais. Use `.env` (fora do git) e os arquivos `.env.example`.
- Mudanças que coloquem anúncio, rastreador de terceiros ou ranking entre pessoas.

## Conduta

Trate todo mundo com respeito. Críticas vão para o código e para as ideias, nunca para as pessoas. Não toleramos assédio, discriminação ou ataques pessoais em issues, pull requests ou qualquer outro espaço do projeto. Quem mantém o projeto pode editar ou apagar mensagens e bloquear quem não seguir isso. Para relatar um problema de conduta, use o mesmo contato do [SECURITY.md](SECURITY.md).
