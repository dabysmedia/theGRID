import "server-only"

import { createHash, randomBytes } from "node:crypto"
import type { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const USER_SESSION_COOKIE = "thegrid_session"
const SESSION_DAYS = 30

function digestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export async function createUserSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await prisma.userSession.create({
    data: { id: digestToken(token), userId, expiresAt },
  })
  return { token, expiresAt }
}

export async function resolveSessionUserId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(USER_SESSION_COOKIE)?.value
  return resolveSessionTokenUserId(token)
}

export async function resolveSessionTokenUserId(token: string | undefined): Promise<string | null> {
  if (!token) return null

  const session = await prisma.userSession.findUnique({
    where: { id: digestToken(token) },
    select: { userId: true, expiresAt: true },
  })
  if (!session) return null
  if (session.expiresAt <= new Date()) {
    await prisma.userSession.deleteMany({ where: { id: digestToken(token) } })
    return null
  }
  return session.userId
}

export async function revokeRequestSession(req: NextRequest): Promise<void> {
  const token = req.cookies.get(USER_SESSION_COOKIE)?.value
  if (!token) return
  await prisma.userSession.deleteMany({ where: { id: digestToken(token) } })
}

export function setUserSessionCookie(
  response: NextResponse,
  session: { token: string; expiresAt: Date },
): void {
  response.cookies.set(USER_SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  })
}

export function clearUserSessionCookie(response: NextResponse): void {
  response.cookies.set(USER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
}
