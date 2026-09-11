import { describe, expect, it } from "vitest"
import {
  WATER_LOG_MAX_OZ,
  WATER_LOG_PRESETS,
  waterPresetForAmount,
} from "@/lib/water"

describe("water log presets", () => {
  it("includes a 12 oz can / zero-cal option among common drink sizes", () => {
    const can = WATER_LOG_PRESETS.find((preset) => preset.id === "can-zero-cal")
    expect(can).toMatchObject({ label: "Can / Zero Cal", amountOz: 12 })
    expect(WATER_LOG_PRESETS.map((preset) => preset.amountOz)).toEqual([8, 12, 16, 20, 32])
  })

  it("keeps preset amounts unique and within the log API range", () => {
    const amounts = WATER_LOG_PRESETS.map((preset) => preset.amountOz)
    expect(new Set(amounts).size).toBe(amounts.length)
    expect(amounts.every((amount) => amount > 0 && amount <= WATER_LOG_MAX_OZ)).toBe(true)
  })

  it("resolves a logged amount back to its preset label", () => {
    expect(waterPresetForAmount(12)?.label).toBe("Can / Zero Cal")
    expect(waterPresetForAmount(7.5)).toBeUndefined()
  })
})
