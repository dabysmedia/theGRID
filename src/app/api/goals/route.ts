import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getActiveUserId } from "@/lib/current-user"

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category")

  try {
    const userId = await getActiveUserId(req)
    if (category) {
      const goal = await prisma.goal.findFirst({
        where: { userId, category, active: true },
        orderBy: { createdAt: "desc" },
      })
      return NextResponse.json(goal)
    }

    const goals = await prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
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

    if (body.category) {
      await prisma.goal.updateMany({
        where: { userId, category: body.category, active: true },
        data: { active: false },
      })
    }

    const goal = await prisma.goal.create({
      data: {
        userId,
        category: body.category,
        goalType: body.goalType || "daily",
        direction: body.direction || "up",
        target: parseFloat(body.target),
        unit: body.unit,
        deadline: body.deadline ? new Date(body.deadline) : null,
        active: body.active ?? true,
      },
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
    const existing = await prisma.goal.findFirst({
      where: { id: body.id, userId },
      select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const goal = await prisma.goal.update({
      where: { id: existing.id },
      data: {
        goalType: body.goalType || undefined,
        direction: body.direction || undefined,
        target: body.target ? parseFloat(body.target) : undefined,
        unit: body.unit || undefined,
        deadline: body.deadline ? new Date(body.deadline) : undefined,
        active: body.active,
      },
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
    const result = await prisma.goal.deleteMany({ where: { id, userId } })
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
