/* Quantas pessoas pediram para seguir: consulta ao abrir o app e a cada poucos minutos, só com a aba à vista.
   Serve para a bolinha em "Pessoas" e nada mais: seguir não gera notificação. */
import { useEffect } from "react";
import { create } from "zustand";
import { apiGet } from "../../api/client";
import type { PersonCard } from "../../api/types";

export type FollowRequest = PersonCard & { at: number };

export const useRequests = create<{ count: number; set: (n: number) => void; refresh: () => Promise<void> }>()((set) => ({
  count: 0,
  set: (n) => set({ count: n }),
  refresh: async () => {
    try { const { requests } = await apiGet<{ requests: FollowRequest[] }>("/me/follow-requests"); set({ count: requests.length }); }
    catch { /* sem rede ou sem conta: a bolinha fica como está */ }
  },
}));

const EVERY = 5 * 60 * 1000;

export function useRequestsPoll() {
  useEffect(() => {
    const { refresh } = useRequests.getState();
    refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, EVERY);
    return () => clearInterval(t);
  }, []);
}
