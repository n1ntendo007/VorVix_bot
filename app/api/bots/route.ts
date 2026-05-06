import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { encryptText, maskSecret } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { getTelegramBotInfo, setTelegramWebhook } from "@/lib/telegram";

export const runtime = "nodejs";

type BotRow = {
  id: string;
  name: string;
  tg_username: string | null;
  token_hint: string;
  is_active: boolean;
  created_at: string;
};

export async function GET(request: NextRequest) {
  const session = await requireSession(request);

  const result = await sql<BotRow>`
    SELECT id, name, tg_username, token_hint, is_active, created_at::text
    FROM bots
    WHERE user_id = ${session.userId}
    ORDER BY created_at DESC
  `;

  return NextResponse.json({ ok: true, bots: result.rows });
}

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    token?: string;
  } | null;

  const token = body?.token?.trim() || "";
  const customName = body?.name?.trim() || "";

  if (!token || !token.includes(":")) {
    return NextResponse.json(
      { ok: false, error: "Вставь корректный Telegram bot token." },
      { status: 400 }
    );
  }

  let botInfo;
  try {
    botInfo = await getTelegramBotInfo(token);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Неверный токен Telegram." },
      { status: 400 }
    );
  }

  const id = randomUUID();
  const webhookSecret = randomBytes(18).toString("hex");
  const name = customName || botInfo.first_name || `@${botInfo.username || "bot"}`;
  const encryptedToken = encryptText(token);
  const tokenHint = maskSecret(token);

  await sql`
    INSERT INTO bots (
      id,
      user_id,
      name,
      tg_bot_id,
      tg_username,
      token_encrypted,
      token_hint,
      webhook_secret
    )
    VALUES (
      ${id},
      ${session.userId},
      ${name},
      ${String(botInfo.id)},
      ${botInfo.username || null},
      ${encryptedToken},
      ${tokenHint},
      ${webhookSecret}
    )
  `;

  let warning: string | undefined;
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");

  if (appUrl) {
    try {
      await setTelegramWebhook(
        token,
        `${appUrl}/api/telegram/webhook/${id}?secret=${webhookSecret}`
      );
    } catch (error) {
      warning = error instanceof Error ? error.message : "Бот добавлен, но webhook не установлен.";
    }
  } else {
    warning = "Бот добавлен, но APP_URL не указан, поэтому webhook не установлен.";
  }

  return NextResponse.json({ ok: true, id, warning });
}
