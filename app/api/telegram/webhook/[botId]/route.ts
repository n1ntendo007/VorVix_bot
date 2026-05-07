import { NextRequest, NextResponse } from "next/server";
import { decryptText } from "@/lib/crypto";
import { sql } from "@/lib/db";
import {
  answerFlowCallback,
  clearChatWaitingState,
  flowMatchesText,
  Flow,
  getButtonReply,
  getChatWaitingState,
  runFlow,
  saveSubscriberVariable,
  upsertSubscriber
} from "@/lib/flow-engine";
import { sendTelegramMessage } from "@/lib/telegram";

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
    from?: {
      first_name?: string;
      username?: string;
    };
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: {
      first_name?: string;
      username?: string;
    };
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

  return result.rows.find((flow: FlowMatchRow) => flowMatchesText(flow, text)) || null;
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
      await answerFlowCallback(token, callback.id, "Цепочка не найдена").catch(() => undefined);
      return NextResponse.json({ ok: true, matched: false });
    }

    const context = await upsertSubscriber(params.botId, chatId, {
      firstName: callback.from?.first_name,
      username: callback.from?.username,
      lastMessage: ""
    });

    await answerFlowCallback(token, callback.id).catch(() => undefined);
    const sent = await runFlow(token, params.botId, flowId, chatId, context);
    return NextResponse.json({ ok: true, matched: true, flow_id: flowId, sent });
  }

  if (callback?.id && callbackData.startsWith("reply:")) {
    const [, stepId, indexText] = callbackData.split(":");
    const buttonIndex = Number(indexText);
    const chatId = callback.message?.chat?.id;

    if (chatId === undefined || !stepId || !Number.isFinite(buttonIndex)) {
      await answerFlowCallback(token, callback.id, "Ошибка кнопки").catch(() => undefined);
      return NextResponse.json({ ok: true, matched: false });
    }

    const reply = await getButtonReply(params.botId, stepId, buttonIndex);
    await answerFlowCallback(token, callback.id, reply ? "Отправляю..." : "Ответ не найден").catch(() => undefined);

    if (reply?.payload) {
      await sendTelegramMessage(token, chatId, reply.payload);
      return NextResponse.json({ ok: true, matched: true, sent: 1 });
    }

    return NextResponse.json({ ok: true, matched: false });
  }

  const text = update?.message?.text?.trim();
  const chatId = update?.message?.chat?.id;

  if (!text || chatId === undefined) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let context = await upsertSubscriber(params.botId, chatId, {
    firstName: update?.message?.from?.first_name,
    username: update?.message?.from?.username,
    lastMessage: text
  });

  const waitingState = await getChatWaitingState(params.botId, chatId);

  if (waitingState?.waiting_flow_id && (await flowBelongsToBot(params.botId, waitingState.waiting_flow_id))) {
    context = await saveSubscriberVariable(params.botId, chatId, waitingState.save_as || "answer", text);
    await clearChatWaitingState(params.botId, chatId);
    const sent = await runFlow(token, params.botId, waitingState.waiting_flow_id, chatId, context);
    return NextResponse.json({ ok: true, matched: true, waiting: true, flow_id: waitingState.waiting_flow_id, sent });
  }

  const flow = await findMatchingFlow(params.botId, text);

  if (!flow) {
    return NextResponse.json({ ok: true, matched: false });
  }

  try {
    const sent = await runFlow(token, params.botId, flow.id, chatId, context);
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
  return NextResponse.json({ ok: true, message: "VorVix_bot webhook v3 is alive." });
}
