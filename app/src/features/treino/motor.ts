/* O motor do treino de digitar. A pessoa escolhe quanto quer ver do nome, e pode trocar a qualquer hora:
     nome     · o nome aparece apagado e ela copia (tecla errada não entra)
     parte    · só a primeira letra, o número de letras e uma pista; Enter confere
     memoria  · nada; Enter confere
     auto     · o motor dosa item por item: começa pelo que a pessoa já sabe de cada um (vem do progresso salvo),
                mostra menos a cada acerto e mais a cada erro, e traz o item de volta até sair de memória
   "Revelar" mostra o nome do item da vez para a pessoa digitar: conta como "precisou ver", sem punir.
   Aquecimento ("rever") e "do dia" são sempre de memória; no "do dia" cada item tem uma tentativa só.
   O motor não guarda nada: avisa cada resposta pelo evento "resultado" e quem ouve grava o progresso. */

export type Item = {
  id: string;
  /** como aparece na tela, com acento */
  nome: string;
  /** outros nomes aceitos (com ou sem acento) */
  aceitos?: string[];
  /** linha pequena quando o nome está à vista */
  apoio: string;
  /** pista quando só parte do nome está à vista */
  pista: string;
  /** onde fica / o que é: entra na explicação do erro */
  onde: string;
};

export type Tipo = "niveis" | "rever" | "dia";
export type Ajuda = "auto" | "nome" | "parte" | "memoria";
/** quanto do nome aparece: 0 = o nome inteiro, 1 = parte, 2 = nada */
export type Nivel = 0 | 1 | 2;
export type Como = "certo" | "viu" | "errado";
export type Fase = "digitando" | "certo" | "errado" | "fim";
export type Stats = { teclas: number; boas: number; letras: number; ativoMs: number; feitos: number };
export type Resposta = { id: string; nivel: Nivel; como: Como };
export type Estado = {
  ajuda: Ajuda; fila: { id: string; nivel: Nivel }[]; idx: number; digitado: string; fase: Fase;
  /** a pessoa pediu para ver o nome do item da vez */
  revelado: boolean;
  /** explicação do erro, ou a linha de apoio depois do acerto */
  recado: string; stats: Stats; seguidos: number;
  /** a primeira resposta de cada item em cada nível de ajuda, nesta partida */
  respostas: Resposta[];
};
export type Evento =
  | { t: "novo"; id: string }
  | { t: "certo"; id: string; seguidos: number }
  | { t: "errado"; id: string }
  | { t: "tecla"; c: string; ok: boolean }
  | { t: "resultado"; id: string; nivel: Nivel; como: Como }
  | { t: "fim" };

export const NIVEL_DE: Record<Exclude<Ajuda, "auto">, Nivel> = { nome: 0, parte: 1, memoria: 2 };

/** sem acento, minúsculo */
export const dobra = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’‘]/g, "'").toLowerCase();
/** para comparar respostas: sem acento, sem º/ª, hífen vale espaço, um espaço só */
const limpa = (s: string) => dobra(s).replace(/[ºª°.]/g, "").replace(/[-:\/]/g, " ").trim().replace(/\s+/g, " ");

function distancia(a: string, b: string) {
  const m = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let p = m[0]; m[0] = i;
    for (let j = 1; j <= b.length; j++) { const x = m[j]; m[j] = Math.min(m[j] + 1, m[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = x; }
  }
  return m[b.length];
}

export function embaralha<T>(a: T[], rnd: () => number = Math.random) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

const ZERO: Stats = { teclas: 0, boas: 0, letras: 0, ativoMs: 0, feitos: 0 };

export class Motor {
  private s: Estado;
  private ouvintes = new Set<() => void>();
  private eventos = new Set<(e: Evento) => void>();
  private relogio: ReturnType<typeof setTimeout> | undefined;
  private ultima = 0;
  private voltas: Record<string, number> = {};
  private respondidos = new Set<string>();
  private feitos = new Set<string>();
  private porId: Map<string, Item>;

  /** `nivelDe` diz, no automático, por onde começar cada item (o que a pessoa já sabe dele) */
  constructor(readonly itens: Item[], readonly tipo: Tipo = "niveis", private nivelDe: (id: string) => Nivel = () => 0) {
    this.porId = new Map(itens.map((i) => [i.id, i]));
    this.s = { ajuda: tipo === "niveis" ? "auto" : "memoria", fila: [], idx: 0, digitado: "", fase: "digitando", revelado: false, recado: "", stats: ZERO, seguidos: 0, respostas: [] };
  }

  subscribe = (f: () => void) => { this.ouvintes.add(f); return () => { this.ouvintes.delete(f); }; };
  get = () => this.s;
  ouvir(f: (e: Evento) => void) { this.eventos.add(f); return () => { this.eventos.delete(f); }; }
  destruir() { clearTimeout(this.relogio); }

  get atual(): Item | undefined { const e = this.s.fila[this.s.idx]; return e && this.s.fase !== "fim" ? this.porId.get(e.id) : undefined; }
  /** quanto do nome está à vista agora */
  get nivel(): Nivel { return this.s.revelado ? 0 : this.s.fila[this.s.idx]?.nivel ?? 0; }
  chave(it: Item) { return dobra(it.nome); }

  private set(p: Partial<Estado>) { this.s = { ...this.s, ...p }; this.ouvintes.forEach((f) => f()); }
  private avisa(e: Evento) { this.eventos.forEach((f) => f(e)); }

  /** começa (ou recomeça) a lista no modo pedido */
  iniciar(ajuda: Ajuda = this.s.ajuda) {
    clearTimeout(this.relogio);
    if (this.tipo !== "niveis") ajuda = "memoria";
    this.voltas = {}; this.ultima = 0; this.respondidos = new Set(); this.feitos = new Set();
    const ids = this.itens.map((i) => i.id), ordem = ajuda === "nome" || ajuda === "auto" || this.tipo === "dia" ? ids : embaralha(ids);
    const fila = ordem.map((id) => ({ id, nivel: ajuda === "auto" ? this.nivelDe(id) : NIVEL_DE[ajuda] }));
    this.set({ ajuda, fila, idx: 0, digitado: "", fase: "digitando", revelado: false, recado: "", respostas: [], stats: ZERO, seguidos: 0 });
    this.avisa({ t: "novo", id: fila[0].id });
  }

  private marca() {
    const agora = performance.now(), dt = agora - this.ultima;
    this.ultima = agora;
    return dt > 0 && dt < 4000 ? dt : 0;
  }

  tecla(c: string) {
    const it = this.atual;
    if (!it || this.s.fase !== "digitando") return;
    const st = { ...this.s.stats }, alvo = this.chave(it), d = this.s.digitado;
    st.ativoMs += this.marca(); st.teclas++;
    if (this.nivel === 0) {
      const ok = c === alvo[d.length];
      this.avisa({ t: "tecla", c, ok });
      if (!ok) { this.set({ stats: st }); return; }
      st.boas++; st.letras++;
      this.set({ stats: st, digitado: d + c });
      if (d + c === alvo) this.acertou();
      return;
    }
    if (d.length >= 60 || (c === " " && (!d || d.endsWith(" ")))) return;
    if (c === alvo[d.length]) st.boas++;
    this.avisa({ t: "tecla", c, ok: true });
    this.set({ stats: st, digitado: d + c });
  }

  apagar() {
    if (this.s.fase !== "digitando" || this.nivel === 0 || !this.s.digitado) return false;
    this.set({ digitado: this.s.digitado.slice(0, -1) });
    return true;
  }

  /** mostra o nome do item da vez para a pessoa digitar: conta como "precisou ver" */
  revelar() {
    if (this.s.fase !== "digitando" || this.nivel === 0) return false;
    this.set({ revelado: true, digitado: "" });
    return true;
  }

  enter() {
    const f = this.s.fase;
    if (f === "certo" || f === "errado") return this.avancar();
    if (f === "fim") { this.iniciar(); return; }
    if (this.nivel !== 0 && this.s.digitado.trim()) this.conferir();
  }

  /** só a primeira resposta de cada item em cada nível de ajuda vira resultado */
  private resultado(it: Item, como: Como) {
    const nivel = this.s.fila[this.s.idx].nivel, k = it.id + ":" + nivel;
    if (this.respondidos.has(k)) return;
    this.respondidos.add(k);
    this.set({ respostas: [...this.s.respostas, { id: it.id, nivel, como }] });
    this.avisa({ t: "resultado", id: it.id, nivel, como });
  }

  /** põe o item de volta mais adiante, mostrando mais ou menos do nome */
  private volta(it: Item, nivel: Nivel, distancia: number) {
    this.voltas[it.id] = (this.voltas[it.id] || 0) + 1;
    if (this.tipo === "dia" || this.voltas[it.id] > 3) return this.s.fila;
    const fila = this.s.fila.slice();
    fila.splice(Math.min(fila.length, this.s.idx + distancia), 0, { id: it.id, nivel });
    return fila;
  }

  private conferir() {
    const it = this.atual!, resp = limpa(this.s.digitado), nivel = this.s.fila[this.s.idx].nivel;
    const vale = (x: Item) => resp === limpa(x.nome) || (x.aceitos || []).some((a) => limpa(a) === resp);
    if (vale(it)) { this.set({ stats: { ...this.s.stats, letras: this.s.stats.letras + resp.length } }); return this.acertou(); }
    const outro = this.itens.find((x) => x.id !== it.id && vale(x));
    const recado = outro ? `Você digitou ${outro.nome}: ${outro.onde}. Aqui é ${it.nome}: ${it.onde}.`
      : distancia(resp, limpa(it.nome)) <= 2 ? `Quase. Escreve-se ${it.nome}.`
      : `Aqui é ${it.nome}: ${it.onde}.`;
    this.resultado(it, "errado");
    // errou: volta daqui a pouco; no automático, mostrando mais
    const fila = this.volta(it, this.s.ajuda === "auto" ? (Math.max(0, nivel - 1) as Nivel) : nivel, 3);
    this.set({ fase: "errado", recado, fila, seguidos: 0 });
    this.avisa({ t: "errado", id: it.id });
  }

  private acertou() {
    const it = this.atual!, antes = this.s.seguidos, nivel = this.s.fila[this.s.idx].nivel, viu = this.s.revelado;
    this.resultado(it, viu ? "viu" : "certo");
    let fila = this.s.fila;
    // no automático o item volta mostrando menos, até sair de memória; se precisou ver, volta igual
    if (this.s.ajuda === "auto" && (viu || nivel < 2)) fila = this.volta(it, viu ? nivel : ((nivel + 1) as Nivel), 4);
    else if (viu && this.tipo !== "dia") fila = this.volta(it, nivel, 4);
    if (!viu) this.feitos.add(it.id);
    this.set({ fase: "certo", fila, recado: nivel === 0 && !viu ? "" : it.apoio, seguidos: viu ? 0 : antes + 1, stats: { ...this.s.stats, feitos: this.feitos.size } });
    this.avisa({ t: "certo", id: it.id, seguidos: antes });
    clearTimeout(this.relogio);
    this.relogio = setTimeout(() => { if (this.s.fase === "certo") this.avancar(); }, nivel === 0 && !viu ? 620 : 1300);
  }

  private avancar() {
    clearTimeout(this.relogio);
    const idx = this.s.idx + 1;
    if (idx < this.s.fila.length) {
      this.set({ idx, digitado: "", fase: "digitando", recado: "", revelado: false });
      this.avisa({ t: "novo", id: this.s.fila[idx].id });
      return;
    }
    this.set({ idx, digitado: "", fase: "fim", recado: "", revelado: false });
    this.avisa({ t: "fim" });
  }
}

export const ppm = (s: Stats) => (s.ativoMs > 2500 ? Math.round(s.letras / 5 / (s.ativoMs / 60000)) : 0);
export const acerto = (s: Stats) => (s.teclas ? Math.round((100 * s.boas) / s.teclas) : 100);
