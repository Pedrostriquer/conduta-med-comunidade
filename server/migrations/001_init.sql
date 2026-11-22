-- Conduta Med: esquema inicial. Tudo em português nos valores que aparecem para o usuário.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent não é IMMUTABLE; este invólucro permite usá-lo em índice
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

/* ---------- contas ---------- */
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  password_hash  text,
  google_sub     text UNIQUE,                -- login com Google entra depois
  name           text NOT NULL,
  handle         text NOT NULL,              -- @usuario, minúsculo: a-z 0-9 . _
  bio            text NOT NULL DEFAULT '',
  faculdade      text,
  semestre       smallint CHECK (semestre BETWEEN 1 AND 12),
  formado        boolean NOT NULL DEFAULT false,
  cidade         text,
  avatar_url     text,
  -- publico: tudo que a pessoa escolheu mostrar | seguidores: na busca só nome e @, o resto para quem ela aceitou | privado: fora da busca
  visibility     text NOT NULL DEFAULT 'seguidores' CHECK (visibility IN ('publico','seguidores','privado')),
  show_stats     boolean NOT NULL DEFAULT true,
  show_faculdade boolean NOT NULL DEFAULT true,
  show_activity  boolean NOT NULL DEFAULT true,
  share_plan     text NOT NULL DEFAULT 'privado' CHECK (share_plan IN ('privado','seguidores','publico')),
  role           text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  -- contadores do perfil, mantidos ao receber o sync
  total_questions integer NOT NULL DEFAULT 0,
  total_correct   integer NOT NULL DEFAULT 0,
  total_cards     integer NOT NULL DEFAULT 0,
  -- plugin: aceita entrar pelo modo de conta compartilhada
  shared_mode    boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE UNIQUE INDEX users_handle_key ON users (lower(handle));
CREATE INDEX users_search_idx ON users USING gin ((f_unaccent(lower(name || ' ' || handle || ' ' || coalesce(faculdade,'')))) gin_trgm_ops);

CREATE TABLE sessions (
  token_hash   bytea PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE password_resets (
  token_hash bytea PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

/* ---------- sincronização: tudo que o app guarda localmente vira registro aqui ---------- */
CREATE SEQUENCE sync_seq;
CREATE TABLE user_records (
  user_id   uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  coll      text NOT NULL,
  id        text NOT NULL,
  data      jsonb,
  deleted   boolean NOT NULL DEFAULT false,
  client_at bigint NOT NULL,                  -- última escrita ganha (ms)
  origin    text NOT NULL DEFAULT 'app' CHECK (origin IN ('app','ia')),
  seq       bigint NOT NULL DEFAULT nextval('sync_seq'),
  PRIMARY KEY (user_id, coll, id)
);
CREATE INDEX user_records_seq_idx ON user_records (user_id, seq);
CREATE INDEX user_records_coll_idx ON user_records (user_id, coll) WHERE NOT deleted;

-- atividade por dia (fuso de São Paulo): gráfico do perfil e sequência
CREATE TABLE user_days (
  user_id   uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  day       date NOT NULL,
  questions integer NOT NULL DEFAULT 0,
  correct   integer NOT NULL DEFAULT 0,
  cards     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

/* ---------- comunidade nas questões ---------- */
CREATE TABLE comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qid        text NOT NULL,
  user_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  parent_id  uuid REFERENCES comments ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  likes      integer NOT NULL DEFAULT 0,
  replies    integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at  timestamptz,
  deleted_at timestamptz,
  hidden_at  timestamptz                     -- escondido pelo admin
);
CREATE INDEX comments_qid_idx ON comments (qid, created_at DESC) WHERE deleted_at IS NULL AND hidden_at IS NULL;
CREATE INDEX comments_parent_idx ON comments (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX comments_user_idx ON comments (user_id, created_at DESC);

CREATE TABLE comment_likes (
  comment_id uuid NOT NULL REFERENCES comments ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

-- marcar a questão: desatualizada, com problema no enunciado, gabarito suspeito, imagem ruim ou outro motivo
CREATE TABLE question_flags (
  qid        text NOT NULL,
  user_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  reason     text NOT NULL CHECK (reason IN ('desatualizada','problema','gabarito','imagem','outro')),
  note       text NOT NULL DEFAULT '',
  status     text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','visto','resolvido','descartado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (qid, user_id, reason)
);
CREATE INDEX question_flags_qid_idx ON question_flags (qid);
CREATE INDEX question_flags_status_idx ON question_flags (status, created_at DESC);

CREATE TABLE reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind text NOT NULL CHECK (target_kind IN ('comment','user','doc','deck')),
  target_id   text NOT NULL,
  user_id     uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  reason      text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','resolvido','descartado')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_kind, target_id, user_id)
);

/* ---------- pessoas ---------- */
CREATE TABLE follows (
  follower_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aceito')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz,
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX follows_followee_idx ON follows (followee_id, status);

/* ---------- resumos: pastas dentro de pastas e documentos ---------- */
CREATE TABLE docs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  parent_id   uuid REFERENCES docs ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('pasta','doc')),
  title       text NOT NULL DEFAULT '',
  icon        text,
  content     jsonb,                          -- documento do editor (ProseMirror/Tiptap JSON)
  plain       text NOT NULL DEFAULT '',       -- texto corrido para a busca
  position    double precision NOT NULL DEFAULT 0,
  -- compartilhar: vale para a pasta e tudo dentro dela
  visibility  text NOT NULL DEFAULT 'privado' CHECK (visibility IN ('privado','seguidores','publico')),
  version     integer NOT NULL DEFAULT 1,
  origin      text NOT NULL DEFAULT 'app' CHECK (origin IN ('app','ia')),
  copied_from uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz                     -- lixeira: 30 dias
);
CREATE INDEX docs_tree_idx ON docs (user_id, parent_id, position) WHERE deleted_at IS NULL;
CREATE INDEX docs_shared_idx ON docs (user_id) WHERE visibility <> 'privado' AND deleted_at IS NULL;
CREATE INDEX docs_search_idx ON docs USING gin (to_tsvector('portuguese', f_unaccent(title || ' ' || plain))) WHERE deleted_at IS NULL;

CREATE TABLE uploads (
  hash       text NOT NULL,
  user_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('doc','avatar','fc')),
  ext        text NOT NULL,
  bytes      integer NOT NULL,
  width      integer,
  height     integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hash)
);

/* ---------- baralhos compartilhados ---------- */
CREATE TABLE shared_decks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  local_deck  text NOT NULL,                  -- id do baralho no app de quem publicou
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  tags        text[] NOT NULL DEFAULT '{}',
  visibility  text NOT NULL DEFAULT 'publico' CHECK (visibility IN ('publico','seguidores','link')),
  version     integer NOT NULL DEFAULT 1,
  cards_count integer NOT NULL DEFAULT 0,
  subscribers integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  removed_at  timestamptz,
  UNIQUE (owner_id, local_deck)
);
CREATE INDEX shared_decks_search_idx ON shared_decks USING gin ((f_unaccent(lower(name || ' ' || description))) gin_trgm_ops);

CREATE TABLE shared_deck_versions (
  deck_id    uuid NOT NULL REFERENCES shared_decks ON DELETE CASCADE,
  version    integer NOT NULL,
  cards      jsonb NOT NULL,                  -- [{key, kind, fields, ord, path, tags}]
  media      jsonb NOT NULL DEFAULT '{}',     -- {nome do arquivo: hash.ext}
  note       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deck_id, version)
);

CREATE TABLE deck_subscriptions (
  deck_id      uuid NOT NULL REFERENCES shared_decks ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  local_deck   text NOT NULL,
  seen_version integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deck_id, user_id)
);
CREATE INDEX deck_subscriptions_user_idx ON deck_subscriptions (user_id);

/* ---------- suporte ---------- */
CREATE TABLE feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users ON DELETE SET NULL,
  kind       text NOT NULL CHECK (kind IN ('sugestao','prova','problema','senha','outro')),
  title      text NOT NULL DEFAULT '',
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000),
  source     text NOT NULL DEFAULT 'app' CHECK (source IN ('app','plugin')),
  status     text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','lendo','feito','recusado')),
  reply      text,
  replied_at timestamptz,
  meta       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_user_idx ON feedback (user_id, created_at DESC);
CREATE INDEX feedback_status_idx ON feedback (status, created_at DESC);

/* ---------- plugin (MCP) e OAuth ---------- */
CREATE TABLE oauth_clients (
  client_id     text PRIMARY KEY,
  client_name   text NOT NULL DEFAULT 'IA',
  redirect_uris text[] NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE oauth_codes (
  code_hash      bytea PRIMARY KEY,
  client_id      text NOT NULL REFERENCES oauth_clients ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  redirect_uri   text NOT NULL,
  code_challenge text NOT NULL,
  scope          text NOT NULL DEFAULT '',
  resource       text,
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz
);

-- conexão normal: tokens do OAuth e tokens pessoais (para quem usa Claude Code, Cursor etc.)
CREATE TABLE mcp_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('access','refresh','pessoal')),
  token_hash   bytea NOT NULL UNIQUE,
  client_id    text REFERENCES oauth_clients ON DELETE CASCADE,
  label        text NOT NULL DEFAULT '',
  scope        text NOT NULL DEFAULT '',
  family       uuid NOT NULL DEFAULT gen_random_uuid(),   -- rotação do refresh: revoga a família se reusado
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX mcp_tokens_user_idx ON mcp_tokens (user_id) WHERE revoked_at IS NULL;

-- conta compartilhada: o código que muda (um por pessoa; uso único, vale 10 minutos)
CREATE TABLE mcp_access_codes (
  user_id    uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  code       text NOT NULL,
  expires_at timestamptz NOT NULL,
  failures   integer NOT NULL DEFAULT 0,
  locked_until timestamptz
);

-- conta compartilhada: sessão de um chat. 2 h sem usar ou 24 h no total pedem um código novo
CREATE TABLE mcp_shared_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   bytea NOT NULL UNIQUE,
  user_id      uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  ended_at     timestamptz
);
CREATE INDEX mcp_shared_sessions_user_idx ON mcp_shared_sessions (user_id, created_at DESC);

-- o que a IA fez: aparece na página do plugin
CREATE TABLE mcp_audit (
  id      bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  tool    text NOT NULL,
  mode    text NOT NULL CHECK (mode IN ('normal','compartilhado')),
  writes  boolean NOT NULL DEFAULT false,
  ok      boolean NOT NULL DEFAULT true,
  ms      integer NOT NULL DEFAULT 0,
  summary text NOT NULL DEFAULT '',
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mcp_audit_user_idx ON mcp_audit (user_id, at DESC);
