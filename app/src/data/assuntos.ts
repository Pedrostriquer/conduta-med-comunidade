/* Assuntos (o resumo de cada assunto) e resoluções (a correção completa de cada questão), gerados por scripts/importar_acervo.py.
   Tudo sob demanda e guardado na memória: a lista de assuntos quando alguém abre a seção; o resumo ao abrir o assunto;
   as resoluções de um assunto só depois que a pessoa respondeu uma questão dele (ou pediu para treinar um bloco).
   Em produção esses arquivos pedem conta, como o banco (deploy/Caddyfile). */
import { useEffect, useState } from "react";
import type { AreaId } from "./types";

export type AssuntoInfo = { slug: string; titulo: string; area: AreaId; temas: string[]; blocos: number; questoes: number; resolucoes: number };

export type Tabela = { titulo?: string; colunas?: string[]; linhas: string[][] };
export type Numero = { situacao: string; valor: string; antes?: string; obs?: string; fonte?: string; ano?: number | null; url?: string | null };
export type Passos = { titulo?: string; itens: string[] };
export type FluxoNo = { texto: string; opcoes?: { rotulo: string; vai: string }[]; fim?: boolean };
export type Fluxo = { titulo?: string; inicio: string; nos: Record<string, FluxoNo> };
export type Pista = { pista: string; resposta: string };
export type Divergencia = {
  titulo?: string; linhas?: { fonte: string; diz: string; url?: string | null }[]; como_a_prova_tem_cobrado?: string;
  /** segundo formato: um ponto com dois lados */
  ponto?: string; lado_a?: string; lado_b?: string; o_resumo_ensina?: string; aviso_fixo?: string;
};
export type Visual = { arquivo: string; titulo?: string; descricao?: string };
export type VideoRef = { canal?: string; titulo?: string; url: string; o_que_explica?: string; publicado_em?: string | null };
export type Fonte = { nome: string; o_que?: string; url?: string | null; ano?: number | null; tipo?: string };
export type CaiAssim = { questoes?: number; bancas?: number; anos?: string; perguntas_que_mais_se_repetem?: string[] };

export type Bloco = {
  id: string; titulo: string; cai_assim?: CaiAssim; essencial_md?: string; numeros?: Numero[]; tabelas?: Tabela[]; passos?: Passos[];
  fluxos?: Fluxo[]; pistas?: Pista[]; divergencias?: Divergencia[]; cai_pouco?: string; visuais?: Visual[]; videos?: VideoRef[]; fontes?: Fonte[];
};
export type Assunto = { slug: string; titulo: string; em_uma_tela?: { texto_md?: string; tabelas?: Tabela[] }; blocos: Bloco[] };

export type Resolucao = {
  resposta?: { letra?: string; texto?: string };
  decide?: string;
  raciocinio?: string[];
  /** v: "certa" | "errada"; m: "**frase-chave.** porquê"; p: pegadinha */
  alternativas?: { l: string; v: string; m: string; p?: 1 }[];
  levar?: string;
  cuidado?: string;
  divergencia?: string | { tipo?: string; linhas?: { fonte?: string; diz?: string }[] };
  videos?: { canal?: string; url: string }[];
  /** onde isso está no resumo do assunto: o bloco e o trecho a realçar */
  resumo?: { bloco: string; trecho?: string | null };
  /** a regra mudou depois da prova */
  desatualizada?: 1;
};

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/** cada arquivo é pedido uma vez; se falhar, a próxima chamada tenta de novo */
function once<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>) {
  let job = cache.get(key);
  if (!job) {
    job = load();
    job.catch(() => { if (cache.get(key) === job) cache.delete(key); });
    cache.set(key, job);
  }
  return job;
}

const lists = new Map<string, Promise<AssuntoInfo[]>>();
const docs = new Map<string, Promise<Assunto>>();
const sols = new Map<string, Promise<Record<string, Resolucao>>>();
const ready = { list: null as AssuntoInfo[] | null, docs: new Map<string, Assunto>(), sols: new Map<string, Record<string, Resolucao>>() };

const SLUG = /^[a-z0-9-]+$/;

export const loadAssuntos = () => once(lists, "", () => getJson<AssuntoInfo[]>("/data/assuntos.json").then((x) => (ready.list = x)));
export const loadAssunto = (slug: string) => once(docs, slug, () => getJson<Assunto>(`/data/assuntos/${slug}.json`).then((x) => { ready.docs.set(slug, x); return x; }));
/** as resoluções de um assunto: {id da questão: resolução} */
export const loadResolucoes = (slug: string) => once(sols, slug, () => getJson<Record<string, Resolucao>>(`/data/resolucoes/${slug}.json`).then((x) => { ready.sols.set(slug, x); return x; }));

type Loaded<T> = { data: T | null; error: boolean; retry: () => void };

function useLoaded<T>(key: string | null, now: () => T | null, load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: boolean }>(() => ({ key, data: key == null ? null : now(), error: false }));
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (key == null) { setState({ key, data: null, error: false }); return; }
    const have = now();
    setState({ key, data: have, error: false });
    if (have) return;
    let on = true;
    load().then((d) => { if (on) setState({ key, data: d, error: false }); }, () => { if (on) setState({ key, data: null, error: true }); });
    return () => { on = false; };
  }, [key, turn]); // eslint-disable-line
  const fresh = state.key === key;
  return { data: fresh ? state.data : key == null ? null : now(), error: fresh && state.error, retry: () => setTurn((t) => t + 1) };
}

export const useAssuntos = () => useLoaded("lista", () => ready.list, loadAssuntos);
export function useAssunto(slug: string | null | undefined) {
  const ok = slug && SLUG.test(slug) ? slug : null;
  return useLoaded(ok, () => (ok ? ready.docs.get(ok) ?? null : null), () => loadAssunto(ok!));
}

/** a resolução de uma questão. `slug` é o assunto dela (`q.as`); passe null enquanto a pessoa não respondeu: nada é baixado. */
export function useResolucao(qid: string, slug: string | null | undefined): Resolucao | null {
  const ok = slug && SLUG.test(slug) ? slug : null;
  const all = useLoaded(ok, () => (ok ? ready.sols.get(ok) ?? null : null), () => loadResolucoes(ok!));
  return all.data?.[qid] ?? null;
}

/** o título do assunto, se a lista já chegou (pede a lista se ainda não) */
export function useAssuntoInfo(slug: string | null | undefined): AssuntoInfo | null {
  const list = useLoaded(slug ? "lista" : null, () => ready.list, loadAssuntos);
  return list.data?.find((a) => a.slug === slug) ?? null;
}

/** id e início (s) de um link do YouTube ("https://youtu.be/ID?t=123") */
export function ytClip(url: string): { id: string; s: number } | null {
  const m = /(?:youtu\.be\/|[?&]v=|\/embed\/)([A-Za-z0-9_-]{11})/.exec(url || "");
  if (!m) return null;
  const t = /[?&](?:t|start)=(\d+)/.exec(url);
  return { id: m[1], s: t ? Number(t[1]) : 0 };
}
