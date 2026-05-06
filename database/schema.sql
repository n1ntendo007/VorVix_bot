CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tg_bot_id TEXT,
  tg_username TEXT,
  token_encrypted TEXT NOT NULL,
  token_hint TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flows (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Новая цепочка',
  trigger_text TEXT NOT NULL DEFAULT '',
  response_text TEXT NOT NULL DEFAULT '',
  match_mode TEXT NOT NULL DEFAULT 'equals' CHECK (match_mode IN ('equals', 'contains', 'starts_with', 'command', 'any')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flow_steps (
  id TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('message', 'photo', 'video', 'delay')),
  text TEXT NOT NULL DEFAULT '',
  media_url TEXT NOT NULL DEFAULT '',
  delay_seconds INTEGER NOT NULL DEFAULT 0,
  buttons JSONB NOT NULL DEFAULT '[]'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots(user_id);
CREATE INDEX IF NOT EXISTS idx_flows_bot_id ON flows(bot_id);
CREATE INDEX IF NOT EXISTS idx_flows_enabled ON flows(bot_id, enabled);
CREATE INDEX IF NOT EXISTS idx_flow_steps_flow_id ON flow_steps(flow_id, position);
