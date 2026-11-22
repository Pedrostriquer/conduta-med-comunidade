/* Resumos: ler e criar documentos e pastas. A IA não edita nem apaga o que existe. */
import { z } from "zod";
import { env } from "../../env";
import { createDoc, getDoc, listTree } from "../../lib/docs-store";
import { isUuid } from "../../lib/validate";
import { dateOf } from "../data";
import { readTool, ToolError, writeTool } from "../define";
import { markdownToTiptap, tiptapToMarkdown } from "../markdown";

const READ_MAX = 40_000;
const link = (id: string) => `${env.publicUrl}/resumos/${id}`;
function assertId(id: string, what: string) { if (!isUuid(id)) throw new ToolError(`Esse id de ${what} não é válido. Veja os ids com conduta_listar_resumos.`); }

async function assertFolder(uid: string, id: string | undefined) {
  if (!id) return null;
  assertId(id, "pasta");
  const nodes = await listTree(uid), p = nodes.find((n) => n.id === id);
  if (!p || p.kind !== "pasta") throw new ToolError("Não encontrei essa pasta. Veja os ids com conduta_listar_resumos.");
  return p;
}

export const tools = [
  readTool({
    name: "conduta_listar_resumos", title: "Listar resumos", group: "Resumos", summary: "As pastas e os documentos da pessoa.",
    description: "Use para ver as pastas e os documentos de resumo da pessoa, com o id de cada um. Chame antes de ler um resumo ou de criar dentro de uma pasta. Para o conteúdo, conduta_ler_resumo.",
    input: {
      limite: z.number().int().min(1).max(300).default(100).describe("Quantos nesta página (até 300)."),
      offset: z.number().int().min(0).default(0).describe("Quantos pular, para a próxima página."),
    },
    run: async (a: { limite: number; offset: number }, c) => {
      const nodes = await listTree(c.user.id), byId = new Map(nodes.map((n) => [n.id, n]));
      const pathOf = (id: string | null) => { const out: string[] = []; for (let n = id ? byId.get(id) : undefined, i = 0; n && i < 20; n = n.parentId ? byId.get(n.parentId) : undefined, i++) out.unshift(n.title || "Sem título"); return out.join(" › "); };
      return {
        resumo: `${nodes.length} itens`,
        data: { total: nodes.length, offset: a.offset, proxima: a.offset + a.limite < nodes.length ? a.offset + a.limite : null, itens: nodes.slice(a.offset, a.offset + a.limite).map((n) => ({ id: n.id, tipo: n.kind, titulo: n.title || "Sem título", pasta: pathOf(n.parentId) || null, pasta_id: n.parentId, quem_ve: n.visibility, atualizado: dateOf(n.updatedAt), criado_pela_ia: n.origin === "ia" || undefined, ...(n.kind === "doc" ? { link: link(n.id) } : {}) })), tela: `${env.publicUrl}/resumos` },
      };
    },
  }),
  readTool({
    name: "conduta_ler_resumo", title: "Ler resumo", group: "Resumos", summary: "O conteúdo de um resumo, em markdown.",
    description: "Use para ler um resumo da pessoa: devolve o título e o conteúdo em markdown. Ajuda a criar flashcards do que ela escreveu ou a ligar o resumo às questões. Para achar o id, conduta_listar_resumos.",
    input: { id: z.string().describe("Id do resumo, de conduta_listar_resumos.") },
    run: async (a: { id: string }, c) => {
      assertId(a.id, "resumo");
      const d = await getDoc(c.user.id, a.id);
      if (!d) throw new ToolError("Não encontrei esse resumo. Veja os ids com conduta_listar_resumos.");
      if (d.kind === "pasta") throw new ToolError("Esse id é de uma pasta, não de um documento.");
      const md = tiptapToMarkdown(d.content);
      return { resumo: "resumo lido", data: { id: d.id, titulo: d.title || "Sem título", atualizado: dateOf(d.updatedAt), link: link(d.id), markdown: md.length > READ_MAX ? md.slice(0, READ_MAX) + "\n\n[…continua no app]" : md } };
    },
  }),
  writeTool({
    name: "conduta_criar_resumo", title: "Criar resumo", group: "Resumos", summary: "Cria um resumo a partir de markdown, com títulos, listas, tabelas, citações e tarefas.",
    description: "Use para escrever um resumo no Conduta Med. Aceita markdown: títulos, listas, negrito, itálico, tabela, citação, tarefas (- [ ]) e links. Cria um documento novo, sempre privado; a pessoa decide se compartilha. Não edita resumo existente. Pede confirmação: a primeira chamada só mostra a prévia. Baseie o conteúdo nas questões e nas explicações, e avise o que for do seu conhecimento.",
    input: {
      titulo: z.string().min(1).max(200).describe("Título do resumo."),
      markdown: z.string().min(1).max(200_000).describe("Conteúdo em markdown."),
      pasta_id: z.string().optional().describe("Id da pasta onde colocar, de conduta_listar_resumos. Sem ele, fica na raiz."),
    },
    preview: async (a: { titulo: string; markdown: string; pasta_id?: string }, c) => {
      const p = await assertFolder(c.user.id, a.pasta_id), doc = markdownToTiptap(a.markdown), sections = doc.content.filter((n) => n.type === "heading").length;
      return `Criar o resumo "${a.titulo}" ${p ? `na pasta "${p.title}"` : "na raiz dos seus resumos"}, privado, com ${doc.content.length} blocos${sections ? ` e ${sections} títulos` : ""}. Começo: ${a.markdown.replace(/\s+/g, " ").slice(0, 200)}`;
    },
    apply: async (a: { titulo: string; markdown: string; pasta_id?: string }, c) => {
      await assertFolder(c.user.id, a.pasta_id);
      const d = await createDoc(c.user.id, { kind: "doc", title: a.titulo, parentId: a.pasta_id ?? null, content: markdownToTiptap(a.markdown) }, "ia");
      return { resumo: "resumo criado", data: { status: "criado", id: d.id, titulo: d.title, link: link(d.id) } };
    },
  }),
  writeTool({
    name: "conduta_criar_pasta", title: "Criar pasta de resumos", group: "Resumos", summary: "Cria uma pasta para organizar os resumos.",
    description: "Use para criar uma pasta de resumos, na raiz ou dentro de outra. Pede confirmação: a primeira chamada só mostra a prévia.",
    input: {
      nome: z.string().min(1).max(200).describe("Nome da pasta."),
      pasta_id: z.string().optional().describe("Id da pasta de dentro, de conduta_listar_resumos. Sem ele, fica na raiz."),
    },
    preview: async (a: { nome: string; pasta_id?: string }, c) => { const p = await assertFolder(c.user.id, a.pasta_id); return `Criar a pasta "${a.nome}" ${p ? `dentro de "${p.title}"` : "na raiz dos seus resumos"}.`; },
    apply: async (a: { nome: string; pasta_id?: string }, c) => {
      await assertFolder(c.user.id, a.pasta_id);
      const d = await createDoc(c.user.id, { kind: "pasta", title: a.nome, parentId: a.pasta_id ?? null }, "ia");
      return { resumo: "pasta criada", data: { status: "criada", id: d.id, nome: d.title, tela: `${env.publicUrl}/resumos` } };
    },
  }),
];
