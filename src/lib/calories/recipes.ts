import {
  isFoodMeasurementUnit,
  type FoodMeasurementUnit,
} from "@/lib/calories/measurements"

export interface RecipeIngredientInput {
  name: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  portionAmount: number
  portionUnit: FoodMeasurementUnit
  imageUrl: string | null
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

export function parseRecipeIngredients(value: unknown): RecipeIngredientInput[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null

  const parsed: RecipeIngredientInput[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null
    const item = raw as Record<string, unknown>
    const name = typeof item.name === "string" ? item.name.trim() : ""
    const calories = Math.round(Number(item.calories))
    const portionAmount = Number(item.portionAmount ?? 1)
    const portionUnit = item.portionUnit ?? "serving"
    if (
      !name ||
      name.length > 180 ||
      !Number.isFinite(calories) ||
      calories < 0 ||
      !Number.isFinite(portionAmount) ||
      portionAmount <= 0 ||
      !isFoodMeasurementUnit(portionUnit)
    ) {
      return null
    }

    parsed.push({
      name,
      calories,
      protein: optionalNumber(item.protein),
      carbs: optionalNumber(item.carbs),
      fat: optionalNumber(item.fat),
      portionAmount,
      portionUnit,
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
    })
  }
  return parsed
}

export function recipeNutritionTotals(items: RecipeIngredientInput[]) {
  const roundMacro = (value: number) => Math.round(value * 10) / 10
  return items.reduce(
    (totals, item) => ({
      calories: totals.calories + item.calories,
      protein: roundMacro(totals.protein + (item.protein ?? 0)),
      carbs: roundMacro(totals.carbs + (item.carbs ?? 0)),
      fat: roundMacro(totals.fat + (item.fat ?? 0)),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}
