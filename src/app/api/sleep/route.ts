import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate, utcRangeWhereForCalendarDay } from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import {
  computeSleepEfficiency,
  deriveSleepScore,
  qualityToScore,
  scoreToLegacyQuality,
} from "@/lib/sleep-score"
import { sleepDurationHours } from "@/lib/sleepDuration"

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const dateParam = searchParams.get("date")

    const where: Record<string, unknown> = { userId }
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      where.date = utcRangeWhereForCalendarDay(dateParam)
    }

    const entries = await prisma.sleepEntry.findMany({
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

    const bedtime = new Date(body.bedtime)
    const wakeTime = new Date(body.wakeTime)

    let score: number | null =
      body.score != null && Number.isFinite(Number(body.score))
        ? Math.max(0, Math.min(100, Math.round(Number(body.score))))
        : null
    let quality: number =
      body.quality != null && Number.isFinite(Number(body.quality))
        ? Math.max(1, Math.min(5, Math.round(Number(body.quality))))
        : 3

    if (score != null) {
      quality = scoreToLegacyQuality(score)
    } else if (body.quality != null) {
      score = qualityToScore(quality)
    } else {
      // Manual log with no explicit score/quality: derive from duration-based efficiency alone.
      const minutes = sleepDurationHours(bedtime, wakeTime) * 60
      const efficiency = computeSleepEfficiency(minutes, minutes)
      score = deriveSleepScore({ efficiency }) ?? qualityToScore(quality)
    }

    const entry = await prisma.sleepEntry.create({
      data: {
        date: parseYyyyMmDdToStoredDate(String(body.date)),
        bedtime,
        wakeTime,
        quality,
        score,
        notes: body.notes || null,
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

    const { count } = await prisma.sleepEntry.deleteMany({ where: { id, userId } })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
