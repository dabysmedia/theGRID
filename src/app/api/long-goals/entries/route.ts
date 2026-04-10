import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate } from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()

    const goal = await prisma.longGoal.findFirst({ where: { id: body.goalId, userId } })
    if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 })

    const entry = await prisma.longGoalEntry.create({
      data: {
        goalId: body.goalId,
        date: parseYyyyMmDdToStoredDate(String(body.date)),
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
