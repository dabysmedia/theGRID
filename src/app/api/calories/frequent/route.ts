import { hiddenFoodNames, updateHiddenFoods, visibleFoodHistory } from "@/lib/calories/hidden-foods"
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
          oneOff: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true, hiddenFoodNamesJson: true } }),
    ])

    const visibleEntries = visibleFoodHistory(entries, profile?.hiddenFoodNamesJson)
    const timeZone = profile?.timeZone ?? null
    const now = Date.now()
    const headers = { "Cache-Control": "no-store, must-revalidate" }

    if (single) {
      return NextResponse.json(
        {
          hiddenNames: [...hiddenFoodNames(profile?.hiddenFoodNamesJson)],
          picks: frequentFoodsForSlot(visibleEntries, single, 16, now, timeZone),
          recent: recentFoods(visibleEntries, single, 12, timeZone),
          library: loggedFoodLibrary(visibleEntries, single, 400, timeZone),
        },
        { headers },
      )
    }

    return NextResponse.json(
      Object.fromEntries(
        [...new Set(batch)].map((slot) => [
          slot,
          frequentFoodsForSlot(visibleEntries, slot, 16, now, timeZone),
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

/** Hide a history suggestion across all slots without touching nutrition logs. */
export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 500 || typeof body.hidden !== "boolean") {
      return NextResponse.json({ error: "A food name and hidden flag are required." }, { status: 400 })
    }
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { hiddenFoodNamesJson: true } })
      await tx.user.update({ where: { id: userId }, data: { hiddenFoodNamesJson: updateHiddenFoods(user.hiddenFoodNamesJson, body.name, body.hidden) } })
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UserError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: "Could not update suggestions." }, { status: 500 })
  }
}
