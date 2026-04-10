import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate, utcCalendarDayRangeInclusive } from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"

function clampMetric(n: unknown, fallback = 5): number {
  const v = typeof n === "number" ? n : parseInt(String(n), 10)
  if (Number.isNaN(v)) return fallback
  return Math.min(10, Math.max(1, v))
}

const DOMS_JSON_MAX = 12000

function normalizeDomsJson(raw: unknown): string {
  if (raw == null) return "[]"
  let arr: unknown[]
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown
      arr = Array.isArray(p) ? p : []
    } catch {
      return "[]"
    }
  } else if (Array.isArray(raw)) {
    arr = raw
  } else {
    return "[]"
  }
  const out: { key: string; score: number }[] = []
  for (const row of arr) {
    if (!row || typeof row !== "object") continue
    const o = row as Record<string, unknown>
    const key = typeof o.key === "string" ? o.key.slice(0, 120) : ""
    if (!key) continue
    const score = clampMetric(o.score, 5)
    out.push({ key, score })
  }
  const s = JSON.stringify(out)
  return s.length > DOMS_JSON_MAX ? "[]" : s
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const where: Record<string, unknown> = { userId }
    if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      where.date = utcCalendarDayRangeInclusive(from, to)
    }

    const entries = await prisma.recoveryDailyEntry.findMany({
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
    const stored = parseYyyyMmDdToStoredDate(dateStr)

    const domsStr = normalizeDomsJson(body.domsJson)
    const base = {
      date: stored,
      pain: clampMetric(body.pain),
      energy: clampMetric(body.energy),
      mood: clampMetric(body.mood),
      soreness: clampMetric(body.soreness),
      stress: clampMetric(body.stress),
      mobility: clampMetric(body.mobility),
      sleepFeel: clampMetric(body.sleepFeel),
      notes: body.notes != null ? String(body.notes).slice(0, 2000) : null,
      userId,
    }

    // Omit `domsJson` from Prisma upsert — same Turbopack/validation quirk as `InjuryRecord.bodySegmentKeysJson`.
    // Create uses DB default `[]`; update leaves prior value until the raw UPDATE below.
    const rowId = await prisma.$transaction(async (tx) => {
      const row = await tx.recoveryDailyEntry.upsert({
        where: {
          userId_date: { userId, date: stored },
        },
        create: base,
        update: {
          pain: base.pain,
          energy: base.energy,
          mood: base.mood,
          soreness: base.soreness,
          stress: base.stress,
          mobility: base.mobility,
          sleepFeel: base.sleepFeel,
          notes: base.notes,
        },
      })
      await tx.$executeRawUnsafe(
        `UPDATE "RecoveryDailyEntry" SET "domsJson" = ?, "updatedAt" = datetime('now') WHERE "id" = ? AND "userId" = ?`,
        domsStr,
        row.id,
        userId,
      )
      return row.id
    })

    const entry = await prisma.recoveryDailyEntry.findUnique({ where: { id: rowId } })
    if (!entry) {
      return NextResponse.json({ error: "Failed to save", details: "Row missing after upsert." }, { status: 500 })
    }
    return NextResponse.json(entry, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error("[POST /api/recovery/daily]", e)
    const details =
      e instanceof Error && e.message.trim().length > 0 ? e.message.trim().slice(0, 1200) : undefined
    return NextResponse.json(
      { error: "Failed to save", ...(details ? { details } : {}) },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })
    const { count } = await prisma.recoveryDailyEntry.deleteMany({ where: { id, userId } })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
