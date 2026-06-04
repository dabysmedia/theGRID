import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  parseYyyyMmDdToStoredDate,
  utcCalendarDayRangeInclusive,
  utcRangeWhereForCalendarDay,
} from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import { normalizeSideEffects } from "@/lib/peptides"

function clampHunger(n: unknown): number | null {
  const v = typeof n === "number" ? n : parseInt(String(n), 10)
  if (Number.isNaN(v) || v < 1 || v > 10 || !Number.isInteger(v)) return null
  return v
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const dateParam = searchParams.get("date")
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const where: Record<string, unknown> = { userId }
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      where.date = utcRangeWhereForCalendarDay(dateParam)
    } else if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      where.date = utcCalendarDayRangeInclusive(from, to)
    }

    const entries = await prisma.peptideDailyEntry.findMany({
      where,
      orderBy: { date: "desc" },
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
    const dateStr = String(body.date || "")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 })
    }

    const hungerLevel = clampHunger(body.hungerLevel)
    if (hungerLevel == null) {
      return NextResponse.json({ error: "hungerLevel must be integer 1–10" }, { status: 400 })
    }

    const stored = parseYyyyMmDdToStoredDate(dateStr)
    const notes = body.notes != null ? String(body.notes).slice(0, 2000) : null
    const sideEffectsJson = JSON.stringify(normalizeSideEffects(body.sideEffects))

    const entry = await prisma.peptideDailyEntry.upsert({
      where: {
        userId_date: { userId, date: stored },
      },
      create: {
        date: stored,
        hungerLevel,
        sideEffectsJson,
        notes,
        userId,
      },
      update: {
        hungerLevel,
        sideEffectsJson,
        notes,
      },
    })
    return NextResponse.json(entry)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const { count } = await prisma.peptideDailyEntry.deleteMany({ where: { id, userId } })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
