import { describe, expect, it } from "vitest"
import {
  MEAL_SLOTS,
  asMealSlot,
  compareMealSlots,
  currentMealSlot,
  isMealSlot,
  legacyMealTagsForSlot,
  resolveMealSlot,
  slotForHour,
} from "@/lib/calories/meal-slots"

describe("slotForHour", () => {
  it("splits the day into morning, afternoon, and evening", () => {
    expect(slotForHour(4)).toBe("morning")
    expect(slotForHour(9)).toBe("morning")
    expect(slotForHour(11)).toBe("morning")
    expect(slotForHour(12)).toBe("afternoon")
    expect(slotForHour(16)).toBe("afternoon")
    expect(slotForHour(17)).toBe("evening")
    expect(slotForHour(23)).toBe("evening")
  })

  it("keeps the small hours on the evening they belong to", () => {
    expect(slotForHour(0)).toBe("evening")
    expect(slotForHour(3)).toBe("evening")
  })
})

describe("asMealSlot / isMealSlot", () => {
  it("accepts the three slots in any casing", () => {
    expect(asMealSlot("Morning")).toBe("morning")
    expect(asMealSlot(" evening ")).toBe("evening")
    expect(isMealSlot("afternoon")).toBe(true)
  })

  it("rejects anything else", () => {
    expect(asMealSlot("breakfast")).toBeNull()
    expect(asMealSlot(null)).toBeNull()
    expect(isMealSlot("brunch")).toBe(false)
  })
})

describe("resolveMealSlot", () => {
  it("trusts an explicit slot", () => {
    expect(resolveMealSlot({ mealSlot: "evening", mealType: "breakfast" })).toBe("evening")
  })

  it("maps legacy meal names onto blocks", () => {
    expect(resolveMealSlot({ mealType: "breakfast" })).toBe("morning")
    expect(resolveMealSlot({ mealType: "Brunch" })).toBe("morning")
    expect(resolveMealSlot({ mealType: "lunch" })).toBe("afternoon")
    expect(resolveMealSlot({ mealType: "dinner" })).toBe("evening")
    expect(resolveMealSlot({ mealType: "supper" })).toBe("evening")
  })

  it("places a legacy snack by the hour it was logged", () => {
    expect(
      resolveMealSlot(
        { mealType: "snack", createdAt: new Date("2026-08-27T14:30:00Z") },
        "UTC",
      ),
    ).toBe("afternoon")
    expect(
      resolveMealSlot(
        { mealType: "snack", createdAt: new Date("2026-08-27T08:05:00Z") },
        "UTC",
      ),
    ).toBe("morning")
    expect(
      resolveMealSlot(
        { mealType: "snack", createdAt: new Date("2026-08-27T22:40:00Z") },
        "UTC",
      ),
    ).toBe("evening")
  })

  it("reads the logged hour in the user's timezone, not the server's", () => {
    // 02:30 UTC is 21:30 the previous evening in New York.
    expect(
      resolveMealSlot(
        { mealType: "snack", createdAt: "2026-08-28T02:30:00Z" },
        "America/New_York",
      ),
    ).toBe("evening")
  })

  it("falls back to afternoon when a row says nothing useful", () => {
    expect(resolveMealSlot({})).toBe("afternoon")
    expect(resolveMealSlot({ mealType: "snack", createdAt: "not-a-date" })).toBe("afternoon")
  })
})

describe("currentMealSlot", () => {
  it("uses the supplied clock and zone", () => {
    expect(currentMealSlot(new Date("2026-08-27T13:00:00Z"), "UTC")).toBe("afternoon")
    expect(currentMealSlot(new Date("2026-08-27T13:00:00Z"), "America/New_York")).toBe("morning")
  })
})

describe("legacyMealTagsForSlot", () => {
  it("matches the block's meal plus snacks, which happen at any hour", () => {
    expect(legacyMealTagsForSlot("morning")).toEqual(["breakfast", "snack"])
    expect(legacyMealTagsForSlot("afternoon")).toEqual(["lunch", "snack"])
    expect(legacyMealTagsForSlot("evening")).toEqual(["dinner", "snack"])
  })
})

describe("compareMealSlots", () => {
  it("sorts blocks through the day", () => {
    expect([...MEAL_SLOTS].reverse().sort(compareMealSlots)).toEqual([
      "morning",
      "afternoon",
      "evening",
    ])
  })
})
