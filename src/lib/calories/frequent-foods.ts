import { normalizeFoodSearchText, rankByFoodSearch } from "@/lib/calories/food-search-ranking"

const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"])
const RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const FRESH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

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

export type MealFoodSuggestionKind = "frequent" | "recent"

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
  kind: MealFoodSuggestionKind
  sameMeal: boolean
}

interface GroupedFood {
  latest: FrequentFoodEntry
  name: string
  count: number
  mealCount: number
  lastLoggedAt: number
}

function groupingKey(value: string): string {
  return normalizeFoodSearchText(value)
}

function recencyBoost(lastLoggedAt: number, now: number): number {
  const age = now - lastLoggedAt
  if (age <= 24 * 60 * 60 * 1000) return 40
  if (age <= FRESH_WINDOW_MS) return 24
  if (age <= 7 * 24 * 60 * 60 * 1000) return 12
  if (age <= RECENT_WINDOW_MS) return 4
  return 0
}

function toSuggestion(
  group: GroupedFood,
  kind: MealFoodSuggestionKind,
  sameMeal: boolean,
): FrequentFoodSuggestion {
  const latest = group.latest
  return {
    id: latest.id,
    name: group.name,
    calories: latest.calories,
    protein: latest.protein,
    carbs: latest.carbs,
    fat: latest.fat,
    imageUrl: latest.imageUrl,
    portionAmount: latest.portionAmount && latest.portionAmount > 0 ? latest.portionAmount : 1,
    portionUnit: latest.portionUnit?.trim() || "serving",
    logCount: group.count,
    lastLoggedAt: latest.createdAt.toISOString(),
    kind,
    sameMeal,
  }
}

/**
 * Rank foods the user already logs so the search screen can suggest them
 * before they type. Same-meal repeats rank first; a single recent log still
 * appears so yesterday's breakfast is one tap away this morning.
 */
export function frequentFoodsForMeal(
  entries: readonly FrequentFoodEntry[],
  mealType: string,
  limit = 16,
  now = Date.now(),
): FrequentFoodSuggestion[] {
  const normalizedMeal = mealType.trim().toLowerCase()
  if (!MEAL_TYPES.has(normalizedMeal) || limit <= 0) return []

  const grouped = new Map<string, GroupedFood>()
  for (const entry of entries) {
    const name = entry.description?.trim().replace(/\s+/g, " ") ?? ""
    if (!name) continue
    const key = groupingKey(name)
    if (!key) continue
    const current = grouped.get(key)
    const entryMeal = entry.mealType.trim().toLowerCase()
    if (current) {
      current.count += 1
      if (entryMeal === normalizedMeal) {
        current.mealCount += 1
        if (current.latest.mealType.trim().toLowerCase() !== normalizedMeal) {
          current.latest = { ...entry, description: name }
        }
      }
      continue
    }
    grouped.set(key, {
      latest: { ...entry, description: name },
      name,
      count: 1,
      mealCount: entryMeal === normalizedMeal ? 1 : 0,
      lastLoggedAt: entry.createdAt.getTime(),
    })
  }

  const scored = [...grouped.values()]
    .map((group) => {
      const sameMeal = group.mealCount > 0
      const fresh = now - group.lastLoggedAt <= FRESH_WINDOW_MS
      const recent = now - group.lastLoggedAt <= RECENT_WINDOW_MS
      const frequent = group.mealCount >= 2 || group.count >= 3 || (group.mealCount >= 1 && fresh)
      const include = frequent || (sameMeal && recent)
      if (!include) return null
      const kind: MealFoodSuggestionKind =
        group.mealCount >= 2 || group.count >= 3 ? "frequent" : "recent"
      const score =
        group.mealCount * 24 +
        (group.count - group.mealCount) * 6 +
        recencyBoost(group.lastLoggedAt, now) +
        (sameMeal ? 20 : 0)
      return { group, kind, sameMeal, score }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .sort(
      (left, right) =>
        Number(right.sameMeal) - Number(left.sameMeal) ||
        right.score - left.score ||
        right.group.lastLoggedAt - left.group.lastLoggedAt ||
        left.group.name.localeCompare(right.group.name),
    )

  const sameMealScored = scored.filter((entry) => entry.sameMeal)
  const ranked = sameMealScored.length > 0 ? sameMealScored : scored

  const seen = new Set<string>()
  const suggestions: FrequentFoodSuggestion[] = []
  for (const entry of ranked) {
    const key = groupingKey(entry.group.name)
    if (seen.has(key)) continue
    seen.add(key)
    suggestions.push(toSuggestion(entry.group, entry.kind, entry.sameMeal))
    if (suggestions.length >= limit) break
  }
  return suggestions
}

export function matchingFrequentFoods(
  foods: readonly FrequentFoodSuggestion[],
  query: string,
  limit = 8,
): FrequentFoodSuggestion[] {
  return rankByFoodSearch(foods, query, (food) => ({ name: food.name }), limit)
}
