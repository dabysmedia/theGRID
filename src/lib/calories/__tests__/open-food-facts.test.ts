import { describe, expect, it } from "vitest"
import {
  mapOpenFoodFactsProduct,
  rankOpenFoodFactsProducts,
} from "@/lib/calories/open-food-facts"

describe("mapOpenFoodFactsProduct", () => {
  it("prefers the nutrition values supplied for one serving", () => {
    const item = mapOpenFoodFactsProduct({
      code: "0888849000012",
      product_name: "Chocolate Chip Cookie Dough",
      brands: "Quest",
      serving_size: "1 bar (60 g)",
      serving_quantity: 60,
      nutriments: {
        "energy-kcal_serving": 190,
        proteins_serving: 21,
        carbohydrates_serving: 22,
        fat_serving: 9,
      },
    })

    expect(item).toMatchObject({
      food_id: "off:0888849000012",
      serving_size_g: 60,
      calories: 190,
      protein: 21,
      carbs: 22,
      fat: 9,
      source: "openfoodfacts",
    })
  })

  it("scales per-100g nutrition to the declared serving size", () => {
    const item = mapOpenFoodFactsProduct({
      code: "12345678",
      product_name: "Example chips",
      serving_quantity: 30,
      nutriments: {
        "energy-kcal_100g": 500,
        proteins_100g: 10,
        carbohydrates_100g: 50,
        fat_100g: 20,
      },
    })

    expect(item).toMatchObject({ calories: 150, protein: 3, carbs: 15, fat: 6 })
  })

  it("keeps the full-size product image when both image sizes are available", () => {
    const item = mapOpenFoodFactsProduct({
      code: "12345678",
      product_name: "Example bar",
      image_front_url: "https://images.openfoodfacts.org/full.jpg",
      image_front_small_url: "https://images.openfoodfacts.org/small.jpg",
      nutriments: { "energy-kcal_100g": 400 },
    })

    expect(item?.image_url).toBe("https://images.openfoodfacts.org/full.jpg")
  })
})

describe("rankOpenFoodFactsProducts", () => {
  it("drops duplicates and products that do not match every query token", () => {
    const foods = rankOpenFoodFactsProducts(
      [
        { code: "1", product_name: "Chocolate bar", brands: "A", nutriments: { "energy-kcal_100g": 500 } },
        { code: "2", product_name: "Quest bar", brands: "Quest", nutriments: { "energy-kcal_100g": 350 } },
        { code: "3", product_name: "Quest bar", brands: "Quest", nutriments: { "energy-kcal_100g": 350 } },
        { code: "4", product_name: "Quest bar", brands: "No nutrition" },
      ],
      "quest bar",
    )

    expect(foods).toHaveLength(1)
    expect(foods[0].food_name).toBe("Quest bar")
    expect(foods.map((food) => food.food_id)).not.toContain("off:3")
  })

  it("keeps a brand plus product prefix match ahead of unrelated brand products", () => {
    const foods = rankOpenFoodFactsProducts(
      [
        { code: "1", product_name: "California sliced almonds", brands: "Costco", nutriments: { "energy-kcal_100g": 520 } },
        { code: "2", product_name: "Colombian cold brew coffee", brands: "Costco", nutriments: { "energy-kcal_100g": 5 } },
        { code: "3", product_name: "Rotisserie Chicken", brands: "Costco", nutriments: { "energy-kcal_100g": 165 } },
      ],
      "Costco rotisse",
    )

    expect(foods.map((food) => food.food_name)).toEqual(["Rotisserie Chicken"])
  })
})
