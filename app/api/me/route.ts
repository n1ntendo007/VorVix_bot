import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSession(request);

  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, user: session });
}
