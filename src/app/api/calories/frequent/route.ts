import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import {
  frequentFoodsForSlot,
  loggedFoodLibrary,
  recentFoods,
} from "@/lib/calories/frequent-foods"
import { asMealSlot } from "@/lib/calories/meal-slots"

/**
 * `?slot=morning` returns `{ picks, recent, library }` for the composer —
 * `library` is every food ever logged, so typing three letters can find one.
 * `?slots=morning,evening` returns `{ morning: [...], evening: [...] }` from a
 * single history read, so the timeline can fill all three blocks in one trip.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const single = asMealSlot(req.nextUrl.searchParams.get("slot"))
    const batch = (req.nextUrl.searchParams.get("slots") ?? "")
      .split(",")
      .map((value) => asMealSlot(value))
      .filter((value): value is NonNullable<typeof value> => value != null)

    if (!single && batch.length === 0) {
      return NextResponse.json(
        { error: "Choose morning, afternoon, or evening." },
        { status: 400 },
      )
    }

    const [entries, profile] = await Promise.all([
      prisma.calorieEntry.findMany({
        where: { userId },
        select: {
          id: true,
          mealType: true,
          mealSlot: true,
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
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } }),
    ])

    const timeZone = profile?.timeZone ?? null
    const now = Date.now()
    const headers = { "Cache-Control": "no-store, must-revalidate" }

    if (single) {
      return NextResponse.json(
        {
          picks: frequentFoodsForSlot(entries, single, 16, now, timeZone),
          recent: recentFoods(entries, single, 12, timeZone),
          library: loggedFoodLibrary(entries, single, 400, timeZone),
        },
        { headers },
      )
    }

    return NextResponse.json(
      Object.fromEntries(
        [...new Set(batch)].map((slot) => [
          slot,
          frequentFoodsForSlot(entries, slot, 16, now, timeZone),
        ]),
      ),
      { headers },
    )
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to load frequent foods." }, { status: 500 })
  }
}
