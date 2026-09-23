import { describe, expect, it } from "vitest"
import { agentActCatalog } from "@/lib/agent/act/catalog"
import {
  ActError,
  canonicalOp,
  parseActRequest,
  resolveDayKey,
  resolveLogSlot,
  scaleMacros,
} from "@/lib/agent/act/parse"
import { parseAgentExercises } from "@/lib/agent/act/workout-shape"

describe("agent act commands", () => {
  it("parses a single op and a batch, including the short tuple form", () => {
    expect(parseActRequest({ user: "Carlos", op: "day", date: "today" })).toEqual({
      user: "Carlos",
      ops: [{ op: "day", args: { date: "today" } }],
    })
    expect(
      parseActRequest({
        profile: "Carlos",
        ops: [["food.search", "oikos"], { cmd: "meal.add", name: "Oikos", kcal: 90 }],
      }),
    ).toEqual({
      user: "Carlos",
      ops: [
        { op: "food.search", args: { q: "oikos" } },
        { op: "log.add", args: { name: "Oikos", kcal: 90 } },
      ],
    })
  })

  it("rejects an empty body and too many food searches", () => {
    expect(() => parseActRequest(null)).toThrow(ActError)
    expect(() =>
      parseActRequest({
        ops: Array.from({ length: 6 }, () => ({ op: "food.search", q: "rice" })),
      }),
    ).toThrow(/5 food.search/)
  })

  it("resolves today, yesterday, and meal slots", () => {
    expect(resolveDayKey("today", "2026-09-23")).toBe("2026-09-23")
    expect(resolveDayKey("yesterday", "2026-09-23")).toBe("2026-09-22")
    expect(resolveDayKey("", "2026-09-23")).toBe("2026-09-23")
    expect(resolveLogSlot("lunch", new Date("2026-09-23T15:00:00Z"), "America/New_York")).toEqual({
      mealSlot: "afternoon",
      mealType: "lunch",
    })
    expect(resolveLogSlot("snack", new Date(), null)).toEqual({
      mealSlot: "evening",
      mealType: "snack",
    })
  })

  it("scales a saved food's macros by servings", () => {
    expect(scaleMacros({ kcal: 90, p: 15, c: 6, f: 0 }, 2)).toEqual({
      kcal: 180,
      p: 30,
      c: 12,
      f: 0,
    })
  })

  it("turns compact workout sets into completed working sets", () => {
    const exercises = parseAgentExercises([
      { name: "Squat", machine: "Prime", sets: [[225, 5], { lb: 245, reps: 3, type: "failure" }] },
    ])
    expect(exercises).toHaveLength(1)
    expect(exercises[0]).toMatchObject({
      name: "Squat",
      machineName: "Prime",
      machineId: "custom:Prime",
    })
    expect(exercises[0]?.sets.map((set) => [set.weight, set.reps, set.type, set.completed])).toEqual([
      [225, 5, "working", true],
      [245, 3, "failure", true],
    ])
  })

  it("documents the user field and the food commands", () => {
    const doc = agentActCatalog()
    expect(canonicalOp("meal.add")).toBe("log.add")
    expect(doc).toContain("profile name or id")
    expect(doc).toContain("food.search")
    expect(doc).toContain("foods.add")
    expect(doc).toContain("log.move")
    expect(doc).toContain("userDefaulted")
  })
})
