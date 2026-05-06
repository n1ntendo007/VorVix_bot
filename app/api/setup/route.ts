import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const setupSecret = process.env.SETUP_SECRET;
  const secret = request.nextUrl.searchParams.get("secret");

  if (!setupSecret) {
    return NextResponse.json(
      { ok: false, error: "SETUP_SECRET is not configured." },
      { status: 500 }
    );
  }

  if (secret !== setupSecret) {
    return NextResponse.json(
      { ok: false, error: "Invalid setup secret." },
      { status: 403 }
    );
  }

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
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
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS flows (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      trigger_text TEXT NOT NULL DEFAULT '',
      response_text TEXT NOT NULL DEFAULT '',
      match_mode TEXT NOT NULL DEFAULT 'equals',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`ALTER TABLE flows ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Новая цепочка'`;
  await sql`ALTER TABLE flows ALTER COLUMN response_text SET DEFAULT ''`;
  await sql`ALTER TABLE flows ALTER COLUMN trigger_text SET DEFAULT ''`;

  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'flows_match_mode_check'
          AND conrelid = 'flows'::regclass
      ) THEN
        ALTER TABLE flows DROP CONSTRAINT flows_match_mode_check;
      END IF;
    END $$;
  `;

  await sql`
    ALTER TABLE flows
    ADD CONSTRAINT flows_match_mode_check
    CHECK (match_mode IN ('equals', 'contains', 'starts_with', 'command', 'any'))
  `;

  await sql`
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
    )
  `;

  await sql`
    INSERT INTO flow_steps (id, flow_id, type, text, position)
    SELECT md5(random()::text || clock_timestamp()::text), f.id, 'message', f.response_text, 0
    FROM flows f
    WHERE f.response_text <> ''
      AND NOT EXISTS (SELECT 1 FROM flow_steps fs WHERE fs.flow_id = f.id)
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_flows_bot_id ON flows(bot_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_flows_enabled ON flows(bot_id, enabled)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_flow_steps_flow_id ON flow_steps(flow_id, position)`;

  return NextResponse.json({ ok: true, version: "vorvix_bot_v2" });
}
