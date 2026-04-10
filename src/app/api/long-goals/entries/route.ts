import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate } from "@/lib/dateStorage"
import { getActiveUserId } from "@/lib/current-user"

export async function POST(req: NextRequest) {
  try {
    const userId = await getActiveUserId(req)
    const body = await req.json()
    const goal = await prisma.longGoal.findFirst({
      where: { id: body.goalId, userId },
      select: { id: true },
    })
    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 })
    }
    const entry = await prisma.longGoalEntry.create({
      data: {
        goalId: goal.id,
        date: parseYyyyMmDdToStoredDate(String(body.date)),
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
    const userId = await getActiveUserId(req)
    const result = await prisma.longGoalEntry.deleteMany({
      where: { id, goal: { userId } },
    })
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
