/* Índices para o painel de administração separado (pasta admin/). Só índices: nenhuma tabela ou coluna muda.
   Cada um atende uma consulta de routes/admin-painel.ts que filtra por período ou por pessoa. */

-- contas novas por dia
CREATE INDEX IF NOT EXISTS users_created_idx ON users (created_at);
-- busca por e-mail na lista de pessoas (nome e @ já têm users_search_idx)
CREATE INDEX IF NOT EXISTS users_email_trgm_idx ON users USING gin (lower(email) gin_trgm_ops);

-- contas ativas, questões, cards e tempo de uso por dia
CREATE INDEX IF NOT EXISTS usage_days_day_idx ON usage_days (day);
CREATE INDEX IF NOT EXISTS user_days_day_idx ON user_days (day);

-- resumos criados por dia
CREATE INDEX IF NOT EXISTS docs_created_idx ON docs (created_at) WHERE kind = 'doc';

-- Sua IA / MCP: chamadas por hora, tokens emitidos e sessões compartilhadas por data
CREATE INDEX IF NOT EXISTS mcp_audit_at_idx ON mcp_audit (at);
CREATE INDEX IF NOT EXISTS mcp_tokens_created_idx ON mcp_tokens (created_at DESC);
CREATE INDEX IF NOT EXISTS mcp_tokens_user_all_idx ON mcp_tokens (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mcp_shared_sessions_created_idx ON mcp_shared_sessions (created_at DESC);

-- denúncias feitas por uma pessoa
CREATE INDEX IF NOT EXISTS reports_user_idx ON reports (user_id, created_at DESC);
