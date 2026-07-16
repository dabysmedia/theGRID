import { describe, expect, it } from "vitest"
import { foodEmojiForLabel } from "@/components/calories/FoodFallbackIcon"

describe("food fallback icons", () => {
  it("uses a relevant emoji for common food names", () => {
    expect(foodEmojiForLabel("Pepperoni pizza")).toBe("🍕")
    expect(foodEmojiForLabel("Iced coffee")).toBe("☕")
    expect(foodEmojiForLabel("Grilled chicken breast")).toBe("🍗")
    expect(foodEmojiForLabel("Oreo cookies")).toBe("🍪")
    expect(foodEmojiForLabel("Beer")).toBe("🍺")
  })

  it("uses neutral meal fallbacks for recipes and unknown foods", () => {
    expect(foodEmojiForLabel("Carlos special", true)).toBe("🍲")
    expect(foodEmojiForLabel("Carlos special")).toBe("🥣")
  })
})
