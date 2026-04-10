import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate } from "@/lib/dateStorage"
import { getActiveUserId } from "@/lib/current-user"

export async function POST(req: NextRequest) {
  try {
    const userId = await getActiveUserId(req)
    const body = await req.json()
    if (!body.habitId || !body.date) {
      return NextResponse.json({ error: "habitId and date required" }, { status: 400 })
    }

    const date = parseYyyyMmDdToStoredDate(String(body.date))
    const habit = await prisma.habit.findFirst({
      where: { id: body.habitId, userId },
      select: { id: true },
    })
    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    const existing = await prisma.habitCompletion.findUnique({
      where: { habitId_date: { habitId: habit.id, date } },
    })

    if (existing) {
      await prisma.habitCompletion.delete({ where: { id: existing.id } })
      return NextResponse.json({ completed: false, id: existing.id })
    }

    const completion = await prisma.habitCompletion.create({
      data: { habitId: habit.id, date },
    })
    return NextResponse.json({ completed: true, id: completion.id }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to toggle completion" }, { status: 500 })
  }
}
