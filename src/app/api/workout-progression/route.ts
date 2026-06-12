import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"

const NO_STORE = { "Cache-Control": "no-store, must-revalidate" }

/**
 * GET /api/workout-progression          → recent summaries (default 1, ?limit=N max 20)
 * GET /api/workout-progression?sessionId=… → summary for one session
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get("sessionId")

    if (sessionId) {
      const row = await prisma.workoutProgressionSummary.findFirst({
        where: { sessionId, userId },
      })
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE })
      return NextResponse.json(row, { headers: NO_STORE })
    }

    const limit = Math.min(20, Math.max(1, Number(searchParams.get("limit")) || 1))
    const rows = await prisma.workoutProgressionSummary.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
    return NextResponse.json(rows, { headers: NO_STORE })
  } catch (e) {
    if (e instanceof UserError)
      return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500, headers: NO_STORE })
  }
}

/** POST { sessionId, summary } — upsert the persisted workout progression report. */
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : ""
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400, headers: NO_STORE })
    }
    const session = await prisma.workoutSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    })
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404, headers: NO_STORE })
    }
    const summaryJson = JSON.stringify(body.summary ?? {})
    const row = await prisma.workoutProgressionSummary.upsert({
      where: { sessionId },
      update: { summaryJson, userId },
      create: { sessionId, userId, summaryJson },
    })
    return NextResponse.json(row, { status: 201, headers: NO_STORE })
  } catch (e) {
    if (e instanceof UserError)
      return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to save" }, { status: 500, headers: NO_STORE })
  }
}
