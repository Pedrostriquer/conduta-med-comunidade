/* Busca de questões pelo texto: roda no servidor (POST /api/questions/search), porque o navegador só tem o índice do banco,
   sem enunciado nem alternativas. O pedido espera a pessoa parar de digitar e cancela o anterior.
   A relevância e o recorte do trecho ficam em server/src/lib/question-search.ts; aqui só se marca o termo no trecho. */
import { useEffect, useState } from "react";
import { api } from "../../api/client";

export type QuestionHit = { id: string; where: "stem" | string; text: string };
export type QuestionQuery = {
  q: string; bancas?: string[]; anos?: number[]; areas?: string[];
  /** incluir as questões fora do padrão (preferência "Incluir questões sem vídeo e polêmicas") */
  todas: boolean;
  /** ids a deixar de fora ("só as que não fiz") */
  excluir?: string[];
  offset?: number; limit?: number;
  /** tamanho do trecho de cada questão */
  trecho?: number;
};
export type QuestionPage = { total: number; offset: number; hits: QuestionHit[]; ids: string[] };

export const searchQuestions = (query: QuestionQuery, signal?: AbortSignal) => api<QuestionPage>("/questions/search", { method: "POST", body: query, signal });

const EMPTY: QuestionPage = { total: 0, offset: 0, hits: [], ids: [] };

export type QuestionSearch = QuestionPage & {
  /** a resposta mostrada já é a deste pedido (enquanto não for, ficam os resultados anteriores) */
  settled: boolean;
  /** a busca falhou (sem rede, limite): os resultados anteriores somem */
  error: boolean;
};

/** `query` nulo = sem busca. `key` muda quando o pedido muda (o que foi digitado, filtros, página). */
export function useQuestionSearch(query: QuestionQuery | null, key: string, delay = 180): QuestionSearch {
  const [state, setState] = useState<{ key: string; page: QuestionPage; error: boolean }>({ key: "", page: EMPTY, error: false });
  const want = query ? key : "";
  useEffect(() => {
    if (!query) { setState({ key: "", page: EMPTY, error: false }); return; }
    const ac = new AbortController();
    const t = setTimeout(() => {
      searchQuestions(query, ac.signal).then(
        (page) => setState({ key, page, error: false }),
        (e) => { if ((e as Error).name !== "AbortError") setState({ key, page: EMPTY, error: true }); },
      );
    }, delay);
    return () => { clearTimeout(t); ac.abort(); };
  }, [want, delay]); // eslint-disable-line
  if (!query) return { ...EMPTY, settled: true, error: false };
  return { ...state.page, settled: state.key === key, error: state.error && state.key === key };
}
