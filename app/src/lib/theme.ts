/* Tema: segue o sistema por padrão; em Ajustes dá para fixar claro ou escuro. */
import { usePrefs } from "../state/prefs";
import type { ThemePref } from "../state/prefs";

const mq = () => matchMedia("(prefers-color-scheme: dark)");

export function applyTheme(pref: ThemePref) {
  const dark = pref === "escuro" || (pref === "sistema" && mq().matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0a0c10" : "#f4f6f8");
}

export function followSystemTheme() {
  applyTheme(usePrefs.getState().tema);
  mq().addEventListener("change", () => applyTheme(usePrefs.getState().tema));
  usePrefs.subscribe((s, prev) => { if (s.tema !== prev.tema) applyTheme(s.tema); });
}
