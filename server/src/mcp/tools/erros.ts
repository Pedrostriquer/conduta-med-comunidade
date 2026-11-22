/* O que a pessoa errou: as questões em si, para a IA ler de verdade, e a agregação que aponta onde olhar.
   Quem classifica o tipo de falha é a IA, lendo o enunciado; aqui vão só os fatos e uma estimativa pelo texto da pergunta. */
import { z } from "zod";
import { AREAS } from "../../bank";
import type { AreaId, Question } from "../../bank";
import { cat, examOf, imagesOf, norm, temaOf, topicKey, topicLabel, videoLink } from "../catalog";
import { attemptsOf, CONFIDENCE_LABEL, dateOf, needDate, PERIODS, pct, reviewsOf, secs, sinceOf, tagsOf } from "../data";
import { readTool } from "../define";
import type { Attempt } from "../stats";

const AREA_IDS = Object.keys(AREAS) as [AreaId, ...AreaId[]];
const QUICK_MS = 45_000, SLOW_MS = 4 * 60_000;

/** de que tipo é a pergunta, olhando o fim do enunciado. É uma estimativa, para orientar a leitura. */
export function questionKind(q: Question) {
  const tail = norm(q.e).slice(-240);
  if (/tratamento|terapeutic|droga|medicamento|antibiotic|farmaco|prescri/.test(tail)) return "tratamento";
  if (/conduta|proximo passo|manejo|deve[- ]se|melhor abordagem|recomendad|indicad/.test(tail)) return "conduta";
  if (/diagnostico|hipotese|etiologia|agente|se trata de|compativel com|sugere/.test(tail)) return "diagnóstico";
  if (/mecanismo|fisiopatolog|por que|explica/.test(tail)) return "mecanismo";
  if (/exame|investigacao|complementar|confirma/.test(tail)) return "exame";
  return "outro";
}
const classif = (q: Question) => ({ area: AREAS[q.area] ?? q.area, especialidade: q.esp, tema: q.tema });

export const tools = [
  readTool({
    name: "conduta_erros", title: "Questões que a pessoa errou", group: "Erros", summary: "As questões erradas com enunciado, alternativas, o que a pessoa marcou, gabarito, explicação, tempo e autoavaliação.",
    description: "Use para ler de verdade o que a pessoa errou: devolve enunciado, alternativas, a marcada, o gabarito, a explicação, o tempo gasto e como ela se avaliou (Sabia, Chutei, Foi distração, Não sabia). Serve para achar padrões, explicar e criar flashcards. Vem paginado; prefira poucas por vez (limite 10 a 30). Para um panorama sem o texto das questões, use conduta_padroes_de_erro antes. Por padrão traz só as que ela ainda não acertou depois de errar.",
    input: {
      limite: z.number().int().min(1).max(30).default(10).describe("Quantas questões nesta página (até 30)."),
      offset: z.number().int().min(0).default(0).describe("Quantas pular, para a próxima página."),
      area: z.enum(AREA_IDS).optional().describe("Só uma grande área: clinica, cirurgia, go, pediatria ou preventiva."),
      desde: z.string().optional().describe("Só erros a partir desta data, AAAA-MM-DD."),
      ainda_nao_refeitas: z.boolean().default(true).describe("true: só questões cuja última resposta ainda é errada. false: toda questão que ela já errou alguma vez, mesmo que tenha acertado depois."),
    },
    run: async (a: { limite: number; offset: number; area?: AreaId; desde?: string; ainda_nao_refeitas: boolean }, c) => {
      needDate(a.desde, "desde");
      const b = cat(), [attempts, reviews, tags] = await Promise.all([attemptsOf(c.user.id), reviewsOf(c.user.id), tagsOf(c.user.id)]);
      const since = a.desde ? Date.parse(a.desde + "T03:00:00Z") : 0;
      const by = new Map<string, Attempt[]>();
      for (const x of attempts) { const l = by.get(x.qid) || []; l.push(x); by.set(x.qid, l); }
      const rows: { q: Question; hist: Attempt[]; lastWrong: Attempt }[] = [];
      for (const [qid, hist] of by) {
        const q = b.byId.get(qid);
        if (!q || (a.area && q.area !== a.area)) continue;
        hist.sort((x, y) => x.at - y.at);
        const wrongs = hist.filter((x) => !x.correct);
        if (!wrongs.length) continue;
        const last = hist[hist.length - 1], lastWrong = wrongs[wrongs.length - 1];
        if (a.ainda_nao_refeitas && last.correct) continue;
        if (lastWrong.at < since) continue;
        rows.push({ q, hist, lastWrong });
      }
      rows.sort((x, y) => y.lastWrong.at - x.lastWrong.at);
      const page = rows.slice(a.offset, a.offset + a.limite);
      return {
        resumo: `${page.length} de ${rows.length} erros`,
        data: {
          total: rows.length, offset: a.offset, proxima: a.offset + a.limite < rows.length ? a.offset + a.limite : null,
          itens: page.map(({ q, hist, lastWrong }) => {
            const r = reviews.get(q.id);
            return {
              id: q.id, prova: examOf(q)?.nome ?? q.p, numero: q.n, ...classif(q), tipo_de_pergunta_estimado: questionKind(q),
              enunciado: q.e, ...(q.t?.length ? { tabelas: q.t } : {}), ...(q.i?.length ? { imagens: imagesOf(q) } : {}),
              alternativas: q.a, marcada: lastWrong.choice, marcada_texto: lastWrong.choice ? q.a[lastWrong.choice] : "em branco", gabarito: q.g, explicacao: q.x ?? null, video: videoLink(q),
              errou_em: dateOf(lastWrong.at), tempo_s: secs(lastWrong.ms), vezes_errada: hist.filter((x) => !x.correct).length, vezes_certa: hist.filter((x) => x.correct).length, onde: lastWrong.kind,
              autoavaliacao: r ? CONFIDENCE_LABEL[r.kind] : null, etiquetas: tags.get(q.id) || [],
            };
          }),
        },
      };
    },
  }),
  readTool({
    name: "conduta_padroes_de_erro", title: "Padrões nos erros", group: "Erros", summary: "Agrega os erros por área, tema, banca, reincidência, autoavaliação, tempo e tipo de pergunta, para achar padrões.",
    description: "Use primeiro quando a pessoa perguntar por que erra ou pedir um diagnóstico. Agrega os erros por área e tema, banca, reincidência, autoavaliação, tempo e tipo de pergunta. Não traz enunciados: depois leia as questões com conduta_erros e classifique cada erro pelo tipo de falha (diagnóstico, mecanismo, tratamento, conduta, leitura ou distração). A resposta traz sinais; a conclusão é sua, com exemplos das questões.",
    input: {
      periodo: z.enum(PERIODS).default("90d").describe("Janela de tempo: 7d, 30d, 90d ou tudo."),
      area: z.enum(AREA_IDS).optional().describe("Só uma grande área: clinica, cirurgia, go, pediatria ou preventiva."),
    },
    run: async (a: { periodo: (typeof PERIODS)[number]; area?: AreaId }, c) => {
      const b = cat(), since = sinceOf(a.periodo), [all, reviews, tags] = await Promise.all([attemptsOf(c.user.id), reviewsOf(c.user.id), tagsOf(c.user.id)]);
      const xs = all.filter((x) => x.at >= since && b.byId.has(x.qid) && (!a.area || b.byId.get(x.qid)!.area === a.area));
      type G = { n: number; erros: number; ids: string[] };
      const add = (m: Map<string, G>, k: string, x: Attempt) => { const g = m.get(k) || { n: 0, erros: 0, ids: [] }; g.n++; if (!x.correct) { g.erros++; if (g.ids.length < 5 && !g.ids.includes(x.qid)) g.ids.push(x.qid); } m.set(k, g); };
      const areas = new Map<string, G>(), temas = new Map<string, G>(), bancas = new Map<string, G>(), kinds = new Map<string, G>();
      const letters: Record<string, number> = {}, sameWrong = new Map<string, Map<string, number>>(), wrongTimes = new Map<string, number>();
      const conf: Record<string, number> = { sabia: 0, chutei: 0, distracao: 0, naosabia: 0 };
      let okMs = 0, okN = 0, badMs = 0, badN = 0, quick = 0, slow = 0, blank = 0, erros = 0;
      const seenConf = new Set<string>();
      for (const x of xs) {
        const q = b.byId.get(x.qid)!, good = x.ms > 3000 && x.ms < 15 * 60000;
        add(areas, q.area, x); add(temas, topicKey(q) + "/" + temaOf(q), x); add(bancas, examOf(q)?.banca ?? "?", x); add(kinds, questionKind(q), x);
        if (x.correct) { if (good) { okMs += x.ms; okN++; } continue; }
        erros++;
        wrongTimes.set(x.qid, (wrongTimes.get(x.qid) || 0) + 1);
        if (good) { badMs += x.ms; badN++; if (x.ms < QUICK_MS) quick++; if (x.ms > SLOW_MS) slow++; }
        if (x.choice === null) { blank++; continue; }
        letters[x.choice] = (letters[x.choice] || 0) + 1;
        const m = sameWrong.get(x.qid) || new Map<string, number>(); m.set(x.choice, (m.get(x.choice) || 0) + 1); sameWrong.set(x.qid, m);
        const r = reviews.get(x.qid);
        if (r && !seenConf.has(x.qid)) { seenConf.add(x.qid); conf[r.kind]++; }
      }
      const luck = [...new Set(xs.filter((x) => x.correct).map((x) => x.qid))].filter((id) => reviews.get(id)?.kind === "chutei").length;
      const rank = (m: Map<string, G>, label: (k: string) => Record<string, unknown>, top = 15) => [...m.entries()].filter(([, g]) => g.erros).sort(([, x], [, y]) => y.erros - x.erros).slice(0, top).map(([k, g]) => ({ ...label(k), erros: g.erros, respondidas: g.n, acerto_pct: pct(1 - g.erros / g.n), exemplos: g.ids }));
      const reincidentes = [...wrongTimes.entries()].filter(([, n]) => n >= 2).sort(([, x], [, y]) => y - x).slice(0, 15).map(([id, n]) => {
        const q = b.byId.get(id)!, rep = [...(sameWrong.get(id)?.entries() || [])].sort(([, x], [, y]) => y - x)[0];
        return { id, vezes_errada: n, tema: temaOf(q), mesma_alternativa_errada: rep && rep[1] >= 2 ? rep[0] : null };
      });
      const tagCount: Record<string, number> = {};
      for (const ts of tags.values()) for (const t of ts) if (t.startsWith("erro:")) tagCount[t] = (tagCount[t] || 0) + 1;
      return {
        resumo: `${erros} erros em ${a.periodo}`,
        data: {
          periodo: a.periodo, respondidas: xs.length, erros, em_branco: blank,
          por_area: rank(areas, (k) => ({ area: AREAS[k as AreaId] ?? k })),
          por_tema: rank(temas, (k) => ({ tema: k.split("/")[2], especialidade: topicLabel(k.split("/").slice(0, 2).join("/")) })),
          por_banca: rank(bancas, (k) => ({ banca: k })),
          por_tipo_de_pergunta: { nota: "Estimativa pelas palavras do fim do enunciado. Confirme lendo a questão.", grupos: rank(kinds, (k) => ({ tipo: k })) },
          reincidentes,
          autoavaliacao_das_erradas: { nao_sabia: conf.naosabia, foi_distracao: conf.distracao, nota: "Distração frequente aponta para leitura, não para falta de conteúdo." },
          acertos_marcados_como_chute: luck,
          tempo: { medio_nas_certas_s: okN ? secs(okMs / okN) : null, medio_nas_erradas_s: badN ? secs(badMs / badN) : null, erros_em_menos_de_45s: quick, erros_em_mais_de_4min: slow, nota: "Erro rápido sugere leitura apressada; erro demorado, dúvida real de conteúdo." },
          alternativas_mais_marcadas_nos_erros: Object.entries(letters).sort(([, x], [, y]) => y - x).map(([letra, vezes]) => ({ letra, vezes })),
          etiquetas_de_erro_ja_salvas: tagCount,
          como_seguir: "Leia as questões dos grupos que pesam com conduta_erros ou conduta_ler_questao (ids em exemplos e reincidentes). Classifique cada erro: diagnóstico (não reconheceu o quadro), mecanismo (não entendeu por que acontece), tratamento, conduta (sabia a doença, errou o próximo passo) ou leitura/distração. Mostre o padrão com exemplos e, com a licença da pessoa, grave com conduta_etiquetar_questoes (erro:diagnostico, erro:mecanismo, erro:tratamento, erro:conduta, erro:leitura).",
        },
      };
    },
  }),
];
