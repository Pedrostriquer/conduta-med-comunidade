/* Sugestões para o criador: a IA só manda com a licença da pessoa. */
import { z } from "zod";
import { env } from "../../env";
import { createFeedback } from "../../lib/feedback-store";
import { writeTool } from "../define";

const KIND_LABEL = { sugestao: "sugestão de função", prova: "pedido de prova", problema: "problema", outro: "mensagem" } as const;
type Kind = keyof typeof KIND_LABEL;

export const tools = [
  writeTool({
    name: "conduta_enviar_sugestao", title: "Enviar sugestão ao criador", group: "Suporte", summary: "Com a licença da pessoa, manda ao criador uma sugestão, pedido de prova ou problema.",
    description: "Use quando a pessoa reclamar de algo, sentir falta de uma função ou de uma prova, ou encontrar um problema. Antes, pergunte se pode mandar para o criador do Conduta Med. Escreva com as palavras dela, em poucas linhas, sem dados de saúde nem de terceiros. Pede confirmação: a primeira chamada só mostra a prévia. A resposta do criador aparece em Suporte, no app.",
    input: {
      tipo: z.enum(["sugestao", "prova", "problema", "outro"]).describe("sugestao: função que ela gostaria. prova: prova que falta no banco. problema: algo que não funcionou. outro."),
      texto: z.string().min(1).max(8000).describe("A mensagem, com as palavras da pessoa."),
    },
    preview: (a: { tipo: Kind; texto: string }) => `Mandar ao criador do Conduta Med, como ${KIND_LABEL[a.tipo]}:\n"${a.texto}"`,
    apply: async (a: { tipo: Kind; texto: string }, c) => {
      const item = await createFeedback(c.user.id, { kind: a.tipo, body: a.texto, meta: { modo: c.mode } }, "plugin");
      return { resumo: KIND_LABEL[a.tipo], data: { status: "enviada", id: item.id, onde_ver_a_resposta: `${env.publicUrl}/suporte` } };
    },
  }),
];
