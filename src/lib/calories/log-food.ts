export interface CalorieEntry {
  id: string
  date: string
  mealType: string
  description: string | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
}

export interface SavedMeal {
  id: string
  name: string
  /** Single tag or comma-separated tags (breakfast, lunch, …) */
  mealType: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  useCount: number
}

export interface DraftMealItem {
  id: string
  mealType: string
  description: string | null
  /** Number of servings / units (default 1). */
  quantity: number
  unitCalories: number
  unitProtein: number | null
  unitCarbs: number | null
  unitFat: number | null
  savedMealId?: string
}

export function draftMealItemTotals(item: DraftMealItem) {
  const q = item.quantity > 0 ? item.quantity : 1
  const roundMacro = (v: number) => Math.round(v * 10) / 10
  return {
    calories: Math.round(item.unitCalories * q),
    protein: item.unitProtein != null ? roundMacro(item.unitProtein * q) : null,
    carbs: item.unitCarbs != null ? roundMacro(item.unitCarbs * q) : null,
    fat: item.unitFat != null ? roundMacro(item.unitFat * q) : null,
  }
}

export type PendingSavedMealDelete = { id: string; name: string }

export const mealTypes = ["breakfast", "lunch", "dinner", "snack"] as const
const mealTypeSet = new Set<string>(mealTypes)

export function savedMealTagList(meal: Pick<SavedMeal, "mealType">): string[] {
  if (!meal.mealType?.trim()) return []
  return [
    ...new Set(
      meal.mealType
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => mealTypeSet.has(t))
    ),
  ]
}
