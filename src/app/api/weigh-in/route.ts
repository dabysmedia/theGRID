import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { DEFAULT_WEIGHT_UNIT } from "@/lib/units"
import { formatDate } from "@/lib/utils"
import { parseYyyyMmDdToStoredDate } from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import { assertNotVacationBlocked } from "@/lib/vacation-block-server"

async function findOrCreateBodyweightGoal(userId: string) {
  let goal = await prisma.longGoal.findFirst({
    where: { category: "bodyweight", userId },
  })

  if (!goal) {
    goal = await prisma.longGoal.create({
      data: {
        name: "Bodyweight",
        category: "bodyweight",
        target: 0,
        unit: DEFAULT_WEIGHT_UNIT,
        direction: "down",
        active: true,
        userId,
      },
    })
  }

  return goal
}

function resolveDate(req: NextRequest): Date {
  const d = req.nextUrl.searchParams.get("d")
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return parseYyyyMmDdToStoredDate(d)
  }
  return parseYyyyMmDdToStoredDate(formatDate(new Date()))
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const goal = await findOrCreateBodyweightGoal(userId)
    const targetDay = resolveDate(req)

    const dayEntry = await prisma.longGoalEntry.findFirst({
      where: {
        goalId: goal.id,
        date: targetDay,
      },
    })

    const lastTwo = await prisma.longGoalEntry.findMany({
      where: { goalId: goal.id },
      orderBy: { date: "desc" },
      take: 2,
    })

    const recentEntries = await prisma.longGoalEntry.findMany({
      where: {
        goalId: goal.id,
        date: { lte: targetDay },
      },
      orderBy: { date: "desc" },
      take: 7,
      select: { date: true, value: true },
    })

    const latestEntry = lastTwo[0] ?? null
    const previousEntry =
      dayEntry && lastTwo[0]?.id === dayEntry.id
        ? lastTwo[1] ?? null
        : null

    return NextResponse.json({
      done: !!dayEntry,
      todayEntry: dayEntry,
      latestEntry,
      previousEntry,
      /** Oldest→newest weigh-ins on/before the requested day (up to 7). */
      recentValues: recentEntries
        .slice()
        .reverse()
        .map((e) => Math.round(e.value * 10) / 10),
      goalId: goal.id,
      unit: goal.unit,
    })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({
      done: false,
      todayEntry: null,
      latestEntry: null,
      previousEntry: null,
      recentValues: [],
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const goal = await findOrCreateBodyweightGoal(userId)

    const dateParam = body.date
    const dayKey =
      typeof dateParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateParam.trim().slice(0, 10))
        ? dateParam.trim().slice(0, 10)
        : formatDate(new Date())
    await assertNotVacationBlocked(userId, dayKey)

    const targetDay = dateParam
      ? parseYyyyMmDdToStoredDate(String(dateParam).trim())
      : parseYyyyMmDdToStoredDate(formatDate(new Date()))

    const existing = await prisma.longGoalEntry.findFirst({
      where: { goalId: goal.id, date: targetDay },
    })

    if (existing) {
      const updated = await prisma.longGoalEntry.update({
        where: { id: existing.id },
        data: { value: parseFloat(body.value) },
      })
      return NextResponse.json(updated)
    }

    const entry = await prisma.longGoalEntry.create({
      data: {
        goalId: goal.id,
        date: targetDay,
        value: parseFloat(body.value),
        notes: null,
      },
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to log" }, { status: 500 })
  }
}
