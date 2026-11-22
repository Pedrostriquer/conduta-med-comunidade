/* Categorizar e guardar questões: etiquetas da pessoa (inclusive o tipo de erro que a IA identificou) e salvas. */
import { z } from "zod";
import { env } from "../../env";
import { getRecord } from "../../records";
import type { Change } from "../../records";
import { cat } from "../catalog";
import { saveIa } from "../data";
import { ToolError, writeTool } from "../define";

const cleanTag = (t: string) => t.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
const assertIds = (ids: string[]) => { const miss = ids.filter((id) => !cat().byId.has(id)); if (miss.length) throw new ToolError(`Estes ids não existem: ${miss.slice(0, 10).join(", ")}.`); };

type Item = { id: string; etiquetas: string[] };

export const tools = [
  writeTool({
    name: "conduta_etiquetar_questoes", title: "Etiquetar questões", group: "Questões", summary: "Põe etiquetas nas questões, como erro:diagnostico, para a pessoa filtrar depois.",
    description: "Use para categorizar questões com etiquetas da pessoa, principalmente o tipo de falha que você identificou ao ler os erros: erro:diagnostico, erro:mecanismo, erro:tratamento, erro:conduta, erro:leitura. Também aceita etiquetas livres, como revisar ou pegadinha. As novas somam às que já existem. Pede confirmação: a primeira chamada só mostra a prévia.",
    input: {
      itens: z.array(z.object({ id: z.string().describe("Id da questão."), etiquetas: z.array(z.string().min(1).max(40)).min(1).max(10).describe("Etiquetas desta questão.") })).min(1).max(200).describe("As questões e as etiquetas de cada uma."),
    },
    preview: (a: { itens: Item[] }) => {
      assertIds(a.itens.map((x) => x.id));
      const count = new Map<string, number>();
      for (const it of a.itens) for (const t of it.etiquetas.map(cleanTag)) count.set(t, (count.get(t) || 0) + 1);
      return `Etiquetar ${a.itens.length} ${a.itens.length === 1 ? "questão" : "questões"}: ${[...count.entries()].map(([t, n]) => `${t} (${n})`).join(", ")}.`;
    },
    apply: async (a: { itens: Item[] }, c) => {
      const now = Date.now(), byId = new Map<string, string[]>();
      for (const it of a.itens) byId.set(it.id, [...(byId.get(it.id) || []), ...it.etiquetas.map(cleanTag)]);
      const changes: Change[] = [];
      for (const [id, tags] of byId) {
        const cur = await getRecord<{ tags?: string[] }>(c.user.id, "qtag", id);
        changes.push({ c: "qtag", id, data: { tags: [...new Set([...(cur?.tags || []), ...tags])], at: now }, at: now });
      }
      await saveIa(c.user.id, changes);
      return { resumo: `${changes.length} questões etiquetadas`, data: { status: "etiquetadas", questoes: changes.length } };
    },
  }),
  writeTool({
    name: "conduta_salvar_questoes", title: "Salvar questões", group: "Questões", summary: "Guarda questões nas salvas da pessoa.",
    description: "Use quando a pessoa pedir para guardar questões para rever depois. Elas aparecem em Salvas no app. Pede confirmação: a primeira chamada só mostra a prévia.",
    input: { ids: z.array(z.string()).min(1).max(200).describe("Ids das questões. Até 200.") },
    preview: (a: { ids: string[] }) => { assertIds(a.ids); const n = new Set(a.ids).size; return `Guardar ${n} ${n === 1 ? "questão" : "questões"} nas suas salvas.`; },
    apply: async (a: { ids: string[] }, c) => {
      const now = Date.now(), ids = [...new Set(a.ids)];
      await saveIa(c.user.id, ids.map((id) => ({ c: "saved", id, data: { at: now }, at: now })));
      return { resumo: `${ids.length} questões salvas`, data: { status: "salvas", questoes: ids.length, link: `${env.publicUrl}/questoes/salvas` } };
    },
  }),
];
