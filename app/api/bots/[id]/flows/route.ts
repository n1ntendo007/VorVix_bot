import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getFlowsWithSteps, normalizeFlowBody, replaceFlowSteps, userOwnsBot } from "@/lib/flow-engine";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireSession(request);

  if (!(await userOwnsBot(session.userId, params.id))) {
    return NextResponse.json({ ok: false, error: "Бот не найден." }, { status: 404 });
  }

  const flows = await getFlowsWithSteps(params.id);
  return NextResponse.json({ ok: true, flows });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireSession(request);

  if (!(await userOwnsBot(session.userId, params.id))) {
    return NextResponse.json({ ok: false, error: "Бот не найден." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as Parameters<typeof normalizeFlowBody>[0];

  let normalized;
  try {
    normalized = normalizeFlowBody(body);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Проверь цепочку." },
      { status: 400 }
    );
  }

  const id = randomUUID();

  await sql`
    INSERT INTO flows (
      id,
      bot_id,
      name,
      trigger_text,
      response_text,
      match_mode,
      enabled
    )
    VALUES (
      ${id},
      ${params.id},
      ${normalized.name},
      ${normalized.triggerText},
      ${normalized.responseText},
      ${normalized.matchMode},
      ${normalized.enabled}
    )
  `;

  await replaceFlowSteps(id, normalized.steps);

  return NextResponse.json({ ok: true, id });
}
