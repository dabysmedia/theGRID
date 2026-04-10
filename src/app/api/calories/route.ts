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

    const entries = await prisma.calorieEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(entries)
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

function safeOptionalFloat(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = parseFloat(String(v).trim())
  return Number.isFinite(n) ? n : null
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getActiveUserId(req)
    const body = await req.json()

    const dateStr = typeof body.date === "string" ? body.date.trim() : ""
    const mealType = typeof body.mealType === "string" ? body.mealType.trim() : ""
    if (!dateStr || !mealType) {
      return NextResponse.json({ error: "Date and meal type are required." }, { status: 400 })
    }

    let date: Date
    try {
      date = parseYyyyMmDdToStoredDate(dateStr)
    } catch {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 })
    }

    const calories = Math.round(parseFloat(String(body.calories ?? "").trim()))
    if (!Number.isFinite(calories) || calories < 0) {
      return NextResponse.json({ error: "Valid calories are required." }, { status: 400 })
    }

    const entry = await prisma.calorieEntry.create({
      data: {
        userId,
        date,
        mealType,
        description:
          typeof body.description === "string" && body.description.trim() !== ""
            ? body.description.trim()
            : null,
        calories,
        protein: safeOptionalFloat(body.protein),
        carbs: safeOptionalFloat(body.carbs),
        fat: safeOptionalFloat(body.fat),
      },
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (e) {
    console.error("[calories POST]", e)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      {
        error:
          dev && e instanceof Error
            ? e.message
            : "Could not save entry. Check your connection and try again.",
      },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await getActiveUserId(req)
    const body = await req.json()
    const id = typeof body.id === "string" ? body.id.trim() : ""
    if (!id) {
      return NextResponse.json({ error: "Entry id is required." }, { status: 400 })
    }

    const dateStr = typeof body.date === "string" ? body.date.trim() : ""
    const mealType = typeof body.mealType === "string" ? body.mealType.trim() : ""
    if (!dateStr || !mealType) {
      return NextResponse.json({ error: "Date and meal type are required." }, { status: 400 })
    }

    let date: Date
    try {
      date = parseYyyyMmDdToStoredDate(dateStr)
    } catch {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 })
    }

    const calories = Math.round(parseFloat(String(body.calories ?? "").trim()))
    if (!Number.isFinite(calories) || calories < 0) {
      return NextResponse.json({ error: "Valid calories are required." }, { status: 400 })
    }

    const existing = await prisma.calorieEntry.findFirst({
      where: { id, userId },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 })
    }

    const entry = await prisma.calorieEntry.update({
      where: { id: existing.id },
      data: {
        date,
        mealType,
        description:
          typeof body.description === "string" && body.description.trim() !== ""
            ? body.description.trim()
            : null,
        calories,
        protein: safeOptionalFloat(body.protein),
        carbs: safeOptionalFloat(body.carbs),
        fat: safeOptionalFloat(body.fat),
      },
    })
    return NextResponse.json(entry)
  } catch (e) {
    console.error("[calories PUT]", e)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      {
        error:
          dev && e instanceof Error
            ? e.message
            : "Could not update entry. Check your connection and try again.",
      },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  try {
    const userId = await getActiveUserId(req)
    const result = await prisma.calorieEntry.deleteMany({ where: { id, userId } })
    if (result.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
