/* Som do treino, feito na hora com Web Audio (sem arquivo de áudio nem biblioteca).
   Tecla: estalo de ruído filtrado + batida grave curta + o clique mais fraco da tecla soltando.
   Acerto: chiado agudo que se abre + quatro brilhos que sobem meio tom a cada acerto seguido (até 6).
   Erro: duas notas graves abafadas. Fim de rodada: um acorde que sobe, mais cheio. */

let ac: AudioContext | null = null;
let saida: GainNode | null = null;
let ruido: AudioBuffer | null = null;
let ligado = true;

export const somLigado = () => ligado;
export function ligarSom(v: boolean) { ligado = v; if (v) acordar(); }

/** cria (ou acorda) o contexto de áudio; precisa vir de um gesto da pessoa */
export function acordar(): AudioContext | null {
  if (!ac) {
    try {
      const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new AC();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.12;
      saida = ac.createGain(); saida.gain.value = 0.85;
      saida.connect(comp); comp.connect(ac.destination);
      const n = ac.sampleRate, buf = ac.createBuffer(1, n, n), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      ruido = buf;
    } catch { ac = null; }
  }
  if (ac && ac.state === "suspended") void ac.resume();
  return ac;
}

const entre = (a: number, b: number) => a + Math.random() * (b - a);

function envelope(g: GainNode, t: number, pico: number, ataque: number, queda: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(pico, t + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + queda);
}

function sopro(t: number, tipo: BiquadFilterType, freq: number, q: number, pico: number, queda: number, ataque = 0.0015) {
  if (!ac || !saida || !ruido) return;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = ruido; f.type = tipo; f.frequency.value = freq; f.Q.value = q;
  envelope(g, t, pico, ataque, queda);
  s.connect(f); f.connect(g); g.connect(saida);
  s.start(t, Math.random() * 0.8, ataque + queda + 0.02);
}

function nota(t: number, freq: number, pico: number, queda: number, onda: OscillatorType = "sine", ataque = 0.003) {
  if (!ac || !saida) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = onda; o.frequency.setValueAtTime(freq, t);
  envelope(g, t, pico, ataque, queda);
  o.connect(g); g.connect(saida);
  o.start(t); o.stop(t + ataque + queda + 0.05);
}

const pronto = () => ligado && !!acordar();

/** tecla de perfil baixo: estalo claro, corpo curto, e a soltura mais fraca ~65 ms depois */
export function somTecla(tipo: "tecla" | "espaco" | "enter" = "tecla") {
  if (!pronto() || !ac) return;
  const t = ac.currentTime + 0.001, grande = tipo !== "tecla";
  sopro(t, "bandpass", (grande ? 2500 : 4200) * entre(0.88, 1.12), 1.3, grande ? 0.5 : 0.62, 0.028);
  sopro(t, "highpass", 7000, 0.7, 0.11, 0.012);
  nota(t, (grande ? 165 : 285) * entre(0.94, 1.06), grande ? 0.2 : 0.13, 0.045);
  sopro(t + entre(0.055, 0.075), "bandpass", (grande ? 2100 : 3500) * entre(0.9, 1.1), 1.6, 0.14, 0.018);
}

export function somErro() {
  if (!pronto() || !ac) return;
  const t = ac.currentTime;
  nota(t, 146.8, 0.22, 0.12, "triangle");
  nota(t + 0.01, 110, 0.15, 0.17);
  sopro(t, "lowpass", 900, 0.8, 0.12, 0.05);
}

/** a estrutura se desfazendo; `seguidos` = acertos em sequência antes deste */
export function somAcerto(seguidos: number) {
  if (!pronto() || !ac) return;
  const t = ac.currentTime + 0.005, sobe = Math.pow(2, Math.min(seguidos, 6) / 12);
  sopro(t, "highpass", 5200, 0.6, 0.2, 0.42, 0.03);
  sopro(t, "bandpass", 8200, 2, 0.09, 0.5, 0.05);
  [2093, 2637, 3136, 4186].forEach((f, i) => nota(t + 0.025 * i + entre(0, 0.01), f * sobe, 0.045, 0.32));
  nota(t, 523.25 * sobe, 0.05, 0.5, "triangle");
}

/** fim de rodada: dó maior aberto subindo, com um grave por baixo e um brilho no fim */
export function somFim(ultima = false) {
  if (!pronto() || !ac) return;
  const t = ac.currentTime + 0.01;
  const acorde = ultima ? [261.63, 392, 523.25, 659.25, 783.99, 1046.5] : [261.63, 392, 523.25, 659.25];
  acorde.forEach((f, i) => {
    nota(t + 0.07 * i, f, 0.075, 0.9 + 0.08 * i, "triangle", 0.008);
    nota(t + 0.07 * i, f * 2, 0.02, 0.6);
  });
  nota(t, 130.81, 0.12, 1.1, "sine", 0.02);
  const fim = t + 0.07 * acorde.length;
  sopro(fim, "highpass", 6000, 0.6, 0.12, 0.7, 0.05);
  [2093, 3136, 4186].forEach((f, i) => nota(fim + 0.03 * i, f, 0.03, 0.5));
}
