/* Cronograma: ler o plano e o que cai em cada dia; criar ou alterar com tudo o que o editor do app permite. */
import { z } from "zod";
import { env } from "../../env";
import { AREAS } from "../../bank";
import type { AreaId } from "../../bank";
import { getRecord } from "../../records";
import type { Change } from "../../records";
import { cat, topicLabel } from "../catalog";
import { attemptsOf, goalsOf, needDate, pct, planOf, saveIa } from "../data";
import { addDays, diffDays, isDayKey, today, weekdayOf, WEEKDAYS } from "../dates";
import { readTool, ToolError, writeTool } from "../define";
import { behindOf, buildSchedule, cardsPerDay, DEFAULT_PREFS, examName, PHASES, planImpact, prefsOf, SEC_PER_CARD } from "../plan";
import type { Plan, PlanPrefs } from "../plan";
import { computeStats } from "../stats";
import type { Goals } from "../stats";
import { findDeck } from "./flashcards";

const BANCAS = ["ENARE", "ENAMED", "SUS-SP", "PSU-MG", "PSU-GO", "AMP", "AMRIGS", "USP-SP", "USP-RP", "UNIFESP", "PSU-AL", "SES-PE", "SES-DF", "Revalida", "Outra"] as const;
const WD = z.number().int().min(0).max(6);
const MAX_RANGE = 62;

const day = (k: number) => WEEKDAYS[k];
const list = (xs: string[]) => (xs.length ? xs.join(", ") : "nenhum");

const input = {
  banca: z.enum(BANCAS).optional().describe("Banca principal. Outra = usa todas as provas do banco. Obrigatória ao criar."),
  data: z.string().optional().describe("Data da prova, AAAA-MM-DD. Obrigatória ao criar. Precisa ser futura."),
  nome_prova: z.string().max(60).optional().describe("Nome da prova, como ENARE 2027. Sem ele, é calculado pela banca e pela data."),
  inicio: z.string().optional().describe("Primeiro dia do plano, AAAA-MM-DD. Padrão ao criar: hoje."),
  dias_da_semana: z.array(WD).min(1).optional().describe("Dias de estudo: 0 = domingo, 1 = segunda ... 6 = sábado. Padrão ao criar: segunda a sábado."),
  meta_por_dia: z.number().int().min(1).max(500).optional().describe("Questões por dia de estudo. Padrão ao criar: 40."),
  simulado_frequencia: z.enum(["semanal", "quinzenal", "nenhum"]).optional().describe("Com que frequência entra simulado. Padrão ao criar: semanal. Na reta final entra um a mais por semana."),
  simulado_dia: WD.optional().describe("Dia da semana do simulado: 0 = domingo ... 6 = sábado. Padrão ao criar: sábado."),
  ritmo: z.enum(["meta", "dia", "horas"]).optional().describe("Como medir a carga: meta (mesma quantidade todo dia), dia (questões por dia da semana) ou horas (horas por dia da semana)."),
  questoes_por_dia_da_semana: z.record(z.string(), z.number().int().min(0).max(500)).optional().describe('Com ritmo = dia. Exemplo: {"1": 40, "2": 60}, onde a chave é o dia da semana (0 = domingo).'),
  horas_por_dia_da_semana: z.record(z.string(), z.number().min(0).max(16)).optional().describe('Com ritmo = horas. Exemplo: {"1": 3, "6": 6}, onde a chave é o dia da semana (0 = domingo).'),
  minutos_por_questao: z.number().min(0.5).max(15).optional().describe("Minutos por questão com a correção, usado no ritmo por horas. Padrão: 2,5."),
  plantoes: z.array(WD).optional().describe("Dias da semana com plantão fixo: viram dia leve, só com o mínimo de questões. Passe a lista inteira; [] tira todos."),
  pausas: z.array(z.object({ de: z.string().describe("Início, AAAA-MM-DD."), ate: z.string().describe("Fim, AAAA-MM-DD."), nome: z.string().max(60).optional().describe("Nome, como Férias.") })).optional().describe("Férias e pausas: dias sem estudo. Passe a lista inteira; [] tira todas."),
  bancas_extras: z.array(z.enum(BANCAS)).optional().describe("Outras bancas-alvo além da principal: somam na escolha dos temas e dos simulados. Passe a lista inteira."),
  enfase_por_area: z.record(z.string(), z.number().min(0.5).max(1.5)).optional().describe('Ênfase por grande área: 0.5 (menos), 1 (normal) ou 1.5 (mais). Chaves: clinica, cirurgia, go, pediatria, preventiva. Exemplo: {"go": 1.5}.'),
  fases: z.object({ fim_da_base: z.number().min(0.1).max(0.95).describe("Fração dos dias de estudo em que termina a Base. Padrão: 0.65."), fim_da_revisao: z.number().min(0.15).max(1).describe("Fração em que termina a Revisão. Padrão: 0.9. Depois vem a Reta final.") }).optional().describe("Onde termina cada fase do plano."),
  teto_por_dia: z.number().int().min(1).max(500).nullable().optional().describe("Máximo de questões num dia, para nada acumular. null tira o teto."),
  cards_por_dia: z.record(z.string(), z.number().int().min(0).max(2000)).optional().describe('Meta de flashcards por dia em cada baralho, pelo nome do baralho. Exemplo: {"Meus erros": 30}. 0 tira a meta. Entra na carga do dia.'),
  minimo_questoes: z.number().int().min(1).max(100).optional().describe("Mínimo de questões para o dia contar na sequência. Padrão: 10."),
  minimo_cards: z.number().int().min(1).max(300).optional().describe("Mínimo de cards para o dia contar na sequência (vale questões ou cards). Padrão: 20."),
};
type Input = { [K in keyof typeof input]?: z.infer<(typeof input)[K]> };

type Next = { plan: Plan; prefs: PlanPrefs; cardGoals: Record<string, number>; minimo: Goals["minimo"]; creating: boolean; deckNames: Map<string, string> };

/** junta o pedido com o que já existe; o que não veio continua igual */
async function merge(a: Input, uid: string, cur: Plan | null, goals: Goals): Promise<Next> {
  const t = today();
  needDate(a.data, "data"); needDate(a.inicio, "inicio");
  for (const p of a.pausas || []) { needDate(p.de, "de"); needDate(p.ate, "ate"); if (p.ate < p.de) throw new ToolError("Numa pausa, o fim precisa vir depois do começo."); }
  if (!cur && (!a.banca || !a.data)) throw new ToolError("Para criar o cronograma preciso de pelo menos a banca e a data da prova. Pergunte à pessoa.");
  const banca = a.banca ?? cur!.banca, data = a.data ?? cur!.data;
  if (!isDayKey(data) || data <= t) throw new ToolError("A data da prova precisa ser depois de hoje.");
  const changedExam = !!cur && (banca !== cur.banca || data !== cur.data);
  const plan: Plan = {
    banca, data, exame: a.nome_prova ?? (cur && !changedExam ? cur.exame : examName(banca, data)),
    inicio: a.inicio ?? (cur?.inicio && cur.inicio <= t ? cur.inicio : t), dias: a.dias_da_semana ? [...new Set(a.dias_da_semana)].sort() : cur?.dias ?? [1, 2, 3, 4, 5, 6], meta: a.meta_por_dia ?? cur?.meta ?? 40,
    simulado: { freq: a.simulado_frequencia ?? cur?.simulado.freq ?? "semanal", dia: a.simulado_dia ?? cur?.simulado.dia ?? 6 },
    ajustes: cur?.ajustes ?? {}, resolvidoAte: cur?.resolvidoAte ?? null, criadoEm: cur?.criadoEm ?? 0,
  };
  if (plan.inicio >= data) throw new ToolError("O início do plano precisa ser antes da data da prova.");
  const base = cur ? prefsOf(cur, goals.prefs as never) : DEFAULT_PREFS;
  const nums = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => { const n = Number(k); if (!Number.isInteger(n) || n < 0 || n > 6) throw new ToolError(`Dia da semana inválido: ${k}. Use de 0 (domingo) a 6 (sábado).`); return [n, v]; }));
  const prefs: PlanPrefs = {
    ...base,
    ...(a.ritmo ? { ritmo: a.ritmo } : {}), ...(a.questoes_por_dia_da_semana ? { porDia: nums(a.questoes_por_dia_da_semana) } : {}), ...(a.horas_por_dia_da_semana ? { horas: nums(a.horas_por_dia_da_semana) } : {}),
    ...(a.minutos_por_questao ? { minPorQuestao: a.minutos_por_questao } : {}), ...(a.plantoes ? { plantoes: [...new Set(a.plantoes)].sort() } : {}), ...(a.pausas ? { pausas: a.pausas } : {}),
    ...(a.bancas_extras ? { bancas: [...new Set(a.bancas_extras)].filter((b) => b !== banca) } : {}), ...(a.teto_por_dia !== undefined ? { teto: a.teto_por_dia } : {}),
    ...(a.fases ? { fases: [a.fases.fim_da_base, a.fases.fim_da_revisao] as [number, number] } : {}),
  };
  if (a.enfase_por_area) {
    for (const k of Object.keys(a.enfase_por_area)) if (!(k in AREAS)) throw new ToolError(`Área desconhecida: ${k}. Use clinica, cirurgia, go, pediatria ou preventiva.`);
    prefs.areas = { ...base.areas, ...a.enfase_por_area };
  }
  if (prefs.fases[0] >= prefs.fases[1]) throw new ToolError("A Base precisa terminar antes da Revisão.");
  const cardGoals = { ...goals.cardGoals }, deckNames = new Map<string, string>();
  for (const [name, n] of Object.entries(a.cards_por_dia || {})) {
    const d = await findDeck(uid, name);
    deckNames.set(d.id, d.name);
    if (n > 0) cardGoals[d.id] = n; else delete cardGoals[d.id];
  }
  // ao trocar o jeito de medir, cada dia começa com o equivalente à meta atual, como no editor do app
  if (prefs.ritmo !== "meta") {
    const cardsMin = cardsPerDay(cardGoals) * SEC_PER_CARD / 60;
    for (const d of plan.dias) {
      if (prefs.ritmo === "dia" && prefs.porDia[d] == null) prefs.porDia = { ...prefs.porDia, [d]: plan.meta };
      if (prefs.ritmo === "horas" && prefs.horas[d] == null) prefs.horas = { ...prefs.horas, [d]: Math.max(0.5, Math.round(((plan.meta * prefs.minPorQuestao + cardsMin) / 60) * 2) / 2) };
    }
  }
  const minimo = { questoes: a.minimo_questoes ?? goals.minimo.questoes, cards: a.minimo_cards ?? goals.minimo.cards };
  return { plan, prefs, cardGoals, minimo, creating: !cur, deckNames };
}

function describe(n: Next, cur: Plan | null, curPrefs: PlanPrefs) {
  const { plan: p, prefs: f } = n, out: string[] = [];
  out.push(`${n.creating ? "Criar" : "Alterar"} o cronograma para ${p.exame} em ${p.data} (faltam ${diffDays(today(), p.data)} dias), a partir de ${p.inicio}.`);
  out.push(`Banca principal: ${p.banca}. Outras bancas: ${list(f.bancas)}.`);
  out.push(`Dias de estudo: ${p.dias.map(day).join(", ")}.`);
  out.push(f.ritmo === "meta" ? `Ritmo: ${p.meta} questões por dia.` : f.ritmo === "dia" ? `Ritmo por dia da semana: ${Object.entries(f.porDia).map(([d, q]) => `${day(+d)} ${q}`).join(", ")}.` : `Ritmo por horas: ${Object.entries(f.horas).map(([d, h]) => `${day(+d)} ${h} h`).join(", ")} (${f.minPorQuestao} min por questão).`);
  out.push(`Simulados: ${p.simulado.freq === "nenhum" ? "nenhum" : `${p.simulado.freq}, ${day(p.simulado.dia)}`}.`);
  if (f.plantoes.length) out.push(`Plantão fixo (dia leve): ${f.plantoes.map(day).join(", ")}.`);
  if (f.pausas.length) out.push(`Pausas: ${f.pausas.map((x) => `${x.nome || "pausa"} de ${x.de} a ${x.ate}`).join("; ")}.`);
  if (Object.keys(f.areas).length) out.push(`Ênfase: ${Object.entries(f.areas).map(([k, v]) => `${AREAS[k as AreaId]} ${v < 1 ? "menos" : v > 1 ? "mais" : "normal"}`).join(", ")}.`);
  if (f.teto) out.push(`Teto de ${f.teto} questões por dia.`);
  if (f.fases[0] !== curPrefs.fases[0] || f.fases[1] !== curPrefs.fases[1]) out.push(`Fases: Base até ${pct(f.fases[0])}% dos dias, Revisão até ${pct(f.fases[1])}%.`);
  if (n.deckNames.size) out.push(`Cards por dia: ${[...n.deckNames].map(([id, name]) => `${name} ${n.cardGoals[id] ?? 0}`).join(", ")}.`);
  return out;
}

export const tools = [
  readTool({
    name: "conduta_ver_cronograma", title: "Ver o cronograma", group: "Cronograma", summary: "O plano, as preferências e o que está previsto em cada dia.",
    description: "Use para saber o que está previsto: o plano (prova, banca, data, dias, meta), as preferências (ritmo, plantões, pausas, ênfase, fases, teto), o atraso e o que cai em cada dia do período (temas, questões, simulado, cards, minutos, quanto já fez). Chame antes de sugerir mudanças. Sem plano, diz como criar. Para criar ou alterar, conduta_salvar_cronograma.",
    input: {
      de: z.string().optional().describe("Primeiro dia, AAAA-MM-DD. Padrão: hoje."),
      ate: z.string().optional().describe("Último dia, AAAA-MM-DD. Padrão: 14 dias depois de 'de'. No máximo 62 dias por chamada."),
    },
    run: async (a: { de?: string; ate?: string }, c) => {
      needDate(a.de, "de"); needDate(a.ate, "ate");
      const [plan, goals, attempts] = await Promise.all([planOf(c.user.id), goalsOf(c.user.id), attemptsOf(c.user.id)]);
      if (!plan) return { resumo: "sem cronograma", data: { tem_cronograma: false, nota: "A pessoa ainda não tem cronograma. Ofereça montar com conduta_salvar_cronograma: basta a banca e a data, o resto tem padrão.", criar_no_app: `${env.publicUrl}/cronograma/novo` } };
      const st = computeStats(attempts), prefs = prefsOf(plan, goals.prefs as never), days = buildSchedule(plan, st, prefs, goals.cardGoals, goals.minimo.questoes, goals.eventos, goals.regras), t = today();
      const de = a.de || t, ate = a.ate || addDays(de, 14);
      if (diffDays(de, ate) > MAX_RANGE) throw new ToolError(`Peça no máximo ${MAX_RANGE} dias por vez.`);
      const b = behindOf(plan, days, st), c0 = cat();
      return {
        resumo: `de ${de} a ${ate}`,
        data: {
          tem_cronograma: true,
          plano: { prova: plan.exame, banca: plan.banca, data: plan.data, inicio: plan.inicio, dias_da_semana: plan.dias.map(day), meta_por_dia: plan.meta, simulado: plan.simulado },
          preferencias: { ritmo: prefs.ritmo, questoes_por_dia_da_semana: prefs.porDia, horas_por_dia_da_semana: prefs.horas, minutos_por_questao: prefs.minPorQuestao, plantoes: prefs.plantoes.map(day), pausas: prefs.pausas, bancas_extras: prefs.bancas, enfase_por_area: prefs.areas, fases: { fim_da_base: prefs.fases[0], fim_da_revisao: prefs.fases[1] }, teto_por_dia: prefs.teto },
          metas: { cards_por_dia_por_baralho: goals.cardGoals, minimo_para_a_sequencia: goals.minimo },
          compromissos: (goals.eventos || []).filter((e) => e.ate >= de && e.de <= ate).map((e) => ({ de: e.de, ate: e.ate, tipo: e.tipo, nome: e.nome ?? null })),
          situacao: { hoje: t, faltam_dias: diffDays(t, plan.data), questoes_atrasadas: b.atrasadas, progresso_pct: pct(b.progresso), resumo: planImpact(days, prefs, cardsPerDay(goals.cardGoals)) },
          dias: days.filter((d) => d.key >= de && d.key <= ate).map((d) => ({
            data: d.key, dia: day(weekdayOf(d.key)), tipo: d.kind, fase: PHASES[d.phase], ...(d.evento ? { compromisso: d.evento } : {}), ...(d.onlyCards ? { so_flashcards: true } : {}), ...(d.topics.length ? { temas: d.topics.map(topicLabel) } : {}), ...(d.target ? { questoes: d.target } : {}), ...(d.exam ? { simulado: c0.examById.get(d.exam)?.nome ?? d.exam, formato: d.formato } : {}), ...(d.light ? { dia_leve: true } : {}), ...(d.pausa ? { pausa: d.pausa } : {}), ...(d.cards ? { cards: d.cards } : {}), ...(d.minutes ? { minutos: d.minutes } : {}), ...(st.activity.get(d.key) ? { feitas: st.activity.get(d.key) } : {}),
          })),
          link: `${env.publicUrl}/cronograma`,
        },
      };
    },
  }),
  writeTool({
    name: "conduta_salvar_cronograma", title: "Criar ou alterar o cronograma", group: "Cronograma", summary: "Cria ou altera o plano com tudo o que o editor do app permite, mostrando antes o impacto.",
    description: "Use para criar o cronograma ou mudar qualquer coisa nele: prova, banca, data, dias, meta, ritmo, horas por dia, plantões, pausas, bancas extras, ênfase por área, fases, teto e metas de cards. Passe só o que muda: o resto continua igual. Ao criar, bastam banca e data. Pede confirmação: a primeira chamada mostra o que vai mudar e o impacto (questões por dia, simulados, carga). Quando importar de outra plataforma, mostre antes o que entendeu dos prints e o que não dá para trazer. Não apaga o cronograma: isso só no app.",
    input,
    preview: async (a: Input, c) => {
      const [cur, goals, attempts] = await Promise.all([planOf(c.user.id), goalsOf(c.user.id), attemptsOf(c.user.id)]);
      const n = await merge(a, c.user.id, cur, goals), st = computeStats(attempts), curPrefs = cur ? prefsOf(cur, goals.prefs as never) : DEFAULT_PREFS;
      const after = planImpact(buildSchedule(n.plan, st, n.prefs, n.cardGoals, n.minimo.questoes, goals.eventos, goals.regras), n.prefs, cardsPerDay(n.cardGoals));
      const before = cur ? planImpact(buildSchedule(cur, st, curPrefs, goals.cardGoals, goals.minimo.questoes, goals.eventos, goals.regras), curPrefs, cardsPerDay(goals.cardGoals)) : null;
      const line = (label: string, k: keyof typeof after, unit = "") => `${label}: ${before && before[k] !== after[k] ? `${before[k]} → ` : ""}${after[k]}${unit}`;
      return [
        ...describe(n, cur, curPrefs), "", "Como fica:",
        line("Questões por dia (média)", "media_questoes_por_dia"), line("Maior dia", "maior_dia"), line("Carga média por dia", "carga_media_min", " min"), line("Dias de estudo", "dias_de_estudo"), line("Simulados", "simulados"), line("Questões até a prova", "questoes_ate_a_prova"),
      ].join("\n");
    },
    apply: async (a: Input, c) => {
      const uid = c.user.id, [cur, goals, study, meta] = await Promise.all([planOf(uid), goalsOf(uid), getRecord<Record<string, unknown>>(uid, "study", "main"), getRecord<Record<string, unknown>>(uid, "meta", "main")]);
      const n = await merge(a, uid, cur, goals), now = Date.now(), plan: Plan = { ...n.plan, criadoEm: cur?.criadoEm || now };
      const nextGoals = { ...goals, prefs: { ...goals.prefs, [String(plan.criadoEm)]: n.prefs }, cardGoals: n.cardGoals, minimo: n.minimo };
      const changes: Change[] = [{ c: "plan", id: "main", data: plan, at: now }, { c: "goals", id: "main", data: nextGoals, at: now }];
      // quem montou o plano pela IA não precisa passar pelas boas-vindas do app
      if (!meta?.onboarded) changes.push({ c: "meta", id: "main", data: { celebrated: {}, ...(meta || {}), onboarded: true }, at: now });
      if (!study) changes.push({ c: "study", id: "main", data: { bancas: [plan.banca, ...n.prefs.bancas], prova: plan.data, fase: null }, at: now });
      await saveIa(uid, changes);
      return { resumo: `${n.creating ? "criou" : "alterou"} o cronograma`, data: { status: n.creating ? "criado" : "alterado", prova: plan.exame, data: plan.data, link: `${env.publicUrl}/cronograma`, ajustar_no_app: `${env.publicUrl}/cronograma?ajustar=1`, nota: "Aparece no app na próxima vez que ele sincronizar." } };
    },
  }),
];
