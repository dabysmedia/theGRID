import { describe, expect, it } from "vitest"
import {
  frequentFoodsForSlot,
  loggedFoodLibrary,
  matchingFrequentFoods,
  recentFoods,
  type FrequentFoodEntry,
} from "@/lib/calories/frequent-foods"

function entry(
  id: string,
  mealSlot: string,
  description: string,
  createdAt: string,
): FrequentFoodEntry {
  return {
    id,
    mealType: "snack",
    mealSlot,
    description,
    calories: 200,
    protein: 10,
    carbs: 20,
    fat: 5,
    imageUrl: null,
    portionAmount: 1,
    portionUnit: "serving",
    createdAt: new Date(createdAt),
  }
}

describe("frequentFoodsForSlot", () => {
  const now = Date.parse("2026-08-02T18:00:00Z")
  const history = [
    entry("aft-2", "afternoon", "Greek Yogurt", "2026-08-02T12:00:00Z"),
    entry("morn-3", "morning", "Oatmeal", "2026-08-02T08:00:00Z"),
    entry("aft-1", "Afternoon", " greek   yogurt ", "2026-08-01T12:00:00Z"),
    entry("morn-2", "morning", "Oatmeal", "2026-08-01T08:00:00Z"),
    entry("morn-1", "morning", "Oatmeal", "2026-07-31T08:00:00Z"),
    entry("eve-1", "evening", "Chicken Bowl", "2026-08-02T16:00:00Z"),
  ]

  it("uses only the selected block's history without leaking across blocks", () => {
    expect(frequentFoodsForSlot(history, "afternoon", 16, now).map((f) => f.name)).toEqual([
      "Greek Yogurt",
    ])
    expect(frequentFoodsForSlot(history, "morning", 16, now).map((f) => f.name)).toEqual([
      "Oatmeal",
    ])
  })

  it("keeps the most recent portion data for repeated logs", () => {
    const result = frequentFoodsForSlot(history, "afternoon", 16, now)
    expect(result[0]).toMatchObject({
      id: "aft-2",
      logCount: 2,
      kind: "frequent",
      sameSlot: true,
    })
  })

  it("suggests a food after a single recent log", () => {
    const result = frequentFoodsForSlot([history[5]], "evening", 16, now)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      name: "Chicken Bowl",
      kind: "recent",
      logCount: 1,
    })
  })

  it("leaves one-time quick logs out of picks, recent, and the searchable library", () => {
    const quick = [{ ...history[5], oneOff: true }]
    expect(frequentFoodsForSlot(quick, "evening", 16, now)).toEqual([])
    expect(recentFoods(quick, "evening", 12).map((food) => food.name)).toEqual([])
    expect(loggedFoodLibrary(quick, "evening").map((food) => food.name)).toEqual([])
  })

  it("rejects an unsupported block", () => {
    // @ts-expect-error — guarding the runtime path callers can still hit
    expect(frequentFoodsForSlot(history, "brunch", 16, now)).toEqual([])
  })

  it("places legacy rows that predate the timeline", () => {
    const legacy: FrequentFoodEntry[] = [
      {
        ...entry("legacy-1", "", "Protein Shake", "2026-08-01T08:00:00Z"),
        mealSlot: null,
        mealType: "breakfast",
      },
      {
        ...entry("legacy-2", "", "Protein Shake", "2026-08-02T08:00:00Z"),
        mealSlot: null,
        mealType: "breakfast",
      },
    ]
    expect(frequentFoodsForSlot(legacy, "morning", 16, now).map((f) => f.name)).toEqual([
      "Protein Shake",
    ])
    expect(frequentFoodsForSlot(legacy, "evening", 16, now)).toEqual([])
  })

  it("places a legacy snack by the hour it was logged", () => {
    const snack: FrequentFoodEntry[] = [
      {
        ...entry("snack-1", "", "Trail Mix", "2026-08-01T21:00:00Z"),
        mealSlot: null,
        mealType: "snack",
      },
      {
        ...entry("snack-2", "", "Trail Mix", "2026-08-02T21:30:00Z"),
        mealSlot: null,
        mealType: "snack",
      },
    ]
    expect(frequentFoodsForSlot(snack, "evening", 16, now, "UTC").map((f) => f.name)).toEqual([
      "Trail Mix",
    ])
    expect(frequentFoodsForSlot(snack, "morning", 16, now, "UTC")).toEqual([])
  })

  it("fuzzy-matches suggestions while searching", () => {
    const suggestions = frequentFoodsForSlot(history, "morning", 16, now)
    expect(matchingFrequentFoods(suggestions, "oatmel").map((f) => f.name)).toEqual(["Oatmeal"])
  })
})

describe("loggedFoodLibrary", () => {
  it("returns every distinct food ever logged, most-logged first", () => {
    const history = [
      entry("a1", "morning", "Oatmeal", "2026-08-01T08:00:00Z"),
      entry("a2", "morning", "Oatmeal", "2026-07-30T08:00:00Z"),
      entry("a3", "morning", "Oatmeal", "2026-07-28T08:00:00Z"),
      entry("b1", "evening", "Fairlife Core Power Shake", "2026-07-20T20:00:00Z"),
      entry("c1", "afternoon", "Chicken Bowl", "2026-08-02T13:00:00Z"),
      entry("c2", "afternoon", "Chicken Bowl", "2026-08-01T13:00:00Z"),
    ]
    expect(loggedFoodLibrary(history, "morning", 400).map((f) => f.name)).toEqual([
      "Oatmeal",
      "Chicken Bowl",
      "Fairlife Core Power Shake",
    ])
  })

  it("keeps a food that was logged once a month ago, unlike the recent shelf", () => {
    const old = [entry("old", "evening", "Fairlife Core Power Shake", "2026-06-01T20:00:00Z")]
    const filler = Array.from({ length: 20 }, (_, i) =>
      entry(`f${i}`, "morning", `Filler ${i}`, "2026-08-02T08:00:00Z"),
    )
    const history = [...filler, ...old]
    expect(recentFoods(history, "morning", 12).map((f) => f.name)).not.toContain(
      "Fairlife Core Power Shake",
    )
    expect(loggedFoodLibrary(history, "morning", 400, undefined).map((f) => f.name)).toContain(
      "Fairlife Core Power Shake",
    )
  })

  it("respects its cap", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      entry(`m${i}`, "morning", `Food ${i}`, "2026-08-01T08:00:00Z"),
    )
    expect(loggedFoodLibrary(many, "morning", 10)).toHaveLength(10)
  })
})
