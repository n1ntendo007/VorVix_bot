export type TelegramBotInfo = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
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
    allowed_updates: ["message"]
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

export async function sendTelegramMessage(
  token: string,
  chatId: number | string,
  text: string
): Promise<void> {
  const data = await callTelegram<unknown>(token, "sendMessage", {
    chat_id: chatId,
    text
  });

  if (!data.ok) {
    throw new Error(data.description || "Could not send Telegram message.");
  }
}
