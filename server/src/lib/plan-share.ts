/* O cronograma que uma pessoa mostra aos outros: só os campos do contrato, tirados do que o sync guardou. */
import { q } from "../db";

type PlanData = { exame?: string; banca?: string; data?: string; inicio?: string; dias?: number[]; meta?: number; simulado?: unknown; criadoEm?: number };
type GoalsData = { prefs?: Record<string, unknown> };

export async function sharedPlan(userId: string) {
  const rows = await q<{ coll: string; data: unknown; at: number }>("SELECT coll, data, client_at AS at FROM user_records WHERE user_id = $1 AND coll = ANY('{plan,goals}') AND id = 'main' AND NOT deleted", [userId]);
  const planRow = rows.find((r) => r.coll === "plan"), goalsRow = rows.find((r) => r.coll === "goals");
  const plan = planRow?.data as PlanData | null | undefined;
  if (!plan || typeof plan !== "object") return null;
  const goals = goalsRow?.data as GoalsData | null | undefined;
  return {
    exame: plan.exame ?? "", banca: plan.banca ?? "", data: plan.data ?? "", inicio: plan.inicio ?? "", dias: plan.dias ?? [], meta: plan.meta ?? 0, simulado: plan.simulado ?? null,
    prefs: goals?.prefs?.[String(plan.criadoEm)] ?? null, updatedAt: Math.max(planRow!.at, goalsRow?.at ?? 0),
  };
}
