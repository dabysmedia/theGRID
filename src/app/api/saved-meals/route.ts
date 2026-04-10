import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const mealType = searchParams.get("mealType")

    const where: Record<string, unknown> = { userId }
    if (mealType) where.mealType = mealType

    const meals = await prisma.savedMeal.findMany({
      where,
      orderBy: { useCount: "desc" },
    })
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
    const body = await req.json()
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const mealType = typeof body.mealType === "string" ? body.mealType.trim() : ""
    if (!name || !mealType) {
      return NextResponse.json({ error: "Name and meal type are required." }, { status: 400 })
    }
    const calories = Math.round(parseFloat(String(body.calories ?? "").trim()))
    if (!Number.isFinite(calories) || calories < 0) {
      return NextResponse.json({ error: "Valid calories are required." }, { status: 400 })
    }
    const meal = await prisma.savedMeal.create({
      data: {
        name,
        mealType,
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
