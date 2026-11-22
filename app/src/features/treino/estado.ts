/* O progresso do treino, por pessoa. Fica no navegador (localStorage "conduta-treino") e é espelhado no servidor pela
   sincronização (coleção "treino": um registro por item, id "<região>/<item>", e o registro "dia").
   Este arquivo não importa o catálogo de propósito: o motor de sincronização o carrega logo na entrada do app.
   O treino não entra nas estatísticas de questões.

   Revisão espaçada simples: cada acerto de memória sobe um degrau e marca a próxima revisão para 1, 3, 7, 16, 35 e
   90 dias; um erro de memória volta ao começo e pede revisão em 10 minutos; "precisou ver" não sobe nem desce. */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Registro = {
  /** degraus seguidos de memória */
  n: number;
  ok: number; err: number;
  /** última resposta e próxima revisão (ms; 0 = ainda não entrou na revisão) */
  ultima: number; rever: number;
  /** no automático, quanto do nome mostrar da próxima vez: 0 = inteiro, 1 = parte, 2 = nada */
  f: 0 | 1 | 2;
};
export type Quadro = "certo" | "viu" | "errado";
export type Dia = { data: string; conjunto: string; quadros: Quadro[] };

type Estado = {
  itens: Record<string, Registro>;
  dia: Dia | null;
  /** dias seguidos com o "do dia" feito */
  sequencia: number;
  /** quando o "do dia" mudou pela última vez (ms): decide quem ganha na sincronização */
  diaEm: number;
  registrar: (chave: string, nivel: 0 | 1 | 2, como: Quadro) => void;
  fecharDia: (d: Dia) => void;
};

const DIA = 86_400_000, DEGRAUS = [1, 3, 7, 16, 35, 90];
/** a partir de dois acertos de memória seguidos o item conta como dominado */
export const DOMINADO = 2;
export const hoje = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const useTreino = create<Estado>()(persist((set) => ({
  itens: {}, dia: null, sequencia: 0, diaEm: 0,
  registrar: (k, nivel, como) => set((s) => {
    const a = s.itens[k] ?? { n: 0, ok: 0, err: 0, ultima: 0, rever: 0, f: 0 as const }, agora = Date.now();
    const r: Registro = { ...a, ultima: agora };
    if (como === "errado") { r.err++; r.f = Math.max(0, nivel - 1) as Registro["f"]; if (nivel === 2) { r.n = 0; r.rever = agora + 10 * 60_000; } }
    else if (como === "viu") { r.f = Math.max(0, Math.min(a.f, nivel) - (nivel === 0 ? 0 : 1)) as Registro["f"]; if (nivel === 2 && a.rever) r.rever = Math.min(a.rever, agora + DIA); }
    else {
      r.f = Math.max(a.f, Math.min(2, nivel + 1)) as Registro["f"];
      if (nivel >= 1) r.ok++;
      if (nivel === 2) { r.n = a.n + 1; r.rever = agora + DEGRAUS[Math.min(r.n, DEGRAUS.length) - 1] * DIA; }
    }
    return { itens: { ...s.itens, [k]: r } };
  }),
  fecharDia: (d) => set((s) => {
    if (s.dia?.data === d.data) return { dia: d, diaEm: Date.now() };
    const ontem = hoje(new Date(Date.now() - DIA));
    return { dia: d, sequencia: s.dia?.data === ontem ? s.sequencia + 1 : 1, diaEm: Date.now() };
  }),
}), {
  name: "conduta-treino", version: 2,
  partialize: (s) => ({ itens: s.itens, dia: s.dia, sequencia: s.sequencia, diaEm: s.diaEm }) as Estado,
  // v1 guardava por nível ("ossos-cranio-1/frontal"); agora é por região ("ossos-cranio/frontal")
  migrate: (p, v) => {
    const x = (p || {}) as Partial<Estado>;
    if (v >= 2) return x as Estado;
    const itens: Record<string, Registro> = {};
    for (const [k, r] of Object.entries(x.itens || {})) itens[k.replace(/-\d+\//, "/")] = { ...r, f: r.n > 0 ? 2 : 1 };
    return { itens, dia: null, sequencia: x.sequencia ?? 0, diaEm: 0 } as unknown as Estado;
  },
}));

// outra aba treinou: recarrega daqui
if (typeof window !== "undefined") addEventListener("storage", (e: StorageEvent) => { if (e.key === "conduta-treino") void useTreino.persist.rehydrate(); });
