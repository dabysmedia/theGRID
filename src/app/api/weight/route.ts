import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { formatDate } from "@/lib/utils"
import { subDays } from "date-fns"
import { parseYyyyMmDdToStoredDate, utcCalendarDayKeyFromIso } from "@/lib/dateStorage"

async function getOrCreateGoal() {
  let goal = await prisma.longGoal.findFirst({
    where: { category: "bodyweight" },
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
      },
    })
  }
  return goal
}

export async function GET() {
  try {
    const goal = await getOrCreateGoal()
    const entries = await prisma.longGoalEntry.findMany({
      where: { goalId: goal.id },
      orderBy: { date: "desc" },
    })

    const todayStr = formatDate(new Date())
    const todayD = new Date()
    const weekAgoStr = formatDate(subDays(todayD, 6))
    const monthAgoStr = formatDate(subDays(todayD, 29))

    const todayEntry = entries.find((e) => utcCalendarDayKeyFromIso(e.date) === todayStr)

    const last7 = entries.filter((e) => {
      const k = utcCalendarDayKeyFromIso(e.date)
      return k >= weekAgoStr && k <= todayStr
    })
    const last30 = entries.filter((e) => {
      const k = utcCalendarDayKeyFromIso(e.date)
      return k >= monthAgoStr && k <= todayStr
    })

    const values = entries.map((e) => e.value)
    const avg7 =
      last7.length > 0
        ? Math.round((last7.reduce((s, e) => s + e.value, 0) / last7.length) * 10) / 10
        : null
    const avg30 =
      last30.length > 0
        ? Math.round((last30.reduce((s, e) => s + e.value, 0) / last30.length) * 10) / 10
        : null

    const allTimeHigh = values.length ? Math.max(...values) : null
    const allTimeLow = values.length ? Math.min(...values) : null

    const weekChange =
      last7.length >= 2
        ? Math.round((last7[0].value - last7[last7.length - 1].value) * 10) / 10
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
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const goal = await getOrCreateGoal()
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
  } catch {
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  try {
    await prisma.longGoalEntry.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
