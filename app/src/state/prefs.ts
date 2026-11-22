/* Preferências que não mexem no estudo. Hoje só o tema: lembretes voltam quando houver como enviá-los de verdade, e a
   privacidade do perfil mora na conta (/perfil/editar). */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { quietly } from "./quiet";

export type ThemePref = "sistema" | "claro" | "escuro";

export type Prefs = { tema: ThemePref };

export const DEFAULT_PREFS: Prefs = { tema: "sistema" };

type PrefsState = Prefs & {
  setPrefs: (p: Partial<Prefs>) => void;
  resetPrefs: () => void;
};

export const usePrefs = create<PrefsState>()(persist((set) => ({
  ...DEFAULT_PREFS,
  setPrefs: (p) => set(p),
  resetPrefs: () => set(DEFAULT_PREFS),
}), {
  name: "conduta-prefs",
  version: 1,
  partialize: (s) => ({ tema: s.tema }) as PrefsState,
  // versões antigas guardavam lembretes e o perfil público aqui: só o tema continua
  merge: (p, cur) => ({ ...cur, tema: (p as Partial<Prefs> | undefined)?.tema ?? cur.tema }),
}));

// outra aba mudou as preferências (o tema, por exemplo): recarrega daqui
if (typeof window !== "undefined") addEventListener("storage", (e: StorageEvent) => { if (e.key === "conduta-prefs") quietly(() => usePrefs.persist.rehydrate()); });
