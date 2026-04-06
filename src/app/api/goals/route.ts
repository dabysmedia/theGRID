import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category")

  try {
    if (category) {
      const goal = await prisma.goal.findFirst({
        where: { category, active: true },
        orderBy: { createdAt: "desc" },
      })
      return NextResponse.json(goal)
    }

    const goals = await prisma.goal.findMany({
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(goals)
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (body.category) {
      await prisma.goal.updateMany({
        where: { category: body.category, active: true },
        data: { active: false },
      })
    }

    const goal = await prisma.goal.create({
      data: {
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
    const body = await req.json()
    const goal = await prisma.goal.update({
      where: { id: body.id },
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
    await prisma.goal.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
