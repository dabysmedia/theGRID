import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate } from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")

    const where: Record<string, unknown> = { userId }
    if (status) where.status = status
    const sessions = await prisma.workoutSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
    })
    return NextResponse.json(sessions, {
      headers: { "Cache-Control": "no-store, must-revalidate" },
    })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json(
      { error: "Failed to fetch" },
      { status: 500, headers: { "Cache-Control": "no-store, must-revalidate" } },
    )
  }
}

function prismaErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code: string }).code)
    if (code === "P2021" || code === "P2010") {
      return "Workout tables are missing on the server. Run: npx prisma db push (or redeploy with schema sync)."
    }
  }
  if (err instanceof Error && err.message) {
    const m = err.message
    if (/no such table|does not exist/i.test(m) && /WorkoutSession/i.test(m)) {
      return "Workout tables are missing. Run: npx prisma db push"
    }
    return m.length > 220 ? `${m.slice(0, 220)}…` : m
  }
  return "Failed to create"
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const { name, date, exercises } = body
    const dateStr = date == null ? "" : String(date).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json(
        { error: "Invalid date (expected YYYY-MM-DD)." },
        { status: 400, headers: { "Cache-Control": "no-store, must-revalidate" } },
      )
    }
    let storedDate: Date
    try {
      storedDate = parseYyyyMmDdToStoredDate(dateStr)
    } catch {
      return NextResponse.json(
        { error: "Invalid calendar date." },
        { status: 400, headers: { "Cache-Control": "no-store, must-revalidate" } },
      )
    }
    const session = await prisma.workoutSession.create({
      data: {
        name: (name || "Workout").trim(),
        date: storedDate,
        exercises: JSON.stringify(Array.isArray(exercises) ? exercises : []),
        status: "active",
        userId,
      },
    })
    return NextResponse.json(session, {
      status: 201,
      headers: { "Cache-Control": "no-store, must-revalidate" },
    })
  } catch (err) {
    if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error("[workout-sessions POST]", err)
    return NextResponse.json(
      { error: prismaErrorMessage(err) },
      { status: 500, headers: { "Cache-Control": "no-store, must-revalidate" } },
    )
  }
}
