import { describe, expect, it } from "vitest"
import { hiddenFoodNames, updateHiddenFoods, visibleFoodHistory } from "../hidden-foods"

describe("hidden food history", () => {
  it("hides all logs matching a deleted food without modifying nutrition history", () => {
    const history = [{ description: "Built", calories: 180 }, { description: " BUILT ", calories: 200 }, { description: "Chicken", calories: 240 }]
    const preference = updateHiddenFoods("[]", "Built", true)
    expect(visibleFoodHistory(history, preference)).toEqual([history[2]])
    expect(history).toHaveLength(3)
    expect(history[0].calories).toBe(180)
  })
  it("undo restores all matching suggestions and preserves other hidden foods", () => {
    const hidden = updateHiddenFoods(updateHiddenFoods("[]", "Built", true), "Old shake", true)
    const restored = updateHiddenFoods(hidden, " BUILT ", false)
    expect(hiddenFoodNames(restored).has("built")).toBe(false)
    expect(hiddenFoodNames(restored).has("old shake")).toBe(true)
  })
  it("handles empty, malformed and duplicate stored preferences", () => {
    expect(hiddenFoodNames("broken").size).toBe(0)
    expect(hiddenFoodNames('[null,12,"Built","built"]').size).toBe(1)
    expect(visibleFoodHistory([{ description: null }], null)).toHaveLength(1)
  })
})
