import { NextRequest, NextResponse } from "next/server";
import { decryptText } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { answerFlowCallback, flowMatchesText, Flow, runFlow } from "@/lib/flow-engine";

export const runtime = "nodejs";

type BotRow = {
  token_encrypted: string;
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
  callback_query?: {
    id?: string;
    data?: string;
    message?: {
      chat?: {
        id?: number | string;
      };
    };
  };
};

type FlowMatchRow = Pick<Flow, "id" | "name" | "trigger_text" | "match_mode" | "position" | "enabled" | "response_text">;

async function findMatchingFlow(botId: string, text: string): Promise<FlowMatchRow | null> {
  const result = await sql<FlowMatchRow>`
    SELECT id, name, trigger_text, response_text, match_mode, enabled, position
    FROM flows
    WHERE bot_id = ${botId}
      AND enabled = TRUE
    ORDER BY position ASC, created_at ASC
  `;

  return result.rows.find((flow) => flowMatchesText(flow, text)) || null;
}

async function flowBelongsToBot(botId: string, flowId: string): Promise<boolean> {
  const result = await sql<{ id: string }>`
    SELECT id FROM flows WHERE id = ${flowId} AND bot_id = ${botId} AND enabled = TRUE LIMIT 1
  `;

  return result.rows.length > 0;
}

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

  const token = decryptText(bot.token_encrypted);
  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;

  const callback = update?.callback_query;
  const callbackData = callback?.data || "";

  if (callback?.id && callbackData.startsWith("flow:")) {
    const flowId = callbackData.slice("flow:".length);
    const chatId = callback.message?.chat?.id;

    if (chatId === undefined || !(await flowBelongsToBot(params.botId, flowId))) {
      await answerFlowCallback(token, callback.id).catch(() => undefined);
      return NextResponse.json({ ok: true, matched: false });
    }

    await answerFlowCallback(token, callback.id).catch(() => undefined);
    const sent = await runFlow(token, params.botId, flowId, chatId);
    return NextResponse.json({ ok: true, matched: true, flow_id: flowId, sent });
  }

  const text = update?.message?.text?.trim();
  const chatId = update?.message?.chat?.id;

  if (!text || chatId === undefined) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const flow = await findMatchingFlow(params.botId, text);

  if (!flow) {
    return NextResponse.json({ ok: true, matched: false });
  }

  try {
    const sent = await runFlow(token, params.botId, flow.id, chatId);
    return NextResponse.json({ ok: true, matched: true, flow_id: flow.id, sent });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Telegram send error."
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "VorVix_bot webhook v2 is alive." });
}
