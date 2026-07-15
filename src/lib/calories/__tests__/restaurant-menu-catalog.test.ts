import { describe, expect, it } from "vitest"
import {
  getRestaurantMenu,
  restaurantMenuFoods,
  searchRestaurantMenus,
} from "@/lib/calories/restaurant-menu-catalog"

describe("restaurant menu catalog", () => {
  it("exposes browsable menu sections with normalized food results", () => {
    const chipotle = getRestaurantMenu("chipotle")

    expect(chipotle).not.toBeNull()
    const foods = restaurantMenuFoods(chipotle!)
    expect(foods.length).toBeGreaterThan(10)
    expect(foods.find((food) => food.food_name === "Adobo Chicken")).toMatchObject({
      brand_name: "Chipotle",
      serving_description: "4 oz serving",
      serving_size_g: 113,
      calories: 180,
      protein: 32,
      source: "restaurant",
    })
  })

  it("searches by restaurant name, alias, and menu item", () => {
    expect(searchRestaurantMenus("mcd").every((food) => food.brand_name === "McDonald's")).toBe(true)
    expect(searchRestaurantMenus("waffle fries").map((food) => food.brand_name)).toContain("Chick-fil-A")
    expect(searchRestaurantMenus("taco bell crunchy").map((food) => food.food_name)).toContain("Crunchy Taco")
  })

  it("returns no results for short or unrelated searches", () => {
    expect(searchRestaurantMenus("x")).toEqual([])
    expect(searchRestaurantMenus("not a real menu item")).toEqual([])
  })
})
