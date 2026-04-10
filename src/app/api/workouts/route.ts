import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate, utcRangeWhereForCalendarDay } from "@/lib/dateStorage"
import { getActiveUserId } from "@/lib/current-user"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const dateParam = searchParams.get("date")

  try {
    const userId = await getActiveUserId(req)
    const where =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? { userId, date: utcRangeWhereForCalendarDay(dateParam) }
        : { userId }

    const entries = await prisma.workoutEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(entries)
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getActiveUserId(req)
    const body = await req.json()
    const entry = await prisma.workoutEntry.create({
      data: {
        userId,
        date: parseYyyyMmDdToStoredDate(String(body.date)),
        type: body.type,
        name: body.name,
        duration: body.duration ? parseInt(body.duration) : null,
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
    const result = await prisma.workoutEntry.deleteMany({ where: { id, userId } })
    if (result.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
