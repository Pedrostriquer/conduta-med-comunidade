/* Modo de conta compartilhada: entrar com @usuario e código, e sair. Só existem no endereço /mcp/compartilhado. */
import { z } from "zod";
import { env } from "../../env";
import { sessionTool } from "../define";
import { SHARED_RULES } from "../instructions";
import { enter, leave, SESSION_IDLE_MS } from "../shared";

export const tools = [
  sessionTool({
    name: "conduta_entrar", title: "Entrar com @usuario e código", group: "Conta compartilhada", summary: "Entra na conta com o @usuario e o código de acesso que aparece no app.",
    description: `A primeira chamada de todo chat nesta conexão. Pergunte o @usuario e o código de acesso da pessoa: o código aparece em ${env.publicUrl}/plugin/codigo (mande este link: abre direto no código, pronto para copiar), muda a cada uso e vale 10 minutos. Devolve o token sessao, que você passa no campo sessao de toda ferramenta. Nunca salve o código nem a sessão na memória e não repita o token na conversa. Se der erro, peça para a pessoa conferir os dois em vez de tentar de novo: erros demais travam a conta por 15 minutos.`,
    input: {
      usuario: z.string().min(1).max(40).describe("O @usuario da pessoa no Conduta Med, com ou sem @."),
      codigo: z.string().min(1).max(20).describe("O código de acesso de 8 caracteres que aparece no app. Uso único."),
    },
    run: async (a: { usuario: string; codigo: string }, ctx) => {
      const s = await enter(a.usuario, a.codigo, ctx.ip);
      return {
        userId: s.user.id, resumo: "entrou",
        data: {
          status: "conectado", sessao: s.token, pessoa: { nome: s.user.name, usuario: "@" + s.user.handle },
          vale: `Até ${Math.round(SESSION_IDLE_MS / 3_600_000)} horas sem uso e no máximo 24 horas. Depois, peça um código novo.`,
          regras: SHARED_RULES, proximo_passo: "Chame conduta_inicio com este token no campo sessao.",
        },
      };
    },
  }),
  sessionTool({
    name: "conduta_sair", title: "Sair da sessão", group: "Conta compartilhada", summary: "Encerra a sessão deste chat.",
    description: "Encerra a sessão deste chat. Use quando a pessoa disser que terminou ou pedir para sair. Depois disso, entrar de novo pede um código novo.",
    input: { sessao: z.string().min(10).describe("O token da sessão, devolvido por conduta_entrar.") },
    run: async (a: { sessao: string }) => { await leave(a.sessao); return { data: { status: "encerrada", nota: "Sessão encerrada. Para entrar de novo, é preciso um código novo." } }; },
  }),
];
