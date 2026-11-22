/* A primeira chamada de todo chat e o guia da plataforma. */
import { z } from "zod";
import { one } from "../../db";
import { env } from "../../env";
import { attemptsOf, cardsByDay, goalsOf, planOf, pct, reviewsOf, settingsOf } from "../data";
import { diffDays, endOfToday, today, weekdayOf, WEEKDAYS } from "../dates";
import { readTool } from "../define";
import { guideText, TOPICS } from "../guide";
import { CORE_RULES, SHARED_RULES } from "../instructions";
import { behindOf, buildSchedule, cardsPerDay, examName, PHASES, prefsOf } from "../plan";
import { computeStats, streakOf } from "../stats";
import { topicLabel } from "../catalog";

const NEW_ACCOUNT_DAYS = 14;

const ONBOARDING = [
  "Pergunte o que ela quer fazer agora e ajude nisso primeiro. Nada é obrigatório: dá para começar a fazer questões na hora, sem prova-alvo, meta nem cronograma.",
  "Em poucas linhas, quando couber, diga o que você consegue fazer aqui: achar padrões nos erros, explicar questões com a resolução e o vídeo, estudar um assunto pelo resumo, montar listas, flashcards e, se ela quiser, um cronograma. E que pode ensinar a usar qualquer parte da plataforma.",
  "Se ela usava outro app, o Anki ou uma planilha, ofereça trazer o que der: cronograma a partir de prints, baralho do Anki pelo Importar em Flashcards.",
  "Cronograma, meta e perfil são ofertas, não etapas. Se ela não quiser agora, siga em frente.",
  "Uma coisa por vez, esperando a resposta. Use conduta_guia(\"comecar\") para os caminhos e links.",
];

export const tools = [
  readTool({
    name: "conduta_inicio", title: "Início: quem está conectado e o que fazer", group: "Começo", summary: "Diz quem está conectado, se a conta é nova, o que dá para configurar e o resumo de hoje.",
    description: "Chame no começo do chat. Diz quem está conectado, o modo da conexão, se a conta é nova, o que dá para configurar se a pessoa quiser (tudo opcional), o resumo de hoje (questões, meta, cronograma, sequência, o que há para revisar) e o que fazer em seguida. Em conta nova, traz ideias de boas-vindas. Não use para estatísticas detalhadas: para isso há conduta_estatisticas.",
    input: {},
    run: async (_a, c) => {
      const u = c.user;
      const [attempts, plan, goals, settings, reviews, cards, due] = await Promise.all([
        attemptsOf(u.id), planOf(u.id), goalsOf(u.id), settingsOf(u.id), reviewsOf(u.id), cardsByDay(u.id),
        one<{ n: number; decks: number }>(`SELECT count(*) FILTER (WHERE (data->>'isNew')::float8 = 0 AND (data->>'due')::float8 <= $2 AND coalesce(data->>'suspended','0') <> '1') AS n, count(DISTINCT data->>'deck') AS decks FROM user_records WHERE user_id = $1 AND coll = 'fc_card' AND NOT deleted`, [u.id, endOfToday()]),
      ]);
      const st = computeStats(attempts), t = today();
      const isNew = !attempts.length && !plan && Date.now() - new Date(u.created_at).getTime() < NEW_ACCOUNT_DAYS * 86_400_000;
      const opcional_configurar = [
        ...(plan ? [] : ["cronograma"]),
        ...(u.formado || u.faculdade ? [] : ["faculdade"]),
        ...(u.formado || u.semestre ? [] : ["semestre"]),
      ];
      const opcional = [...(u.cidade ? [] : ["cidade"]), ...(u.bio ? [] : ["bio"]), ...(u.avatar_url ? [] : ["foto (só no app)"])];
      let cronograma = null;
      if (plan) {
        const prefs = prefsOf(plan, goals.prefs as never), days = buildSchedule(plan, st, prefs, goals.cardGoals, goals.minimo.questoes, goals.eventos, goals.regras), d = days.find((x) => x.key === t);
        const b = behindOf(plan, days, st);
        cronograma = { prova: plan.exame || examName(plan.banca, plan.data), data: plan.data, faltam_dias: diffDays(t, plan.data), fase: d ? PHASES[d.phase] : null, hoje: d ? { tipo: d.kind, temas: d.topics.map(topicLabel), questoes_planejadas: d.target, cards_planejados: d.cards ?? 0, dia_leve: !!d.light } : null, questoes_atrasadas: b.atrasadas, progresso_pct: pct(b.progresso) };
      }
      const voltando = [...reviews.values()].filter((r) => r?.due <= endOfToday()).length;
      const feitas = st.activity.get(t) || 0, certas = st.correctByDay.get(t) || 0, meta = cronograma?.hoje?.questoes_planejadas || settings.metaDiaria;
      const proximo = isNew
        ? "Conta nova: pergunte o que ela quer fazer e use o boas_vindas como ideias, não como roteiro."
        : !plan ? "Sem cronograma, o que é normal: ajude no que ela pedir. Se ela quiser organizar a rotina, ofereça montar (conduta_salvar_cronograma)."
        : feitas >= meta ? "A meta de hoje já foi. Elogie sem exagero e ofereça revisar os erros (conduta_padroes_de_erro) ou flashcards."
        : "Diga em duas linhas como está o dia e ofereça a lista de hoje (conduta_sugerir_lista).";
      return {
        resumo: isNew ? "conta nova" : "início",
        data: {
          pessoa: { nome: u.name, usuario: "@" + u.handle, faculdade: u.faculdade, semestre: u.semestre, formado: u.formado },
          modo: c.mode, conta_nova: isNew, pode_configurar_se_quiser: [...opcional_configurar, ...opcional],
          hoje: {
            data: t, dia: WEEKDAYS[weekdayOf(t)], questoes_feitas: feitas, questoes_certas: certas, meta_de_questoes: meta, cards_revisados: cards.get(t) || 0, meta_de_cards: cardsPerDay(goals.cardGoals),
            sequencia: streakOf(st, cards, goals), cronograma,
            para_revisar: { questoes_erradas: st.dueWrong.length, voltando_pela_autoavaliacao: voltando, flashcards_vencidos: due?.n ?? 0 },
          },
          totais: { questoes_respondidas: st.total, acerto_pct: pct(st.accuracy), baralhos: due?.decks ?? 0 },
          ...(isNew ? { boas_vindas: ONBOARDING } : {}),
          o_que_fazer_agora: proximo,
          regras: [...CORE_RULES, ...(c.mode === "compartilhado" ? SHARED_RULES : [])],
          app: env.publicUrl,
        },
      };
    },
  }),
  readTool({
    name: "conduta_guia", title: "Guia: onde fica cada coisa", group: "Começo", summary: "Explica onde fica cada coisa na plataforma e como usar, com links reais.",
    description: "Use quando a pessoa perguntar onde fica ou como faz algo no Conduta Med, parecer perdida, ou quando for ensinar a usar. \"geral\" é o mapa; \"comecar\" são os caminhos de quem acabou de chegar. Devolve o caminho de cada tela, os links prontos para mandar, como as coisas funcionam (Sabia/Chutei, refazer as erradas, simulado que corrige no final, perfis dos flashcards) e o que ainda não existe. Não use para dados da pessoa.",
    input: { topico: z.enum(TOPICS).default("geral").describe("Tópico: geral, comecar, questoes, assuntos, simulados, flashcards, resumos, treino, cronograma, analises, perfil, comunidade, suporte ou plugin.") },
    run: (a: { topico: (typeof TOPICS)[number] }) => { const text = guideText(a.topico); return { data: { topico: a.topico, guia: text }, text, resumo: a.topico }; },
  }),
];
