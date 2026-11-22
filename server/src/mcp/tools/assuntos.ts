/* Ler os Assuntos: a lista, o resumo de um assunto ("Em uma tela" e os blocos) e um bloco inteiro. */
import { z } from "zod";
import { limpa } from "../../lib/limpo";
import { assunto, assuntos, linkAssunto } from "../assuntos";
import { readTool, ToolError } from "../define";

const AREA: Record<string, string> = { clinica: "Clínica Médica", cirurgia: "Cirurgia", go: "Ginecologia e Obstetrícia", pediatria: "Pediatria", preventiva: "Preventiva" };
const BLOCO_MAX = 12_000;

export const tools = [
  readTool({
    name: "conduta_assuntos", title: "Assuntos: resumos do jeito que a prova cobra", group: "Assuntos", summary: "Lista os assuntos com resumo pronto, lê o resumo de um assunto e um bloco inteiro, com o link para abrir no app.",
    description: "Use para estudar um tema com a pessoa ou indicar onde ler: os Assuntos são resumos por assunto escritos a partir das questões que caem, com o que a prova mais pergunta. Sem argumentos, lista os assuntos que existem. Com assunto (o slug), devolve o \"Em uma tela\" e o índice dos blocos, com quantas questões cada um tem e as perguntas que mais se repetem. Com assunto e bloco, devolve o texto inteiro daquele bloco. Sempre mande o link para a pessoa abrir no app. Não são os resumos pessoais da pessoa: esses ficam em conduta_listar_resumos.",
    input: {
      assunto: z.string().max(80).optional().describe("Slug do assunto, como arboviroses-sindromes-febris. Vazio: lista todos."),
      bloco: z.string().max(10).optional().describe("Id do bloco, como F1. Precisa do assunto."),
    },
    run: (a: { assunto?: string; bloco?: string }) => {
      if (!a.assunto) {
        const list = assuntos();
        return {
          resumo: `${list.length} assuntos`,
          data: {
            assuntos: list.map((x) => ({ assunto: x.slug, titulo: x.titulo, area: AREA[x.area] ?? x.area, questoes: x.questoes, link: linkAssunto(x.slug) })),
            nota: list.length ? "Ainda não há resumo de todos os temas. Se o tema que a pessoa quer não estiver aqui, diga e ofereça as questões dele." : "Ainda não há assuntos publicados.",
          },
        };
      }
      const s = assunto(a.assunto);
      if (!s) throw new ToolError(`Não há o assunto "${a.assunto}". Chame conduta_assuntos sem argumentos para ver a lista.`);
      if (a.bloco) {
        const b = s.blocos.find((x) => x.id.toLowerCase() === a.bloco!.toLowerCase());
        if (!b) throw new ToolError(`O assunto ${s.titulo} não tem o bloco ${a.bloco}. Blocos: ${s.blocos.map((x) => x.id).join(", ")}.`);
        const txt = limpa(b.essencial_md, true);
        return {
          resumo: `${s.titulo} · ${b.titulo}`,
          data: {
            assunto: s.titulo, bloco: b.id, titulo: b.titulo, link: linkAssunto(s.slug, b.id),
            como_cai: { questoes: b.cai_assim?.questoes ?? null, perguntas_que_mais_se_repetem: b.cai_assim?.perguntas_que_mais_se_repetem ?? [] },
            texto: txt.length > BLOCO_MAX ? txt.slice(0, BLOCO_MAX) + " […] (continua no app)" : txt,
          },
        };
      }
      return {
        resumo: s.titulo,
        data: {
          assunto: s.titulo, link: linkAssunto(s.slug),
          em_uma_tela: limpa(s.em_uma_tela?.texto_md, true) || null,
          blocos: s.blocos.map((b) => ({ bloco: b.id, titulo: b.titulo, questoes: b.cai_assim?.questoes ?? null, perguntas_que_mais_se_repetem: (b.cai_assim?.perguntas_que_mais_se_repetem ?? []).slice(0, 3), link: linkAssunto(s.slug, b.id) })),
          nota: "Na página do assunto há o botão Fazer questões deste assunto. Para ler um bloco inteiro, chame de novo com o bloco.",
        },
      };
    },
  }),
];
