/* Administração: segredos e ajustes, uso da plataforma, saúde do servidor e a IA dentro do app. */

/* ---------- segredos cifrados (chave da API, senha do e-mail) e ajustes gerais ---------- */
CREATE TABLE app_secrets (
  name       text PRIMARY KEY,
  ciphertext bytea NOT NULL,
  iv         bytea NOT NULL,
  tag        bytea NOT NULL,
  hint       text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users ON DELETE SET NULL
);
CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

/* ---------- código de nova senha por e-mail ---------- */
CREATE TABLE password_codes (
  user_id    uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  code_hash  bytea NOT NULL,
  attempts   integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);

/* ---------- uso: cada tela aberta fica 90 dias; o total por dia fica para sempre ---------- */
CREATE TABLE usage_events (
  id      bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  visit   text NOT NULL,
  path    text NOT NULL,
  at      timestamptz NOT NULL,
  ms      integer NOT NULL DEFAULT 0
);
CREATE INDEX usage_events_user_idx ON usage_events (user_id, at DESC);
CREATE INDEX usage_events_at_idx ON usage_events (at);
CREATE TABLE usage_days (
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  day     date NOT NULL,
  ms      bigint NOT NULL DEFAULT 0,
  screens integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

/* ---------- saúde do servidor: uma linha por minuto ---------- */
CREATE TABLE server_minutes (
  minute   timestamptz PRIMARY KEY,
  requests integer NOT NULL DEFAULT 0,
  errors   integer NOT NULL DEFAULT 0,
  slow     integer NOT NULL DEFAULT 0,
  ms_total bigint NOT NULL DEFAULT 0,
  ms_max   integer NOT NULL DEFAULT 0,
  mcp      integer NOT NULL DEFAULT 0,
  cpu_pct  real,
  rss_mb   integer,
  mem_pct  real,
  load1    real
);
/* só quem fez muita coisa naquele minuto */
CREATE TABLE server_busy (
  minute   timestamptz NOT NULL,
  user_id  uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  requests integer NOT NULL,
  PRIMARY KEY (minute, user_id)
);
CREATE TABLE server_errors (
  id      bigserial PRIMARY KEY,
  at      timestamptz NOT NULL DEFAULT now(),
  method  text NOT NULL DEFAULT '',
  path    text NOT NULL DEFAULT '',
  status  integer NOT NULL DEFAULT 500,
  message text NOT NULL,
  stack   text,
  user_id uuid REFERENCES users ON DELETE SET NULL
);
CREATE INDEX server_errors_at_idx ON server_errors (at DESC);

/* ---------- espaço de cada pessoa no banco, recalculado pela faxina ---------- */
CREATE TABLE user_storage (
  user_id       uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  records_bytes bigint NOT NULL DEFAULT 0,
  by_coll       jsonb NOT NULL DEFAULT '{}',
  at            timestamptz NOT NULL DEFAULT now()
);

/* ---------- IA dentro do app ---------- */
CREATE TABLE ai_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users ON DELETE SET NULL,
  kind         text NOT NULL CHECK (kind IN ('resultado','flashcards','teste')),
  trigger      text NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual','auto','admin')),
  status       text NOT NULL DEFAULT 'rodando' CHECK (status IN ('rodando','feito','erro')),
  model        text NOT NULL,
  effort       text NOT NULL,
  source       jsonb NOT NULL DEFAULT '{}',
  options      jsonb NOT NULL DEFAULT '{}',
  est_in       integer NOT NULL DEFAULT 0,
  est_out      integer NOT NULL DEFAULT 0,
  est_usd      numeric(10,6) NOT NULL DEFAULT 0,
  /* o pior caso enquanto roda: entra na conta do crédito para ninguém estourar com duas análises ao mesmo tempo */
  reserved_usd numeric(10,6) NOT NULL DEFAULT 0,
  tokens_in    integer NOT NULL DEFAULT 0,
  tokens_out   integer NOT NULL DEFAULT 0,
  cache_read   integer NOT NULL DEFAULT 0,
  cache_write  integer NOT NULL DEFAULT 0,
  cost_usd     numeric(10,6) NOT NULL DEFAULT 0,
  /* teste do admin entra no gasto geral, não no crédito da pessoa */
  charged      boolean NOT NULL DEFAULT true,
  prompt_chars integer NOT NULL DEFAULT 0,
  prompt       text,
  system       text,
  result       jsonb,
  error        text,
  parent       uuid REFERENCES ai_runs ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  ms           integer
);
CREATE INDEX ai_runs_user_idx ON ai_runs (user_id, created_at DESC);
CREATE INDEX ai_runs_created_idx ON ai_runs (created_at DESC);
CREATE INDEX ai_runs_running_idx ON ai_runs (user_id) WHERE status = 'rodando';

CREATE TABLE ai_user (
  user_id     uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  /* limite próprio por mês; nulo segue o padrão */
  monthly_usd numeric(8,2),
  /* crédito a mais só no mês indicado */
  extra_usd   numeric(8,2) NOT NULL DEFAULT 0,
  extra_month text,
  fc_mode     text NOT NULL DEFAULT 'manual' CHECK (fc_mode IN ('desligado','manual','meta')),
  fc_limit    integer NOT NULL DEFAULT 30,
  fc_filter   text NOT NULL DEFAULT 'erros' CHECK (fc_filter IN ('erros','dificeis','todos')),
  fc_pull     integer NOT NULL DEFAULT 10,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
