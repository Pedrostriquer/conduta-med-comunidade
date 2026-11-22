/* Datas do ponto de vista da pessoa: chave AAAA-MM-DD no fuso de São Paulo. O app calcula no fuso local do navegador;
   aqui o relógio do servidor pode estar em UTC, então a conta é feita à mão, sem depender do fuso da máquina. */
const OFFSET = 3 * 3_600_000, DAY = 86_400_000;
const utc = (k: string) => Date.parse(k + "T00:00:00Z");

export const dayKey = (ms = Date.now()) => new Date(ms - OFFSET).toISOString().slice(0, 10);
export const today = () => dayKey();
export const addDays = (k: string, n: number) => new Date(utc(k) + n * DAY).toISOString().slice(0, 10);
export const diffDays = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY);
/** dia da semana da chave: 0 = domingo */
export const weekdayOf = (k: string) => new Date(utc(k)).getUTCDay();
/** último instante do dia de hoje, em ms */
export const endOfToday = () => utc(today()) + DAY + OFFSET - 1;
export const isDayKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(utc(s)) && new Date(utc(s)).toISOString().slice(0, 10) === s;

export const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
