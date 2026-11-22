/* Os registros de cada pessoa: o que o app espelha e o que o plugin grava. Toda escrita passa por `applyChanges`,
   que serializa por pessoa (o cursor do sync nunca perde registro), aplica "última escrita ganha" por `at`
   e mantém os contadores do perfil quando chega uma resposta ou uma revisão nova. */
import { one, q, tx } from "./db";
import type { Db } from "./db";

export type Change = { c: string; id: string; data?: unknown; deleted?: boolean; at: number };
export type Origin = "app" | "ia";

export const COLLECTIONS = new Set(["settings", "session", "attempt", "plan", "saved", "qnote", "qtag", "review", "meta", "goals", "prefs", "study", "fc_deck", "fc_card", "fc_revlog", "fc_config", "fc_draft", "fc_media", "treino"]);

/** dia no fuso de São Paulo: é o que a pessoa chama de "hoje" */
const dayOf = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);

export async function applyChanges(userId: string, changes: Change[], origin: Origin = "app") {
  return tx(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [userId]);
    let applied = 0, ignored = 0, questions = 0, correct = 0, cards = 0;
    const days = new Map<string, { q: number; ok: number; c: number }>();
    const bump = (at: number) => { const d = dayOf(at); let x = days.get(d); if (!x) { x = { q: 0, ok: 0, c: 0 }; days.set(d, x); } return x; };

    for (const ch of changes) {
      // apagar o histórico tira o registro dos números do perfil: vale o que estava gravado antes de sumir
      if (ch.deleted && (ch.c === "attempt" || ch.c === "fc_revlog")) {
        const old = await one<{ data: { correct?: boolean; at?: number } | null; at: number }>(
          "SELECT data, client_at AS at FROM user_records WHERE user_id = $1 AND coll = $2 AND id = $3 AND NOT deleted AND client_at <= $4",
          [userId, ch.c, ch.id, Math.round(ch.at)], db,
        );
        if (old) {
          const x = bump(old.data?.at ?? old.at);
          if (ch.c === "attempt") { x.q--; questions--; if (old.data?.correct) { x.ok--; correct--; } }
          else { x.c--; cards--; }
        }
      }
      const r = await db.query<{ inserted: boolean }>(
        `INSERT INTO user_records (user_id, coll, id, data, deleted, client_at, origin)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, coll, id) DO UPDATE
           SET data = EXCLUDED.data, deleted = EXCLUDED.deleted, client_at = EXCLUDED.client_at, origin = EXCLUDED.origin, seq = nextval('sync_seq')
           WHERE user_records.client_at <= EXCLUDED.client_at
         RETURNING (xmax = 0) AS inserted`,
        [userId, ch.c, ch.id, ch.deleted ? null : JSON.stringify(ch.data ?? null), !!ch.deleted, Math.round(ch.at), origin],
      );
      if (!r.rowCount) { ignored++; continue; }
      applied++;
      if (!r.rows[0].inserted || ch.deleted) continue;
      if (ch.c === "attempt") {
        const a = ch.data as { correct?: boolean; at?: number };
        const x = bump(a?.at ?? ch.at); x.q++; questions++;
        if (a?.correct) { x.ok++; correct++; }
      } else if (ch.c === "fc_revlog") {
        const l = ch.data as { at?: number };
        bump(l?.at ?? ch.at).c++; cards++;
      }
    }

    if (days.size) {
      await db.query(
        "UPDATE users SET total_questions = greatest(total_questions + $2, 0), total_correct = greatest(total_correct + $3, 0), total_cards = greatest(total_cards + $4, 0) WHERE id = $1",
        [userId, questions, correct, cards],
      );
      for (const [day, v] of days) {
        await db.query(
          `INSERT INTO user_days (user_id, day, questions, correct, cards) VALUES ($1, $2, greatest($3::int, 0), greatest($4::int, 0), greatest($5::int, 0))
           ON CONFLICT (user_id, day) DO UPDATE SET questions = greatest(user_days.questions + $3, 0), correct = greatest(user_days.correct + $4, 0), cards = greatest(user_days.cards + $5, 0)`,
          [userId, day, v.q, v.ok, v.c],
        );
      }
    }
    const cur = await db.query<{ seq: number | null }>("SELECT max(seq) AS seq FROM user_records WHERE user_id = $1", [userId]);
    return { cursor: cur.rows[0].seq ?? 0, applied, ignored };
  });
}

export async function pullChanges(userId: string, since: number, limit = 1000) {
  const rows = await q<{ c: string; id: string; data: unknown; deleted: boolean; at: number; origin: Origin; seq: number }>(
    `SELECT coll AS c, id, data, deleted, client_at AS at, origin, seq FROM user_records WHERE user_id = $1 AND seq > $2 ORDER BY seq LIMIT $3`,
    [userId, since, limit + 1],
  );
  const more = rows.length > limit;
  if (more) rows.pop();
  return { changes: rows, cursor: rows.length ? rows[rows.length - 1].seq : since, more };
}

/** todos os registros vivos de uma coleção */
export async function listRecords<T = any>(userId: string, coll: string, db?: Db): Promise<{ id: string; data: T; at: number; origin: Origin }[]> {
  return q(`SELECT id, data, client_at AS at, origin FROM user_records WHERE user_id = $1 AND coll = $2 AND NOT deleted`, [userId, coll], db);
}
export async function getRecord<T = any>(userId: string, coll: string, id: string, db?: Db): Promise<T | null> {
  const r = await one<{ data: T }>(`SELECT data FROM user_records WHERE user_id = $1 AND coll = $2 AND id = $3 AND NOT deleted`, [userId, coll, id], db);
  return r ? r.data : null;
}
