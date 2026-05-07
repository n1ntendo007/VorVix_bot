export type TelegramBotInfo = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

export type InlineButton = {
  text: string;
  type: "url" | "flow" | "reply";
  url?: string;
  flowId?: string;
  payload?: string;
  row?: number;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type ReplyMarkup = {
  inline_keyboard: Array<Array<Record<string, string>>>;
};

async function callTelegram<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>
): Promise<TelegramApiResponse<T>> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });

  const data = (await response.json()) as TelegramApiResponse<T>;

  if (!data.ok) {
    return {
      ok: false,
      description: data.description || `Telegram API error: ${response.status}`
    };
  }

  return data;
}

export function buildReplyMarkup(
  buttons: InlineButton[] | null | undefined,
  stepId?: string
): ReplyMarkup | undefined {
  const rowsMap = new Map<number, Array<Record<string, string>>>();

  (buttons || []).forEach((button, index) => {
    const text = String(button.text || "").trim();
    if (!text) return;

    let telegramButton: Record<string, string> | null = null;

    if (button.type === "url") {
      const url = String(button.url || "").trim();
      if (!/^https?:\/\//i.test(url)) return;
      telegramButton = { text, url };
    }

    if (button.type === "flow") {
      const flowId = String(button.flowId || "").trim();
      if (!flowId) return;
      telegramButton = { text, callback_data: `flow:${flowId}` };
    }

    if (button.type === "reply") {
      if (!stepId) return;
      telegramButton = { text, callback_data: `reply:${stepId}:${index}` };
    }

    if (!telegramButton) return;

    const rowNumber = Number.isFinite(Number(button.row)) ? Number(button.row) : index;
    const row = rowsMap.get(rowNumber) || [];
    row.push(telegramButton);
    rowsMap.set(rowNumber, row);
  });

  const rows = Array.from(rowsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, row]) => row)
    .filter((row) => row.length > 0);

  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
}

export async function getTelegramBotInfo(token: string): Promise<TelegramBotInfo> {
  const data = await callTelegram<TelegramBotInfo>(token, "getMe");

  if (!data.ok || !data.result?.is_bot) {
    throw new Error(data.description || "Telegram bot token is invalid.");
  }

  return data.result;
}

export async function setTelegramWebhook(token: string, url: string): Promise<void> {
  const data = await callTelegram<boolean>(token, "setWebhook", {
    url,
    drop_pending_updates: false,
    allowed_updates: ["message", "callback_query"]
  });

  if (!data.ok) {
    throw new Error(data.description || "Could not set Telegram webhook.");
  }
}

export async function deleteTelegramWebhook(token: string): Promise<void> {
  const data = await callTelegram<boolean>(token, "deleteWebhook", {
    drop_pending_updates: false
  });

  if (!data.ok) {
    throw new Error(data.description || "Could not delete Telegram webhook.");
  }
}

export async function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  text = "Готово"
): Promise<void> {
  const data = await callTelegram<unknown>(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false
  });

  if (!data.ok) {
    throw new Error(data.description || "Could not answer callback query.");
  }
}

export async function sendTelegramMessage(
  token: string,
  chatId: number | string,
  text: string,
  buttons?: InlineButton[],
  stepId?: string
): Promise<void> {
  const data = await callTelegram<unknown>(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
    reply_markup: buildReplyMarkup(buttons, stepId)
  });

  if (!data.ok) {
    throw new Error(data.description || "Could not send Telegram message.");
  }
}

export async function sendTelegramPhoto(
  token: string,
  chatId: number | string,
  photo: string,
  caption?: string,
  buttons?: InlineButton[],
  stepId?: string
): Promise<void> {
  const data = await callTelegram<unknown>(token, "sendPhoto", {
    chat_id: chatId,
    photo,
    caption: caption || undefined,
    parse_mode: caption ? "HTML" : undefined,
    reply_markup: buildReplyMarkup(buttons, stepId)
  });

  if (!data.ok) {
    throw new Error(data.description || "Could not send Telegram photo.");
  }
}

export async function sendTelegramVideo(
  token: string,
  chatId: number | string,
  video: string,
  caption?: string,
  buttons?: InlineButton[],
  stepId?: string
): Promise<void> {
  const data = await callTelegram<unknown>(token, "sendVideo", {
    chat_id: chatId,
    video,
    caption: caption || undefined,
    parse_mode: caption ? "HTML" : undefined,
    reply_markup: buildReplyMarkup(buttons, stepId)
  });

  if (!data.ok) {
    throw new Error(data.description || "Could not send Telegram video.");
  }
}

export async function sendTelegramDocument(
  token: string,
  chatId: number | string,
  document: string,
  caption?: string,
  buttons?: InlineButton[],
  stepId?: string
): Promise<void> {
  const data = await callTelegram<unknown>(token, "sendDocument", {
    chat_id: chatId,
    document,
    caption: caption || undefined,
    parse_mode: caption ? "HTML" : undefined,
    reply_markup: buildReplyMarkup(buttons, stepId)
  });

  if (!data.ok) {
    throw new Error(data.description || "Could not send Telegram document.");
  }
}

export async function sendTelegramAudio(
  token: string,
  chatId: number | string,
  audio: string,
  caption?: string,
  buttons?: InlineButton[],
  stepId?: string
): Promise<void> {
  const data = await callTelegram<unknown>(token, "sendAudio", {
    chat_id: chatId,
    audio,
    caption: caption || undefined,
    parse_mode: caption ? "HTML" : undefined,
    reply_markup: buildReplyMarkup(buttons, stepId)
  });

  if (!data.ok) {
    throw new Error(data.description || "Could not send Telegram audio.");
  }
}

export async function sendTelegramVoice(
  token: string,
  chatId: number | string,
  voice: string,
  caption?: string,
  buttons?: InlineButton[],
  stepId?: string
): Promise<void> {
  const data = await callTelegram<unknown>(token, "sendVoice", {
    chat_id: chatId,
    voice,
    caption: caption || undefined,
    parse_mode: caption ? "HTML" : undefined,
    reply_markup: buildReplyMarkup(buttons, stepId)
  });

  if (!data.ok) {
    throw new Error(data.description || "Could not send Telegram voice.");
  }
}

export async function sendTelegramAnimation(
  token: string,
  chatId: number | string,
  animation: string,
  caption?: string,
  buttons?: InlineButton[],
  stepId?: string
): Promise<void> {
  const data = await callTelegram<unknown>(token, "sendAnimation", {
    chat_id: chatId,
    animation,
    caption: caption || undefined,
    parse_mode: caption ? "HTML" : undefined,
    reply_markup: buildReplyMarkup(buttons, stepId)
  });

  if (!data.ok) {
    throw new Error(data.description || "Could not send Telegram animation.");
  }
}
