import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { decryptText } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { getFlowsWithSteps } from "@/lib/flow-engine";
import { deleteTelegramWebhook } from "@/lib/telegram";

export const runtime = "nodejs";

type BotRow = {
  id: string;
  name: string;
  tg_username: string | null;
  token_hint: string;
  is_active: boolean;
};

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireSession(request);

  const botResult = await sql<BotRow>`
    SELECT id, name, tg_username, token_hint, is_active
    FROM bots
    WHERE id = ${params.id} AND user_id = ${session.userId}
    LIMIT 1
  `;

  const bot = botResult.rows[0];

  if (!bot) {
    return NextResponse.json({ ok: false, error: "Бот не найден." }, { status: 404 });
  }

  const flows = await getFlowsWithSteps(params.id);
  return NextResponse.json({ ok: true, bot, flows });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireSession(request);
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    is_active?: boolean;
  } | null;

  const current = await sql<{ id: string }>`
    SELECT id FROM bots WHERE id = ${params.id} AND user_id = ${session.userId} LIMIT 1
  `;

  if (!current.rows[0]) {
    return NextResponse.json({ ok: false, error: "Бот не найден." }, { status: 404 });
  }

  if (typeof body?.name === "string" && body.name.trim().length > 0) {
    await sql`
      UPDATE bots
      SET name = ${body.name.trim()}, updated_at = NOW()
      WHERE id = ${params.id} AND user_id = ${session.userId}
    `;
  }

  if (typeof body?.is_active === "boolean") {
    await sql`
      UPDATE bots
      SET is_active = ${body.is_active}, updated_at = NOW()
      WHERE id = ${params.id} AND user_id = ${session.userId}
    `;
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireSession(request);

  const botResult = await sql<{ token_encrypted: string }>`
    SELECT token_encrypted
    FROM bots
    WHERE id = ${params.id} AND user_id = ${session.userId}
    LIMIT 1
  `;

  const bot = botResult.rows[0];

  if (!bot) {
    return NextResponse.json({ ok: false, error: "Бот не найден." }, { status: 404 });
  }

  try {
    await deleteTelegramWebhook(decryptText(bot.token_encrypted));
  } catch {
    // The bot can still be deleted even if Telegram webhook cleanup fails.
  }

  await sql`DELETE FROM bots WHERE id = ${params.id} AND user_id = ${session.userId}`;

  return NextResponse.json({ ok: true });
}
