import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const category = req.nextUrl.searchParams.get("category")

    if (category) {
      const goal = await prisma.goal.findFirst({
        where: { category, active: true, userId },
        orderBy: { createdAt: "desc" },
      })
      return NextResponse.json(goal)
    }

    const goals = await prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(goals)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()

    if (body.category) {
      await prisma.goal.updateMany({
        where: { category: body.category, active: true, userId },
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
        userId,
      },
    })
    return NextResponse.json(goal, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()

    const existing = await prisma.goal.findFirst({ where: { id: body.id, userId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

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
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const { count } = await prisma.goal.deleteMany({ where: { id, userId } })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
