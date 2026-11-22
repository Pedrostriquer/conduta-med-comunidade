/* Um McpServer novo por requisição, sem estado: a identidade vem do token ou da sessão. Junta ferramentas, roteiros e guias. */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { env } from "../env";
import { registerTool } from "./define";
import type { AnyTool, RequestCtx } from "./define";
import { guideText, TOPIC_TITLES, TOPICS } from "./guide";
import { instructionsFor } from "./instructions";
import { PROMPTS } from "./prompts";
import { tools as inicio } from "./tools/inicio";
import { tools as estatisticas } from "./tools/estatisticas";
import { tools as erros } from "./tools/erros";
import { tools as questoes } from "./tools/questoes";
import { tools as listas } from "./tools/listas";
import { tools as cronograma } from "./tools/cronograma";
import { tools as perfil } from "./tools/perfil";
import { tools as flashcards } from "./tools/flashcards";
import { tools as etiquetas } from "./tools/etiquetas";
import { tools as resumos } from "./tools/resumos";
import { tools as suporte } from "./tools/suporte";
import { tools as sessao } from "./tools/sessao";
import { tools as assuntosTools } from "./tools/assuntos";

export const VERSION = "0.4.0";
/** todas menos as de entrar e sair, que só existem no modo compartilhado */
export const COMMON_TOOLS: AnyTool[] = [...inicio, ...estatisticas, ...erros, ...questoes, ...assuntosTools, ...listas, ...etiquetas, ...cronograma, ...perfil, ...flashcards, ...resumos, ...suporte];
export const ALL_TOOLS: AnyTool[] = [...sessao, ...COMMON_TOOLS];

/** o ícone que a IA mostra ao lado do conector (padrão do MCP; quem não lê isto usa o favicon do domínio) */
const ICONS = () => [
  { src: `${env.publicUrl}/icone-512.png`, mimeType: "image/png", sizes: ["512x512"] },
  { src: `${env.publicUrl}/icone-192.png`, mimeType: "image/png", sizes: ["192x192"] },
  { src: `${env.publicUrl}/icone-conduta-med.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
];

export function buildServer(ctx: RequestCtx) {
  const server = new McpServer({ name: "conduta-med", title: "Conduta Med", version: VERSION, websiteUrl: env.publicUrl, icons: ICONS() }, { instructions: instructionsFor(ctx.mode) });
  for (const t of ctx.mode === "compartilhado" ? ALL_TOOLS : COMMON_TOOLS) registerTool(server, ctx, t);
  for (const p of PROMPTS) {
    const argsSchema = p.args ? Object.fromEntries(p.args.map((a) => [a.name, z.string().optional().describe(a.description)])) : undefined;
    server.registerPrompt(p.name, { title: p.title, description: p.description, ...(argsSchema ? { argsSchema } : {}) }, ((args: Record<string, string | undefined> = {}) => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: p.text(args) } }],
    })) as never);
  }
  for (const t of TOPICS) {
    server.registerResource(`guia-${t}`, `conduta://guia/${t}`, { title: `Guia: ${TOPIC_TITLES[t]}`, description: `Onde fica e como usar: ${TOPIC_TITLES[t].toLowerCase()}.`, mimeType: "text/markdown" }, async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: guideText(t) }],
    }));
  }
  return server;
}
