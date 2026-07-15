export interface CalorieEntry {
  id: string
  date: string
  mealType: string
  description: string | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  imageUrl: string | null
  portionAmount: number | null
  portionUnit: string | null
}

export interface SavedMeal {
  id: string
  name: string
  /** Single tag or comma-separated tags (breakfast, lunch, …) */
  mealType: string
  foodCategory: import("@/lib/calories/saved-food-category").SavedFoodCategory
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  imageUrl: string | null
  servingAmount: number
  servingUnit: import("@/lib/calories/measurements").FoodMeasurementUnit
  servingWeightG: number | null
  useCount: number
}

export interface RecipeIngredient {
  id: string
  name: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  portionAmount: number
  portionUnit: import("@/lib/calories/measurements").FoodMeasurementUnit
  imageUrl: string | null
  sortOrder: number
}

export interface Recipe {
  id: string
  name: string
  mealType: string
  imageUrl: string | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  useCount: number
  ingredients: RecipeIngredient[]
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
  imageUrl?: string | null
  savedMealId?: string
  recipeId?: string
  portionAmount?: number
  portionUnit?: import("@/lib/calories/measurements").FoodMeasurementUnit
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
