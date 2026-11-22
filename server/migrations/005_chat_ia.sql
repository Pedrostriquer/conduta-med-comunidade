/* Chat de IA dentro do app: conversas, mensagens e a medição de cada resposta.
   Cada resposta é uma linha de ai_runs (kind 'chat'), com a fonte usada (provider) e se custou dinheiro de API ou saiu de uma assinatura. */

ALTER TABLE ai_runs DROP CONSTRAINT ai_runs_kind_check;
ALTER TABLE ai_runs ADD CONSTRAINT ai_runs_kind_check CHECK (kind IN ('resultado','flashcards','teste','chat'));
ALTER TABLE ai_runs
  ADD COLUMN provider   text NOT NULL DEFAULT 'anthropic_api',
  /* 'api': cost_usd foi cobrado de verdade. 'assinatura': cost_usd é quanto custaria na API (não saiu dinheiro) */
  ADD COLUMN billing    text NOT NULL DEFAULT 'api' CHECK (billing IN ('api','assinatura')),
  ADD COLUMN chat_id    uuid,
  /* idas ao modelo e ferramentas chamadas para montar uma resposta */
  ADD COLUMN rounds     integer NOT NULL DEFAULT 0,
  ADD COLUMN tool_calls integer NOT NULL DEFAULT 0;
CREATE INDEX ai_runs_chat_idx ON ai_runs (chat_id, created_at) WHERE chat_id IS NOT NULL;

/* por pessoa: nulo segue o padrão do painel */
ALTER TABLE ai_user
  ADD COLUMN chat_enabled  boolean,
  ADD COLUMN chat_provider text,
  ADD COLUMN chat_model    text,
  /* teto de mensagens por dia, além do crédito do mês */
  ADD COLUMN chat_daily    integer;

CREATE TABLE ai_chats (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  title      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX ai_chats_user_idx ON ai_chats (user_id, updated_at DESC) WHERE deleted_at IS NULL;

/* blocks: texto, chamadas de ferramenta e resultados, no formato comum a todas as fontes (ver ia/providers.ts) */
CREATE TABLE ai_chat_messages (
  id         bigserial PRIMARY KEY,
  chat_id    uuid NOT NULL REFERENCES ai_chats ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user','assistant')),
  blocks     jsonb NOT NULL,
  run_id     uuid REFERENCES ai_runs ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_chat_messages_chat_idx ON ai_chat_messages (chat_id, id);

/* as ferramentas chamadas pelo chat do app entram na mesma auditoria das do plugin */
ALTER TABLE mcp_audit DROP CONSTRAINT mcp_audit_mode_check;
ALTER TABLE mcp_audit ADD CONSTRAINT mcp_audit_mode_check CHECK (mode IN ('normal','compartilhado','chat'));
