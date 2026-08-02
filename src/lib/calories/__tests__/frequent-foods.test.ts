import { describe, expect, it } from "vitest"
import {
  frequentFoodsForMeal,
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
  const history = [
    entry("snack-2", "snack", "Greek Yogurt", "2026-08-02T12:00:00Z"),
    entry("breakfast-3", "breakfast", "Oatmeal", "2026-08-02T08:00:00Z"),
    entry("snack-1", "Snack", " greek   yogurt ", "2026-08-01T12:00:00Z"),
    entry("breakfast-2", "breakfast", "Oatmeal", "2026-08-01T08:00:00Z"),
    entry("breakfast-1", "breakfast", "Oatmeal", "2026-07-31T08:00:00Z"),
  ]

  it("uses only the selected meal history without cross-meal leakage", () => {
    expect(frequentFoodsForMeal(history, "snack").map((food) => food.name)).toEqual([
      "Greek Yogurt",
    ])
    expect(frequentFoodsForMeal(history, "breakfast").map((food) => food.name)).toEqual([
      "Oatmeal",
    ])
  })

  it("requires repeated logs and keeps the most recent portion data", () => {
    const result = frequentFoodsForMeal(history, "snack")
    expect(result[0]).toMatchObject({ id: "snack-2", logCount: 2 })
    expect(frequentFoodsForMeal([history[0]], "snack")).toEqual([])
  })

  it("rejects unsupported meal contexts", () => {
    expect(frequentFoodsForMeal(history, "brunch")).toEqual([])
  })
})
