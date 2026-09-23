import { describe, expect, it } from "vitest"
import { inferSavedFoodCategory, categoryFromSearchQuery } from "@/lib/calories/saved-food-category"

describe("inferSavedFoodCategory", () => {
  it("recognizes explicit food formats", () => {
    expect(inferSavedFoodCategory({ name: "Chocolate protein shake" })).toBe("shake")
    expect(inferSavedFoodCategory({ name: "Quest protein bar" })).toBe("bar")
    expect(inferSavedFoodCategory({ name: "Doritos chips" })).toBe("snack")
    expect(inferSavedFoodCategory({ name: "Iced coffee" })).toBe("drink")
  })

  it("recognizes restaurants before generic food terms", () => {
    expect(inferSavedFoodCategory({ name: "Chipotle chicken bowl" })).toBe("restaurant")
    expect(inferSavedFoodCategory({ name: "Starbucks protein box" })).toBe("restaurant")
  })

  it("uses meal tags and calories for foods without format keywords", () => {
    expect(inferSavedFoodCategory({ name: "Picadillo", mealType: "lunch" })).toBe("meal")
    expect(inferSavedFoodCategory({ name: "Homemade plate", calories: 650 })).toBe("meal")
    expect(inferSavedFoodCategory({ name: "Mystery bite", mealType: "snack" })).toBe("snack")
  })

  it("sorts plain ingredients and prepared plates apart", () => {
    expect(inferSavedFoodCategory({ name: "Chicken breast, cooked", calories: 187 })).toBe(
      "ingredient",
    )
    expect(inferSavedFoodCategory({ name: "Protein powder", calories: 120 })).toBe("ingredient")
    expect(inferSavedFoodCategory({ name: "Chicken rice bowl", calories: 640 })).toBe("meal")
  })

  it("treats a one-word category name as a category search", () => {
    expect(categoryFromSearchQuery("shakes")).toBe("shake")
    expect(categoryFromSearchQuery("bars")).toBe("bar")
    expect(categoryFromSearchQuery("protein bar")).toBeNull()
    expect(categoryFromSearchQuery("bare")).toBeNull()
  })
})
