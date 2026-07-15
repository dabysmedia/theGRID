import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate, utcRangeWhereForCalendarDay } from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import { assertNotVacationBlocked } from "@/lib/vacation-block-server"
import { normalizeFoodImageUrl } from "@/lib/calories/food-image"
import { isFoodMeasurementUnit } from "@/lib/calories/measurements"

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const dateParam = searchParams.get("date")

    const where: Record<string, unknown> = { userId }
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      where.date = utcRangeWhereForCalendarDay(dateParam)
    }

    const entries = await prisma.calorieEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(entries)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

function safeOptionalFloat(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = parseFloat(String(v).trim())
  return Number.isFinite(n) ? n : null
}

async function calorieEntryData(body: Record<string, unknown>, userId: string) {
  const dateStr = typeof body.date === "string" ? body.date.trim() : ""
  const mealType = typeof body.mealType === "string" ? body.mealType.trim() : ""
  if (!dateStr || !mealType) throw new UserError("Date and meal type are required.", 400)

  let date: Date
  try {
    date = parseYyyyMmDdToStoredDate(dateStr)
  } catch {
    throw new UserError("Invalid date.", 400)
  }
  await assertNotVacationBlocked(userId, dateStr.slice(0, 10))

  const calories = Math.round(parseFloat(String(body.calories ?? "").trim()))
  if (!Number.isFinite(calories) || calories < 0) {
    throw new UserError("Valid calories are required.", 400)
  }
  const portionAmount = safeOptionalFloat(body.portionAmount)

  return {
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
    imageUrl: normalizeFoodImageUrl(body.imageUrl),
    portionAmount:
      portionAmount != null && portionAmount > 0 ? portionAmount : null,
    portionUnit: isFoodMeasurementUnit(body.portionUnit)
      ? body.portionUnit
      : null,
    userId,
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = (await req.json()) as Record<string, unknown>
    if (Array.isArray(body.entries)) {
      if (body.entries.length === 0 || body.entries.length > 100) {
        return NextResponse.json({ error: "Add between 1 and 100 foods." }, { status: 400 })
      }
      const data = await Promise.all(
        body.entries.map((entry) =>
          calorieEntryData(
            entry && typeof entry === "object"
              ? (entry as Record<string, unknown>)
              : {},
            userId,
          ),
        ),
      )
      const entries = await prisma.$transaction(
        data.map((item) => prisma.calorieEntry.create({ data: item })),
      )
      return NextResponse.json(entries, { status: 201 })
    }

    const entry = await prisma.calorieEntry.create({
      data: await calorieEntryData(body, userId),
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
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
    const userId = await resolveUserId(req)
    const body = (await req.json()) as Record<string, unknown>

    if (Array.isArray(body.entries)) {
      const rawEntries = body.entries
      const deleteIds = Array.isArray(body.deleteIds)
        ? body.deleteIds
            .filter((id): id is string => typeof id === "string" && id.trim() !== "")
            .map((id) => id.trim())
        : []
      if (rawEntries.length > 100 || deleteIds.length > 100 || rawEntries.length + deleteIds.length === 0) {
        return NextResponse.json(
          { error: "Update between 1 and 100 foods at a time." },
          { status: 400 },
        )
      }

      const entries = rawEntries.map((entry) =>
        entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {},
      )
      const updateIds = entries
        .map((entry) => (typeof entry.id === "string" ? entry.id.trim() : ""))
        .filter(Boolean)
      const touchedIds = [...new Set([...updateIds, ...deleteIds])]
      if (touchedIds.length !== updateIds.length + deleteIds.length) {
        return NextResponse.json({ error: "Duplicate entry ids are not allowed." }, { status: 400 })
      }

      if (touchedIds.length > 0) {
        const ownedEntries = await prisma.calorieEntry.count({
          where: { id: { in: touchedIds }, userId },
        })
        if (ownedEntries !== touchedIds.length) {
          return NextResponse.json({ error: "One or more foods were not found." }, { status: 404 })
        }
      }

      const data = await Promise.all(entries.map((entry) => calorieEntryData(entry, userId)))
      const saved = await prisma.$transaction(async (tx) => {
        const nextEntries = await Promise.all(
          entries.map((entry, index) => {
            const id = typeof entry.id === "string" ? entry.id.trim() : ""
            return id
              ? tx.calorieEntry.update({ where: { id }, data: data[index] })
              : tx.calorieEntry.create({ data: data[index] })
          }),
        )
        if (deleteIds.length > 0) {
          await tx.calorieEntry.deleteMany({ where: { id: { in: deleteIds }, userId } })
        }
        return nextEntries
      })
      return NextResponse.json(saved)
    }

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

    await assertNotVacationBlocked(userId, dateStr.slice(0, 10))

    const calories = Math.round(parseFloat(String(body.calories ?? "").trim()))
    if (!Number.isFinite(calories) || calories < 0) {
      return NextResponse.json({ error: "Valid calories are required." }, { status: 400 })
    }

    const existing = await prisma.calorieEntry.findFirst({ where: { id, userId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const entry = await prisma.calorieEntry.update({
      where: { id },
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
        ...("imageUrl" in body
          ? { imageUrl: normalizeFoodImageUrl(body.imageUrl) }
          : {}),
        portionAmount:
          safeOptionalFloat(body.portionAmount) != null &&
          safeOptionalFloat(body.portionAmount)! > 0
            ? safeOptionalFloat(body.portionAmount)
            : null,
        portionUnit: isFoodMeasurementUnit(body.portionUnit)
          ? body.portionUnit
          : null,
      },
    })
    return NextResponse.json(entry)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
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
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const { count } = await prisma.calorieEntry.deleteMany({ where: { id, userId } })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
