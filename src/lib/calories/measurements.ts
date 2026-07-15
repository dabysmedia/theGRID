export const FOOD_MEASUREMENT_UNITS = [
  "serving",
  "g",
  "oz",
  "piece",
] as const

export type FoodMeasurementUnit = (typeof FOOD_MEASUREMENT_UNITS)[number]

const GRAMS_PER_OUNCE = 28.349523125

export function isFoodMeasurementUnit(value: unknown): value is FoodMeasurementUnit {
  return (
    typeof value === "string" &&
    (FOOD_MEASUREMENT_UNITS as readonly string[]).includes(value)
  )
}

export function measurementUnitLabel(
  unit: FoodMeasurementUnit,
  amount?: number,
): string {
  switch (unit) {
    case "g":
      return "g"
    case "oz":
      return "oz"
    case "piece":
      return amount === 1 ? "piece" : "pieces"
    default:
      return amount === 1 ? "serving" : "servings"
  }
}

export function formatFoodPortion(
  amount: number | null | undefined,
  unit: string | null | undefined,
): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null
  if (!isFoodMeasurementUnit(unit)) return null
  const rounded = Math.round(amount * 100) / 100
  return `${rounded} ${measurementUnitLabel(unit, rounded)}`
}

/**
 * Converts a chosen portion into a multiplier of the nutrition basis.
 * Mass conversion is available when the food database supplies grams per serving.
 */
export function foodPortionMultiplier({
  amount,
  unit,
  basisAmount = 1,
  basisUnit = "serving",
  servingWeightG,
}: {
  amount: number
  unit: FoodMeasurementUnit
  basisAmount?: number
  basisUnit?: FoodMeasurementUnit
  servingWeightG?: number | null
}): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (!Number.isFinite(basisAmount) || basisAmount <= 0) return null

  if (unit === basisUnit) return amount / basisAmount

  const toGrams = (
    value: number,
    valueUnit: FoodMeasurementUnit,
  ): number | null => {
    if (valueUnit === "g") return value
    if (valueUnit === "oz") return value * GRAMS_PER_OUNCE
    if (
      (valueUnit === "serving" || valueUnit === "piece") &&
      servingWeightG != null &&
      servingWeightG > 0
    ) {
      return value * servingWeightG
    }
    return null
  }

  const amountG = toGrams(amount, unit)
  const basisG = toGrams(basisAmount, basisUnit)
  if (amountG == null || basisG == null || basisG <= 0) return null
  return amountG / basisG
}

export function availableFoodUnits(
  basisUnit: FoodMeasurementUnit,
  servingWeightG?: number | null,
): FoodMeasurementUnit[] {
  const units: FoodMeasurementUnit[] = [basisUnit]
  if (servingWeightG != null && servingWeightG > 0) {
    for (const unit of ["serving", "g", "oz"] as const) {
      if (!units.includes(unit)) units.push(unit)
    }
  }
  return units
}
