import { describe, expect, it } from "vitest"
import {
  foodSearchRelevance,
  rankAndMergeFoodSearchResults,
  rankByFoodSearch,
} from "@/lib/calories/food-search-ranking"
import { correctFoodSearchQuery } from "@/lib/calories/food-search-query"
import { searchPreparedFoodCatalog } from "@/lib/calories/prepared-food-catalog"
import { searchStapleFoodCatalog } from "@/lib/calories/staple-food-catalog"
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
    expect(foodSearchRelevance(result, "chiken")).not.toBeNull()
    expect(foodSearchRelevance(result, "COSTCO CHICKEN")).not.toBeNull()
  })

  it("allows extra filler words when the food name still matches", () => {
    const result = food("Rotisserie Chicken", "Costco")
    expect(foodSearchRelevance(result, "grilled rotisserie chicken")).not.toBeNull()
    expect(foodSearchRelevance(result, "organic chicken")).not.toBeNull()
  })

  it("matches abbreviations, plurals, and short prefixes", () => {
    expect(foodSearchRelevance(food("Peanut Butter", "Generic"), "pb")).not.toBeNull()
    expect(foodSearchRelevance(food("Egg", "Generic"), "eggs")).not.toBeNull()
    expect(foodSearchRelevance(food("Egg", "Generic"), "eg")).not.toBeNull()
    expect(foodSearchRelevance(food("Greek Yogurt", "Chobani"), "yoghurt")).not.toBeNull()
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

  it("ranks local library names with the same fuzzy rules", () => {
    const ranked = rankByFoodSearch(
      [{ name: "Oatmeal" }, { name: "Greek Yogurt" }, { name: "Chicken Bake" }],
      "oatmel",
      (item) => ({ name: item.name }),
    )
    expect(ranked.map((item) => item.name)).toEqual(["Oatmeal"])
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

describe("staple food catalog", () => {
  it("surfaces everyday foods from typos and shorthand", () => {
    expect(searchStapleFoodCatalog("bananna")[0]).toMatchObject({
      food_name: "Banana",
      source: "catalog",
    })
    expect(searchStapleFoodCatalog("pb")[0]?.food_name).toMatch(/peanut butter/i)
    expect(searchStapleFoodCatalog("oatmeal")[0]?.food_name).toMatch(/oatmeal/i)
  })
})

describe("food search query correction", () => {
  it("rewrites common misspellings before talking to external databases", () => {
    expect(correctFoodSearchQuery("Chiken Breast")).toMatchObject({
      corrected: "chicken breast",
      didCorrect: true,
    })
    expect(correctFoodSearchQuery("bananna")).toMatchObject({
      corrected: "banana",
      didCorrect: true,
    })
    expect(correctFoodSearchQuery("pb")).toMatchObject({
      corrected: "peanut butter",
      didCorrect: true,
    })
    expect(correctFoodSearchQuery("chicken")).toMatchObject({
      didCorrect: false,
    })
  })
})
