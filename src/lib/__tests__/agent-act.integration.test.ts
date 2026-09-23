import { afterAll, describe, expect, it } from "vitest"

/**
 * Opt-in. Uses whatever DATABASE_PATH the process already has, so the default
 * `npm test` run skips it and does not touch the dev database.
 * Run with AGENT_ACT_INTEGRATION=1 and DATABASE_PATH pointed at a scratch file.
 */
const enabled = process.env.AGENT_ACT_INTEGRATION === "1"

describe.skipIf(!enabled)("agent act against a database", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let runAgentAct: typeof import("@/lib/agent/act/dispatch").runAgentAct

  afterAll(async () => {
    if (prisma) await prisma.$disconnect()
  })

  it("writes food, recipes, and a workout for the named profile only", async () => {
    ;({ prisma } = await import("@/lib/prisma"))
    ;({ runAgentAct } = await import("@/lib/agent/act/dispatch"))

    await prisma.user.create({ data: { name: "Alex", timeZone: "America/New_York" } })
    await prisma.user.create({ data: { name: "Carlos", timeZone: "America/New_York" } })

    await expect(runAgentAct({ op: "day" })).rejects.toThrow(/More than one profile/)

    const created = await runAgentAct({
      user: "carlos",
      ops: [
        { op: "foods.add", name: "Oikos", kcal: 90, p: 15, c: 6, f: 0, amt: 1, unit: "serving" },
        { op: "log.add", date: "2026-09-23", slot: "morning", name: "Eggs", kcal: 140, p: 12 },
        {
          op: "recipes.add",
          name: "Shake",
          tags: ["snack"],
          items: [{ name: "Oikos", kcal: 90, p: 15 }, { name: "Berries", kcal: 40, c: 10 }],
        },
        {
          op: "workout.add",
          date: "2026-09-23",
          name: "Legs",
          exercises: [{ name: "Squat", sets: [[225, 5], [245, 3]] }],
        },
      ],
    })

    expect(created.user).toMatchObject({ name: "Carlos" })
    expect(created.ok).toBe(true)
    const foodId = (created.results[0] as { id: string }).id
    const logId = (created.results[1] as { id: string }).id
    const recipeId = (created.results[2] as { id: string }).id

    const logged = await runAgentAct({
      user: "Carlos",
      ops: [
        { op: "log.add", date: "2026-09-23", slot: "afternoon", foodId, servings: 2 },
        { op: "recipes.log", id: recipeId, date: "2026-09-23", slot: "evening" },
        { op: "log.move", id: logId, date: "2026-09-22", slot: "snack" },
        { op: "day", date: "2026-09-23" },
      ],
    })
    expect(logged.ok).toBe(true)
    const doubled = logged.results[0] as { id: string }
    const day = logged.results[3] as { foods: { id: string; kcal: number; name: string }[]; workouts: { name: string }[] }
    const saved = day.foods.find((row) => row.id === doubled.id)
    expect(saved).toMatchObject({ name: "Oikos", kcal: 180 })
    expect(day.foods.some((row) => row.name === "Shake" && row.kcal === 130)).toBe(true)
    expect(day.foods.some((row) => row.id === logId)).toBe(false)
    expect(day.workouts.map((row) => row.name)).toContain("Legs")

    const moved = await prisma.calorieEntry.findUniqueOrThrow({ where: { id: logId } })
    expect(moved.mealType).toBe("snack")
    expect(moved.mealSlot).toBe("evening")

    const alexFoods = await prisma.calorieEntry.count({
      where: { user: { name: "Alex" } },
    })
    expect(alexFoods).toBe(0)
  })
})
