import { normalizeFoodSearchText } from "./food-search-ranking"

export function hiddenFoodNames(json: string | null | undefined): Set<string> {
  try {
    const values: unknown = JSON.parse(json ?? "[]")
    return new Set(Array.isArray(values) ? values.filter((v): v is string => typeof v === "string").map(normalizeFoodSearchText).filter(Boolean) : [])
  } catch { return new Set() }
}

export function updateHiddenFoods(json: string | null | undefined, name: string, hidden: boolean): string {
  const names = hiddenFoodNames(json)
  const key = normalizeFoodSearchText(name)
  if (key) { if (hidden) names.add(key); else names.delete(key) }
  return JSON.stringify([...names])
}

export function visibleFoodHistory<T extends { description: string | null }>(entries: readonly T[], json: string | null | undefined): T[] {
  const hidden = hiddenFoodNames(json)
  return entries.filter((entry) => !hidden.has(normalizeFoodSearchText(entry.description ?? "")))
}
