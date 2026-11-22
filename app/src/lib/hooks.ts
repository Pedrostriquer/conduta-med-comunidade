import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => { const m = matchMedia(query); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => matchMedia(query).matches,
    () => false,
  );
}
/** abaixo de breakpoint-compact (700px): folhas sobem da borda, botões principais ocupam a largura */
export const useCompact = () => useMedia("(max-width: 699px)");
/** a partir de breakpoint-regular (1000px): barra lateral */
export const useRegular = () => useMedia("(min-width: 1000px)");

/** relógio que avança a cada `ms` enquanto `on` */
export function useNow(ms = 1000, on = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, on]);
  return now;
}

/** direção da rolagem da página: encolhe a dock ao descer mais de 4px */
export function useScrollDown(threshold = 4) {
  const [down, setDown] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    last.current = scrollY;
    const on = () => {
      const y = scrollY, d = y - last.current;
      if (y < 24) setDown(false);
      else if (d > threshold) setDown(true);
      else if (d < -threshold) setDown(false);
      if (Math.abs(d) > threshold) last.current = y;
    };
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, [threshold]);
  return down;
}

/** a página passou do título grande? (mostra o título pequeno na barra de vidro) */
export function useScrolledPast(px: number) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const on = () => setPast(scrollY > px);
    on(); addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, [px]);
  return past;
}

export function useKey(handler: (e: KeyboardEvent) => void, on = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!on) return;
    const f = (e: KeyboardEvent) => ref.current(e);
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, [on]);
}
