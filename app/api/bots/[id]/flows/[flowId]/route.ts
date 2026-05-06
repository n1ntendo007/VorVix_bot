import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { normalizeFlowBody, replaceFlowSteps, userOwnsBot } from "@/lib/flow-engine";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; flowId: string } }
) {
  const session = await requireSession(request);

  if (!(await userOwnsBot(session.userId, params.id))) {
    return NextResponse.json({ ok: false, error: "Бот не найден." }, { status: 404 });
  }

  const existing = await sql<{ id: string }>`
    SELECT id FROM flows WHERE id = ${params.flowId} AND bot_id = ${params.id} LIMIT 1
  `;

  if (!existing.rows[0]) {
    return NextResponse.json({ ok: false, error: "Цепочка не найдена." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as Parameters<typeof normalizeFlowBody>[0];

  if (body?.steps) {
    let normalized;
    try {
      normalized = normalizeFlowBody(body);
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Проверь цепочку." },
        { status: 400 }
      );
    }

    await sql`
      UPDATE flows
      SET name = ${normalized.name},
          trigger_text = ${normalized.triggerText},
          response_text = ${normalized.responseText},
          match_mode = ${normalized.matchMode},
          enabled = ${normalized.enabled},
          updated_at = NOW()
      WHERE id = ${params.flowId} AND bot_id = ${params.id}
    `;

    await replaceFlowSteps(params.flowId, normalized.steps);
    return NextResponse.json({ ok: true });
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
