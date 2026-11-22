/* As molas e curvas do design system (tokens duration-*, ease-*, spring-*) na linguagem do Motion.
   As molas seguem o SwiftUI (duração percebida + quique), como no tokens.json. */
import type { Transition } from "motion/react";

export const spring = {
  /** sem quique: revelar, abrir folha e diálogo */
  smooth: { type: "spring", visualDuration: 0.45, bounce: 0 } as Transition,
  /** 15% de quique: soltar botão, polegar, próximo cartão, aviso */
  snappy: { type: "spring", visualDuration: 0.35, bounce: 0.15 } as Transition,
  /** 30% de quique: só no acerto e ao concluir o dia */
  bouncy: { type: "spring", visualDuration: 0.5, bounce: 0.3 } as Transition,
};

export const ease = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
};

export const dur = { instant: 0.09, quick: 0.16, base: 0.24, gentle: 0.36, slow: 0.52 };

export const reduceMotion = () => {
  try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

/** toque leve no Android (o Safari do iPhone ignora) */
export function haptic(kind: "tick" | "success" | "error" = "tick") {
  try {
    if (!("vibrate" in navigator)) return;
    navigator.vibrate(kind === "tick" ? 6 : kind === "success" ? 12 : [10, 40, 10]);
  } catch { /* sem vibração */ }
}

export const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
};
