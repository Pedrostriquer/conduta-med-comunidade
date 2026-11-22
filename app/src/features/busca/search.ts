/* Peças da busca que rodam no navegador: os termos, o trecho e o destaque (os índices do texto normalizado batem com os
   do original), e a busca de temas, provas e atalhos, que só precisa do índice do banco.
   A busca pelo texto das questões é do servidor: ver questions.ts. */
import type { Bank } from "../../data/bank";
import type { Exam, Question } from "../../data/types";
import { AREAS } from "../../data/types";

const MARKS = /[̀-ͯ]/g;

/** minúsculas e sem acento, com o mesmo comprimento do original (para os índices baterem) */
export function norm(s: string) {
  const n = s.normalize("NFD").replace(MARKS, "").toLowerCase();
  if (n.length === s.length) return n;
  let out = "";
  for (const c of s) { const x = c.normalize("NFD").replace(MARKS, "").toLowerCase(); out += x.length === c.length ? x : c; }
  return out;
}

const STOP = new Set("a o as os e de da do das dos em no na nos nas um uma uns umas com por para pra ao aos que se ou sem sob".split(" "));

/** termos da busca, sem acento; palavras como "de", "com" e "para" só contam se forem tudo o que foi digitado */
export function terms(query: string) {
  const all = [...new Set(norm(query).split(/[\s,;.]+/).filter((t) => t.length >= 2))];
  const strong = all.filter((t) => !STOP.has(t));
  return (strong.length ? strong : all).sort((a, b) => b.length - a.length);
}

/** trecho de ~len caracteres em volta do primeiro termo encontrado */
export function snippet(text: string, ts: string[], len = 170) {
  const n = norm(text);
  let at = -1;
  for (const t of ts) { const i = n.indexOf(t); if (i >= 0) { at = i; break; } } // os termos vêm do mais longo ao mais curto
  if (at < 0 || text.length <= len) return text.length > len ? text.slice(0, len).replace(/\s+\S*$/, "") + "…" : text;
  let a = Math.max(0, at - Math.round(len * 0.35));
  if (a > 0) { const sp = text.indexOf(" ", a); a = sp > 0 && sp < at ? sp + 1 : a; }
  let b = Math.min(text.length, a + len);
  if (b < text.length) { const sp = text.lastIndexOf(" ", b); b = sp > at ? sp : b; }
  return (a > 0 ? "…" : "") + text.slice(a, b) + (b < text.length ? "…" : "");
}

/** pedaços do texto com os termos marcados */
export function marks(text: string, ts: string[]) {
  if (!ts.length) return [{ t: text, m: false }];
  const n = norm(text), hit = new Uint8Array(text.length);
  for (const t of ts) { let i = n.indexOf(t); while (i >= 0) { hit.fill(1, i, i + t.length); i = n.indexOf(t, i + t.length); } }
  const out: { t: string; m: boolean }[] = [];
  let s = 0;
  for (let i = 1; i <= text.length; i++) if (i === text.length || hit[i] !== hit[s]) { out.push({ t: text.slice(s, i), m: !!hit[s] }); s = i; }
  return out;
}

/* ---------- temas, provas e atalhos ---------- */
export type TopicHit = { key: string; label: string; sub: string; area: string; n: number };

export function searchTopics(bank: Bank, query: string, limit = 5): TopicHit[] {
  const ts = terms(query); if (!ts.length) return [];
  const out: (TopicHit & { s: number })[] = [];
  for (const t of bank.topics) {
    const area = AREAS.find((a) => a.id === t.area)?.label ?? t.area;
    const e = norm(t.esp);
    if (ts.every((x) => e.includes(x))) out.push({ key: t.key, label: t.esp, sub: area, area: t.area, n: t.ids.length, s: e.startsWith(ts[0]) ? 3 : 2 });
    for (const m of t.temas) {
      if (m.tema === t.esp) continue;
      const n = norm(m.tema);
      if (ts.every((x) => n.includes(x))) out.push({ key: t.key + "/" + m.tema, label: m.tema, sub: t.esp, area: t.area, n: m.ids.length, s: n.startsWith(ts[0]) ? 1.5 : 1 });
    }
  }
  return out.sort((a, b) => b.s - a.s || b.n - a.n).slice(0, limit);
}

export function searchExams(bank: Bank, query: string, limit = 4): Exam[] {
  const ts = terms(query); if (!ts.length) return [];
  // "enare 26" também acha 2026
  return bank.exams.filter((e) => {
    const h = norm(`${e.nome} ${e.banca} ${e.ano}`);
    return ts.every((t) => h.includes(t) || (/^\d{2}$/.test(t) && String(e.ano).endsWith(t)));
  }).slice(0, limit);
}

export type NavHit = { id: string; label: string; icon: string; to: string; keys: string };
export const NAV_HITS: NavHit[] = [
  { id: "hoje", label: "Hoje", icon: "today", to: "/", keys: "inicio dia hoje" },
  { id: "questoes", label: "Questões", icon: "questions", to: "/questoes", keys: "questoes lista montar tema" },
  { id: "salvas", label: "Questões salvas", icon: "bookmark", to: "/questoes/salvas", keys: "salvas marcadas anotacoes notas favoritas" },
  { id: "busca", label: "Buscar no banco", icon: "search", to: "/busca", keys: "busca pesquisar procurar banco" },
  { id: "simulados", label: "Simulados", icon: "exam", to: "/simulados", keys: "simulados provas prova" },
  { id: "cronograma", label: "Cronograma", icon: "calendar", to: "/cronograma", keys: "cronograma plano calendario" },
  { id: "perfil", label: "Perfil", icon: "user", to: "/perfil", keys: "perfil desempenho atividade" },
  { id: "ajustes", label: "Ajustes", icon: "sliders", to: "/perfil/ajustes", keys: "ajustes configuracoes preferencias" },
  { id: "flashcards", label: "Flashcards", icon: "cards", to: "/flashcards", keys: "flashcards anki cards baralhos" },
  { id: "compartilhados", label: "Baralhos compartilhados", icon: "share", to: "/flashcards/compartilhados", keys: "compartilhados baralhos publicar assinar explorar" },
  { id: "assuntos", label: "Assuntos", icon: "layers", to: "/assuntos", keys: "assuntos resumo do assunto teoria estudar revisar" },
  { id: "resumos", label: "Resumos", icon: "doc", to: "/resumos", keys: "resumos documentos notas pastas" },
  { id: "pessoas", label: "Pessoas", icon: "users", to: "/pessoas", keys: "pessoas seguir colegas amigos usuarios" },
  { id: "suporte", label: "Suporte", icon: "help", to: "/suporte", keys: "suporte ajuda feedback sugestao problema prova" },
];

export function searchNav(query: string) {
  const ts = terms(query);
  if (!ts.length) return NAV_HITS;
  return NAV_HITS.filter((n) => { const h = norm(n.label) + " " + n.keys; return ts.every((t) => h.split(/\s+/).some((w) => w.startsWith(t))); });
}

export const examTag = (bank: Bank, q: Question) => {
  const e = bank.examById[q.p];
  return e ? `${e.banca} ${e.nome.match(/\d{4}(?:[./]\d)?/)?.[0] ?? e.ano}${e.nome.includes("Reaplica") ? " (reaplicação)" : ""}` : q.p;
};
