/* Números, tempos e datas no formato brasileiro, como pede a seção Escrita do design system. */

export const num = (n: number) => Number(n).toLocaleString("pt-BR");

export const pct = (v: number) => Math.round(v * 100) + "%";

/** 9:27:44 ou 12:05 (cronômetro) */
export function clock(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const H = Math.floor(s / 3600), M = Math.floor((s % 3600) / 60), S = s % 60;
  return (H ? H + ":" + String(M).padStart(2, "0") : M) + ":" + String(S).padStart(2, "0");
}

/** 4h 20min, 38 min, 50 s */
export function duration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return s + "\u00a0s";
  const H = Math.floor(s / 3600), M = Math.round((s % 3600) / 60);
  if (!H) return M + "\u00a0min";
  return M ? `${H}h\u00a0${String(M).padStart(2, "0")}min` : `${H}h`;
}

/** ritmo por questão: 2:41 */
export const pace = (sec: number) => clock(sec);

export const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;

/* ---------- datas: sempre no fuso local, chave AAAA-MM-DD ---------- */
export type DayKey = string;

export function dayKey(d: Date | number = new Date()): DayKey {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
export function fromKey(k: DayKey) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(k: DayKey, n: number): DayKey {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function diffDays(a: DayKey, b: DayKey) {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86400000);
}
export const today = () => dayKey();

const WD = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const WD_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MON = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MON_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const weekday = (k: DayKey) => WD[fromKey(k).getDay()];
export const weekdayShort = (i: number) => WD_SHORT[i];
export const weekdayName = (i: number) => WD[i];
export const monthName = (m: number) => MON[m];
export const monthShort = (m: number) => MON_SHORT[m];

/** terça, 27 de outubro */
export function longDate(k: DayKey, withYear = false) {
  const d = fromKey(k);
  return `${WD[d.getDay()]}, ${d.getDate()} de ${MON[d.getMonth()]}${withYear ? " de " + d.getFullYear() : ""}`;
}
/** 27 de outubro */
export function shortDate(k: DayKey) {
  const d = fromKey(k);
  return `${d.getDate()} de ${MON[d.getMonth()]}`;
}
/** 27 out */
export function tinyDate(k: DayKey) {
  const d = fromKey(k);
  return `${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
}
/** hoje, ontem, amanhã ou a data curta */
export function relativeDay(k: DayKey) {
  const d = diffDays(today(), k);
  if (d === 0) return "hoje";
  if (d === -1) return "ontem";
  if (d === 1) return "amanhã";
  return shortDate(k);
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** junta com vírgulas e “e”: Cardiologia, Obstetrícia e Trauma */
export function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " e " + items[items.length - 1];
}
