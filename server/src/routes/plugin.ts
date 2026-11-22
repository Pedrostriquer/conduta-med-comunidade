/* A página "Sua IA" do app: prompts prontos e passos de cada IA, conexões, sessões compartilhadas, código de acesso e atividade.
   Os passos vêm da documentação oficial de cada IA (conferida em 30/10/2026). As telas delas mudam: o prompt manda a IA
   avisar quando o que a pessoa vê for diferente, em vez de insistir num menu que não existe. */
import { Hono } from "hono";
import { z } from "zod";
import { one, q, tx } from "../db";
import { env } from "../env";
import { hit, ms, notFound, requireUser } from "../http";
import type { AppEnv } from "../http";
import { isUuid, jsonBody, uuidOr404 } from "../lib/validate";
import { currentCode, SESSION_IDLE_MS } from "../mcp/shared";
import { ALL_TOOLS } from "../mcp/server";
import { PERSONAL_PREFIX, randomToken, sha256 } from "../oauth/tokens";

const r = new Hono<AppEnv>();

const urls = () => ({ normal: `${env.publicUrl}/mcp`, shared: `${env.publicUrl}/mcp/compartilhado` });
const NAMES = { normal: "Conduta Med", shared: "Conduta Med (conta compartilhada)" };

/** o link do Claude que abre "Adicionar conector personalizado" já com o nome e o endereço preenchidos */
export const claudeLink = (name: string, url: string) =>
  `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(name)}&connectorUrl=${encodeURIComponent(url)}`;
/** o texto para ler a pergunta certa: o que conta é outra pessoa usar o mesmo login, não o tipo de plano */
export const SHARED_HINT = "Use a conexão de conta compartilhada se mais alguém entra com o mesmo login desta IA: assinatura dividida com amigos, colegas ou família (o que é muito comum) ou um login comum de trabalho. Não tem a ver com plano Team ou empresarial. Se o login é só seu, use a conexão normal.";

type ClientSteps = { id: string; name: string; steps: string[]; stepsCompartilhado: string[] };

function clients(): ClientSteps[] {
  const { normal, shared } = urls();
  const claude = (url: string, auth: string, name: string) => [
    "Faça pelo navegador em claude.ai ou pelo aplicativo de computador. Funciona no plano gratuito (um conector) e nos pagos individuais. Em plano de equipe, quem adiciona é o dono da organização, em Organization settings > Connectors.",
    `Atalho: abra ${claudeLink(name, url)} . Ele abre a tela "Adicionar conector personalizado" já com o nome e o endereço. Toque em Continuar e, depois, em Conectar (ou Add). Pronto: pule para o último passo.`,
    "Sem o atalho: abra Customize > Connectors (https://claude.ai/customize/connectors), toque em \"+ Add\" e depois em \"Add custom connector\".",
    `Em nome, escreva ${name}. Em endereço, cole ${url} e toque em Continue.`,
    `Em Authentication, escolha ${auth} Toque em Continue e depois em "Add".`,
    'Num chat novo, toque no "+" no canto de baixo, abra Connectors e confira se o Conduta Med está ligado.',
  ];
  const chatgpt = (url: string, auth: string, name: string) => [
    "Faça no site chatgpt.com, no computador: a OpenAI só permite isso pela web. Conferido em outubro de 2026, a central de ajuda diz: planos Business, Enterprise e Edu têm o acesso completo, e no Business só administradores adicionam; o plano Pro conecta só com permissão de leitura, então a IA lê os seus dados, mas pode não conseguir gravar. Para Plus e gratuito a ajuda não confirma: se a opção não aparecer, a sua conta não tem esse recurso.",
    "Abra Plugins: https://chatgpt.com/plugins (se essa página não existir na sua conta, a tela antiga fica em Configurações > Apps > Create).",
    'Toque no botão de mais e em "Add custom MCP server".',
    `Em nome, escreva ${name}. Em Connection, cole ${url}.`,
    `Em autenticação, ${auth}`,
    'Leia o aviso, marque "I understand and want to continue" e toque em "Create as a plugin". Confira a lista de ações e instale.',
    "Num chat novo, digite @ na caixa de mensagem e escolha o Conduta Med. No ChatGPT a escolha vale por mensagem: repita o @ quando for pedir dados novos.",
  ];
  return [
    {
      id: "claude", name: "Claude (site e aplicativo de computador)",
      steps: claude(normal, '"Sign in when needed" e deixe o resto como veio.', NAMES.normal),
      stepsCompartilhado: claude(shared, '"No sign in": nesta conexão ninguém fica logado.', NAMES.shared),
    },
    {
      id: "chatgpt", name: "ChatGPT",
      steps: chatgpt(normal, "escolha OAuth. Quando pedir, entre com a sua conta do Conduta Med e toque em Permitir.", "Conduta Med"),
      stepsCompartilhado: chatgpt(shared, "escolha sem autenticação: nesta conexão ninguém fica logado.", "Conduta Med (conta compartilhada)"),
    },
    {
      id: "claude-code", name: "Claude Code",
      steps: [`No terminal: claude mcp add --transport http conduta-med ${normal}`, "Abra o Claude Code, digite /mcp, escolha conduta-med e entre com a sua conta.", `Em máquina sem navegador, gere um token pessoal em ${env.publicUrl}/plugin e use: claude mcp add --transport http conduta-med ${normal} --header "Authorization: Bearer ${PERSONAL_PREFIX}SEU_TOKEN"`],
      stepsCompartilhado: [`No terminal: claude mcp add --transport http conduta-med-compartilhado ${shared}`, "Em cada conversa, informe o @usuario e o código de acesso."],
    },
    {
      id: "cursor", name: "Cursor",
      steps: [`Crie ou edite o arquivo ~/.cursor/mcp.json com: {"mcpServers":{"conduta-med":{"url":"${normal}"}}}`, "O Cursor abre o login do Conduta Med sozinho. Entre e toque em Permitir."],
      stepsCompartilhado: [`Crie ou edite o arquivo ~/.cursor/mcp.json com: {"mcpServers":{"conduta-med-compartilhado":{"url":"${shared}"}}}`, "Em cada conversa, informe o @usuario e o código de acesso."],
    },
    {
      id: "gemini", name: "Gemini",
      steps: ["No aplicativo e no site do Gemini não encontramos, até outubro de 2026, um jeito oficial de adicionar um conector próprio. No Gemini CLI, de computador, funciona:", `No terminal: gemini mcp add --transport http conduta-med ${normal}`, "Dentro do Gemini CLI, digite /mcp auth conduta-med e entre com a sua conta."],
      stepsCompartilhado: ["No aplicativo e no site do Gemini não encontramos um jeito oficial de adicionar um conector próprio. No Gemini CLI:", `No terminal: gemini mcp add --transport http conduta-med-compartilhado ${shared}`, "Em cada conversa, informe o @usuario e o código de acesso."],
    },
  ];
}

const numbered = (xs: string[]) => xs.map((s, i) => `${i + 1}. ${s}`).join("\n");

function setupPrompts(cs: ClientSteps[]) {
  const { normal, shared } = urls();
  const by = (id: string) => cs.find((c) => c.id === id)!;
  const intro = `Quero conectar você ao Conduta Med, a plataforma onde eu estudo para a residência médica (${env.publicUrl}). Com essa conexão você consegue ver minhas estatísticas e meu cronograma, ler as questões que eu errei para achar padrões, montar listas e flashcards, explicar questões com base no vídeo da correção e me ensinar a usar a plataforma. Nada é alterado sem eu confirmar.`;
  const how = `Como me ajudar:
- Se você consegue abrir links, leia primeiro ${env.publicUrl}/ia.md: tem o passo a passo atualizado de cada IA. Se não consegue, siga o que está aqui.
- Sou estudante de medicina e não entendo de tecnologia. Fale simples, sem termos técnicos.
- Vamos como numa conversa: me dê uma etapa por vez, espere eu dizer que fiz e só então passe para a próxima.
- Comece perguntando em qual aparelho estou, se for preciso.
- Você não consegue adicionar o conector sozinho: só me orienta. Eu que faço na tela. Se o que eu vejo for diferente do que está aqui, peça para eu descrever ou mandar um print e me ajude a achar.`;
  const stepsOf = (id: string, key: "steps" | "stepsCompartilhado") => `Se você for o ${by(id).name}:\n${numbered(by(id)[key])}`;
  return {
    normal: `${intro}

O endereço do conector é:
${normal}

Escolhi a conexão normal, para quem tem o login desta IA só para si. Se eu contar que divido este login com outras pessoas (assinatura dividida com amigos ou família é comum), me avise que o certo é a conexão de conta compartilhada: eu copio o outro pedido em ${env.publicUrl}/plugin.

${how}

Passos para adicionar:

${stepsOf("claude", "steps")}

${stepsOf("chatgpt", "steps")}

Se você for outra IA, veja se existe a opção de adicionar um conector ou servidor MCP remoto com esse endereço. Se não existir, me diga com clareza que não dá.

Quando eu entrar na minha conta e autorizar, chame a ferramenta conduta_inicio e siga o que ela disser. Ela diz quem está conectado e o que falta configurar. Se ela já estiver disponível agora, é porque o conector já está pronto: chame e pule os passos.`,
    compartilhado: `${intro}

Outras pessoas entram com o mesmo login desta IA (por exemplo, dividimos a assinatura). Por isso quero o modo de conta compartilhada, para ninguém mais ver os meus estudos: o conector não tem login. Em cada chat eu informo o meu @usuario e um código de acesso, que aparece só no meu app e muda a cada uso. A sessão cai depois de 2 horas sem uso ou 24 horas no total, e aí eu passo um código novo.

O endereço do conector é:
${shared}

${how}
- Talvez o conector já exista nesta conta, com o nome Conduta Med (conta compartilhada). Se existir, não precisa adicionar de novo.
- Nunca salve meu @usuario, o código, a sessão ou os meus dados de estudo na sua memória. Não repita o token da sessão na conversa.

Passos para adicionar:

${stepsOf("claude", "stepsCompartilhado")}

${stepsOf("chatgpt", "stepsCompartilhado")}

Se você for outra IA, veja se existe a opção de adicionar um conector ou servidor MCP remoto sem autenticação com esse endereço. Se não existir, me diga com clareza que não dá.

Quando o conector estiver pronto, peça o meu @usuario e o código, e me mande o link ${env.publicUrl}/plugin/codigo, que abre direto no código para eu copiar; chame a ferramenta conduta_entrar e depois conduta_inicio com a sessão devolvida. Se essas ferramentas já estiverem disponíveis agora, pule os passos.`,
  };
}

r.get("/plugin/setup", (c) => {
  requireUser(c);
  const cs = clients(), { normal, shared } = urls();
  return c.json({
    urlNormal: normal, urlCompartilhado: shared, guia: `${env.publicUrl}/ia.md`,
    claudeLinks: { normal: claudeLink(NAMES.normal, normal), compartilhado: claudeLink(NAMES.shared, shared) },
    prompts: setupPrompts(cs), clients: cs, tools: ALL_TOOLS.map((t) => ({ name: t.name, group: t.group, summary: t.summary })),
  });
});

r.get("/plugin/status", async (c) => {
  const u = requireUser(c);
  const [connections, sessions, last] = await Promise.all([
    // uma conexão é uma família de tokens: o refresh roda, a conexão continua a mesma
    q<{ id: string; personal: boolean; label: string; last_used_at: Date | null; created_at: Date }>(
      `SELECT family AS id, bool_or(kind = 'pessoal') AS personal, max(label) AS label, max(last_used_at) AS last_used_at, min(created_at) AS created_at
       FROM mcp_tokens WHERE user_id = $1 GROUP BY family HAVING bool_or(revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())) ORDER BY max(last_used_at) DESC NULLS LAST, min(created_at) DESC`, [u.id]),
    q<{ id: string; created_at: Date; last_used_at: Date; ends_at: Date }>(
      `SELECT id, created_at, last_used_at, LEAST(expires_at, last_used_at + ($2 || ' milliseconds')::interval) AS ends_at FROM mcp_shared_sessions
       WHERE user_id = $1 AND ended_at IS NULL AND expires_at > now() AND last_used_at > now() - ($2 || ' milliseconds')::interval ORDER BY last_used_at DESC`, [u.id, String(SESSION_IDLE_MS)]),
    one<{ at: Date | null }>("SELECT max(at) AS at FROM mcp_audit WHERE user_id = $1", [u.id]),
  ]);
  return c.json({
    connections: connections.map((x) => ({ id: x.id, kind: x.personal ? "pessoal" : "oauth", label: x.label, lastUsedAt: ms(x.last_used_at), createdAt: ms(x.created_at)! })),
    sharedSessions: sessions.map((x) => ({ id: x.id, createdAt: ms(x.created_at)!, lastUsedAt: ms(x.last_used_at)!, expiresAt: ms(x.ends_at)! })),
    sharedMode: u.shared_mode, lastUsedAt: ms(last?.at),
  });
});

r.get("/plugin/activity", async (c) => {
  const u = requireUser(c), n = Math.max(1, Math.min(200, Number(c.req.query("limit")) || 50));
  const rows = await q<{ tool: string; mode: string; writes: boolean; ok: boolean; summary: string; at: Date }>("SELECT tool, mode, writes, ok, summary, at FROM mcp_audit WHERE user_id = $1 ORDER BY at DESC, id DESC LIMIT $2", [u.id, n]);
  return c.json({ items: rows.map((x) => ({ tool: x.tool, mode: x.mode, writes: x.writes, ok: x.ok, summary: x.summary, at: ms(x.at)! })) });
});

r.get("/plugin/code", async (c) => {
  const u = requireUser(c);
  return c.json(await currentCode(u), 200, { "Cache-Control": "no-store" });
});
r.post("/plugin/code/rotate", async (c) => {
  const u = requireUser(c);
  hit(`plugin-code:${u.id}`, 20, 3_600_000);
  return c.json(await currentCode(u, true), 200, { "Cache-Control": "no-store" });
});

const TokenBody = z.object({ label: z.string().trim().min(1, "Dê um nome para reconhecer depois.").max(60, "O nome pode ter até 60 caracteres.") });
r.post("/plugin/tokens", async (c) => {
  const u = requireUser(c), { label } = await jsonBody(c, TokenBody);
  hit(`plugin-token:${u.id}`, 20, 3_600_000);
  const token = randomToken(PERSONAL_PREFIX);
  const row = await one<{ family: string }>("INSERT INTO mcp_tokens (user_id, kind, token_hash, label) VALUES ($1, 'pessoal', $2, $3) RETURNING family", [u.id, sha256(token), label]);
  return c.json({ id: row!.family, token }, 200, { "Cache-Control": "no-store" });
});
r.delete("/plugin/connections/:id", async (c) => {
  const u = requireUser(c), id = uuidOr404(c.req.param("id"));
  await q("UPDATE mcp_tokens SET revoked_at = now() WHERE user_id = $1 AND family = $2 AND revoked_at IS NULL", [u.id, id]);
  return c.body(null, 204);
});
r.delete("/plugin/shared-sessions/:id", async (c) => {
  const u = requireUser(c), id = c.req.param("id");
  if (!isUuid(id)) throw notFound();
  await q("UPDATE mcp_shared_sessions SET ended_at = now() WHERE user_id = $1 AND id = $2 AND ended_at IS NULL", [u.id, id]);
  return c.body(null, 204);
});

const SettingsBody = z.object({ sharedMode: z.boolean() });
r.patch("/plugin/settings", async (c) => {
  const u = requireUser(c), { sharedMode } = await jsonBody(c, SettingsBody);
  await tx(async (db) => {
    await db.query("UPDATE users SET shared_mode = $2, updated_at = now() WHERE id = $1", [u.id, sharedMode]);
    if (!sharedMode) {
      // desligou: nada do que estava aberto continua valendo
      await db.query("UPDATE mcp_shared_sessions SET ended_at = now() WHERE user_id = $1 AND ended_at IS NULL", [u.id]);
      await db.query("DELETE FROM mcp_access_codes WHERE user_id = $1", [u.id]);
    }
  });
  return c.body(null, 204);
});

/* ---------- a página para a IA ler: /ia.md (e /llms.txt) ---------- */
/** Texto público, sem dado de ninguém: a pessoa cola o link na IA dela e a IA guia a conexão e o uso. */
export function iaGuide() {
  const u = env.publicUrl, { normal, shared } = urls(), cs = clients();
  const block = (key: "steps" | "stepsCompartilhado") => cs.map((c) => `### ${c.name}\n${numbered(c[key])}`).join("\n\n");
  return `# Conduta Med: guia para a IA conectar e ensinar

Você (a IA) está lendo isto porque uma pessoa quer ligar você ao Conduta Med (${u}), a plataforma gratuita e comunitária onde ela estuda para a residência médica. Com a conexão você vê as estatísticas e o cronograma dela, lê as questões que ela errou para achar padrões, explica questões com a resolução e o vídeo da correção, lê os resumos por assunto, monta listas e flashcards e ensina a usar a plataforma. Nada é alterado sem ela confirmar.

## Como conduzir
- A pessoa é estudante de medicina, não é de tecnologia. Fale simples: nada de MCP, servidor, OAuth, token ou API.
- Um passo por vez. Espere ela dizer que fez antes do próximo.
- Você não adiciona o conector sozinho: orienta, e ela faz na tela. Se a tela dela for diferente, peça um print ou que descreva, e ajude a achar.
- Pergunte em qual IA e em qual aparelho ela está, se não souber.

## Primeiro: qual conexão?
Pergunte: "mais alguém entra com este mesmo login da IA?"
- Não, o login é só dela: conexão normal, endereço ${normal}. Ela entra na conta do Conduta Med uma vez e pronto.
- Sim: conexão de conta compartilhada, endereço ${shared}. ${SHARED_HINT} Na conta compartilhada o conector não guarda login: em cada chat ela diz o @usuario e o código de acesso; mande o link ${u}/plugin/codigo, que abre direto no código pronto para copiar (muda a cada uso, vale 10 minutos; a sessão cai com 2 horas sem uso ou 24 horas no total). Nunca salve o código, a sessão nem os dados dela na sua memória.
A página ${u}/plugin também tem os dois caminhos e um pedido pronto para colar.

## Claude: atalho de um toque
- Conexão normal: ${claudeLink(NAMES.normal, normal)}
- Conta compartilhada: ${claudeLink(NAMES.shared, shared)}
O link abre "Adicionar conector personalizado" já preenchido. Ela confere o nome e o endereço, toca em Continuar e depois em Conectar. Na conexão normal, o Claude abre a tela do Conduta Med para ela entrar e tocar em Permitir.

## Passo a passo: conexão normal
${block("steps")}

## Passo a passo: conta compartilhada
${block("stepsCompartilhado")}

Outra IA: veja se ela permite adicionar um conector ou servidor MCP remoto com o endereço acima. Se não permitir, diga com clareza que não dá.

## Depois de conectar
Chame conduta_inicio (na conta compartilhada, antes conduta_entrar com o @usuario e o código). Daí em diante:
- Pergunte o que ela quer fazer e ajude nisso. Nada é obrigatório: prova-alvo, meta e cronograma são opcionais.
- Ensine a usar a plataforma com conduta_guia: "geral" é o mapa, "comecar" são os caminhos de quem acabou de chegar, e há um tópico para cada parte (questões, assuntos, simulados, flashcards, resumos, treino, cronograma, análises, perfil, comunidade, suporte, plugin). Responda sempre com o link real.
- Toda alteração mostra uma prévia e só acontece com o sim dela.

## O que existe na plataforma
- Hoje (${u}/): o que fazer agora, a meta e a sequência.
- Questões (${u}/questoes): listas por tema, prova ou erros; muitas com resolução completa e vídeo da correção no minuto da questão.
- Assuntos (${u}/assuntos): resumos por assunto, do jeito que a prova cobra, com as questões de cada um.
- Simulados (${u}/simulados): provas reais cronometradas.
- Cronograma (${u}/cronograma): opcional, até o dia da prova.
- Flashcards (${u}/flashcards): baralhos, importação do Anki (.apkg) e revisão espaçada.
- Resumos (${u}/resumos): o caderno da pessoa.
- Treino (${u}/treino): jogo de digitar ossos, músculos e ritmos de ECG, com corpo 3D; Explorar em ${u}/treino/explorar.
- Análises com IA (${u}/analises), Pessoas (${u}/pessoas), Perfil e ajustes (${u}/perfil), Suporte (${u}/suporte).
O Conduta Med é gratuito: não fale de preço nem de plano.
`;
}

export const iaPage = new Hono<AppEnv>();
for (const path of ["/ia.md", "/llms.txt"]) {
  iaPage.get(path, (c) => {
    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("Cache-Control", "public, max-age=600");
    return c.body(iaGuide());
  });
}

export default r;
