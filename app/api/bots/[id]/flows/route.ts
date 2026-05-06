import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

type FlowRow = {
  id: string;
  trigger_text: string;
  response_text: string;
  match_mode: "equals" | "contains";
  enabled: boolean;
  position: number;
};

async function userOwnsBot(userId: string, botId: string): Promise<boolean> {
  const result = await sql<{ id: string }>`
    SELECT id FROM bots WHERE id = ${botId} AND user_id = ${userId} LIMIT 1
  `;

  return result.rows.length > 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireSession(request);

  if (!(await userOwnsBot(session.userId, params.id))) {
    return NextResponse.json({ ok: false, error: "Бот не найден." }, { status: 404 });
  }

  const result = await sql<FlowRow>`
    SELECT id, trigger_text, response_text, match_mode, enabled, position
    FROM flows
    WHERE bot_id = ${params.id}
    ORDER BY position ASC, created_at DESC
  `;

  return NextResponse.json({ ok: true, flows: result.rows });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireSession(request);

  if (!(await userOwnsBot(session.userId, params.id))) {
    return NextResponse.json({ ok: false, error: "Бот не найден." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    trigger_text?: string;
    response_text?: string;
    match_mode?: "equals" | "contains";
  } | null;

  const triggerText = body?.trigger_text?.trim() || "";
  const responseText = body?.response_text?.trim() || "";
  const matchMode = body?.match_mode === "contains" ? "contains" : "equals";

  if (!triggerText || !responseText) {
    return NextResponse.json(
      { ok: false, error: "Заполни триггер и ответ." },
      { status: 400 }
    );
  }

  const id = randomUUID();

  await sql`
    INSERT INTO flows (id, bot_id, trigger_text, response_text, match_mode)
    VALUES (${id}, ${params.id}, ${triggerText}, ${responseText}, ${matchMode})
  `;

  return NextResponse.json({ ok: true, id });
}
