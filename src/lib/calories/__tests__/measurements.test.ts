import { describe, expect, it } from "vitest"
import {
  availableFoodUnits,
  foodPortionMultiplier,
  formatFoodPortion,
} from "@/lib/calories/measurements"

describe("foodPortionMultiplier", () => {
  it("converts grams to a multiplier of one database serving", () => {
    expect(
      foodPortionMultiplier({
        amount: 90,
        unit: "g",
        basisUnit: "serving",
        basisAmount: 1,
        servingWeightG: 60,
      }),
    ).toBe(1.5)
  })

  it("converts ounces through grams", () => {
    expect(
      foodPortionMultiplier({
        amount: 2,
        unit: "oz",
        basisUnit: "serving",
        basisAmount: 1,
        servingWeightG: 28.349523125,
      }),
    ).toBeCloseTo(2)
  })

  it("does not offer mass units without a known serving weight", () => {
    expect(availableFoodUnits("serving", null)).toEqual(["serving"])
  })
})

describe("formatFoodPortion", () => {
  it("formats persisted amounts with friendly labels", () => {
    expect(formatFoodPortion(1, "serving")).toBe("1 serving")
    expect(formatFoodPortion(2.5, "oz")).toBe("2.5 oz")
    expect(formatFoodPortion(100, "g")).toBe("100 g")
  })
})
