import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;

  const username = body?.username?.trim().toLowerCase() || "";
  const password = body?.password || "";

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { ok: false, error: "Логин: 3-32 символа, только латиница, цифры и _." },
      { status: 400 }
    );
  }

  if (password.length < 4) {
    return NextResponse.json(
      { ok: false, error: "Пароль должен быть минимум 4 символа." },
      { status: 400 }
    );
  }

  const countResult = await sql<{ count: string }>`SELECT COUNT(*)::text AS count FROM users`;
  const userCount = Number(countResult.rows[0]?.count || "0");
  const allowPublicRegistration = process.env.ALLOW_PUBLIC_REGISTRATION === "true";

  if (userCount > 0 && !allowPublicRegistration) {
    return NextResponse.json(
      { ok: false, error: "Регистрация закрыта. Первый аккаунт уже создан." },
      { status: 403 }
    );
  }

  const existing = await sql<{ id: string }>`
    SELECT id FROM users WHERE username = ${username} LIMIT 1
  `;

  if (existing.rows.length > 0) {
    return NextResponse.json(
      { ok: false, error: "Такой логин уже занят." },
      { status: 409 }
    );
  }

  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  await sql`
    INSERT INTO users (id, username, password_hash)
    VALUES (${id}, ${username}, ${passwordHash})
  `;

  const token = await createSessionToken({ userId: id, username });
  setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
