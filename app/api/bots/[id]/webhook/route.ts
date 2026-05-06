import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { decryptText } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { setTelegramWebhook } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireSession(request);

  const result = await sql<{ token_encrypted: string; webhook_secret: string }>`
    SELECT token_encrypted, webhook_secret
    FROM bots
    WHERE id = ${params.id} AND user_id = ${session.userId}
    LIMIT 1
  `;

  const bot = result.rows[0];

  if (!bot) {
    return NextResponse.json({ ok: false, error: "Бот не найден." }, { status: 404 });
  }

  const appUrl = process.env.APP_URL?.replace(/\/$/, "");

  if (!appUrl) {
    return NextResponse.json(
      { ok: false, error: "APP_URL не указан в Vercel Environment Variables." },
      { status: 500 }
    );
  }

  try {
    await setTelegramWebhook(
      decryptText(bot.token_encrypted),
      `${appUrl}/api/telegram/webhook/${params.id}?secret=${bot.webhook_secret}`
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Не удалось обновить webhook." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
