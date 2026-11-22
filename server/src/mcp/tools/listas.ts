/* Listas de questões: sugerir pelo cronograma e criar a sessão no formato do app (Session de state/store.ts). */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { AREAS } from "../../bank";
import type { AreaId, Question } from "../../bank";
import { env } from "../../env";
import { cat, poolOf, topicKey, topicLabel } from "../catalog";
import { attemptsOf, goalsOf, needDate, planOf, reviewsOf, settingsOf, saveIa } from "../data";
import { endOfToday, today } from "../dates";
import { readTool, ToolError, writeTool } from "../define";
import { buildSchedule, prefsOf } from "../plan";
import { computeStats, weakTopics } from "../stats";
import type { Stats } from "../stats";

const shuffle = <T,>(xs: T[]) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
/** sorteia alternando as especialidades, como o app, para a lista não virar um bloco só de um tema */
function pick(xs: Question[], n: number) {
  const groups = new Map<string, Question[]>();
  for (const q of shuffle(xs)) { const k = topicKey(q); (groups.get(k) || groups.set(k, []).get(k)!).push(q); }
  const lanes = shuffle([...groups.values()]), out: string[] = [];
  while (out.length < n && lanes.some((l) => l.length)) for (const l of lanes) if (l.length && out.length < n) out.push(l.shift()!.id);
  return out;
}
const fresh = (st: Stats, xs: Question[]) => xs.filter((q) => !st.answered.has(q.id));

export const newId = () => randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x") + Date.now().toString(36).slice(-4);

export const tools = [
  readTool({
    name: "conduta_sugerir_lista", title: "Sugerir lista de questões", group: "Listas", summary: "Escolhe questões disponíveis pelo cronograma, pelos pontos fracos ou pelos erros, sem criar nada.",
    description: "Use quando a pessoa perguntar o que fazer hoje ou pedir uma lista: escolhe questões do jeito que o app faz, olhando os temas do dia no cronograma, o que ela ainda não fez, os pontos fracos e as erradas. Não cria nada e não mostra o conteúdo: devolve os ids e o porquê. Depois de combinar com a pessoa, crie com conduta_criar_lista. Para filtrar à mão, conduta_buscar_questoes.",
    input: {
      dia: z.string().optional().describe("Dia do cronograma, AAAA-MM-DD. Padrão: hoje."),
      quantidade: z.number().int().min(1).max(100).optional().describe("Quantas questões. Padrão: o que falta para a meta do dia, entre 5 e 50."),
      foco: z.enum(["cronograma", "fracos", "erros", "retorno"]).default("cronograma").describe("cronograma: temas do dia. fracos: especialidades com menor acerto. erros: erradas há mais de um dia. retorno: as que voltaram pela autoavaliação."),
    },
    run: async (a: { dia?: string; quantidade?: number; foco: "cronograma" | "fracos" | "erros" | "retorno" }, c) => {
      needDate(a.dia, "dia");
      const b = cat(), [attempts, plan, goals, settings, reviews] = await Promise.all([attemptsOf(c.user.id), planOf(c.user.id), goalsOf(c.user.id), settingsOf(c.user.id), reviewsOf(c.user.id)]);
      const st = computeStats(attempts), dia = a.dia || today(), inc = settings.incluirTodas, pool = poolOf(inc), okIds = new Set(pool.map((q) => q.id));
      const day = plan ? buildSchedule(plan, st, prefsOf(plan, goals.prefs as never), goals.cardGoals, goals.minimo.questoes, goals.eventos, goals.regras).find((d) => d.key === dia) : undefined;
      const doneToday = dia === today() ? st.activity.get(dia) || 0 : 0;
      const goal = a.quantidade ?? Math.max(5, Math.min(50, (day?.target || settings.metaDiaria) - doneToday));
      const weak = weakTopics(st).slice(0, 4).map((w) => w.key);
      let ids: string[] = [], titulo = "Questões do dia", porque = "";
      if (a.foco === "erros") {
        ids = pick(st.dueWrong.filter((id) => okIds.has(id)).map((id) => b.byId.get(id)!), goal); titulo = "Revisão de erros"; porque = "Questões erradas há mais de um dia.";
      } else if (a.foco === "retorno") {
        ids = [...reviews.entries()].filter(([id, r]) => r?.due <= endOfToday() && b.byId.has(id)).sort(([, x], [, y]) => x.due - y.due).slice(0, goal).map(([id]) => id); titulo = "Questões que voltaram"; porque = "Voltaram pela autoavaliação: Sabia em 21 dias, Chutei ou distração em 7, Não sabia em 2.";
      } else if (a.foco === "fracos") {
        const set = new Set(weak); ids = pick(fresh(st, pool.filter((q) => set.has(topicKey(q)))), goal); titulo = "Pontos fracos"; porque = weak.length ? `Especialidades com menor acerto: ${weak.map(topicLabel).join("; ")}.` : "Ainda sem respostas suficientes para saber os pontos fracos.";
      } else {
        if (day?.kind === "simulado") return { resumo: "dia de simulado", data: { dia, tipo_do_dia: "simulado", prova: day.exam ? b.examById.get(day.exam)?.nome : null, formato: day.formato, link: `${env.publicUrl}/simulados`, nota: "Hoje o cronograma marca simulado. O simulado se começa no app, na tela de Simulados. Se a pessoa preferir questões, chame de novo com foco fracos." } };
        const topics = new Set(day?.kind === "estudo" ? day.topics : []);
        ids = pick(fresh(st, pool.filter((q) => topics.has(topicKey(q)))), goal);
        if (ids.length < goal) { const set = new Set(weak), used = new Set(ids); ids = ids.concat(pick(fresh(st, pool.filter((q) => (!weak.length || set.has(topicKey(q))) && !used.has(q.id))), goal - ids.length)); }
        if (ids.length < goal) { const used = new Set(ids); ids = ids.concat(pick(st.wrong.filter((id) => okIds.has(id) && !used.has(id)).map((id) => b.byId.get(id)!), goal - ids.length)); }
        if (topics.size) titulo = [...topics].map((k) => k.split("/")[1]).join(" e ");
        porque = topics.size ? `Temas do dia no cronograma: ${[...topics].map(topicLabel).join("; ")}. Completei com novas dos pontos fracos e com erradas, se faltou.` : plan ? "Hoje não há tema marcado no cronograma: misturei novas dos pontos fracos." : "Sem cronograma: misturei novas de todas as áreas, puxando pelos pontos fracos quando há.";
      }
      const count = new Map<string, number>();
      for (const id of ids) { const k = topicKey(b.byId.get(id)!); count.set(k, (count.get(k) || 0) + 1); }
      return {
        resumo: `${ids.length} sugeridas (${a.foco})`,
        data: { dia, foco: a.foco, tipo_do_dia: day?.kind ?? null, quantidade: ids.length, titulo_sugerido: titulo, por_que: porque, por_especialidade: [...count.entries()].sort(([, x], [, y]) => y - x).map(([k, n]) => ({ especialidade: topicLabel(k), questoes: n })), ids, proximo_passo: "Combine com a pessoa e crie com conduta_criar_lista (passe dia, se for do cronograma)." },
      };
    },
  }),
  writeTool({
    name: "conduta_criar_lista", title: "Criar lista de questões", group: "Listas", summary: "Cria uma lista de questões no app, pronta para responder, e devolve o link.",
    description: "Use para criar uma lista de questões no app da pessoa, a partir de ids (de conduta_sugerir_lista, conduta_buscar_questoes ou conduta_erros). Pede confirmação: a primeira chamada só mostra a prévia. Depois, a lista aparece no app e o link abre direto para responder. Só para listas: simulado se começa na tela de Simulados.",
    input: {
      titulo: z.string().min(1).max(120).describe("Nome da lista, como a pessoa vai ver no app."),
      ids: z.array(z.string()).min(1).max(200).describe("Ids das questões, na ordem em que devem aparecer. Até 200."),
      corrigir: z.enum(["imediato", "final"]).optional().describe("imediato: mostra a correção a cada questão. final: só ao terminar. Padrão: o que a pessoa escolheu nos ajustes (normalmente imediato)."),
      dia: z.string().optional().describe("Dia do cronograma a que a lista atende, AAAA-MM-DD. Faz a lista contar para aquele dia."),
      nota: z.string().max(200).optional().describe("Por que a lista foi montada, em uma frase. Aparece só como origem da lista."),
    },
    preview: async (a: { titulo: string; ids: string[]; corrigir?: "imediato" | "final"; dia?: string }, c) => {
      needDate(a.dia, "dia");
      const b = cat(), miss = a.ids.filter((id) => !b.byId.has(id));
      if (miss.length) throw new ToolError(`Estes ids não existem: ${miss.slice(0, 10).join(", ")}. Confira com conduta_buscar_questoes.`);
      const ids = [...new Set(a.ids)], areas = new Map<string, number>();
      for (const id of ids) { const k = b.byId.get(id)!.area; areas.set(k, (areas.get(k) || 0) + 1); }
      const fb = a.corrigir ?? (await settingsOf(c.user.id)).feedbackLista;
      return `Criar a lista "${a.titulo}" com ${ids.length} questões (${[...areas.entries()].map(([k, n]) => `${AREAS[k as AreaId]}: ${n}`).join(", ")}), correção ${fb === "imediato" ? "a cada questão" : "ao final"}${a.dia ? `, contando para o dia ${a.dia} do cronograma` : ""}.`;
    },
    apply: async (a: { titulo: string; ids: string[]; corrigir?: "imediato" | "final"; dia?: string; nota?: string }, c) => {
      const ids = [...new Set(a.ids)], now = Date.now(), id = newId();
      const feedback = a.corrigir ?? (await settingsOf(c.user.id)).feedbackLista;
      const session = { id, kind: "lista", title: a.titulo, qids: ids, feedback, createdAt: now, limitSec: null, answers: {}, marked: {}, cur: 0, elapsedMs: 0, status: "ativa", source: { type: "ia", ...(a.nota ? { nota: a.nota } : {}) }, ...(a.dia ? { planDay: a.dia } : {}) };
      await saveIa(c.user.id, [{ c: "session", id, data: session, at: now }]);
      return { resumo: `lista com ${ids.length} questões`, data: { status: "criada", id, titulo: a.titulo, questoes: ids.length, link: `${env.publicUrl}/sessao/${id}`, nota: "A lista aparece no app na próxima vez que ele sincronizar." } };
    },
  }),
];
