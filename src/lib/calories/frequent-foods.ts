import { normalizeFoodSearchText, rankByFoodSearch } from "@/lib/calories/food-search-ranking"
import { isMealSlot, resolveMealSlot, type MealSlot } from "@/lib/calories/meal-slots"

const RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const FRESH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export interface FrequentFoodEntry {
  id: string
  /** Legacy meal name; used to place rows logged before the timeline. */
  mealType: string
  /** Timeline block, when the row has one. */
  mealSlot?: string | null
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
  /** This food has been eaten in the block being suggested for. */
  sameSlot: boolean
}

interface GroupedFood {
  latest: FrequentFoodEntry
  name: string
  count: number
  slotCount: number
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
  sameSlot: boolean,
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
    sameSlot,
  }
}

/**
 * Rank the foods this user actually eats in a given time block, so the timeline
 * and the search screen can offer them before anything is typed.
 *
 * Repeats within the same block rank first — that is what makes the morning
 * block learn your breakfast. A single recent log still surfaces, so yesterday's
 * dinner is one tap away tonight.
 */
export function frequentFoodsForSlot(
  entries: readonly FrequentFoodEntry[],
  slot: MealSlot,
  limit = 16,
  now = Date.now(),
  timeZone?: string | null,
): FrequentFoodSuggestion[] {
  if (!isMealSlot(slot) || limit <= 0) return []

  const grouped = new Map<string, GroupedFood>()
  for (const entry of entries) {
    const name = entry.description?.trim().replace(/\s+/g, " ") ?? ""
    if (!name) continue
    const key = groupingKey(name)
    if (!key) continue
    const entrySlot = resolveMealSlot(entry, timeZone)
    const current = grouped.get(key)
    if (current) {
      current.count += 1
      if (entrySlot === slot) {
        current.slotCount += 1
        // Prefer the newest log from this block for portion/photo details.
        if (resolveMealSlot(current.latest, timeZone) !== slot) {
          current.latest = { ...entry, description: name }
        }
      }
      continue
    }
    grouped.set(key, {
      latest: { ...entry, description: name },
      name,
      count: 1,
      slotCount: entrySlot === slot ? 1 : 0,
      lastLoggedAt: entry.createdAt.getTime(),
    })
  }

  const scored = [...grouped.values()]
    .map((group) => {
      const sameSlot = group.slotCount > 0
      const fresh = now - group.lastLoggedAt <= FRESH_WINDOW_MS
      const recent = now - group.lastLoggedAt <= RECENT_WINDOW_MS
      const frequent = group.slotCount >= 2 || group.count >= 3 || (group.slotCount >= 1 && fresh)
      const include = frequent || (sameSlot && recent)
      if (!include) return null
      const kind: MealFoodSuggestionKind =
        group.slotCount >= 2 || group.count >= 3 ? "frequent" : "recent"
      const score =
        group.slotCount * 24 +
        (group.count - group.slotCount) * 6 +
        recencyBoost(group.lastLoggedAt, now) +
        (sameSlot ? 20 : 0)
      return { group, kind, sameSlot, score }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .sort(
      (left, right) =>
        Number(right.sameSlot) - Number(left.sameSlot) ||
        right.score - left.score ||
        right.group.lastLoggedAt - left.group.lastLoggedAt ||
        left.group.name.localeCompare(right.group.name),
    )

  const sameSlotScored = scored.filter((entry) => entry.sameSlot)
  const ranked = sameSlotScored.length > 0 ? sameSlotScored : scored

  const seen = new Set<string>()
  const suggestions: FrequentFoodSuggestion[] = []
  for (const entry of ranked) {
    const key = groupingKey(entry.group.name)
    if (seen.has(key)) continue
    seen.add(key)
    suggestions.push(toSuggestion(entry.group, entry.kind, entry.sameSlot))
    if (suggestions.length >= limit) break
  }
  return suggestions
}

/** One row per distinct food name, with the newest log kept as its face. */
function groupByFood(
  entries: readonly FrequentFoodEntry[],
  slot: MealSlot | null,
  timeZone?: string | null,
): GroupedFood[] {
  const grouped = new Map<string, GroupedFood>()
  for (const entry of entries) {
    const name = entry.description?.trim().replace(/\s+/g, " ") ?? ""
    if (!name) continue
    const key = groupingKey(name)
    if (!key) continue
    const entrySlot = resolveMealSlot(entry, timeZone)
    const current = grouped.get(key)
    if (current) {
      current.count += 1
      if (slot != null && entrySlot === slot) current.slotCount += 1
      continue
    }
    grouped.set(key, {
      latest: { ...entry, description: name },
      name,
      count: 1,
      slotCount: slot != null && entrySlot === slot ? 1 : 0,
      lastLoggedAt: entry.createdAt.getTime(),
    })
  }
  return [...grouped.values()]
}

/**
 * Every distinct food this user has ever logged, most-logged first.
 *
 * Search runs against this rather than the short picks/recent shelves — a food
 * eaten twice a month still has to be findable by typing three letters of it.
 */
export function loggedFoodLibrary(
  entries: readonly FrequentFoodEntry[],
  slot: MealSlot | null,
  limit = 400,
  timeZone?: string | null,
): FrequentFoodSuggestion[] {
  return groupByFood(entries, slot, timeZone)
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.lastLoggedAt - left.lastLoggedAt ||
        left.name.localeCompare(right.name),
    )
    .slice(0, Math.max(0, limit))
    .map((group) =>
      toSuggestion(group, group.count >= 3 ? "frequent" : "recent", group.slotCount > 0),
    )
}

/**
 * Most recently logged foods, newest first, one row per distinct food and
 * regardless of block — the "I just ate this yesterday" list.
 */
export function recentFoods(
  entries: readonly FrequentFoodEntry[],
  slot: MealSlot | null,
  limit = 12,
  timeZone?: string | null,
): FrequentFoodSuggestion[] {
  return groupByFood(entries, slot, timeZone)
    .sort(
      (left, right) =>
        right.lastLoggedAt - left.lastLoggedAt || left.name.localeCompare(right.name),
    )
    .slice(0, Math.max(0, limit))
    .map((group) =>
      toSuggestion(group, group.count >= 3 ? "frequent" : "recent", group.slotCount > 0),
    )
}

export function matchingFrequentFoods(
  foods: readonly FrequentFoodSuggestion[],
  query: string,
  limit = 8,
): FrequentFoodSuggestion[] {
  return rankByFoodSearch(foods, query, (food) => ({ name: food.name }), limit)
}
