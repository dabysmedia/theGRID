import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate, utcRangeWhereForCalendarDay } from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import { resolveStepsTimezone, stepsRefDayKey } from "@/lib/steps-day"

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const dateParam = searchParams.get("date")

    const where: Record<string, unknown> = { userId }
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      where.date = utcRangeWhereForCalendarDay(dateParam)
    }

    const entries = await prisma.stepEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(entries)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const requestedDate = String(body.date ?? "")
    const count = Number.parseInt(String(body.count ?? ""), 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || !Number.isFinite(count) || count <= 0) {
      return NextResponse.json({ error: "Valid date and positive step count required" }, { status: 400 })
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timeZone: true },
    })
    const timeZone = resolveStepsTimezone(user?.timeZone)
    const stepsDate = stepsRefDayKey(requestedDate, new Date(), timeZone)
    const entry = await prisma.stepEntry.create({
      data: {
        date: parseYyyyMmDdToStoredDate(stepsDate),
        count,
        userId,
      },
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const { count } = await prisma.stepEntry.deleteMany({ where: { id, userId } })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
