/* A conta vem do servidor (sessão por cookie). A cópia guardada aqui só serve para o app abrir sem rede: quem manda é
   `GET /api/auth/me`. `profile` (o que a pessoa contou no onboarding) é estado do estudo e sincroniza como `study`. */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ApiError, apiGet, apiPatch, apiPost } from "../api/client";
import type { Me } from "../api/types";
import type { DayKey } from "../lib/format";
import { flushBeforeLeaving, freezeStorage, guardOwner, startSync, stopSync, wipeLocal } from "../sync/engine";
import { quietly } from "./quiet";
import { useStore } from "./store";

export type Fase = "internato" | "formado" | "residente";
/** o que o estudante contou no onboarding */
export type StudyProfile = { bancas: string[]; prova: DayKey | null; fase: Fase | null };
export type SignUp = { name: string; email: string; password: string; handle?: string };

type AuthState = {
  user: Me | null;
  /** "loading": ainda não sabemos se há sessão e não há cópia guardada */
  status: "loading" | "ready";
  profile: StudyProfile | null;
  boot: () => Promise<void>;
  signIn: (login: string, password: string) => Promise<Me>;
  signUp: (a: SignUp) => Promise<Me>;
  /** senha criada pelo link do suporte (ou da conta que o admin criou): a API já devolve a pessoa com a sessão aberta */
  resetPassword: (token: string, password: string) => Promise<Me>;
  /** tenta enviar o que falta, sai e apaga o que é da pessoa deste navegador. `to`: para onde ir depois */
  signOut: (to?: string) => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  saveMe: (patch: Partial<Me>) => Promise<Me>;
  /** depois de apagar a conta: limpa este navegador e volta para a entrada */
  forgetLocal: () => Promise<void>;
  /** só em desenvolvimento: entra sem conta, para ver o app com os dados de exemplo */
  enterDemo: () => void;
  setProfile: (p: Partial<StudyProfile>) => void;
};

const DEMO_ID = "demo";
const first = (name: string) => name.trim().split(/\s+/)[0] || "";

/** o que toda entrada faz: confere o dono dos dados, guarda a pessoa e liga a sincronização */
async function accept(user: Me, set: (p: Partial<AuthState>) => void): Promise<boolean> {
  if (!(await guardOwner(user.id))) return false;
  set({ user, status: "ready" });
  const st = useStore.getState();
  if (!st.settings.nome && user.name) st.setSettings({ nome: first(user.name) });
  void startSync(user.id);
  return true;
}
/** `guardOwner` apagou tudo e a página vai recarregar: quem chamou fica esperando até lá */
const never = <T,>() => new Promise<T>(() => {});

let booting: Promise<void> | null = null;

export const useAuth = create<AuthState>()(persist((set, get) => ({
  user: null,
  status: "loading",
  profile: null,
  boot: () => {
    if (!booting) {
      booting = (async () => {
        if (get().user) set({ status: "ready" }); // abre logo com a cópia; a resposta abaixo corrige se a sessão acabou
        try {
          const r = await apiGet<{ user: Me | null }>("/auth/me");
          if (r.user) { if (!(await accept(r.user, set))) await never(); }
          else { stopSync(); set({ user: null, status: "ready" }); }
        } catch (e) {
          // sem rede ou servidor fora: segue com a cópia, e sem cópia vai para a entrada
          set({ status: "ready" });
          const u = get().user;
          if (u && !(e instanceof ApiError && e.status === 401)) void startSync(u.id);
        }
      })();
    }
    return booting;
  },
  signIn: async (login, password) => {
    const { user } = await apiPost<{ user: Me }>("/auth/login", { login, password });
    if (!(await accept(user, set))) return never();
    return user;
  },
  signUp: async (a) => {
    const { user } = await apiPost<{ user: Me }>("/auth/signup", a);
    if (!(await accept(user, set))) return never();
    return user;
  },
  resetPassword: async (token, password) => {
    const { user } = await apiPost<{ user: Me }>("/auth/reset", { token, password });
    if (!(await accept(user, set))) return never();
    return user;
  },
  signOut: async (to = "/entrar") => {
    await flushBeforeLeaving();
    await apiPost("/auth/logout").catch(() => { /* sem rede: a sessão expira sozinha; os dados saem daqui de qualquer jeito */ });
    await wipeLocal();
    freezeStorage();
    location.replace(to);
    return never();
  },
  refreshMe: async () => {
    const { user } = await apiGet<{ user: Me | null }>("/auth/me");
    if (user) set({ user });
    else { stopSync(); set({ user: null }); }
    return user;
  },
  saveMe: async (patch) => {
    const { user } = await apiPatch<{ user: Me }>("/me", patch);
    const before = get().user;
    set({ user });
    if (patch.name && before?.name !== user.name) useStore.getState().setSettings({ nome: first(user.name) });
    return user;
  },
  forgetLocal: async () => {
    await wipeLocal();
    freezeStorage();
    location.replace("/entrar");
    return never();
  },
  enterDemo: () => { if (import.meta.env.DEV) set({
    status: "ready",
    user: { id: DEMO_ID, name: "Marina Duarte", handle: "marina.duarte", email: "marina.duarte@exemplo.com", role: "user", bio: "", faculdade: null, semestre: null, formado: false, cidade: null, avatarUrl: null, visibility: "privado", showStats: false, showFaculdade: false, showActivity: false, sharePlan: "privado", totalQuestions: 0, totalCards: 0, sharedMode: false, createdAt: Date.now() },
  }); },
  setProfile: (p) => set((s) => ({ profile: { bancas: [], prova: null, fase: null, ...(s.profile || {}), ...p } })),
}), {
  name: "conduta-auth", version: 2,
  partialize: (s) => ({ user: s.user?.id === DEMO_ID ? null : s.user, profile: s.profile }) as AuthState,
  // v2: a conta simulada de antes não vale mais
  migrate: (p, v) => { const x = (p || {}) as Partial<AuthState>; return { profile: x.profile ?? null, user: v < 2 ? null : x.user ?? null } as AuthState; },
}));

// outra aba gravou o perfil de estudo: recarrega daqui sem mandar de volta
if (typeof window !== "undefined") addEventListener("storage", (e: StorageEvent) => { if (e.key === "conduta-auth") quietly(() => useAuth.persist.rehydrate()); });
