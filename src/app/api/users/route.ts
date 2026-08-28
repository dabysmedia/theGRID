import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPin } from "@/lib/pin-hash"
import { createUserSession, revokeRequestSession, setUserSessionCookie } from "@/lib/user-session"

const AVATAR_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#f59e0b",
  "#ec4899", "#6366f1", "#14b8a6", "#f97316", "#06b6d4",
]

const userListBaseSelect = {
  id: true,
  name: true,
  avatarColor: true,
  avatarUrl: true,
} as const

const workCycleSelect = {
  workCycleEnabled: true,
  workCycleAnchorDate: true,
  workCycleLength: true,
  workCyclePatternJson: true,
  workoutGoalPerCycle: true,
  trainingStyle: true,
  trainingSplit: true,
  protocolEnabled: true,
} as const

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      // This endpoint powers the locked profile picker, so expose identity only.
      // Private settings are restored from the authenticated session endpoint.
      select: userListBaseSelect,
      orderBy: { createdAt: "asc" },
    })
    return NextResponse.json(users)
  } catch (e) {
    console.error("[users GET]", e)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 })
    }
    if (name.length > 40) {
      return NextResponse.json({ error: "Name must be 40 characters or fewer." }, { status: 400 })
    }
    const pin = typeof body.pin === "string" ? body.pin : ""
    if (!/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be 4–8 digits." }, { status: 400 })
    }

    const count = await prisma.user.count()
    const avatarColor = body.avatarColor || AVATAR_COLORS[count % AVATAR_COLORS.length]

    const user = await prisma.user.create({
      data: {
        name,
        pinHash: hashPin(pin),
        avatarColor,
      },
      select: {
        id: true,
        name: true,
        avatarColor: true,
        avatarUrl: true,
        vacationResumeDate: true,
        ...workCycleSelect,
      },
    })
    await revokeRequestSession(req)
    const session = await createUserSession(user.id)
    const response = NextResponse.json(user, { status: 201 })
    setUserSessionCookie(response, session)
    return response
  } catch (e) {
    console.error("[users POST]", e)
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 })
  }
}
