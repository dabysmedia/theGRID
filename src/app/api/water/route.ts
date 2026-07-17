import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  parseYyyyMmDdToStoredDate,
  utcRangeWhereForCalendarDay,
} from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"

const DEFAULT_BOTTLE_OZ = 32
const DEFAULT_GOAL_OZ = 32
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const date = new URL(req.url).searchParams.get("date") ?? ""

    if (!DATE_PATTERN.test(date)) {
      return NextResponse.json({ error: "Valid date required" }, { status: 400 })
    }

    const [entries, waterGoal] = await Promise.all([
      prisma.waterEntry.findMany({
        where: { userId, date: utcRangeWhereForCalendarDay(date) },
        orderBy: { createdAt: "desc" },
        select: { id: true, amountOz: true, createdAt: true },
      }),
      prisma.goal.findFirst({
        where: { userId, category: "water", goalType: "daily", active: true },
        orderBy: { createdAt: "desc" },
        select: { target: true },
      }),
    ])
    const totalOz = entries.reduce((sum, entry) => sum + entry.amountOz, 0)
    const goalOz =
      waterGoal && Number.isFinite(waterGoal.target) && waterGoal.target > 0
        ? waterGoal.target
        : DEFAULT_GOAL_OZ

    return NextResponse.json({
      entries,
      totalOz,
      bottleOz: DEFAULT_BOTTLE_OZ,
      goalOz,
    })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to fetch water" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const date = String(body.date ?? "")
    const amountOz = Number(body.amountOz)

    if (
      !DATE_PATTERN.test(date) ||
      !Number.isFinite(amountOz) ||
      amountOz <= 0 ||
      amountOz > 128
    ) {
      return NextResponse.json(
        { error: "Valid date and water amount between 0 and 128 oz required" },
        { status: 400 },
      )
    }

    const entry = await prisma.waterEntry.create({
      data: {
        date: parseYyyyMmDdToStoredDate(date),
        amountOz: Math.round(amountOz * 10) / 10,
        userId,
      },
      select: { id: true, amountOz: true, createdAt: true },
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to log water" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const goalOz = Number(body.goalOz)

    if (!Number.isFinite(goalOz) || goalOz < 1 || goalOz > 512) {
      return NextResponse.json(
        { error: "Water goal must be between 1 and 512 oz" },
        { status: 400 },
      )
    }

    const roundedGoal = Math.round(goalOz * 10) / 10
    const existing = await prisma.goal.findFirst({
      where: { userId, category: "water", goalType: "daily", active: true },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })

    if (existing) {
      await prisma.goal.update({
        where: { id: existing.id },
        data: { target: roundedGoal, unit: "oz", direction: "up" },
      })
    } else {
      await prisma.goal.create({
        data: {
          category: "water",
          goalType: "daily",
          direction: "up",
          target: roundedGoal,
          unit: "oz",
          userId,
        },
      })
    }

    return NextResponse.json({ goalOz: roundedGoal })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to update water goal" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const { count } = await prisma.waterEntry.deleteMany({ where: { id, userId } })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to undo water log" }, { status: 500 })
  }
}
