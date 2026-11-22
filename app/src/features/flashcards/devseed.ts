/* Só no desenvolvimento: cria um baralho de teste com cards em todos os estados e 60 dias de revisões,
   para ver as telas de flashcards sem importar um .apkg. No console: __fcSeed() e, para apagar, __fcSeedClear(). */
import { uid } from "../../lib/random";
import { addLog, deleteDeck, putMany } from "./db";
import type { CardRec, DeckRec, Rate } from "./db";
import { useDeckStore } from "./decks";

const ID = "devseed";
const PATHS = [
  ["Clínica Médica", "Cardiologia", "Insuficiência cardíaca"], ["Clínica Médica", "Cardiologia", "Arritmias"], ["Clínica Médica", "Nefrologia"],
  ["Cirurgia", "Trauma", "ATLS"], ["Cirurgia", "Abdome agudo"], ["Pediatria", "Neonatologia"], ["Pediatria", "Imunizações"],
  ["Ginecologia e Obstetrícia", "Pré-natal"], ["Preventiva", "Epidemiologia"],
];
const FACTS = [
  ["Droga de escolha na fibrilação atrial com instabilidade hemodinâmica", "Cardioversão elétrica sincronizada"],
  ["Critério de Framingham maior mais específico", "Turgência jugular patológica"],
  ["Primeira medida no ATLS", "Via aérea com proteção da coluna cervical"],
  ["Vacina contraindicada na gestação", "Tríplice viral"],
  ["Sensibilidade", "Proporção de doentes com teste positivo"],
];

export async function seed(n = 420) {
  const now = Date.now(), DAY = 86400000;
  const deck: DeckRec = { id: ID, name: "Clínica (teste)", file: "", importedAt: now, cards: n, images: 0, groups: ["Clínica Médica", "Cirurgia", "Pediatria"] };
  const cards: CardRec[] = [];
  for (let i = 0; i < n; i++) {
    const [q, a] = FACTS[i % FACTS.length], r = Math.random();
    const c: CardRec = { id: `${ID}:${i}`, deck: ID, path: PATHS[i % PATHS.length], kind: i % 3 === 0 ? "cloze" : "basic",
      fields: i % 3 === 0 ? [`${q}: {{c1::${a}}} (card ${i + 1})`, ""] : [`${q}? <small>(card ${i + 1})</small>`, a], ord: 0,
      due: i, ivl: 0, ease: 2.5, reps: 0, lapses: 0, step: 0, isNew: 1, order: i, tags: i % 7 === 0 ? ["enare"] : [] };
    if (r < 0.55) {
      const ivl = Math.max(1, Math.round(Math.pow(Math.random(), 2) * 120));
      Object.assign(c, { isNew: 0, ivl, ease: 1.8 + Math.random(), reps: 2 + Math.round(Math.random() * 10), lapses: Math.random() < 0.2 ? 1 + Math.round(Math.random() * 3) : 0, due: now + (Math.random() * 40 - 6) * DAY, introduced: now - 60 * DAY * Math.random() });
    } else if (r < 0.6) Object.assign(c, { isNew: 0, step: 1, due: now + 5 * 60000, reps: 1, introduced: now });
    if (Math.random() < 0.04) c.suspended = 1;
    if (Math.random() < 0.06) c.flag = 1 + Math.floor(Math.random() * 7);
    if (Math.random() < 0.05) c.marked = 1;
    cards.push(c);
  }
  await putMany("decks", [deck]);
  await putMany("cards", cards);
  const rates: Rate[] = ["again", "hard", "good", "good", "good", "good", "easy"];
  for (let d = 60; d >= 0; d--) {
    if (Math.random() < 0.2) continue;
    const k = 10 + Math.round(Math.random() * 60);
    for (let j = 0; j < k; j++) {
      const c = cards[Math.floor(Math.random() * cards.length)], rate = rates[Math.floor(Math.random() * rates.length)];
      await addLog({ id: uid(), card: c.id, deck: ID, at: now - d * DAY - Math.random() * 3600000, rate, kind: j % 5 === 0 ? "new" : "review", ivl: Math.max(1, c.ivl), lastIvl: c.ivl, ease: c.ease, ms: 3000 + Math.random() * 15000 });
    }
  }
  await useDeckStore.getState().refresh();
  return cards.length;
}
export async function clear() { await deleteDeck(ID); await useDeckStore.getState().refresh(); }

Object.assign(window, { __fcSeed: seed, __fcSeedClear: clear });
