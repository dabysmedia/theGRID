import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { UnifiedFoodSearch } from "@/components/calories/UnifiedFoodSearch"
import type { Recipe, SavedMeal } from "@/lib/calories/log-food"

function savedMeal(over: Partial<SavedMeal> & { id: string; name: string }): SavedMeal {
  return {
    mealType: "breakfast",
    foodCategory: "meal",
    calories: 285,
    protein: 18,
    carbs: 30,
    fat: 11,
    imageUrl: null,
    servingAmount: 1,
    servingUnit: "serving",
    servingWeightG: null,
    useCount: 4,
    ...over,
  }
}

function recipe(over: Partial<Recipe> & { id: string; name: string }): Recipe {
  return {
    mealType: "dinner",
    imageUrl: null,
    calories: 720,
    protein: 46,
    carbs: 55,
    fat: 30,
    useCount: 2,
    ingredients: [
      {
        id: "i1",
        name: "Salmon",
        calories: 400,
        protein: 40,
        carbs: 0,
        fat: 24,
        portionAmount: 6,
        portionUnit: "oz",
        imageUrl: null,
        sortOrder: 0,
      },
    ],
    ...over,
  }
}

const noop = () => {}

function render(over: Partial<Parameters<typeof UnifiedFoodSearch>[0]> = {}) {
  return renderToStaticMarkup(
    <UnifiedFoodSearch
      savedMeals={[]}
      recipes={[]}
      mealSlot="morning"
      query=""
      mode="search"
      barcodeScan={null}
      onAddCatalog={noop}
      onAddSaved={noop}
      onAddFrequent={noop}
      onAddRecipe={noop}
      {...over}
    />,
  )
}

describe("UnifiedFoodSearch", () => {
  it("exposes library editing separately from adding a saved food", () => {
    const html = render({ mode: "library", savedMeals: [savedMeal({ id: "s1", name: "Custom oats" })], onEditSaved: noop })
    expect(html).toContain('aria-label="Edit Custom oats"')
    expect(html).toContain('aria-label="Add Custom oats"')
  })

  it("puts saved foods on a Favorites rail while idle", () => {
    const html = render({ savedMeals: [savedMeal({ id: "s1", name: "Overnight Oats" })] })
    expect(html).toContain("Favorites")
    expect(html).toContain("Overnight Oats")
    expect(html).toContain("285 cal")
  })

  it("keeps favorites out of the way once a search is typed", () => {
    const html = render({
      savedMeals: [savedMeal({ id: "s1", name: "Overnight Oats" })],
      query: "chicken",
    })
    expect(html).not.toContain("Favorites")
  })

  it("library mode lists saved foods and recipes, not the search shelves", () => {
    const html = render({
      mode: "library",
      savedMeals: [savedMeal({ id: "s1", name: "Overnight Oats" })],
      recipes: [recipe({ id: "r1", name: "Salmon Plate" })],
    })
    expect(html).toContain("Saved foods")
    expect(html).toContain("Recipes")
    expect(html).toContain("Salmon Plate")
    expect(html).toContain("1 ingredient")
    expect(html).not.toContain("Favorites")
    expect(html).not.toContain("Morning picks")
  })

  it("gives every row a full macro line and its own add button", () => {
    const html = render({
      mode: "library",
      savedMeals: [savedMeal({ id: "s1", name: "Overnight Oats" })],
    })
    expect(html).toContain(">18P<")
    expect(html).toContain(">11F<")
    expect(html).toContain(">30C<")
    expect(html).toContain('aria-label="Add Overnight Oats"')
  })

  it("groups a mixed library under category headings", () => {
    const html = render({
      mode: "library",
      savedMeals: [
        savedMeal({ id: "s1", name: "Overnight Oats", foodCategory: "meal" }),
        savedMeal({ id: "s2", name: "Core Power", foodCategory: "shake", calories: 170 }),
      ],
    })
    expect(html).toContain("Meals &amp; plates")
    expect(html).toContain("Shakes")
    expect(html).toContain("Overnight Oats")
    expect(html).toContain("Core Power")
  })

  it("explains an empty library differently from an empty search", () => {
    expect(render({ mode: "library" })).toContain("Nothing saved yet")
    expect(render({ query: "zzzz" })).toContain("No foods found")
  })

  it("no longer renders its own search field — the composer owns it", () => {
    expect(render()).not.toContain('type="search"')
  })
})
