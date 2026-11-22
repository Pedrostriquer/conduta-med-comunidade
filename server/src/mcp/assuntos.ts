/* Os Assuntos (resumos por assunto) e as resoluções das questões: os mesmos arquivos que o app lê em data/assuntos*
   e data/resolucoes/. Lidos sob demanda e guardados em memória; o texto passa pelo mesmo filtro de anotações do app. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "../env";
import { limpa } from "../lib/limpo";

export type AssuntoInfo = { slug: string; titulo: string; area: string; temas: string[]; blocos: number; questoes: number; resolucoes: number };
type CaiAssim = { questoes?: number; bancas?: number; anos?: string; perguntas_que_mais_se_repetem?: string[] };
export type Bloco = { id: string; titulo: string; cai_assim?: CaiAssim; essencial_md?: string; cai_pouco?: string | string[] };
export type Assunto = { slug: string; titulo: string; em_uma_tela?: { texto_md?: string }; blocos: Bloco[] };
type Alt = { l: string; v: string; m?: string };
export type Resolucao = { resposta?: { letra: string; texto?: string }; decide?: string; raciocinio?: string[]; alternativas?: Alt[]; bloco?: string };

const read = <T>(file: string): T | null => {
  try { return JSON.parse(readFileSync(join(env.dataDir, file), "utf8")) as T; } catch { return null; }
};

let index: AssuntoInfo[] | null = null;
export function assuntos(): AssuntoInfo[] {
  if (!index) index = read<AssuntoInfo[]>("assuntos.json") ?? [];
  return index;
}

const SLUG = /^[a-z0-9-]{1,80}$/;
const cacheA = new Map<string, Assunto | null>();
export function assunto(slug: string): Assunto | null {
  if (!SLUG.test(slug)) return null;
  if (!cacheA.has(slug)) cacheA.set(slug, read<Assunto>(`assuntos/${slug}.json`));
  return cacheA.get(slug)!;
}

const cacheR = new Map<string, Record<string, Resolucao> | null>();
export function resolucao(slug: string | undefined, qid: string): Resolucao | null {
  if (!slug || !SLUG.test(slug)) return null;
  if (!cacheR.has(slug)) cacheR.set(slug, read<Record<string, Resolucao>>(`resolucoes/${slug}.json`));
  return cacheR.get(slug)?.[qid] ?? null;
}

/** a resolução pronta para a IA ler, sem as anotações de trabalho */
export function resolucaoLimpa(r: Resolucao) {
  return {
    decide: limpa(r.decide) || null,
    raciocinio: (r.raciocinio || []).map((x) => limpa(x)).filter(Boolean),
    alternativas: (r.alternativas || []).map((a) => ({ letra: a.l, certa: a.v === "certa", por_que: limpa(a.m) || null })),
  };
}

export const linkAssunto = (slug: string, bloco?: string) => `${env.publicUrl}/assuntos/${slug}${bloco ? "#" + bloco : ""}`;
