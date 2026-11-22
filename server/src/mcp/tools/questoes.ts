/* Ler o banco: uma questão inteira, o trecho do vídeo, a busca com filtros e o catálogo. */
import { z } from "zod";
import { AREAS } from "../../bank";
import type { AreaId, Question } from "../../bank";
import { q as sql } from "../../db";
import { cat, examOf, imagesOf, norm, poolOf, questionLink, temaOf, terms, videoLink } from "../catalog";
import { attemptsOf, CONFIDENCE_LABEL, dateOf, reviewsOf, savedOf, secs, tagsOf } from "../data";
import { getRecord } from "../../records";
import { readTool, ToolError } from "../define";
import { computeStats } from "../stats";
import { loadTranscript, slice } from "../transcripts";
import { linkAssunto, resolucao, resolucaoLimpa } from "../assuntos";

const AREA_IDS = Object.keys(AREAS) as [AreaId, ...AreaId[]];
const TRANSCRIPT_MAX = 14_000, DEFAULT_SPAN_S = 300;

/** fim da explicação no vídeo: o marcado, ou o começo da próxima questão do mesmo vídeo, ou cinco minutos */
function videoEnd(q: Question) {
  if (q.v?.f) return q.v.f;
  const next = cat().all.filter((x) => x.v?.id === q.v?.id && x.v!.s > q.v!.s).reduce((m, x) => Math.min(m, x.v!.s), Infinity);
  return Math.min(next, q.v!.s + DEFAULT_SPAN_S);
}
const preview = (t: string, n = 150) => { const s = t.replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s; };

/** a resolução completa (o que decide, o raciocínio e por que cada alternativa) e o assunto, quando a questão tem */
function resolucaoDe(q: Question) {
  const r = resolucao(q.as, q.id);
  if (!q.as) return {};
  return { assunto: { slug: q.as, link: linkAssunto(q.as, r?.bloco) }, ...(r ? { resolucao: resolucaoLimpa(r) } : {}) };
}

export const tools = [
  readTool({
    name: "conduta_ler_questao", title: "Ler questões", group: "Questões", summary: "Enunciado, alternativas, gabarito, explicação, classificação, prova, link do vídeo no segundo exato, histórico da pessoa e marcações da comunidade.",
    description: "Use para ler questões inteiras a partir do id: enunciado, alternativas, gabarito, explicação, resolução completa (o que decide a questão, o raciocínio e por que cada alternativa está certa ou errada) e o assunto com o link do resumo, quando houver, classificação, prova, link do vídeo no segundo exato, link no app, o histórico da pessoa e os números de comentários e marcações da comunidade. Atenção: traz o gabarito. Se estiver treinando com a pessoa na conversa, não mostre gabarito, tema nem explicação antes de ela responder. Para encontrar ids, use conduta_buscar_questoes ou conduta_erros.",
    input: { ids: z.array(z.string()).min(1).max(10).describe("Ids das questões, como PROVA-2026-Q001. Até 10 por chamada.") },
    run: async (a: { ids: string[] }, c) => {
      const b = cat(), [attempts, reviews, tags, saved] = await Promise.all([attemptsOf(c.user.id), reviewsOf(c.user.id), tagsOf(c.user.id), savedOf(c.user.id)]);
      const found = a.ids.map((id) => b.byId.get(id)).filter(Boolean) as Question[], ids = found.map((q) => q.id);
      const [comments, flags, notes] = await Promise.all([
        sql<{ qid: string; n: number }>("SELECT qid, count(*) AS n FROM comments WHERE qid = ANY($1) AND deleted_at IS NULL AND hidden_at IS NULL GROUP BY qid", [ids]),
        sql<{ qid: string; reason: string; n: number }>("SELECT qid, reason, count(*) AS n FROM question_flags WHERE qid = ANY($1) AND status <> 'descartado' GROUP BY qid, reason", [ids]),
        Promise.all(ids.map((id) => getRecord<{ text: string }>(c.user.id, "qnote", id))),
      ]);
      return {
        resumo: `${found.length} questão(ões)`,
        data: {
          nao_encontradas: a.ids.filter((id) => !b.byId.has(id)),
          questoes: found.map((q, i) => {
            const hist = attempts.filter((x) => x.qid === q.id).sort((x, y) => x.at - y.at), r = reviews.get(q.id), ex = examOf(q);
            return {
              id: q.id, prova: ex?.nome ?? q.p, banca: ex?.banca, ano: ex?.ano, numero: q.n, area: AREAS[q.area] ?? q.area, especialidade: q.esp, tema: q.tema,
              enunciado: q.e, ...(q.t?.length ? { tabelas: q.t } : {}), ...(q.i?.length ? { imagens: imagesOf(q) } : {}), alternativas: q.a, gabarito: q.an ? "anulada pela banca" : q.g, explicacao: q.x ?? null,
              ...resolucaoDe(q),
              video: videoLink(q), canal_do_video: q.v?.c ?? null, link_no_app: questionLink(q), validada: !!q.ok,
              historico: { respostas: hist.map((x) => ({ data: dateOf(x.at), marcou: x.choice, acertou: x.correct, tempo_s: secs(x.ms), onde: x.kind })), autoavaliacao: r ? CONFIDENCE_LABEL[r.kind] : null, volta_em: r ? dateOf(r.due) : null, salva: saved.has(q.id), etiquetas: tags.get(q.id) || [], anotacao: notes[i]?.text ?? null },
              comunidade: { comentarios: comments.find((x) => x.qid === q.id)?.n ?? 0, marcacoes: Object.fromEntries(flags.filter((x) => x.qid === q.id).map((x) => [x.reason, x.n])) },
            };
          }),
        },
      };
    },
  }),
  readTool({
    name: "conduta_transcricao_explicacao", title: "Transcrição da explicação em vídeo", group: "Questões", summary: "O que o professor fala no vídeo da correção naquele minuto da questão.",
    description: "Use para explicar uma questão com base no vídeo: devolve o que o professor fala no trecho da correção daquela questão, com a marca de tempo e o link do vídeo no segundo exato. A transcrição é automática e pode ter erros de palavras, sobretudo em termos médicos: corrija pelo sentido. Não use para ler o enunciado (conduta_ler_questao).",
    input: {
      id: z.string().describe("Id da questão, como PROVA-2026-Q001."),
      margem_segundos: z.number().int().min(0).max(120).default(15).describe("Segundos a mais antes e depois do trecho, para não cortar a fala."),
    },
    run: async (a: { id: string; margem_segundos: number }) => {
      const q = cat().byId.get(a.id);
      if (!q) throw new ToolError(`Não encontramos a questão ${a.id}. Use conduta_buscar_questoes para achar o id.`);
      if (!q.v) return { resumo: a.id, data: { id: q.id, tem_video: false, explicacao: q.x ?? null, nota: "Esta questão não tem correção em vídeo." } };
      const end = videoEnd(q), de = Math.max(0, q.v.s - a.margem_segundos), ate = end + a.margem_segundos, lines = await loadTranscript(q.v.id);
      if (!lines) return { resumo: a.id, data: { id: q.id, video: videoLink(q), tem_transcricao: false, explicacao: q.x ?? null, nota: "A transcrição deste vídeo não está disponível. Use a explicação escrita e mande o link do vídeo." } };
      const trecho = slice(lines, de, ate);
      return { resumo: a.id, data: { id: q.id, video: videoLink(q), canal: q.v.c ?? null, inicio_s: Math.round(q.v.s), fim_s: Math.round(end), transcricao: trecho.length > TRANSCRIPT_MAX ? trecho.slice(0, TRANSCRIPT_MAX) + " […]" : trecho || null, nota: trecho ? "Transcrição automática: pode ter erros de palavras." : "Não há fala transcrita neste trecho." } };
    },
  }),
  readTool({
    name: "conduta_buscar_questoes", title: "Buscar questões", group: "Questões", summary: "Procura no banco por texto, área, especialidade, tema, banca, ano, prova e situação da pessoa.",
    description: "Use para encontrar questões para uma lista ou para achar o id de uma questão: por palavras do enunciado ou das alternativas, área, especialidade, tema, banca, ano, prova e situação (novas, erradas, acertadas, salvas). Devolve só um trecho do começo e nunca o gabarito. Para ler inteira, conduta_ler_questao. Para a lista do dia pronta, conduta_sugerir_lista. Para saber os nomes de especialidades e temas, conduta_catalogo.",
    input: {
      texto: z.string().max(200).optional().describe("Palavras que precisam aparecer no enunciado ou nas alternativas. Sem acento também acha."),
      area: z.enum(AREA_IDS).optional().describe("Grande área: clinica, cirurgia, go, pediatria ou preventiva."),
      especialidade: z.string().optional().describe("Especialidade, como Cardiologia. Vale parte do nome."),
      tema: z.string().optional().describe("Tema, como Insuficiência cardíaca. Vale parte do nome."),
      banca: z.string().optional().describe("Banca, como ENARE ou USP-SP."),
      ano: z.number().int().optional().describe("Ano da prova."),
      prova: z.string().optional().describe("Id da prova, como ENARE-2025."),
      status: z.enum(["todas", "novas", "erradas", "acertadas", "salvas"]).default("todas").describe("Situação da pessoa: novas (nunca respondeu), erradas (última resposta errada), acertadas, salvas ou todas."),
      somente_validas: z.boolean().default(true).describe("true: só as que entram por padrão no app (com vídeo, sem divergência). false: inclui todas."),
      limite: z.number().int().min(1).max(100).default(20).describe("Quantas nesta página (até 100)."),
      offset: z.number().int().min(0).default(0).describe("Quantas pular, para a próxima página."),
    },
    run: async (a: { texto?: string; area?: AreaId; especialidade?: string; tema?: string; banca?: string; ano?: number; prova?: string; status: string; somente_validas: boolean; limite: number; offset: number }, c) => {
      const b = cat(), [st, saved] = await Promise.all([attemptsOf(c.user.id).then(computeStats), savedOf(c.user.id)]);
      const wrong = new Set(st.wrong), esp = a.especialidade && norm(a.especialidade), tema = a.tema && norm(a.tema), banca = a.banca && norm(a.banca), prova = a.prova && norm(a.prova), ts = a.texto ? terms(a.texto) : [];
      const statusOf = (id: string) => (!st.answered.has(id) ? "nova" : wrong.has(id) ? "errada" : "acertada");
      const hits = poolOf(!a.somente_validas).filter((q) => {
        if (a.area && q.area !== a.area) return false;
        if (esp && !norm(q.esp || "Outros").includes(esp)) return false;
        if (tema && !norm(temaOf(q)).includes(tema)) return false;
        const ex = examOf(q);
        if (banca && norm(ex?.banca ?? "") !== banca) return false;
        if (a.ano && ex?.ano !== a.ano) return false;
        if (prova && norm(q.p) !== prova && norm(ex?.nome ?? "") !== prova) return false;
        if (a.status === "novas" && statusOf(q.id) !== "nova") return false;
        if (a.status === "erradas" && statusOf(q.id) !== "errada") return false;
        if (a.status === "acertadas" && statusOf(q.id) !== "acertada") return false;
        if (a.status === "salvas" && !saved.has(q.id)) return false;
        if (ts.length) { const d = b.docs.get(q.id)!; if (!ts.every((t) => d.includes(t))) return false; }
        return true;
      });
      const page = hits.slice(a.offset, a.offset + a.limite);
      return {
        resumo: `${hits.length} encontradas`,
        data: {
          total: hits.length, offset: a.offset, proxima: a.offset + a.limite < hits.length ? a.offset + a.limite : null,
          itens: page.map((q) => { const ex = examOf(q); return { id: q.id, prova: ex?.nome ?? q.p, banca: ex?.banca, ano: ex?.ano, numero: q.n, area: q.area, especialidade: q.esp, tema: q.tema, situacao: statusOf(q.id), salva: saved.has(q.id) || undefined, com_imagem: q.i?.length ? true : undefined, inicio: preview(q.e), link: questionLink(q) }; }),
        },
      };
    },
  }),
  readTool({
    name: "conduta_catalogo", title: "Catálogo do banco", group: "Questões", summary: "Áreas, especialidades e temas com contagem, provas e bancas disponíveis.",
    description: "Use para saber o que existe no banco: áreas, especialidades e temas com a contagem, e as provas e bancas disponíveis. Serve para escolher filtros certos, responder se uma prova está aqui e montar cronograma. Sem área, lista só as especialidades; com área, traz também os temas. As bancas vêm resumidas (anos e total); com banca, vêm as provas daquela banca uma a uma. Os números são das questões que entram por padrão no app.",
    input: {
      area: z.enum(AREA_IDS).optional().describe("Mostra os temas desta grande área: clinica, cirurgia, go, pediatria ou preventiva. Sem ela, vem o panorama sem os temas."),
      banca: z.string().max(60).optional().describe("Mostra as provas desta banca, uma a uma, com id e número de questões. Sem ela, cada banca vem resumida em anos e total."),
    },
    run: (a: { area?: AreaId; banca?: string }) => {
      const b = cat(), ok = new Set(poolOf(false).map((q) => q.id)), count = (ids: string[]) => ids.filter((id) => ok.has(id)).length;
      const areas = (Object.keys(AREAS) as AreaId[]).filter((id) => !a.area || id === a.area).map((id) => {
        const ts = b.topics.filter((t) => t.area === id);
        return {
          id, nome: AREAS[id], questoes: ts.reduce((s, t) => s + count(t.ids), 0),
          especialidades: ts.map((t) => ({ nome: t.esp, questoes: count(t.ids), ...(a.area ? { temas: t.temas.map((x) => ({ nome: x.tema, questoes: count(x.ids) })).filter((x) => x.questoes) } : {}) })).filter((t) => t.questoes),
        };
      });
      const bancas = new Map<string, { id: string; ano: number; nome: string; questoes: number }[]>();
      for (const e of b.exams) { const l = bancas.get(e.banca) || []; l.push({ id: e.id, ano: e.ano, nome: e.nome, questoes: count((b.byExam.get(e.id) || []).map((q) => q.id)) }); bancas.set(e.banca, l); }
      if (a.banca) {
        const want = norm(a.banca), hit = [...bancas.entries()].filter(([banca]) => norm(banca) === want || norm(banca).includes(want));
        if (!hit.length) throw new ToolError(`Não há a banca "${a.banca}" no banco. Chame conduta_catalogo sem argumentos para ver as bancas.`);
        return { resumo: a.banca, data: { bancas: hit.map(([banca, provas]) => ({ banca, provas: provas.sort((x, y) => y.ano - x.ano) })) } };
      }
      // são centenas de provas: no panorama, cada banca vem resumida; o detalhe sai com banca
      const resumoBancas = [...bancas.entries()].map(([banca, provas]) => ({ banca, provas: provas.length, questoes: provas.reduce((s, p) => s + p.questoes, 0), anos: [...new Set(provas.map((p) => p.ano))].sort((x, y) => y - x) })).sort((x, y) => y.questoes - x.questoes);
      return { resumo: a.area ?? "panorama", data: { total: b.all.length, entram_por_padrao: ok.size, areas, ...(a.area ? {} : { bancas: resumoBancas, nota: "Para ver as provas de uma banca, uma a uma, chame de novo com banca." }) } };
    },
  }),
];
