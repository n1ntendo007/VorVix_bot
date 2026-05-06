import { NextRequest, NextResponse } from "next/server";
import { decryptText } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";

type BotRow = {
  token_encrypted: string;
};

type FlowRow = {
  id: string;
  response_text: string;
};

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: {
      id?: number | string;
    };
  };
};

export async function POST(
  request: NextRequest,
  { params }: { params: { botId: string } }
) {
  const secret = request.nextUrl.searchParams.get("secret") || "";

  const botResult = await sql<BotRow>`
    SELECT token_encrypted
    FROM bots
    WHERE id = ${params.botId}
      AND webhook_secret = ${secret}
      AND is_active = TRUE
    LIMIT 1
  `;

  const bot = botResult.rows[0];

  if (!bot) {
    return NextResponse.json({ ok: false, error: "Bot not found." }, { status: 404 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const text = update?.message?.text?.trim();
  const chatId = update?.message?.chat?.id;

  if (!text || chatId === undefined) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const flowResult = await sql<FlowRow>`
    SELECT id, response_text
    FROM flows
    WHERE bot_id = ${params.botId}
      AND enabled = TRUE
      AND (
        (match_mode = 'equals' AND LOWER(trigger_text) = LOWER(${text}))
        OR
        (match_mode = 'contains' AND LOWER(${text}) LIKE '%' || LOWER(trigger_text) || '%')
      )
    ORDER BY position ASC, created_at ASC
    LIMIT 1
  `;

  const flow = flowResult.rows[0];

  if (!flow) {
    return NextResponse.json({ ok: true, matched: false });
  }

  try {
    await sendTelegramMessage(decryptText(bot.token_encrypted), chatId, flow.response_text);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Telegram send error."
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, matched: true, flow_id: flow.id });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "VorVix_bot webhook is alive." });
}
