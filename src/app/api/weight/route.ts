import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { formatDate } from "@/lib/utils"
import { subDays } from "date-fns"
import { parseYyyyMmDdToStoredDate, utcCalendarDayKeyFromIso } from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import { assertNotVacationBlocked } from "@/lib/vacation-block-server"
import { normalizeDayKey } from "@/lib/vacation-mode"

async function getOrCreateGoal(userId: string) {
  let goal = await prisma.longGoal.findFirst({
    where: { category: "bodyweight", userId },
  })
  if (!goal) {
    goal = await prisma.longGoal.create({
      data: {
        name: "Bodyweight",
        category: "bodyweight",
        target: 0,
        unit: "lbs",
        direction: "down",
        active: true,
        userId,
      },
    })
  }
  return goal
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const goal = await getOrCreateGoal(userId)
    const entries = await prisma.longGoalEntry.findMany({
      where: { goalId: goal.id },
      orderBy: { date: "desc" },
    })

    const todayStr = formatDate(new Date())
    const todayD = new Date()
    const weekAgoStr = formatDate(subDays(todayD, 6))
    const monthAgoStr = formatDate(subDays(todayD, 29))

    const todayEntry = entries.find((e) => utcCalendarDayKeyFromIso(e.date) === todayStr)

    function weightsByDayInRange(fromStr: string, toStr: string): Map<string, number> {
      const byDay = new Map<string, number>()
      for (const e of entries) {
        const k = utcCalendarDayKeyFromIso(e.date)
        if (k >= fromStr && k <= toStr && !byDay.has(k)) {
          byDay.set(k, e.value)
        }
      }
      return byDay
    }

    const last7Map = weightsByDayInRange(weekAgoStr, todayStr)
    const last30Map = weightsByDayInRange(monthAgoStr, todayStr)
    const last7Vals = [...last7Map.values()]
    const last30Vals = [...last30Map.values()]

    const values = entries.map((e) => e.value)
    const avg7 =
      last7Vals.length > 0
        ? Math.round(
            (last7Vals.reduce((s, v) => s + v, 0) / last7Vals.length) * 10
          ) / 10
        : null
    const avg30 =
      last30Vals.length > 0
        ? Math.round(
            (last30Vals.reduce((s, v) => s + v, 0) / last30Vals.length) * 10
          ) / 10
        : null

    const allTimeHigh = values.length ? Math.max(...values) : null
    const allTimeLow = values.length ? Math.min(...values) : null

    const last7Keys = [...last7Map.keys()].sort()
    const weekChange =
      last7Keys.length >= 2
        ? Math.round(
            (last7Map.get(last7Keys[last7Keys.length - 1])! -
              last7Map.get(last7Keys[0])!) *
              10
          ) / 10
        : null

    return NextResponse.json({
      goalId: goal.id,
      unit: goal.unit,
      target: goal.target,
      direction: goal.direction,
      startValue: goal.startValue,
      entries,
      stats: {
        current: todayEntry?.value ?? entries[0]?.value ?? null,
        avg7,
        avg30,
        allTimeHigh,
        allTimeLow,
        weekChange,
        totalEntries: entries.length,
      },
    })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const dayKey = normalizeDayKey(String(body.date ?? ""))
    if (dayKey) await assertNotVacationBlocked(userId, dayKey)
    const goal = await getOrCreateGoal(userId)
    const date = parseYyyyMmDdToStoredDate(String(body.date))

    const existing = await prisma.longGoalEntry.findFirst({
      where: { goalId: goal.id, date },
    })

    if (existing) {
      const updated = await prisma.longGoalEntry.update({
        where: { id: existing.id },
        data: { value: parseFloat(body.value), notes: body.notes || null },
      })
      return NextResponse.json(updated)
    }

    const entry = await prisma.longGoalEntry.create({
      data: {
        goalId: goal.id,
        date,
        value: parseFloat(body.value),
        notes: body.notes || null,
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

    const entry = await prisma.longGoalEntry.findUnique({
      where: { id },
      include: { goal: { select: { userId: true } } },
    })
    if (!entry || entry.goal.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await prisma.longGoalEntry.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
