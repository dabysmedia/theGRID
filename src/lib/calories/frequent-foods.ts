const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"])

export interface FrequentFoodEntry {
  id: string
  mealType: string
  description: string | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  imageUrl: string | null
  portionAmount: number | null
  portionUnit: string | null
  createdAt: Date
}

export interface FrequentFoodSuggestion {
  id: string
  name: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  imageUrl: string | null
  portionAmount: number
  portionUnit: string
  logCount: number
  lastLoggedAt: string
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * Derive frequent foods from actual log history for one meal context.
 * Entries are expected newest-first so the suggestion keeps the most recent
 * portion and nutrition values while frequency controls the ordering.
 */
export function frequentFoodsForMeal(
  entries: readonly FrequentFoodEntry[],
  mealType: string,
  limit = 8,
): FrequentFoodSuggestion[] {
  const normalizedMeal = mealType.trim().toLowerCase()
  if (!MEAL_TYPES.has(normalizedMeal) || limit <= 0) return []

  const grouped = new Map<string, { latest: FrequentFoodEntry; count: number }>()
  for (const entry of entries) {
    if (entry.mealType.trim().toLowerCase() !== normalizedMeal) continue
    const name = entry.description?.trim().replace(/\s+/g, " ") ?? ""
    if (!name) continue
    const key = normalizedName(name)
    const current = grouped.get(key)
    if (current) current.count += 1
    else grouped.set(key, { latest: { ...entry, description: name }, count: 1 })
  }

  return [...grouped.values()]
    .filter(({ count }) => count >= 2)
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.latest.createdAt.getTime() - a.latest.createdAt.getTime() ||
        (a.latest.description ?? "").localeCompare(b.latest.description ?? ""),
    )
    .slice(0, limit)
    .map(({ latest, count }) => ({
      id: latest.id,
      name: latest.description!,
      calories: latest.calories,
      protein: latest.protein,
      carbs: latest.carbs,
      fat: latest.fat,
      imageUrl: latest.imageUrl,
      portionAmount: latest.portionAmount && latest.portionAmount > 0 ? latest.portionAmount : 1,
      portionUnit: latest.portionUnit?.trim() || "serving",
      logCount: count,
      lastLoggedAt: latest.createdAt.toISOString(),
    }))
}
