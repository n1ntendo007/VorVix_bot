import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import {
  answerCallbackQuery,
  InlineButton,
  sendTelegramAnimation,
  sendTelegramAudio,
  sendTelegramDocument,
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramVideo,
  sendTelegramVoice
} from "@/lib/telegram";

export type MatchMode = "equals" | "contains" | "starts_with" | "command" | "any";
export type StepType =
  | "message"
  | "photo"
  | "video"
  | "document"
  | "audio"
  | "voice"
  | "animation"
  | "delay"
  | "condition"
  | "random"
  | "jump"
  | "question";
export type ConditionMode = "equals" | "contains" | "starts_with" | "any";

export type FlowButton = InlineButton;

export type FlowStep = {
  id: string;
  type: StepType;
  text: string;
  media_url: string;
  delay_seconds: number;
  buttons: FlowButton[];
  position: number;
  condition_mode: ConditionMode;
  condition_value: string;
  true_flow_id: string;
  false_flow_id: string;
  target_flow_id: string;
  save_as: string;
};

export type Flow = {
  id: string;
  name: string;
  trigger_text: string;
  response_text: string;
  match_mode: MatchMode;
  enabled: boolean;
  position: number;
  steps: FlowStep[];
};

type StepRow = Omit<FlowStep, "buttons" | "type" | "condition_mode"> & {
  flow_id?: string;
  type: string;
  condition_mode: string;
  buttons: unknown;
};

type FlowRow = Omit<Flow, "steps" | "match_mode"> & {
  match_mode: string;
};

type FlowBody = {
  name?: unknown;
  trigger_text?: unknown;
  match_mode?: unknown;
  enabled?: unknown;
  steps?: Array<Partial<FlowStep> & { buttons?: unknown }>;
};

type SubscriberContext = {
  firstName?: string;
  username?: string;
  lastMessage?: string;
  variables?: Record<string, string>;
};

const MATCH_MODES = new Set(["equals", "contains", "starts_with", "command", "any"]);
const STEP_TYPES = new Set([
  "message",
  "photo",
  "video",
  "document",
  "audio",
  "voice",
  "animation",
  "delay",
  "condition",
  "random",
  "jump",
  "question"
]);
const CONDITION_MODES = new Set(["equals", "contains", "starts_with", "any"]);

function trimText(value: unknown, max = 4000): string {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeConditionMode(value: unknown): ConditionMode {
  const mode = String(value || "contains");
  return CONDITION_MODES.has(mode) ? (mode as ConditionMode) : "contains";
}

function normalizeButtons(value: unknown): FlowButton[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 24).map((raw, index) => {
    const button = raw as Partial<FlowButton>;
    const type = button.type === "flow" || button.type === "reply" || button.type === "url" ? button.type : "url";
    const row = Number.isFinite(Number(button.row)) ? Math.max(0, Math.min(12, Number(button.row))) : index;

    return {
      text: trimText(button.text, 64) || "Кнопка",
      type,
      url: trimText(button.url, 500),
      flowId: trimText(button.flowId, 120),
      payload: trimText(button.payload, 1000),
      row
    };
  });
}

function normalizeStep(raw: Partial<FlowStep> | null | undefined, index: number): FlowStep {
  const rawType = String(raw?.type || "message");
  const type = STEP_TYPES.has(rawType) ? (rawType as StepType) : "message";
  const text = trimText(raw?.text);
  const mediaUrl = trimText(raw?.media_url, 1200);
  const buttons = normalizeButtons(raw?.buttons);
  const delaySecondsRaw = Number(raw?.delay_seconds ?? 0);
  const delaySeconds = Number.isFinite(delaySecondsRaw)
    ? Math.max(0, Math.min(900, Math.round(delaySecondsRaw)))
    : 0;
  const conditionMode = normalizeConditionMode(raw?.condition_mode);
  const conditionValue = trimText(raw?.condition_value, 500);
  const trueFlowId = trimText(raw?.true_flow_id, 120);
  const falseFlowId = trimText(raw?.false_flow_id, 120);
  const targetFlowId = trimText(raw?.target_flow_id, 120);
  const saveAs = trimText(raw?.save_as, 80).replace(/[^a-zA-Z0-9_а-яА-Я-]/g, "_");

  if (type === "message" && !text && buttons.length === 0) {
    throw new Error(`Блок ${index + 1}: напиши текст сообщения или добавь кнопки.`);
  }

  if (["photo", "video", "document", "audio", "voice", "animation"].includes(type) && !mediaUrl) {
    throw new Error(`Блок ${index + 1}: вставь ссылку или file_id медиа.`);
  }

  if (type === "delay" && delaySeconds < 1) {
    throw new Error(`Блок ${index + 1}: задержка должна быть от 1 секунды.`);
  }

  if (type === "condition" && conditionMode !== "any" && !conditionValue) {
    throw new Error(`Блок ${index + 1}: заполни условие.`);
  }

  if (type === "jump" && !targetFlowId) {
    throw new Error(`Блок ${index + 1}: выбери цепочку для перехода.`);
  }

  if (type === "question" && !text) {
    throw new Error(`Блок ${index + 1}: напиши вопрос пользователю.`);
  }

  if (type === "random" && text.split("\n").map((item) => item.trim()).filter(Boolean).length === 0) {
    throw new Error(`Блок ${index + 1}: добавь варианты случайного сообщения.`);
  }

  return {
    id: trimText(raw?.id, 80) || randomUUID(),
    type,
    text,
    media_url: mediaUrl,
    delay_seconds: delaySeconds,
    buttons,
    position: index,
    condition_mode: conditionMode,
    condition_value: conditionValue,
    true_flow_id: trueFlowId,
    false_flow_id: falseFlowId,
    target_flow_id: targetFlowId,
    save_as: saveAs
  };
}

export function normalizeFlowBody(body: FlowBody | null) {
  const matchMode = MATCH_MODES.has(String(body?.match_mode))
    ? (body?.match_mode as MatchMode)
    : "equals";
  const name = trimText(body?.name, 80) || "Новая цепочка";
  const triggerText = trimText(body?.trigger_text, 200);
  const enabled = typeof body?.enabled === "boolean" ? body.enabled : true;
  const rawSteps = Array.isArray(body?.steps) ? body.steps : [];

  if (matchMode !== "any" && !triggerText) {
    throw new Error("Заполни триггер цепочки.");
  }

  if (rawSteps.length === 0) {
    throw new Error("Добавь хотя бы один блок в цепочку.");
  }

  const steps = rawSteps.map((step, index) => normalizeStep(step, index));
  const responseText = steps.find((step) => step.type === "message" && step.text)?.text || "";

  return {
    name,
    triggerText,
    responseText,
    matchMode,
    enabled,
    steps
  };
}

export async function userOwnsBot(userId: string, botId: string): Promise<boolean> {
  const result = await sql<{ id: string }>`
    SELECT id FROM bots WHERE id = ${botId} AND user_id = ${userId} LIMIT 1
  `;

  return result.rows.length > 0;
}

function rowToStep(row: StepRow): FlowStep {
  return {
    id: row.id,
    type: STEP_TYPES.has(row.type) ? (row.type as StepType) : "message",
    text: row.text || "",
    media_url: row.media_url || "",
    delay_seconds: Number(row.delay_seconds || 0),
    buttons: normalizeButtons(row.buttons),
    position: Number(row.position || 0),
    condition_mode: normalizeConditionMode(row.condition_mode),
    condition_value: row.condition_value || "",
    true_flow_id: row.true_flow_id || "",
    false_flow_id: row.false_flow_id || "",
    target_flow_id: row.target_flow_id || "",
    save_as: row.save_as || ""
  };
}

export async function getFlowsWithSteps(botId: string): Promise<Flow[]> {
  const flowsResult = await sql<FlowRow>`
    SELECT id, name, trigger_text, response_text, match_mode, enabled, position
    FROM flows
    WHERE bot_id = ${botId}
    ORDER BY position ASC, created_at ASC
  `;

  const stepsResult = await sql<StepRow>`
    SELECT id, flow_id, type, text, media_url, delay_seconds, buttons, position,
           condition_mode, condition_value, true_flow_id, false_flow_id, target_flow_id, save_as
    FROM flow_steps
    WHERE flow_id IN (SELECT id FROM flows WHERE bot_id = ${botId})
    ORDER BY position ASC, created_at ASC
  `;

  const stepsByFlow = new Map<string, FlowStep[]>();

  for (const row of stepsResult.rows) {
    if (!row.flow_id) continue;
    const list = stepsByFlow.get(row.flow_id) || [];
    list.push(rowToStep(row));
    stepsByFlow.set(row.flow_id, list);
  }

  return flowsResult.rows.map((flow: FlowRow) => ({
    ...flow,
    match_mode: flow.match_mode as MatchMode,
    steps: stepsByFlow.get(flow.id) || []
  }));
}

export async function replaceFlowSteps(flowId: string, steps: FlowStep[]): Promise<void> {
  await sql`DELETE FROM flow_steps WHERE flow_id = ${flowId}`;

  for (const step of steps) {
    await sql`
      INSERT INTO flow_steps (
        id,
        flow_id,
        type,
        text,
        media_url,
        delay_seconds,
        buttons,
        position,
        condition_mode,
        condition_value,
        true_flow_id,
        false_flow_id,
        target_flow_id,
        save_as
      )
      VALUES (
        ${step.id},
        ${flowId},
        ${step.type},
        ${step.text},
        ${step.media_url},
        ${step.delay_seconds},
        CAST(${JSON.stringify(step.buttons)} AS JSONB),
        ${step.position},
        ${step.condition_mode},
        ${step.condition_value},
        ${step.true_flow_id},
        ${step.false_flow_id},
        ${step.target_flow_id},
        ${step.save_as}
      )
    `;
  }
}

function normalizeIncoming(text: string): string {
  return text.trim().toLowerCase();
}

function testText(mode: ConditionMode | MatchMode, expected: string, incomingText: string): boolean {
  const incoming = normalizeIncoming(incomingText);
  const trigger = normalizeIncoming(expected);

  if (mode === "any") return true;
  if (!trigger) return false;
  if (mode === "equals") return incoming === trigger;
  if (mode === "contains") return incoming.includes(trigger);
  if (mode === "starts_with") return incoming.startsWith(trigger);

  const command = incoming.split(/\s+/)[0]?.replace(/^\//, "") || "";
  const expectedCommand = trigger.replace(/^\//, "");
  return command === expectedCommand;
}

export function flowMatchesText(flow: Pick<Flow, "trigger_text" | "match_mode">, text: string): boolean {
  return testText(flow.match_mode, flow.trigger_text, text);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderTemplate(text: string, context?: SubscriberContext): string {
  const variables = context?.variables || {};
  const replacements: Record<string, string> = {
    first_name: context?.firstName || "",
    username: context?.username || "",
    last_message: context?.lastMessage || "",
    ...variables
  };

  return text.replace(/\{([a-zA-Z0-9_а-яА-Я-]+)\}/g, (_match, key: string) => {
    return escapeHtml(String(replacements[key] ?? ""));
  });
}

async function getExecutableSteps(flowId: string, botId: string): Promise<FlowStep[]> {
  const result = await sql<StepRow>`
    SELECT fs.id, fs.type, fs.text, fs.media_url, fs.delay_seconds, fs.buttons, fs.position,
           fs.condition_mode, fs.condition_value, fs.true_flow_id, fs.false_flow_id, fs.target_flow_id, fs.save_as
    FROM flow_steps fs
    JOIN flows f ON f.id = fs.flow_id
    WHERE fs.flow_id = ${flowId}
      AND f.bot_id = ${botId}
      AND f.enabled = TRUE
    ORDER BY fs.position ASC, fs.created_at ASC
  `;

  return result.rows.map(rowToStep);
}

async function flowBelongsToBot(botId: string, flowId: string): Promise<boolean> {
  if (!flowId) return false;

  const result = await sql<{ id: string }>`
    SELECT id FROM flows WHERE id = ${flowId} AND bot_id = ${botId} AND enabled = TRUE LIMIT 1
  `;

  return result.rows.length > 0;
}

export async function setChatWaitingState(
  botId: string,
  chatId: number | string,
  waitingFlowId: string,
  saveAs: string
): Promise<void> {
  await sql`
    INSERT INTO chat_states (bot_id, chat_id, waiting_flow_id, save_as, updated_at)
    VALUES (${botId}, ${String(chatId)}, ${waitingFlowId}, ${saveAs}, NOW())
    ON CONFLICT (bot_id, chat_id)
    DO UPDATE SET waiting_flow_id = EXCLUDED.waiting_flow_id,
                  save_as = EXCLUDED.save_as,
                  updated_at = NOW()
  `;
}

export async function clearChatWaitingState(botId: string, chatId: number | string): Promise<void> {
  await sql`DELETE FROM chat_states WHERE bot_id = ${botId} AND chat_id = ${String(chatId)}`;
}

export async function getChatWaitingState(
  botId: string,
  chatId: number | string
): Promise<{ waiting_flow_id: string; save_as: string } | null> {
  const result = await sql<{ waiting_flow_id: string; save_as: string }>`
    SELECT waiting_flow_id, save_as
    FROM chat_states
    WHERE bot_id = ${botId} AND chat_id = ${String(chatId)}
    LIMIT 1
  `;

  return result.rows[0] || null;
}

export async function upsertSubscriber(
  botId: string,
  chatId: number | string,
  info: { firstName?: string; username?: string; lastMessage?: string }
): Promise<SubscriberContext> {
  const current = await sql<{ variables: Record<string, string> | null }>`
    SELECT variables FROM subscribers WHERE bot_id = ${botId} AND chat_id = ${String(chatId)} LIMIT 1
  `;

  const variables = current.rows[0]?.variables || {};

  await sql`
    INSERT INTO subscribers (id, bot_id, chat_id, first_name, username, last_message, variables, updated_at)
    VALUES (
      ${randomUUID()},
      ${botId},
      ${String(chatId)},
      ${info.firstName || ""},
      ${info.username || ""},
      ${info.lastMessage || ""},
      CAST(${JSON.stringify(variables)} AS JSONB),
      NOW()
    )
    ON CONFLICT (bot_id, chat_id)
    DO UPDATE SET first_name = EXCLUDED.first_name,
                  username = EXCLUDED.username,
                  last_message = EXCLUDED.last_message,
                  updated_at = NOW()
  `;

  return {
    firstName: info.firstName || "",
    username: info.username || "",
    lastMessage: info.lastMessage || "",
    variables
  };
}

export async function saveSubscriberVariable(
  botId: string,
  chatId: number | string,
  key: string,
  value: string
): Promise<SubscriberContext> {
  const current = await sql<{ variables: Record<string, string> | null; first_name: string; username: string; last_message: string }>`
    SELECT variables, first_name, username, last_message
    FROM subscribers
    WHERE bot_id = ${botId} AND chat_id = ${String(chatId)}
    LIMIT 1
  `;

  const row = current.rows[0];
  const variables = { ...(row?.variables || {}) };

  if (key) {
    variables[key] = value;
  }

  await sql`
    UPDATE subscribers
    SET variables = CAST(${JSON.stringify(variables)} AS JSONB), updated_at = NOW()
    WHERE bot_id = ${botId} AND chat_id = ${String(chatId)}
  `;

  return {
    firstName: row?.first_name || "",
    username: row?.username || "",
    lastMessage: value,
    variables
  };
}

export async function getButtonReply(
  botId: string,
  stepId: string,
  buttonIndex: number
): Promise<{ payload: string } | null> {
  const result = await sql<{ buttons: unknown }>`
    SELECT fs.buttons
    FROM flow_steps fs
    JOIN flows f ON f.id = fs.flow_id
    WHERE fs.id = ${stepId}
      AND f.bot_id = ${botId}
      AND f.enabled = TRUE
    LIMIT 1
  `;

  const buttons = normalizeButtons(result.rows[0]?.buttons);
  const button = buttons[buttonIndex];

  if (!button || button.type !== "reply" || !button.payload) return null;
  return { payload: button.payload };
}

async function runNestedFlow(
  token: string,
  botId: string,
  flowId: string,
  chatId: number | string,
  context?: SubscriberContext,
  depth = 0
): Promise<number> {
  if (depth > 5 || !(await flowBelongsToBot(botId, flowId))) return 0;
  return runFlow(token, botId, flowId, chatId, context, depth + 1);
}

export async function runFlow(
  token: string,
  botId: string,
  flowId: string,
  chatId: number | string,
  context?: SubscriberContext,
  depth = 0
): Promise<number> {
  if (depth > 6) return 0;

  const steps = await getExecutableSteps(flowId, botId);
  let sent = 0;

  for (const step of steps) {
    if (step.type === "delay") {
      const seconds = Math.min(step.delay_seconds, 20);
      await sleep(seconds * 1000);
      continue;
    }

    if (step.type === "condition") {
      const conditionOk = testText(step.condition_mode, step.condition_value, context?.lastMessage || "");
      const nextFlowId = conditionOk ? step.true_flow_id : step.false_flow_id;
      if (nextFlowId) {
        sent += await runNestedFlow(token, botId, nextFlowId, chatId, context, depth);
        break;
      }
      continue;
    }

    if (step.type === "jump") {
      sent += await runNestedFlow(token, botId, step.target_flow_id, chatId, context, depth);
      break;
    }

    if (step.type === "question") {
      await sendTelegramMessage(
        token,
        chatId,
        renderTemplate(step.text, context),
        step.buttons,
        step.id
      );
      sent += 1;

      if (step.target_flow_id) {
        await setChatWaitingState(botId, chatId, step.target_flow_id, step.save_as || "answer");
      }
      break;
    }

    if (step.type === "random") {
      const variants = step.text.split("\n").map((line) => line.trim()).filter(Boolean);
      const choice = variants[Math.floor(Math.random() * variants.length)] || "";
      await sendTelegramMessage(token, chatId, renderTemplate(choice, context), step.buttons, step.id);
      sent += 1;
      continue;
    }

    const text = renderTemplate(step.text || "", context);

    if (step.type === "photo") {
      await sendTelegramPhoto(token, chatId, step.media_url, text || undefined, step.buttons, step.id);
      sent += 1;
      continue;
    }

    if (step.type === "video") {
      await sendTelegramVideo(token, chatId, step.media_url, text || undefined, step.buttons, step.id);
      sent += 1;
      continue;
    }

    if (step.type === "document") {
      await sendTelegramDocument(token, chatId, step.media_url, text || undefined, step.buttons, step.id);
      sent += 1;
      continue;
    }

    if (step.type === "audio") {
      await sendTelegramAudio(token, chatId, step.media_url, text || undefined, step.buttons, step.id);
      sent += 1;
      continue;
    }

    if (step.type === "voice") {
      await sendTelegramVoice(token, chatId, step.media_url, text || undefined, step.buttons, step.id);
      sent += 1;
      continue;
    }

    if (step.type === "animation") {
      await sendTelegramAnimation(token, chatId, step.media_url, text || undefined, step.buttons, step.id);
      sent += 1;
      continue;
    }

    await sendTelegramMessage(token, chatId, text || "Выберите действие:", step.buttons, step.id);
    sent += 1;
  }

  return sent;
}

export async function answerFlowCallback(token: string, callbackQueryId: string, text = "Открываю..."): Promise<void> {
  await answerCallbackQuery(token, callbackQueryId, text);
}
