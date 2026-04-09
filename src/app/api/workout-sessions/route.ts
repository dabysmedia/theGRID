import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate } from "@/lib/dateStorage"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")

  try {
    const where = status ? { status } : {}
    const sessions = await prisma.workoutSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
    })
    return NextResponse.json(sessions)
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, date, exercises } = body
    const session = await prisma.workoutSession.create({
      data: {
        name: (name || "Workout").trim(),
        date: parseYyyyMmDdToStoredDate(String(date)),
        exercises: JSON.stringify(Array.isArray(exercises) ? exercises : []),
        status: "active",
      },
    })
    return NextResponse.json(session, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}
