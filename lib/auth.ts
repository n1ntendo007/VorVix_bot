import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";

export const AUTH_COOKIE = "vorvix_session";

export type SessionUser = {
  userId: string;
  username: string;
};

function getSecretKey(): Uint8Array {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("APP_SECRET must be set and should be at least 24 characters long.");
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    userId: user.userId,
    username: user.username
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export function setSessionCookie(token: string): void {
  cookies().set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export function clearSessionCookie(): void {
  cookies().set(AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function getSession(request?: NextRequest): Promise<SessionUser | null> {
  const token = request ? request.cookies.get(AUTH_COOKIE)?.value : cookies().get(AUTH_COOKIE)?.value;

  if (!token) return null;

  try {
    const verified = await jwtVerify(token, getSecretKey());
    const userId = verified.payload.userId;
    const username = verified.payload.username;

    if (typeof userId !== "string" || typeof username !== "string") return null;

    return { userId, username };
  } catch {
    return null;
  }
}

export async function requireSession(request?: NextRequest): Promise<SessionUser> {
  const session = await getSession(request);

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}
