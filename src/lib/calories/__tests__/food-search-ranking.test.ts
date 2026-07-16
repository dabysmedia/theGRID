import { describe, expect, it } from "vitest"
import {
  foodSearchRelevance,
  rankAndMergeFoodSearchResults,
} from "@/lib/calories/food-search-ranking"
import { searchPreparedFoodCatalog } from "@/lib/calories/prepared-food-catalog"
import type { FoodSearchItem } from "@/lib/calories/open-food-facts"

function food(name: string, brand: string): FoodSearchItem {
  return {
    food_id: `${brand}:${name}`,
    food_name: name,
    brand_name: brand,
    food_type: "Test",
    serving_description: "1 serving",
    serving_size_g: null,
    calories: 100,
    protein: null,
    carbs: null,
    fat: null,
    image_url: null,
    source: "openfoodfacts",
  }
}

describe("food search ranking", () => {
  it("requires every meaningful term instead of accepting a brand-only match", () => {
    expect(foodSearchRelevance(food("Cold Brew Coffee", "Costco"), "costco rotisse")).toBeNull()
    expect(foodSearchRelevance(food("Rotisserie Chicken", "Costco"), "costco rotisse")).not.toBeNull()
  })

  it("supports prefixes and small spelling mistakes", () => {
    const result = food("Rotisserie Chicken", "Costco")
    expect(foodSearchRelevance(result, "costco rotisse")).not.toBeNull()
    expect(foodSearchRelevance(result, "costco rotiserrie chicken")).not.toBeNull()
  })

  it("ranks the complete brand and product match first across sources", () => {
    const ranked = rankAndMergeFoodSearchResults("costco rotisserie", [
      [food("Cold Brew Coffee", "Costco")],
      [
        {
          ...food("Rotisserie Chicken", "Costco"),
          food_id: "catalog:costco-rotisserie",
          source: "catalog",
        },
      ],
    ])
    expect(ranked.map((result) => result.food_name)).toEqual(["Rotisserie Chicken"])
  })
})

describe("prepared food catalog", () => {
  it("finds Costco rotisserie chicken from an incomplete query", () => {
    expect(searchPreparedFoodCatalog("Costco rotisse")[0]).toMatchObject({
      food_name: "Rotisserie Chicken",
      brand_name: "Costco",
      source: "catalog",
    })
  })
})
