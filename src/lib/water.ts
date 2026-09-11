/** Quick-log sizes for hydration, including common drinks that aren't plain water. */
export const WATER_LOG_PRESETS = [
  { id: "glass", label: "Glass", amountOz: 8 },
  { id: "can-zero-cal", label: "Can / Zero Cal", amountOz: 12 },
  { id: "bottle", label: "Bottle", amountOz: 16 },
  { id: "tumbler", label: "Tumbler", amountOz: 20 },
  { id: "large", label: "Large", amountOz: 32 },
] as const

export type WaterLogPreset = (typeof WATER_LOG_PRESETS)[number]
export type WaterLogPresetId = WaterLogPreset["id"]

export const WATER_LOG_MAX_OZ = 128

export function waterPresetForAmount(amountOz: number): WaterLogPreset | undefined {
  return WATER_LOG_PRESETS.find((preset) => preset.amountOz === amountOz)
}
