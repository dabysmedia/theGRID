import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"

const ALLOWED_MEAL_TAGS = new Set(["breakfast", "lunch", "dinner", "snack"])

/** Multiple tags stored as comma-separated `mealType` (e.g. `breakfast,lunch`). */
function splitStoredMealTags(mealType: string): string[] {
  if (!mealType?.trim()) return []
  return [
    ...new Set(
      mealType
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => ALLOWED_MEAL_TAGS.has(t))
    ),
  ]
}

function normalizeMealTagsFromBody(body: Record<string, unknown>): string[] | null {
  if (Array.isArray(body.mealTags)) {
    const tags = body.mealTags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => ALLOWED_MEAL_TAGS.has(t))
    const unique = [...new Set(tags)]
    return unique.length > 0 ? unique : null
  }
  const single = typeof body.mealType === "string" ? body.mealType.trim().toLowerCase() : ""
  if (single && ALLOWED_MEAL_TAGS.has(single)) return [single]
  return null
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const mealType = searchParams.get("mealType")

    const meals = await prisma.savedMeal.findMany({
      where: { userId },
      orderBy: { useCount: "desc" },
    })
    if (mealType) {
      const mt = mealType.trim().toLowerCase()
      if (ALLOWED_MEAL_TAGS.has(mt)) {
        return NextResponse.json(meals.filter((m) => splitStoredMealTags(m.mealType).includes(mt)))
      }
    }
    return NextResponse.json(meals)
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

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = (await req.json()) as Record<string, unknown>
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const tags = normalizeMealTagsFromBody(body)
    if (!name || !tags) {
      return NextResponse.json(
        { error: "Name and at least one meal tag (breakfast, lunch, dinner, snack) are required." },
        { status: 400 }
      )
    }
    const calories = Math.round(parseFloat(String(body.calories ?? "").trim()))
    if (!Number.isFinite(calories) || calories < 0) {
      return NextResponse.json({ error: "Valid calories are required." }, { status: 400 })
    }
    const meal = await prisma.savedMeal.create({
      data: {
        name,
        mealType: tags.join(","),
        calories,
        protein: safeOptionalFloat(body.protein),
        carbs: safeOptionalFloat(body.carbs),
        fat: safeOptionalFloat(body.fat),
        userId,
      },
    })
    return NextResponse.json(meal, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error("[saved-meals POST]", e)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      {
        error:
          dev && e instanceof Error
            ? e.message
            : "Could not save meal. Check your connection and try again.",
      },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const existing = await prisma.savedMeal.findFirst({ where: { id, userId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = (await req.json()) as Record<string, unknown>
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const tags = normalizeMealTagsFromBody(body)
    if (!name || !tags) {
      return NextResponse.json(
        { error: "Name and at least one meal tag (breakfast, lunch, dinner, snack) are required." },
        { status: 400 }
      )
    }
    const calories = Math.round(parseFloat(String(body.calories ?? "").trim()))
    if (!Number.isFinite(calories) || calories < 0) {
      return NextResponse.json({ error: "Valid calories are required." }, { status: 400 })
    }

    const meal = await prisma.savedMeal.update({
      where: { id },
      data: {
        name,
        mealType: tags.join(","),
        calories,
        protein: safeOptionalFloat(body.protein),
        carbs: safeOptionalFloat(body.carbs),
        fat: safeOptionalFloat(body.fat),
      },
    })
    return NextResponse.json(meal)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error("[saved-meals PUT]", e)
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const existing = await prisma.savedMeal.findFirst({ where: { id, userId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const meal = await prisma.savedMeal.update({
      where: { id },
      data: { useCount: { increment: 1 } },
    })
    return NextResponse.json(meal)
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

    const { count } = await prisma.savedMeal.deleteMany({ where: { id, userId } })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
