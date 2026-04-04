import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { DEFAULT_WEIGHT_UNIT } from "@/lib/units"
import { startOfDay } from "date-fns"

async function findOrCreateBodyweightGoal() {
  let goal = await prisma.longGoal.findFirst({
    where: { category: "bodyweight" },
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
      },
    })
  }

  return goal
}

function resolveDate(req: NextRequest): Date {
  const d = req.nextUrl.searchParams.get("d")
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return startOfDay(new Date(d + "T00:00:00"))
  }
  return startOfDay(new Date())
}

export async function GET(req: NextRequest) {
  try {
    const goal = await findOrCreateBodyweightGoal()
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
      goalId: goal.id,
      unit: goal.unit,
    })
  } catch {
    return NextResponse.json({
      done: false,
      todayEntry: null,
      latestEntry: null,
      previousEntry: null,
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const goal = await findOrCreateBodyweightGoal()

    const dateParam = body.date
    const targetDay = dateParam
      ? startOfDay(new Date(dateParam + "T00:00:00"))
      : startOfDay(new Date())

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
  } catch {
    return NextResponse.json({ error: "Failed to log" }, { status: 500 })
  }
}
