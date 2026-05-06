import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

async function userOwnsBot(userId: string, botId: string): Promise<boolean> {
  const result = await sql<{ id: string }>`
    SELECT id FROM bots WHERE id = ${botId} AND user_id = ${userId} LIMIT 1
  `;

  return result.rows.length > 0;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; flowId: string } }
) {
  const session = await requireSession(request);

  if (!(await userOwnsBot(session.userId, params.id))) {
    return NextResponse.json({ ok: false, error: "Бот не найден." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    trigger_text?: string;
    response_text?: string;
    match_mode?: "equals" | "contains";
    enabled?: boolean;
  } | null;

  const existing = await sql<{ id: string }>`
    SELECT id FROM flows WHERE id = ${params.flowId} AND bot_id = ${params.id} LIMIT 1
  `;

  if (!existing.rows[0]) {
    return NextResponse.json({ ok: false, error: "Цепочка не найдена." }, { status: 404 });
  }

  if (typeof body?.trigger_text === "string" && body.trigger_text.trim().length > 0) {
    await sql`
      UPDATE flows
      SET trigger_text = ${body.trigger_text.trim()}, updated_at = NOW()
      WHERE id = ${params.flowId} AND bot_id = ${params.id}
    `;
  }

  if (typeof body?.response_text === "string" && body.response_text.trim().length > 0) {
    await sql`
      UPDATE flows
      SET response_text = ${body.response_text.trim()}, updated_at = NOW()
      WHERE id = ${params.flowId} AND bot_id = ${params.id}
    `;
  }

  if (body?.match_mode === "equals" || body?.match_mode === "contains") {
    await sql`
      UPDATE flows
      SET match_mode = ${body.match_mode}, updated_at = NOW()
      WHERE id = ${params.flowId} AND bot_id = ${params.id}
    `;
  }

  if (typeof body?.enabled === "boolean") {
    await sql`
      UPDATE flows
      SET enabled = ${body.enabled}, updated_at = NOW()
      WHERE id = ${params.flowId} AND bot_id = ${params.id}
    `;
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; flowId: string } }
) {
  const session = await requireSession(request);

  if (!(await userOwnsBot(session.userId, params.id))) {
    return NextResponse.json({ ok: false, error: "Бот не найден." }, { status: 404 });
  }

  await sql`
    DELETE FROM flows
    WHERE id = ${params.flowId} AND bot_id = ${params.id}
  `;

  return NextResponse.json({ ok: true });
}
