/* Faxina periódica: sessões vencidas, códigos usados, auditoria antiga, lixeira de resumos. */
import { pool } from "./db";

const SQL = [
  "DELETE FROM sessions WHERE expires_at < now()",
  "DELETE FROM password_resets WHERE expires_at < now()",
  "DELETE FROM oauth_codes WHERE expires_at < now()",
  "DELETE FROM mcp_access_codes WHERE expires_at < now() AND (locked_until IS NULL OR locked_until < now())",
  "DELETE FROM mcp_shared_sessions WHERE expires_at < now() - interval '7 days'",
  "DELETE FROM mcp_tokens WHERE expires_at < now() - interval '30 days'",
  "DELETE FROM mcp_audit WHERE at < now() - interval '90 days'",
  "DELETE FROM docs WHERE deleted_at < now() - interval '30 days'",
  // cliente registrado que nunca chegou a conectar
  "DELETE FROM oauth_clients c WHERE c.created_at < now() - interval '30 days' AND NOT EXISTS (SELECT 1 FROM mcp_tokens t WHERE t.client_id = c.client_id)",
  "DELETE FROM password_codes WHERE expires_at < now()",
  "DELETE FROM usage_events WHERE at < now() - interval '90 days'",
  "DELETE FROM server_minutes WHERE minute < now() - interval '30 days'",
  "DELETE FROM server_busy WHERE minute < now() - interval '30 days'",
  "DELETE FROM server_errors WHERE at < now() - interval '90 days'",
  // a execução fica para a conta do mês; o texto enviado à IA, 30 dias. De quem apagou a conta, sai tudo que era dela
  "UPDATE ai_runs SET prompt = NULL, system = NULL WHERE prompt IS NOT NULL AND created_at < now() - interval '30 days'",
  "UPDATE ai_runs SET prompt = NULL, system = NULL, result = NULL, source = '{}', options = '{}' WHERE user_id IS NULL AND source <> '{}'",
  `INSERT INTO user_storage (user_id, records_bytes, by_coll, at)
   SELECT user_id, sum(bytes), jsonb_object_agg(coll, bytes), now() FROM (SELECT user_id, coll, sum(pg_column_size(data)) AS bytes FROM user_records WHERE NOT deleted GROUP BY user_id, coll) x GROUP BY user_id
   ON CONFLICT (user_id) DO UPDATE SET records_bytes = EXCLUDED.records_bytes, by_coll = EXCLUDED.by_coll, at = now()`,
];

export function startJobs() {
  const run = async () => { for (const s of SQL) await pool.query(s).catch((e) => console.error("faxina:", e.message)); };
  setTimeout(run, 60_000).unref();
  setInterval(run, 6 * 3_600_000).unref();
}
