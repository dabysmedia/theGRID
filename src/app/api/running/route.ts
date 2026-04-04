import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { startOfDay, endOfDay } from "date-fns"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const dateParam = searchParams.get("date")

  try {
    const where = dateParam
      ? {
          date: {
            gte: startOfDay(new Date(dateParam)),
            lte: endOfDay(new Date(dateParam)),
          },
        }
      : {}

    const entries = await prisma.runEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(entries)
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    )
  }

  try {
    const distance = Number.parseFloat(String(body.distance ?? ""))
    const duration = Number.parseInt(String(body.duration ?? ""), 10)
    const dateStr = typeof body.date === "string" ? body.date : ""
    const dateBuilt = new Date(dateStr + "T00:00:00")
    if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(duration) || duration <= 0) {
      return NextResponse.json(
        { error: "Valid distance and duration are required." },
        { status: 400 }
      )
    }

    const entry = await prisma.runEntry.create({
      data: {
        date: dateBuilt,
        distance,
        duration,
        environment: (body.environment as string) || "outdoor",
        notes: (body.notes as string | null) ?? null,
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
    await prisma.runEntry.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
