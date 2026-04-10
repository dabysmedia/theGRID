import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getActiveUserId } from "@/lib/current-user"

export async function GET(req: NextRequest) {
  try {
    const userId = await getActiveUserId(req)
    const goals = await prisma.longGoal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        entries: { orderBy: { date: "desc" } },
      },
    })
    return NextResponse.json(goals)
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getActiveUserId(req)
    const body = await req.json()
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const unit = typeof body.unit === "string" ? body.unit.trim() : ""
    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 })
    }
    if (!unit) {
      return NextResponse.json({ error: "Unit is required." }, { status: 400 })
    }
    const target = parseFloat(body.target)
    if (Number.isNaN(target)) {
      return NextResponse.json({ error: "Target must be a number." }, { status: 400 })
    }
    let startValue: number | null = null
    if (body.startValue != null && body.startValue !== "") {
      const s = parseFloat(body.startValue)
      if (Number.isNaN(s)) {
        return NextResponse.json(
          { error: "Starting value must be a number." },
          { status: 400 }
        )
      }
      startValue = s
    }
    const goal = await prisma.longGoal.create({
      data: {
        userId,
        name,
        category: typeof body.category === "string" ? body.category : "other",
        target,
        unit,
        direction: body.direction === "down" ? "down" : "up",
        startValue,
        active: true,
      },
      include: { entries: true },
    })
    return NextResponse.json(goal, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await getActiveUserId(req)
    const body = await req.json()
    const existing = await prisma.longGoal.findFirst({
      where: { id: body.id, userId },
      select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const goal = await prisma.longGoal.update({
      where: { id: existing.id },
      data: {
        name: body.name ?? undefined,
        target: body.target != null ? parseFloat(body.target) : undefined,
        unit: body.unit ?? undefined,
        direction: body.direction ?? undefined,
        active: body.active,
      },
      include: { entries: true },
    })
    return NextResponse.json(goal)
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  try {
    const userId = await getActiveUserId(req)
    const result = await prisma.longGoal.deleteMany({ where: { id, userId } })
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
