import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;

  const username = body?.username?.trim().toLowerCase() || "";
  const password = body?.password || "";

  if (!username || !password) {
    return NextResponse.json(
      { ok: false, error: "Введи логин и пароль." },
      { status: 400 }
    );
  }

  const result = await sql<{ id: string; username: string; password_hash: string }>`
    SELECT id, username, password_hash FROM users WHERE username = ${username} LIMIT 1
  `;

  const user = result.rows[0];

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Неверный логин или пароль." },
      { status: 401 }
    );
  }

  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    return NextResponse.json(
      { ok: false, error: "Неверный логин или пароль." },
      { status: 401 }
    );
  }

  const token = await createSessionToken({
    userId: user.id,
    username: user.username
  });

  setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
