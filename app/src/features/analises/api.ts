/* Tipos e chamadas das análises com IA. Para a pessoa, o gasto é sempre porcentagem do crédito do mês. */
export type ResultOptions = { detalhe: "leve" | "padrao" | "completo"; acertos: boolean; dicas: boolean; transcricao: boolean; anterior: string | null };
export type AreaP = { area: string; nome: string; peso: number; n: number; ok: number; acerto: number | null; histN: number; histOk: number; histAcerto: number | null; estimado: number; perda: number };
export type EspP = { chave: string; nome: string; area: string; n: number; ok: number; histN: number; histOk: number; acerto: number; perda: number };
export type Numeros = {
  geral: { titulo: string; tipo: string; total: number; certas: number; erradas: number; brancos: number; anuladas: number; acerto: number; segundosPorQuestao: number; banca: string | null; ajustada: boolean };
  shares: Record<string, number>; areas: AreaP[]; especialidades: EspP[];
  ritmo?: { parte: number; de: number; ate: number; n: number; certas: number; brancos: number; segundos: number }[]; repetidas?: { n: number; vezes: number }[]; chutes?: number[];
};
export type Recomendadas = { ids: { id: string; why: string }[]; perArea: { area: string; nome: string; n: number }[] };
export type Estimate = {
  available: boolean; blocked: { code: string; message: string } | null; percent: number; percentLeft: number; runsLeft: number | null; tokensIn: number; tokensOut: number; size: number;
  suggestions: { label: string; options: Partial<ResultOptions>; percent: number }[]; numeros: Numeros; recomendadas: Recomendadas; options: ResultOptions;
};
export type Credit = { available: boolean; percentUsed: number; percentLeft: number; runs: number; renews: string };
export type PadraoErro = { titulo: string; explicacao: string; tipo: string; questoes: number[]; o_que_fazer: string };
export type Analise = { resumo: string; padroes_erro: PadraoErro[]; padroes_acerto: { titulo: string; explicacao: string; questoes: number[] }[]; comparacao: string | null; proximos_passos: string[] };
export type FlashAnalise = { resumo: string; temas: { nome: string; explicacao: string; palavras_chave: string[]; cards: number[] }[]; soltos: number[] };
export type PickedCard = { id: string; deck: string; frente: string; tema: string; motivo: string; novo: boolean };
export type Run = {
  id: string; kind: "resultado" | "flashcards"; trigger: "manual" | "auto"; status: "rodando" | "feito" | "erro"; error: string | null; createdAt: number; finishedAt: number | null; options: Record<string, unknown>;
  source: { sessionId?: string; title?: string; kind?: string; exam?: string | null; banca?: string | null; day?: string; revisados?: number; erros?: number };
  result: null | { analise?: Analise & FlashAnalise; numeros?: Numeros; recomendadas?: Recomendadas; cards?: PickedCard[]; applied?: boolean; counts?: { revisados: number; erros: number; dificeis: number } };
};
export type FlashSettings = { modo: "desligado" | "manual" | "meta"; limite: number; filtro: "erros" | "dificeis" | "todos"; puxar: number; estimativa: Record<string, number> };

/** poucas casas: 0,12% e 3% */
export const pctText = (x: number) => (x < 0.01 ? "menos de 0,01%" : x < 1 ? `${x.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : `${Math.round(x)}%`);
export const FLASH_FILTER: Record<FlashSettings["filtro"], string> = { erros: "Só os que errei", dificeis: "Errados e difíceis", todos: "Todos os do dia" };
export const PATTERN: Record<string, string> = { conceito: "Conceito", interpretacao: "Leitura do enunciado", conduta: "Conduta", distrator: "Distrator", tempo: "Tempo", chute: "Chute", outro: "Outro" };
