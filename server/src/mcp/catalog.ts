/* O banco de questões visto pelo plugin: índices por prova, especialidade e tema, a mesma regra do app para o que
   entra por padrão e o texto normalizado para a busca. Calculado uma vez, na primeira chamada. */
import { AREAS, bank } from "../bank";
import type { AreaId, Exam, Question } from "../bank";
import { env } from "../env";

export type Topic = { key: string; area: AreaId; esp: string; ids: string[]; temas: { tema: string; ids: string[] }[] };

const MARKS = /[̀-ͯ]/g;
export const norm = (s: string) => s.normalize("NFD").replace(MARKS, "").toLowerCase();
const STOP = new Set("a o as os e de da do das dos em no na nos nas um uma uns umas com por para pra ao aos que se ou sem sob".split(" "));
/** termos da busca: sem acento e sem palavras como "de" e "com", a não ser que seja só isso */
export function terms(q: string) {
  const all = [...new Set(norm(q).split(/[\s,;.]+/).filter((t) => t.length >= 2))];
  const strong = all.filter((t) => !STOP.has(t));
  return strong.length ? strong : all;
}

let idx: { topics: Topic[]; topicByKey: Map<string, Topic>; byExam: Map<string, Question[]>; docs: Map<string, string>; pos: Map<string, number> } | null = null;

export function cat() {
  const b = bank();
  if (!idx) {
    const topicByKey = new Map<string, Topic>(), byExam = new Map<string, Question[]>(), docs = new Map<string, string>();
    for (const q of b.all) {
      const esp = q.esp || "Outros", key = q.area + "/" + esp;
      let t = topicByKey.get(key);
      if (!t) { t = { key, area: q.area, esp, ids: [], temas: [] }; topicByKey.set(key, t); }
      t.ids.push(q.id);
      const tema = q.tema || esp;
      let tm = t.temas.find((x) => x.tema === tema);
      if (!tm) { tm = { tema, ids: [] }; t.temas.push(tm); }
      tm.ids.push(q.id);
      const l = byExam.get(q.p) || []; l.push(q); byExam.set(q.p, l);
      docs.set(q.id, norm(q.e + " " + Object.values(q.a).join(" ")));
    }
    for (const l of byExam.values()) l.sort((x, y) => x.n - y.n);
    const topics = [...topicByKey.values()].sort((x, y) => y.ids.length - x.ids.length);
    topics.forEach((t) => t.temas.sort((x, y) => y.ids.length - x.ids.length));
    idx = { topics, topicByKey, byExam, docs, pos: new Map(b.all.map((q, i) => [q.id, i])) };
  }
  return { ...b, ...idx };
}

/** o que entra por padrão: só as questões marcadas como boas (com vídeo, sem divergência); "todas" inclui o resto */
export const poolOf = (all = false) => (all ? bank().all : bank().all.filter((q) => q.ok));

export const topicKey = (q: Question) => q.area + "/" + (q.esp || "Outros");
export const temaOf = (q: Question) => q.tema || q.esp || "Outros";
export const topicLabel = (key: string) => { const [a, e] = key.split("/"); return `${AREAS[a as AreaId] ?? a} › ${e}`; };

/** vídeo da correção no segundo exato */
export const videoLink = (q: Question) => (q.v ? `https://www.youtube.com/watch?v=${q.v.id}&t=${Math.round(q.v.s)}s` : null);

/** a questão no app: quem já respondeu vê a correção; quem não respondeu pode responder */
export const questionLink = (q: Question) => `${env.publicUrl}/questao/${encodeURIComponent(q.id)}`;

export const examOf = (q: Question): Exam | undefined => bank().examById.get(q.p);
export const imagesOf = (q: Question) => (q.i || []).map((p) => `${env.publicUrl}/${p.replace(/^\//, "")}`);
