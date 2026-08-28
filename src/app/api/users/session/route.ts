import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  clearUserSessionCookie,
  resolveSessionUserId,
  revokeRequestSession,
} from "@/lib/user-session"

const sessionUserSelect = {
  id: true,
  name: true,
  avatarColor: true,
  avatarUrl: true,
  vacationResumeDate: true,
  workCycleEnabled: true,
  workCycleAnchorDate: true,
  workCycleLength: true,
  workCyclePatternJson: true,
  workoutGoalPerCycle: true,
  trainingStyle: true,
  trainingSplit: true,
  protocolEnabled: true,
} as const

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveSessionUserId(req)
    if (!userId) {
      const response = NextResponse.json({ authenticated: false }, { status: 401 })
      clearUserSessionCookie(response)
      return response
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: sessionUserSelect })
    if (!user) {
      const response = NextResponse.json({ authenticated: false }, { status: 401 })
      clearUserSessionCookie(response)
      return response
    }
    return NextResponse.json({ authenticated: true, user })
  } catch (error) {
    console.error("[users/session GET]", error)
    return NextResponse.json({ error: "Could not restore the session." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await revokeRequestSession(req)
  } catch (error) {
    console.error("[users/session DELETE]", error)
  }
  const response = NextResponse.json({ success: true })
  clearUserSessionCookie(response)
  return response
}
