/* Traçados de ECG sintéticos. Não são registros de pacientes.
   RASCUNHO: os parâmetros e a forma de cada ritmo ainda não foram conferidos por médico.

   No espírito do ECGSYN (McSharry, Clifford, Tarassenko e Smith, 2003): cada batimento é uma soma de ondas em sino
   (P, Q, R, S, T e extras), e cada ritmo é descrito por PARÂMETROS clínicos, não por uma curva desenhada à mão:
   frequência, intervalo PR, duração do QRS, QT corrigido, amplitude das ondas, desnível do ST, regularidade e, quando
   há, a regra do bloqueio. A tabela RITMOS guarda esses parâmetros; o LEIAME diz de onde veio cada critério.
   Cada ritmo vira um trecho de 40 s a 250 amostras por segundo, em milivolts, na derivação indicada. */

export const FS = 250;
const SEG = 40, TAU = Math.PI * 2;

/** Um batimento numa derivação. Amplitudes em mV, tempos em segundos. */
export type Batimento = {
  /** amplitude da onda P (0 = sem P) e duração; `pEntalhe`: P larga com dois picos (sobrecarga atrial esquerda) */
  p?: number; pDur?: number; pEntalhe?: boolean;
  /** espícula de marcapasso antes do QRS (mV) */
  espicula?: number;
  /** fator de largura da onda Q (Q patológica) */
  qLarg?: number;
  /** onda U (mV) */
  u?: number;
  /** intervalo PR: do início da P ao início do QRS */
  pr?: number;
  /** duração do QRS */
  qrs?: number;
  q?: number; r?: number; s?: number;
  /** R' (segunda onda positiva): rSR' do bloqueio de ramo direito em V1 */
  rl?: number;
  /** R larga com entalhe, sem q: bloqueio de ramo esquerdo em V6 */
  entalhe?: boolean;
  /** onda delta: subida lenta no começo do QRS (pré-excitação) */
  delta?: number;
  /** onda no ponto J: amplitude e largura da descida (estreita = Osborn; larga = corcova de Brugada) */
  j?: number; jLarg?: number;
  /** desnível do segmento ST e a sua forma */
  st?: number; stForma?: "reto" | "convexo" | "concavo" | "colher" | "ascendente";
  /** desnível do segmento PR (pericardite) */
  prSeg?: number;
  /** onda T: amplitude, fator de largura, simétrica (em tenda) */
  t?: number; tLarg?: number; tSim?: boolean;
  /** QT corrigido (Bazett) */
  qtc?: number;
};

export type Ritmo = {
  /** derivação mostrada no canto */
  deriv: string;
  /** aviso no canto (ex.: "sem pulso") */
  nota?: string;
  tipo?: "batimentos" | "fa" | "flutter" | "tv" | "fv" | "torsades" | "assistolia";
  /** frequência ventricular (ou sinusal), por minuto */
  fc: number;
  /** quanto o RR varia com a respiração (fração do RR) */
  resp?: number;
  /** irregularidade aleatória do RR (fração) e onda P que muda de forma a cada batimento (ritmos atriais multifocais) */
  caos?: number; pVaria?: boolean;
  /** extrassístole atrial a cada N batimentos: precoce, estreita, com P diferente e pausa não compensadora */
  esa?: number;
  bat?: Batimento;
  bloqueio?: { tipo: "wenckebach"; prs: number[] } | { tipo: "mobitz2"; cada: number } | { tipo: "total"; fcAtrial: number };
  /** extrassístole a cada N batimentos */
  esv?: { cada: number; bat: Batimento };
};

/** DII normal: P 0,14 mV e 0,10 s; PR 0,16 s; QRS 0,09 s; QTc 0,41 s */
const NORMAL: Required<Pick<Batimento, "p" | "pDur" | "pr" | "qrs" | "q" | "r" | "s" | "t" | "tLarg" | "qtc">> = { p: 0.14, pDur: 0.1, pr: 0.16, qrs: 0.09, q: -0.08, r: 1.1, s: -0.22, t: 0.28, tLarg: 1, qtc: 0.41 };
const LARGO: Batimento = { p: 0, qrs: 0.16, q: 0, r: 0.9, s: -0.5, t: -0.26, tLarg: 1.15, qtc: 0.46 };

export const RITMOS: Record<string, Ritmo> = {
  /* ---- nível 1 ---- */
  sinusal: { deriv: "DII", fc: 68, resp: 0.03 },
  "bradi-sinusal": { deriv: "DII", fc: 44, resp: 0.03 },
  "taqui-sinusal": { deriv: "DII", fc: 128, resp: 0.01, bat: { pr: 0.14, t: 0.22 } },
  "arritmia-sinusal": { deriv: "DII", fc: 66, resp: 0.24 },
  fa: { deriv: "DII", tipo: "fa", fc: 105, bat: { p: 0, q: -0.05, t: 0.16 } },
  flutter: { deriv: "DII", tipo: "flutter", fc: 75, bat: { p: 0, q: 0, r: 0.95, s: -0.12, t: 0.04 } },
  tsv: { deriv: "DII", fc: 186, bat: { p: 0, q: -0.04, r: 1.0, s: -0.25, t: 0.16, qtc: 0.4 } },
  /* ---- nível 2 ---- */
  bav1: { deriv: "DII", fc: 64, resp: 0.02, bat: { pr: 0.32 } },
  mobitz1: { deriv: "DII", fc: 72, bloqueio: { tipo: "wenckebach", prs: [0.18, 0.27, 0.35] } },
  mobitz2: { deriv: "DII", fc: 72, bat: { pr: 0.18, qrs: 0.11 }, bloqueio: { tipo: "mobitz2", cada: 3 } },
  bavt: { deriv: "DII", fc: 36, bat: LARGO, bloqueio: { tipo: "total", fcAtrial: 84 } },
  brd: { deriv: "V1", fc: 70, resp: 0.02, bat: { p: 0.07, qrs: 0.14, q: 0, r: 0.22, s: -0.38, rl: 0.8, t: -0.2, qtc: 0.43 } },
  bre: { deriv: "V6", fc: 70, resp: 0.02, bat: { p: 0.1, qrs: 0.15, q: 0, r: 0.8, s: 0, entalhe: true, st: -0.07, stForma: "reto", t: -0.3, qtc: 0.44 } },
  /* ---- nível 3 ---- */
  esv: { deriv: "DII", fc: 72, esv: { cada: 4, bat: { p: 0, qrs: 0.15, q: 0, r: 1.35, s: -0.25, t: -0.5, tLarg: 1.2, qtc: 0.44 } } },
  tv: { deriv: "DII", tipo: "tv", fc: 176 },
  torsades: { deriv: "DII", tipo: "torsades", fc: 246 },
  fv: { deriv: "DII", tipo: "fv", fc: 0 },
  assistolia: { deriv: "DII", tipo: "assistolia", fc: 0 },
  aesp: { deriv: "DII", nota: "paciente sem pulso", fc: 58, bat: { p: 0.1, r: 0.75, t: 0.2, qrs: 0.1 } },
  idioventricular: { deriv: "DII", fc: 34, bat: LARGO },
  /* ---- nível 4 ---- */
  supra: { deriv: "DII", fc: 82, bat: { q: -0.26, r: 0.7, s: -0.04, st: 0.34, stForma: "convexo", t: 0.34 } },
  hipercalemia: { deriv: "V4", fc: 70, bat: { p: 0.05, pr: 0.21, qrs: 0.115, q: 0, r: 0.95, s: -0.4, t: 1.0, tLarg: 0.7, tSim: true } },
  wpw: { deriv: "DII", fc: 72, bat: { pr: 0.085, qrs: 0.15, delta: 0.5, q: 0, r: 0.95, s: -0.1, t: -0.12 } },
  brugada: { deriv: "V1", fc: 68, bat: { p: 0.06, qrs: 0.1, q: 0, r: 0.16, s: -0.3, j: 0.42, jLarg: 0.085, t: -0.2, qtc: 0.4 } },
  "qt-longo": { deriv: "DII", fc: 58, bat: { t: 0.3, tLarg: 1.55, qtc: 0.58 } },
  pericardite: { deriv: "DII", fc: 92, bat: { st: 0.17, stForma: "concavo", prSeg: -0.07, t: 0.3 } },
  hipotermia: { deriv: "DII", fc: 42, bat: { pr: 0.2, s: -0.05, j: 0.62, jLarg: 0.03, t: 0.2, tLarg: 1.3, qtc: 0.54 } },
  /* ---- para ir além: outros ritmos ---- */
  tam: { deriv: "DII", fc: 124, caos: 0.5, pVaria: true, bat: { t: 0.2 } },
  juncional: { deriv: "DII", fc: 48, bat: { p: -0.11, pr: 0.09, pDur: 0.08 } },
  migratorio: { deriv: "DII", fc: 72, caos: 0.16, pVaria: true },
  "bav-2-1": { deriv: "DII", fc: 76, bat: { pr: 0.18 }, bloqueio: { tipo: "mobitz2", cada: 2 } },
  esa: { deriv: "DII", fc: 70, esa: 4 },
  bigeminismo: { deriv: "DII", fc: 76, esv: { cada: 2, bat: { p: 0, qrs: 0.15, q: 0, r: 1.35, s: -0.25, t: -0.5, tLarg: 1.2, qtc: 0.44 } } },
  riva: { deriv: "DII", fc: 78, bat: LARGO },
  marcapasso: { deriv: "DII", fc: 70, bat: { p: 0.1, pr: 0.17, espicula: 0.55, qrs: 0.17, q: 0, r: 0.22, s: -1.0, t: 0.34, tLarg: 1.1, qtc: 0.46 } },
  /* ---- para ir além: sobrecargas e bloqueio divisional ---- */
  sae: { deriv: "DII", fc: 70, bat: { p: 0.16, pDur: 0.15, pEntalhe: true, pr: 0.19 } },
  sad: { deriv: "DII", fc: 82, bat: { p: 0.34, pDur: 0.09 } },
  sve: { deriv: "V5", fc: 70, bat: { qrs: 0.1, q: -0.06, r: 2.7, s: -0.1, st: -0.14, stForma: "reto", t: -0.36, qtc: 0.43 } },
  svd: { deriv: "V1", fc: 78, bat: { p: 0.2, qrs: 0.1, q: 0, r: 1.05, s: -0.25, st: -0.06, t: -0.26 } },
  bdas: { deriv: "DII", fc: 70, bat: { qrs: 0.105, q: 0, r: 0.3, s: -0.95, t: 0.2 } },
  /* ---- para ir além: isquemia ---- */
  wellens: { deriv: "V3", fc: 64, bat: { q: 0, r: 0.5, s: -0.7, t: -0.6, tSim: true, tLarg: 1.25, qtc: 0.46 } },
  "de-winter": { deriv: "V3", fc: 78, bat: { q: 0, r: 0.55, s: -0.55, st: -0.26, stForma: "ascendente", t: 1.05, tSim: true, tLarg: 1.2 } },
  infra: { deriv: "V5", fc: 98, bat: { r: 1.2, st: -0.22, stForma: "reto", t: 0.1 } },
  "infarto-antigo": { deriv: "DIII", fc: 68, bat: { q: -0.5, qLarg: 2.4, r: 0.4, s: 0, t: -0.16 } },
  /* ---- para ir além: eletrólitos e outros ---- */
  hipocalemia: { deriv: "V3", fc: 70, bat: { q: 0, r: 0.9, s: -0.5, st: -0.07, stForma: "reto", t: 0.07, u: 0.24, qtc: 0.42 } },
  hipercalcemia: { deriv: "DII", fc: 70, bat: { qtc: 0.31, tLarg: 0.8 } },
  hipocalcemia: { deriv: "DII", fc: 70, bat: { qtc: 0.53, tLarg: 0.85 } },
  tep: { deriv: "DIII", fc: 116, bat: { pr: 0.14, q: -0.3, qLarg: 1.6, r: 0.6, s: -0.04, t: -0.24 } },
  "repolarizacao-precoce": { deriv: "V4", fc: 58, bat: { q: 0, r: 1.5, s: -0.15, j: 0.14, jLarg: 0.014, st: 0.15, stForma: "concavo", t: 0.6 } },
  digital: { deriv: "V5", fc: 60, bat: { pr: 0.2, q: -0.04, st: -0.16, stForma: "colher", t: 0.07, qtc: 0.35 } },
};

/* ------------------------------------------------------------------ geração ---- */

/** gerador com semente: o mesmo ritmo sai sempre igual */
function sorteio(semente: number) {
  let a = semente >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** soma uma onda em sino; `sd` é a largura da descida, quando difere da subida */
function sino(b: Float32Array, centro: number, s: number, amp: number, sd = s) {
  if (!amp) return;
  const i0 = Math.max(0, Math.floor((centro - 4 * s) * FS)), i1 = Math.min(b.length - 1, Math.ceil((centro + 4 * sd) * FS));
  for (let i = i0; i <= i1; i++) { const d = i / FS - centro, w = d < 0 ? s : sd; b[i] += amp * Math.exp(-(d * d) / (2 * w * w)); }
}
const sig = (x: number) => 1 / (1 + Math.exp(-x));
/** soma um degrau suave entre t0 e t1, com a forma dada por f(x), x de 0 a 1 */
function trecho(b: Float32Array, t0: number, t1: number, amp: number, f: (x: number) => number, borda0 = 0.006, borda1 = 0.02) {
  if (!amp || t1 <= t0) return;
  const i0 = Math.max(0, Math.floor((t0 - 0.05) * FS)), i1 = Math.min(b.length - 1, Math.ceil((t1 + 0.12) * FS));
  for (let i = i0; i <= i1; i++) { const t = i / FS; b[i] += amp * f(Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))) * sig((t - t0) / borda0) * sig((t1 - t) / borda1); }
}

function ondaP(b: Float32Array, tP: number, bt: Batimento) {
  const p = bt.p ?? NORMAL.p, dur = bt.pDur ?? NORMAL.pDur;
  if (bt.pEntalhe) { sino(b, tP + dur * 0.3, dur / 8, p); sino(b, tP + dur * 0.7, dur / 8, p * 0.95); }
  else sino(b, tP + dur / 2, dur / 5, p);
}

/** QRS, ST e T a partir do início do QRS; `rr` (s) acerta o QT pela frequência (Bazett) */
function qrst(b: Float32Array, tQ: number, rr: number, bt: Batimento) {
  const d = bt.qrs ?? NORMAL.qrs, r = bt.r ?? NORMAL.r, q = bt.q ?? NORMAL.q, s = bt.s ?? NORMAL.s;
  if (bt.espicula) sino(b, tQ - 0.012, 0.0028, bt.espicula);
  if (bt.delta) sino(b, tQ + 0.14 * d, 0.2 * d, bt.delta);
  if (bt.rl) { sino(b, tQ + 0.2 * d, 0.07 * d, r); sino(b, tQ + 0.45 * d, 0.085 * d, s); sino(b, tQ + 0.74 * d, 0.12 * d, bt.rl); }
  else if (bt.entalhe) { sino(b, tQ + 0.33 * d, 0.13 * d, r); sino(b, tQ + 0.64 * d, 0.13 * d, r * 0.95); }
  else { sino(b, tQ + 0.2 * d * (bt.qLarg ? 1.2 : 1), 0.07 * d * (bt.qLarg ?? 1), q); sino(b, tQ + (bt.qLarg ? 0.62 : 0.45) * d, 0.11 * d, r); sino(b, tQ + 0.72 * d, 0.09 * d, s); }
  const tJ = tQ + d;
  const qt = (bt.qtc ?? NORMAL.qtc) * Math.sqrt(Math.min(1.5, Math.max(0.3, rr)));
  const larg = bt.tLarg ?? 1, sr = (bt.tSim ? 0.034 : 0.055) * larg, sf = (bt.tSim ? 0.034 : 0.036) * larg;
  const tT = Math.max(tJ + 0.06, tQ + qt - 2.3 * sf);
  if (bt.j) sino(b, tJ + (bt.jLarg && bt.jLarg > 0.04 ? 0 : 0.012), bt.jLarg && bt.jLarg > 0.04 ? 0.012 : bt.jLarg ?? 0.016, bt.j, bt.jLarg ?? 0.016);
  if (bt.st) {
    const f = bt.stForma ?? "reto";
    if (f === "colher") trecho(b, tJ, tT + sf, bt.st, (x) => Math.pow(Math.sin(Math.PI * x), 0.8), 0.012, 0.03);
    else if (f === "concavo") trecho(b, tJ, tT, bt.st, (x) => 0.45 + 0.55 * x * x);
    else if (f === "ascendente") trecho(b, tJ, tT - sr, bt.st, (x) => 1 - x * x, 0.006, 0.04);
    else if (f === "convexo") { trecho(b, tJ, tT, bt.st, () => 1); sino(b, (tJ + tT) / 2, (tT - tJ) / 3, bt.st * 0.3); }
    else trecho(b, tJ, tT, bt.st, () => 1);
  }
  sino(b, tT, sr, bt.t ?? NORMAL.t, sf);
  if (bt.u) sino(b, tT + 2.3 * sf + 0.07, 0.035, bt.u);
}

function batimentos(b: Float32Array, r: Ritmo, rnd: () => number) {
  const bt = r.bat ?? {}, rrBase = 60 / r.fc, pr = bt.pr ?? NORMAL.pr;
  if (r.bloqueio?.tipo === "total") {
    // átrios e ventrículos cada um no seu ritmo
    for (let t = 0.3; t < SEG; t += 60 / r.bloqueio.fcAtrial) ondaP(b, t, { p: 0.15 });
    for (let t = 0.95; t < SEG; t += rrBase) qrst(b, t, rrBase, bt);
    return;
  }
  let k = 0, ultimoQ = -1;
  for (let tP = 0.3; tP < SEG; k++) {
    const rr = rrBase * (1 + (r.resp ?? 0) * Math.sin(TAU * tP / 4.4)) * (1 + (rnd() - 0.5) * (r.caos ?? 0.012));
    // onda P que muda de foco: forma e PR diferentes a cada batimento
    const foco = r.pVaria ? [{ p: 0.14, pr: 0.16 }, { p: -0.1, pr: 0.12 }, { p: 0.07, pr: 0.2, pEntalhe: true, pDur: 0.12 }, { p: 0.2, pr: 0.14, pDur: 0.08 }][Math.floor(rnd() * 4)] : null;
    let conduz = true, prK = pr;
    if (r.bloqueio?.tipo === "wenckebach") { const n = r.bloqueio.prs.length + 1, i = k % n; conduz = i < n - 1; prK = r.bloqueio.prs[i] ?? pr; }
    if (r.bloqueio?.tipo === "mobitz2") conduz = k % r.bloqueio.cada !== r.bloqueio.cada - 1;
    if (r.esv && k % r.esv.cada === r.esv.cada - 1) {
      // batimento precoce e largo, sem P; a P sinusal seguinte cai dentro dele e não conduz: pausa compensadora
      const tQ = tP - 0.34 * rr;
      qrst(b, tQ, rr, r.esv.bat); ultimoQ = tQ;
    } else if (r.esa && k % r.esa === r.esa - 1) {
      // batimento atrial precoce: P diferente, QRS igual; o ritmo recomeça a contar a partir dele
      tP -= 0.32 * rr;
      ondaP(b, tP, { p: -0.09, pDur: 0.08 });
      const tQ = tP + 0.13; qrst(b, tQ, Math.min(1.5, tQ - ultimoQ), bt); ultimoQ = tQ;
    } else if (foco) {
      ondaP(b, tP, foco);
      const tQ = tP + foco.pr; qrst(b, tQ, ultimoQ < 0 ? rr : Math.min(1.5, tQ - ultimoQ), bt); ultimoQ = tQ;
    } else {
      if ((bt.p ?? NORMAL.p) !== 0) ondaP(b, tP, bt);
      if (bt.prSeg) trecho(b, tP + (bt.pDur ?? NORMAL.pDur), tP + prK, bt.prSeg, () => 1, 0.01, 0.006);
      if (conduz) { const tQ = tP + prK; qrst(b, tQ, ultimoQ < 0 ? rr : Math.min(1.5, tQ - ultimoQ), bt); ultimoQ = tQ; }
    }
    tP += rr;
  }
}

const GERA: Record<NonNullable<Ritmo["tipo"]>, (b: Float32Array, r: Ritmo, rnd: () => number) => void> = {
  batimentos,
  // RR irregularmente irregular, sem P, linha de base tremida (ondas f)
  fa(b, r, rnd) {
    const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU, rnd() * TAU];
    for (let i = 0; i < b.length; i++) {
      const t = i / FS;
      b[i] += 0.034 * Math.sin(TAU * 5.3 * t + ph[0]) * (0.6 + 0.4 * Math.sin(TAU * 0.31 * t + ph[3]))
            + 0.028 * Math.sin(TAU * 6.9 * t + ph[1] + 1.4 * Math.sin(TAU * 0.47 * t))
            + 0.02 * Math.sin(TAU * 8.6 * t + ph[2]) * (0.5 + 0.5 * Math.sin(TAU * 0.83 * t));
    }
    const media = 60 / r.fc;
    for (let t = 0.4, antes = media; t < SEG;) { qrst(b, t, antes, { ...r.bat, r: 0.95 + rnd() * 0.2 }); antes = media * (0.62 + Math.pow(rnd(), 1.25) * 1.3); t += antes; }
  },
  // ondas F a 300 por minuto em dente de serra (descida lenta, subida rápida), condução 4:1
  flutter(b, r) {
    for (let i = 0; i < b.length; i++) { const f = (i / FS * 5) % 1; b[i] += f < 0.8 ? 0.13 - 0.3 * (f / 0.8) : -0.17 + 0.3 * ((f - 0.8) / 0.2); }
    for (let k = 0; k < 2; k++) for (let i = b.length - 2; i > 0; i--) b[i] = (b[i - 1] + 2 * b[i] + b[i + 1]) / 4;
    const rr = 60 / r.fc;
    for (let t = 0.43; t < SEG; t += rr) qrst(b, t, rr, r.bat ?? {});
  },
  // complexos largos e iguais, sem P nem T separadas
  tv(b, r, rnd) {
    const ciclo = 60 / r.fc, k = ciclo / 0.34;
    for (let t = 0.2; t < SEG; t += ciclo * (1 + (rnd() - 0.5) * 0.02)) { sino(b, t, 0.034 * k, 1.25, 0.04 * k); sino(b, t + 0.13 * k, 0.05 * k, -0.8, 0.06 * k); sino(b, t - 0.07 * k, 0.03 * k, -0.12); }
  },
  // ondulação caótica: cinco osciladores entre 3 e 8 Hz, com frequência e amplitude vagando
  fv(b, _r, rnd) {
    const n = 5, f = Array.from({ length: n }, (_, k) => 3.2 + k * 1.05 + rnd()), fase = Array.from({ length: n }, () => rnd() * TAU), amp = Array.from({ length: n }, () => 0.3 + rnd() * 0.5);
    let env = 0.6;
    for (let i = 0; i < b.length; i++) {
      let v = 0;
      for (let k = 0; k < n; k++) {
        f[k] = Math.min(8.5, Math.max(2.6, f[k] + (rnd() - 0.5) * 0.06));
        amp[k] = Math.min(1, Math.max(0.05, amp[k] + (rnd() - 0.5) * 0.02));
        fase[k] += TAU * f[k] / FS;
        v += amp[k] * Math.sin(fase[k]);
      }
      env = Math.min(1, Math.max(0.35, env + (rnd() - 0.5) * 0.012));
      b[i] += v * 0.3 * env;
    }
  },
  // TV polimórfica: a amplitude cresce e diminui em fusos e a polaridade inverte a cada fuso
  torsades(b, r, rnd) {
    let fase = 0, f = r.fc / 60;
    const f0 = f;
    for (let i = 0; i < b.length; i++) {
      const t = i / FS;
      f = Math.min(f0 + 0.5, Math.max(f0 - 0.5, f + (rnd() - 0.5) * 0.01));
      fase += TAU * f / FS;
      b[i] += 0.95 * Math.sin(TAU * t / 4.6) * (Math.sin(fase) + 0.28 * Math.sin(2 * fase + 0.7)) + 0.1 * Math.sin(fase + Math.PI / 2);
    }
  },
  // linha quase reta: só a oscilação lenta da linha de base
  assistolia(b) { for (let i = 0; i < b.length; i++) b[i] += 0.02 * Math.sin(TAU * 0.13 * i / FS) + 0.012 * Math.sin(TAU * 0.37 * i / FS + 1); },
};

const pronto = new Map<string, Float32Array>();

export function tracado(id: string): Float32Array {
  let b = pronto.get(id);
  if (!b) {
    b = new Float32Array(SEG * FS);
    const r = RITMOS[id];
    const rnd = sorteio(Object.keys(RITMOS).indexOf(id) * 7919 + 13);
    if (r) GERA[r.tipo ?? "batimentos"](b, r, rnd);
    // um pouco de ruído e de oscilação da linha de base, como num monitor
    for (let i = 0; i < b.length; i++) b[i] += (rnd() - 0.5) * 0.014 + 0.016 * Math.sin(TAU * 0.21 * i / FS);
    pronto.set(id, b);
  }
  return b;
}

/** valor em mV no instante t (s), com interpolação; o trecho se repete */
export function mv(b: Float32Array, t: number) {
  const x = ((t * FS) % b.length + b.length) % b.length, i = Math.floor(x), k = x - i;
  return b[i] * (1 - k) + b[(i + 1) % b.length] * k;
}
