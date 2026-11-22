/* O banco de questões em memória: mesmos arquivos que o app carrega. São poucos milhares de itens, então
   filtrar aqui é mais simples e mais rápido do que manter uma cópia no Postgres. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "./env";

export type AreaId = "clinica" | "cirurgia" | "go" | "pediatria" | "preventiva";
export type Question = {
  id: string; p: string; n: number; area: AreaId; esp: string | null; tema: string | null; e: string; a: Record<string, string>; g: string;
  t?: string[][][]; i?: string[]; k?: string; x?: string; v?: { id: string; s: number; f: number | null; c?: string }; ok?: 1; an?: 1;
  /** assunto (slug) com resumo e resolução, quando houver */
  as?: string;
};
export type Exam = { id: string; banca: string; ano: number; nome: string; aplicacao: string; alternativas: number; duracao_min: number; total: number; elegiveis: number };

export const AREAS: Record<AreaId, string> = { clinica: "Clínica Médica", cirurgia: "Cirurgia", go: "Ginecologia e Obstetrícia", pediatria: "Pediatria", preventiva: "Preventiva" };

let cache: { all: Question[]; annulled: Question[]; byId: Map<string, Question>; exams: Exam[]; examById: Map<string, Exam> } | null = null;

export function bank() {
  if (!cache) {
    const raw: Question[] = JSON.parse(readFileSync(join(env.dataDir, "questoes.json"), "utf8"));
    const exams: Exam[] = JSON.parse(readFileSync(join(env.dataDir, "provas.json"), "utf8"));
    // as anuladas existem por id (a pessoa pode ter feito na prova), mas não entram em nada que busca ou sorteia
    cache = { all: raw.filter((x) => !x.an), annulled: raw.filter((x) => x.an), byId: new Map(raw.map((x) => [x.id, x])), exams, examById: new Map(exams.map((x) => [x.id, x])) };
  }
  return cache;
}
export const hasQuestion = (id: string) => bank().byId.has(id);

/** o que só o servidor vê de cada questão: por que está marcada, o que o vídeo disse, dicas do professor */
export type QuestionExtra = { st?: string; m?: string[]; rv?: string; av?: string; ev?: string; pr?: string; d?: string[]; pc?: string[]; pe?: string[] };
let extra: { provas: { id: string; coleta: string | null; gabarito: string }[]; questoes: Record<string, QuestionExtra> } | null = null;
export function bankExtra() {
  if (!extra) {
    try { extra = JSON.parse(readFileSync(env.bankExtraFile, "utf8")); } catch { extra = { provas: [], questoes: {} }; }
  }
  return extra!;
}
