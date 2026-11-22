/* Números das questões: a mesma conta que a tela de Desempenho e a de Hoje. */
import { z } from "zod";
import { AREAS } from "../../bank";
import type { AreaId } from "../../bank";
import { cat, topicLabel } from "../catalog";
import { attemptsOf, cardsByDay, goalsOf, PERIODS, pct, secs, sinceOf } from "../data";
import { addDays, dayKey, today, weekdayOf } from "../dates";
import { readTool } from "../define";
import { computeStats, streakOf, weakFrequent } from "../stats";

const good = (ms: number) => ms > 3000 && ms < 15 * 60000;
const monday = (k: string) => addDays(k, -((weekdayOf(k) + 6) % 7));

export const tools = [
  readTool({
    name: "conduta_estatisticas", title: "Estatísticas de questões", group: "Estatísticas", summary: "Totais, acerto por área, especialidade e tema, ritmo, sequência e temas fracos que mais caem.",
    description: "Use quando a pessoa perguntar como está, quanto fez, qual o acerto, onde está fraca ou quiser um panorama. Traz totais, acerto por área, especialidade e tema, ritmo, sequência de dias, semanas e os temas fracos que mais caem nas provas. Não traz o conteúdo das questões: para ler os erros use conduta_erros; para padrões, conduta_padroes_de_erro. Flashcards ficam em conduta_estatisticas_flashcards.",
    input: {
      periodo: z.enum(PERIODS).default("30d").describe("Janela de tempo: 7d, 30d, 90d ou tudo."),
      limite: z.number().int().min(3).max(50).default(12).describe("Quantos itens em cada ranking (especialidades e temas)."),
    },
    run: async (a: { periodo: (typeof PERIODS)[number]; limite: number }, c) => {
      const c0 = cat(), all = await attemptsOf(c.user.id), since = sinceOf(a.periodo), xs = all.filter((x) => x.at >= since);
      const [goals, cards] = await Promise.all([goalsOf(c.user.id), cardsByDay(c.user.id)]);
      const st = computeStats(xs), whole = computeStats(all);
      const time = new Map<string, { ms: number; n: number }>();
      let ms = 0, msN = 0;
      for (const x of xs) {
        if (x.choice === null || !good(x.ms)) continue;
        ms += x.ms; msN++;
        const q = c0.byId.get(x.qid);
        if (q) { const v = time.get(q.area) || { ms: 0, n: 0 }; v.ms += x.ms; v.n++; time.set(q.area, v); }
      }
      const row = (n: number, ok: number) => ({ respondidas: n, acerto_pct: pct(ok / (n || 1)) });
      const por_area = [...st.byArea.entries()].map(([k, v]) => ({ area: k, nome: AREAS[k as AreaId] ?? k, ...row(v.n, v.ok), tempo_medio_s: time.get(k) ? secs(time.get(k)!.ms / time.get(k)!.n) : null })).sort((x, y) => y.respondidas - x.respondidas);
      const por_especialidade = [...st.byTopic.entries()].map(([k, v]) => ({ especialidade: topicLabel(k), ...row(v.n, v.ok) })).sort((x, y) => y.respondidas - x.respondidas).slice(0, a.limite);
      const temas_mais_fracos = [...st.byTema.entries()].filter(([, v]) => v.n >= 3).map(([k, v]) => ({ tema: k.split("/")[2], especialidade: topicLabel(k.split("/").slice(0, 2).join("/")), ...row(v.n, v.ok), acc: v.ok / v.n })).sort((x, y) => x.acc - y.acc).slice(0, a.limite).map(({ acc: _acc, ...r }) => r);
      const fracos_que_mais_caem = weakFrequent(st, a.limite).map((w) => ({ especialidade: topicLabel(w.key), acerto_pct: pct(w.acc), respondidas: w.n, questoes_no_banco: c0.topicByKey.get(w.key)?.ids.length ?? 0 }));
      const weeks = new Map<string, { n: number; ok: number; dias: Set<string> }>();
      for (const x of xs) {
        if (x.choice === null) continue;
        const d = dayKey(x.at), w = monday(d), v = weeks.get(w) || { n: 0, ok: 0, dias: new Set() };
        v.n++; if (x.correct) v.ok++; v.dias.add(d); weeks.set(w, v);
      }
      const dias = st.activity.size;
      return {
        resumo: `período ${a.periodo}`,
        data: {
          periodo: a.periodo, de: since ? dayKey(since) : (xs.length ? dayKey(xs.reduce((m, x) => Math.min(m, x.at), Infinity)) : today()), ate: today(),
          total: st.total, certas: st.correct, acerto_pct: pct(st.accuracy), tempo_medio_por_questao_s: msN ? secs(ms / msN) : null, dias_estudados: dias, media_por_dia_estudado: dias ? Math.round(st.total / dias) : 0,
          sequencia: streakOf(whole, cards, goals), maior_sequencia_de_dias_com_questoes: whole.longest,
          para_revisar: { erradas_sem_refazer: whole.wrong.length, erradas_ha_mais_de_um_dia: whole.dueWrong.length },
          por_area, por_especialidade, temas_mais_fracos, fracos_que_mais_caem,
          semanas: [...weeks.entries()].sort(([x], [y]) => (x < y ? 1 : -1)).slice(0, 8).map(([inicio, v]) => ({ inicio, ...row(v.n, v.ok), dias: v.dias.size })),
          por_prova_feita: progressByExam(whole).slice(0, 10),
          nota: st.total < 30 ? "Poucas respostas neste período: trate os números como indício, não como diagnóstico." : undefined,
        },
      };
    },
  }),
];

function progressByExam(st: ReturnType<typeof computeStats>) {
  const c = cat(), m = new Map<string, { n: number; ok: number }>();
  for (const [qid, a] of st.last) {
    const q = c.byId.get(qid);
    if (!q || a.choice === null) continue;
    const v = m.get(q.p) || { n: 0, ok: 0 }; v.n++; if (a.correct) v.ok++; m.set(q.p, v);
  }
  return [...m.entries()].map(([p, v]) => ({ prova: c.examById.get(p)?.nome ?? p, feitas: v.n, acerto_pct: pct(v.ok / v.n) })).sort((x, y) => y.feitas - x.feitas);
}
