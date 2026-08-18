import { describe, expect, it } from "vitest"
import {
  frequentFoodsForMeal,
  matchingFrequentFoods,
  type FrequentFoodEntry,
} from "@/lib/calories/frequent-foods"

function entry(
  id: string,
  mealType: string,
  description: string,
  createdAt: string,
): FrequentFoodEntry {
  return {
    id,
    mealType,
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

describe("frequentFoodsForMeal", () => {
  const now = Date.parse("2026-08-02T18:00:00Z")
  const history = [
    entry("snack-2", "snack", "Greek Yogurt", "2026-08-02T12:00:00Z"),
    entry("breakfast-3", "breakfast", "Oatmeal", "2026-08-02T08:00:00Z"),
    entry("snack-1", "Snack", " greek   yogurt ", "2026-08-01T12:00:00Z"),
    entry("breakfast-2", "breakfast", "Oatmeal", "2026-08-01T08:00:00Z"),
    entry("breakfast-1", "breakfast", "Oatmeal", "2026-07-31T08:00:00Z"),
    entry("lunch-1", "lunch", "Chicken Bowl", "2026-08-02T16:00:00Z"),
  ]

  it("uses only the selected meal history without cross-meal leakage", () => {
    expect(frequentFoodsForMeal(history, "snack", 16, now).map((food) => food.name)).toEqual([
      "Greek Yogurt",
    ])
    expect(frequentFoodsForMeal(history, "breakfast", 16, now).map((food) => food.name)).toEqual([
      "Oatmeal",
    ])
  })

  it("keeps the most recent portion data for repeated logs", () => {
    const result = frequentFoodsForMeal(history, "snack", 16, now)
    expect(result[0]).toMatchObject({
      id: "snack-2",
      logCount: 2,
      kind: "frequent",
      sameMeal: true,
    })
  })

  it("suggests a food after a single recent log", () => {
    const result = frequentFoodsForMeal([history[5]], "lunch", 16, now)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      name: "Chicken Bowl",
      kind: "recent",
      logCount: 1,
    })
  })

  it("rejects unsupported meal contexts", () => {
    expect(frequentFoodsForMeal(history, "brunch", 16, now)).toEqual([])
  })

  it("fuzzy-matches suggestions while searching", () => {
    const suggestions = frequentFoodsForMeal(history, "breakfast", 16, now)
    expect(matchingFrequentFoods(suggestions, "oatmel").map((food) => food.name)).toEqual([
      "Oatmeal",
    ])
  })
})
