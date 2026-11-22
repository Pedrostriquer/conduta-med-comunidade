/* "Todo dia que eu bater a meta": quando os cards do dia chegam na meta, pede a análise uma vez. O servidor confere se o modo está
   ligado, se já rodou hoje e se há crédito; se não for o caso, responde sem gastar nada. */
import { useEffect } from "react";
import { apiPost } from "../../api/client";
import { today } from "../../lib/format";
import { cardsPerDay, useCardsDone, useGoals } from "../../state/goals";
import { flushBeforeLeaving } from "../../sync/engine";

const KEY = "conduta-ia-auto";
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (d: string) => { try { localStorage.setItem(KEY, d); } catch { /* sem armazenamento: o servidor ainda segura uma por dia */ } };

export function useFlashAuto() {
  const done = useCardsDone((s) => s.byDay.get(today()) || 0);
  const goal = useGoals((s) => cardsPerDay(s.cardGoals) || s.minimo.cards);
  useEffect(() => {
    if (!goal || done < goal || read() === today()) return;
    write(today());
    void flushBeforeLeaving(8000).then(() => apiPost("/ia/flashcards", { auto: true })).catch(() => { /* amanhã tenta de novo */ });
  }, [done, goal]);
}
