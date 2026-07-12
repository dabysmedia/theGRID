import { describe, expect, it } from "vitest"
import { optionalNonNegativeInt } from "@/lib/google-health/normalize"

describe("optionalNonNegativeInt", () => {
  it("normalizes protobuf integer strings", () => {
    expect(optionalNonNegativeInt("553")).toBe(553)
    expect(optionalNonNegativeInt("0")).toBe(0)
  })

  it("keeps valid numeric values and rounds fractional input", () => {
    expect(optionalNonNegativeInt(151)).toBe(151)
    expect(optionalNonNegativeInt(12.6)).toBe(13)
  })

  it("rejects missing, negative, and non-numeric values", () => {
    expect(optionalNonNegativeInt(undefined)).toBeUndefined()
    expect(optionalNonNegativeInt(null)).toBeUndefined()
    expect(optionalNonNegativeInt("")).toBeUndefined()
    expect(optionalNonNegativeInt("-1")).toBeUndefined()
    expect(optionalNonNegativeInt("not-a-number")).toBeUndefined()
  })
})
