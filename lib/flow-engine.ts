import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import {
  answerCallbackQuery,
  InlineButton,
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramVideo
} from "@/lib/telegram";

export type MatchMode = "equals" | "contains" | "starts_with" | "command" | "any";
export type StepType = "message" | "photo" | "video" | "delay";

export type FlowButton = InlineButton;

export type FlowStep = {
  id: string;
  type: StepType;
  text: string;
  media_url: string;
  delay_seconds: number;
  buttons: FlowButton[];
  position: number;
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

export type FlowBody = {
  name?: string;
  trigger_text?: string;
  response_text?: string;
  match_mode?: MatchMode;
  enabled?: boolean;
  steps?: Partial<FlowStep>[];
};

type FlowRow = Omit<Flow, "steps">;

type StepRow = FlowStep & { buttons: unknown };

const MATCH_MODES = new Set(["equals", "contains", "starts_with", "command", "any"]);
const STEP_TYPES = new Set(["message", "photo", "video", "delay"]);

function trimText(value: unknown, max = 4096): string {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeButtons(value: unknown): FlowButton[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 12)
    .map((raw) => {
      const button = raw as Partial<FlowButton>;
      const text = trimText(button.text, 64);
      const type = button.type === "flow" ? "flow" : "url";
      const url = trimText(button.url, 700);
      const flowId = trimText(button.flowId, 80);

      if (!text) return null;

      if (type === "url") {
        if (!/^https?:\/\//i.test(url)) return null;
        return { text, type, url } satisfies FlowButton;
      }

      if (!flowId) return null;
      return { text, type, flowId } satisfies FlowButton;
    })
    .filter(Boolean) as FlowButton[];
}

export function normalizeStep(raw: Partial<FlowStep>, index: number): FlowStep {
  const type = STEP_TYPES.has(String(raw.type)) ? (raw.type as StepType) : "message";
  const text = trimText(raw.text);
  const mediaUrl = trimText(raw.media_url, 1200);
  const buttons = normalizeButtons(raw.buttons);
  const delaySecondsRaw = Number(raw.delay_seconds ?? 0);
  const delaySeconds = Number.isFinite(delaySecondsRaw)
    ? Math.max(0, Math.min(900, Math.round(delaySecondsRaw)))
    : 0;

  if (type === "message" && !text && buttons.length === 0) {
    throw new Error(`Блок ${index + 1}: напиши текст сообщения или добавь кнопки.`);
  }

  if ((type === "photo" || type === "video") && !mediaUrl) {
    throw new Error(`Блок ${index + 1}: вставь URL или file_id медиа.`);
  }

  if (type === "delay" && delaySeconds < 1) {
    throw new Error(`Блок ${index + 1}: задержка должна быть от 1 секунды.`);
  }

  return {
    id: trimText(raw.id, 80) || randomUUID(),
    type,
    text,
    media_url: mediaUrl,
    delay_seconds: delaySeconds,
    buttons,
    position: index
  };
}

export function normalizeFlowBody(body: FlowBody | null) {
  const matchMode = MATCH_MODES.has(String(body?.match_mode))
    ? (body?.match_mode as MatchMode)
    : "equals";
  const name = trimText(body?.name, 80) || "Новая цепочка";
  const triggerText = matchMode === "any" ? trimText(body?.trigger_text, 200) : trimText(body?.trigger_text, 200);
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

export async function getFlowsWithSteps(botId: string): Promise<Flow[]> {
  const flowsResult = await sql<FlowRow>`
    SELECT id, name, trigger_text, response_text, match_mode, enabled, position
    FROM flows
    WHERE bot_id = ${botId}
    ORDER BY position ASC, created_at ASC
  `;

  const stepsResult = await sql<StepRow>`
    SELECT id, flow_id, type, text, media_url, delay_seconds, buttons, position
    FROM flow_steps
    WHERE flow_id IN (SELECT id FROM flows WHERE bot_id = ${botId})
    ORDER BY position ASC, created_at ASC
  `;

  const stepsByFlow = new Map<string, FlowStep[]>();

  for (const row of stepsResult.rows as Array<StepRow & { flow_id: string }>) {
    const list = stepsByFlow.get(row.flow_id) || [];
    list.push({
      id: row.id,
      type: row.type,
      text: row.text,
      media_url: row.media_url,
      delay_seconds: row.delay_seconds,
      buttons: normalizeButtons(row.buttons),
      position: row.position
    });
    stepsByFlow.set(row.flow_id, list);
  }

  return flowsResult.rows.map((flow) => ({
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
        position
      )
      VALUES (
        ${step.id},
        ${flowId},
        ${step.type},
        ${step.text},
        ${step.media_url},
        ${step.delay_seconds},
        CAST(${JSON.stringify(step.buttons)} AS JSONB),
        ${step.position}
      )
    `;
  }
}

function normalizeIncoming(text: string): string {
  return text.trim().toLowerCase();
}

export function flowMatchesText(flow: Pick<Flow, "trigger_text" | "match_mode">, text: string): boolean {
  const incoming = normalizeIncoming(text);
  const trigger = normalizeIncoming(flow.trigger_text);

  if (flow.match_mode === "any") return true;
  if (!trigger) return false;
  if (flow.match_mode === "equals") return incoming === trigger;
  if (flow.match_mode === "contains") return incoming.includes(trigger);
  if (flow.match_mode === "starts_with") return incoming.startsWith(trigger);

  const command = incoming.split(/\s+/)[0]?.replace(/^\//, "") || "";
  const expected = trigger.replace(/^\//, "");
  return command === expected;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getExecutableSteps(flowId: string, botId: string): Promise<FlowStep[]> {
  const result = await sql<StepRow>`
    SELECT fs.id, fs.type, fs.text, fs.media_url, fs.delay_seconds, fs.buttons, fs.position
    FROM flow_steps fs
    JOIN flows f ON f.id = fs.flow_id
    WHERE fs.flow_id = ${flowId}
      AND f.bot_id = ${botId}
      AND f.enabled = TRUE
    ORDER BY fs.position ASC, fs.created_at ASC
  `;

  return result.rows.map((row) => ({
    id: row.id,
    type: row.type,
    text: row.text,
    media_url: row.media_url,
    delay_seconds: row.delay_seconds,
    buttons: normalizeButtons(row.buttons),
    position: row.position
  }));
}

export async function runFlow(token: string, botId: string, flowId: string, chatId: number | string): Promise<number> {
  const steps = await getExecutableSteps(flowId, botId);
  let sent = 0;

  for (const step of steps) {
    if (step.type === "delay") {
      const seconds = Math.min(step.delay_seconds, 20);
      await sleep(seconds * 1000);
      continue;
    }

    if (step.type === "photo") {
      await sendTelegramPhoto(token, chatId, step.media_url, step.text || undefined, step.buttons);
      sent += 1;
      continue;
    }

    if (step.type === "video") {
      await sendTelegramVideo(token, chatId, step.media_url, step.text || undefined, step.buttons);
      sent += 1;
      continue;
    }

    await sendTelegramMessage(token, chatId, step.text || "Выберите действие:", step.buttons);
    sent += 1;
  }

  return sent;
}

export async function answerFlowCallback(token: string, callbackQueryId: string): Promise<void> {
  await answerCallbackQuery(token, callbackQueryId, "Открываю...");
}
