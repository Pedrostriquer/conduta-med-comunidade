export type AreaId = "clinica" | "cirurgia" | "go" | "pediatria" | "preventiva";

/** O que vem no índice (`indice.json`): dá para filtrar, contar, montar lista e corrigir, mas não para mostrar a questão. */
export type Question = {
  id: string;
  /** prova */
  p: string;
  /** número na prova */
  n: number;
  area: AreaId;
  /** especialidade (2º nível da árvore) e tema (3º nível) */
  esp: string | null;
  tema: string | null;
  /** gabarito */
  g: string;
  /** correção em vídeo: id do YouTube, início e fim do trecho (s) e canal */
  v?: { id: string; s: number; f: number | null; c?: string };
  /** assunto do acervo (slug de `data/assuntos.json`) */
  as?: string;
  /** tem figura no enunciado (as figuras em si vêm no corpo, em `i`) */
  img?: 1;
  /** entra por padrão (tem vídeo, sem divergência e sem polêmica). Sem isso é problemática, mas é outra coisa que anulada */
  ok?: 1;
  /** anulada pela banca: fica de fora de tudo, só entra na prova de quem pedir, e não conta na nota */
  an?: 1;
};

/** O corpo da questão, que vem do arquivo da prova (`data/q/<prova>.json`) quando ela vai aparecer: ver `ensureBodies` em `bank.ts`. */
export type QuestionBody = {
  /** enunciado */
  e: string;
  /** alternativas */
  a: Record<string, string>;
  /** tabelas: linhas de células */
  t?: string[][][];
  /** imagens (caminho em /public) */
  i?: string[];
  /** caso compartilhado por várias questões */
  k?: string;
  /** explicação curta */
  x?: string;
};

/** Questão com o corpo já baixado: é o que as telas que mostram enunciado e alternativas recebem. */
export type FullQuestion = Question & QuestionBody;

export type Exam = {
  id: string; banca: string; ano: number; nome: string; aplicacao: string;
  alternativas: number; duracao_min: number; total: number; elegiveis: number;
};

export const AREAS: { id: AreaId; label: string; short: string }[] = [
  { id: "clinica", label: "Clínica Médica", short: "Clínica" },
  { id: "cirurgia", label: "Cirurgia", short: "Cirurgia" },
  { id: "go", label: "Ginecologia e Obstetrícia", short: "GO" },
  { id: "pediatria", label: "Pediatria", short: "Pediatria" },
  { id: "preventiva", label: "Preventiva", short: "Preventiva" },
];
export const areaLabel = (id: string) => AREAS.find((a) => a.id === id)?.label ?? id;
export const areaShort = (id: string) => AREAS.find((a) => a.id === id)?.short ?? id;

/** ordem em que as bancas aparecem nos filtros; o app mostra só as que têm prova no banco */
export const BANCAS = ["ENARE", "ENAMED", "SUS-SP", "PSU-MG", "PSU-GO", "AMP", "AMRIGS", "USP-SP", "USP-RP", "UNIFESP", "PSU-AL", "SES-PE", "SES-DF", "Revalida"] as const;
