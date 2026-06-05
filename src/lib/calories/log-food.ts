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
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  savedMealId?: string
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
