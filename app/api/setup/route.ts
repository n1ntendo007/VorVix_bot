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
      trigger_text TEXT NOT NULL,
      response_text TEXT NOT NULL,
      match_mode TEXT NOT NULL DEFAULT 'equals' CHECK (match_mode IN ('equals', 'contains')),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_flows_bot_id ON flows(bot_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_flows_enabled ON flows(bot_id, enabled)`;

  return NextResponse.json({ ok: true });
}
