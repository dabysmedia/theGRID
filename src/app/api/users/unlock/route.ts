import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPin } from "@/lib/pin-hash"
import { createUserSession, revokeRequestSession, setUserSessionCookie } from "@/lib/user-session"

const MAX_FAILURES = 5
const LOCK_MINUTES = 15

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const userId = typeof body.userId === "string" ? body.userId : ""
    const pin = typeof body.pin === "string" ? body.pin : ""

    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, avatarColor: true, avatarUrl: true, pinHash: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 })
    }

    const attempt = await prisma.userUnlockAttempt.findUnique({ where: { userId } })
    if (attempt?.blockedUntil && attempt.blockedUntil > new Date()) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in a few minutes." },
        { status: 429 },
      )
    }

    if (!user.pinHash) {
      await revokeRequestSession(req)
      const session = await createUserSession(user.id)
      await prisma.userUnlockAttempt.deleteMany({ where: { userId } })
      const response = NextResponse.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          avatarColor: user.avatarColor,
          avatarUrl: user.avatarUrl,
        },
      })
      setUserSessionCookie(response, session)
      return response
    }

    if (!verifyPin(pin, user.pinHash)) {
      const failedCount = (attempt?.failedCount ?? 0) + 1
      await prisma.userUnlockAttempt.upsert({
        where: { userId },
        create: {
          userId,
          failedCount,
          blockedUntil:
            failedCount >= MAX_FAILURES
              ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
              : null,
        },
        update: {
          failedCount,
          blockedUntil:
            failedCount >= MAX_FAILURES
              ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
              : null,
        },
      })
      return NextResponse.json({ error: "Wrong PIN." }, { status: 403 })
    }

    await prisma.userUnlockAttempt.deleteMany({ where: { userId } })
    await revokeRequestSession(req)
    const session = await createUserSession(user.id)
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        avatarColor: user.avatarColor,
        avatarUrl: user.avatarUrl,
      },
    })
    setUserSessionCookie(response, session)
    return response
  } catch {
    return NextResponse.json({ error: "Unlock failed." }, { status: 500 })
  }
}
