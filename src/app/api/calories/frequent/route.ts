import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import { frequentFoodsForMeal } from "@/lib/calories/frequent-foods"

const ALLOWED_MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"])

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const mealType = req.nextUrl.searchParams.get("mealType")?.trim().toLowerCase() ?? ""
    if (!ALLOWED_MEAL_TYPES.has(mealType)) {
      return NextResponse.json({ error: "Choose a valid meal type." }, { status: 400 })
    }

    const entries = await prisma.calorieEntry.findMany({
      where: { userId },
      select: {
        id: true,
        mealType: true,
        description: true,
        calories: true,
        protein: true,
        carbs: true,
        fat: true,
        imageUrl: true,
        portionAmount: true,
        portionUnit: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    })

    return NextResponse.json(frequentFoodsForMeal(entries, mealType), {
      headers: { "Cache-Control": "no-store, must-revalidate" },
    })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to load frequent foods." }, { status: 500 })
  }
}
