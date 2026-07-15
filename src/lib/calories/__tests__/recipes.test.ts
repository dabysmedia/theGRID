import { describe, expect, it } from "vitest"
import {
  parseRecipeIngredients,
  recipeNutritionTotals,
} from "@/lib/calories/recipes"

describe("parseRecipeIngredients", () => {
  it("keeps ingredient portions and rejects invalid units", () => {
    expect(
      parseRecipeIngredients([
        {
          name: "Chicken breast",
          calories: 220,
          protein: 42,
          carbs: 0,
          fat: 5,
          portionAmount: 6,
          portionUnit: "oz",
        },
      ]),
    ).toEqual([
      {
        name: "Chicken breast",
        calories: 220,
        protein: 42,
        carbs: 0,
        fat: 5,
        portionAmount: 6,
        portionUnit: "oz",
        imageUrl: null,
      },
    ])

    expect(
      parseRecipeIngredients([
        { name: "Chicken", calories: 220, portionAmount: 1, portionUnit: "bucket" },
      ]),
    ).toBeNull()
  })
})

describe("recipeNutritionTotals", () => {
  it("sums the complete meal with stable macro precision", () => {
    expect(
      recipeNutritionTotals([
        {
          name: "Chicken",
          calories: 220,
          protein: 42.25,
          carbs: 0,
          fat: 5.15,
          portionAmount: 6,
          portionUnit: "oz",
          imageUrl: null,
        },
        {
          name: "Rice",
          calories: 205,
          protein: 4.3,
          carbs: 44.5,
          fat: 0.4,
          portionAmount: 1,
          portionUnit: "serving",
          imageUrl: null,
        },
      ]),
    ).toEqual({ calories: 425, protein: 46.6, carbs: 44.5, fat: 5.6 })
  })
})
