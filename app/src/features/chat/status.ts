/* Se o chat de IA está ligado para esta pessoa: decide se a entrada aparece no menu. Uma consulta por sessão do app. */
import { useEffect, useState } from "react";
import { apiGet } from "../../api/client";

let cache: Promise<boolean> | null = null;
/** a entrada some só quando o chat não foi ligado; sem crédito ou no limite do dia ela continua lá, com o aviso na tela */
const load = () => (cache ??= apiGet<{ available: boolean; reason: string | null }>("/chat").then((s) => s.available || (s.reason !== "desligado" && s.reason !== "sem_fonte"), () => false));
export const invalidateChatStatus = () => { cache = null; };

export function useChatOn(signedIn: boolean) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!signedIn) { setOn(false); return; }
    let alive = true;
    void load().then((v) => { if (alive) setOn(v); });
    return () => { alive = false; };
  }, [signedIn]);
  return on;
}
