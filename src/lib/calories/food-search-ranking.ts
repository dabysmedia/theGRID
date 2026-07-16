import type { FoodSearchItem } from "@/lib/calories/open-food-facts"

const STOP_WORDS = new Set(["a", "an", "and", "for", "of", "the", "with"])

export function normalizeFoodSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function searchTokens(value: string): string[] {
  return normalizeFoodSearchText(value)
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token))
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1]
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current.push(
        Math.min(
          current[rightIndex] + 1,
          previous[rightIndex + 1] + 1,
          previous[rightIndex] + (left[leftIndex] === right[rightIndex] ? 0 : 1),
        ),
      )
    }
    previous = current
  }
  return previous[right.length]
}

function tokenMatchScore(queryToken: string, candidateToken: string): number {
  if (queryToken === candidateToken) return 60
  if (queryToken.length >= 3 && candidateToken.startsWith(queryToken)) return 54
  if (candidateToken.length >= 3 && queryToken.startsWith(candidateToken)) return 42
  if (queryToken.length >= 4 && candidateToken.includes(queryToken)) return 36

  const allowedDistance = queryToken.length >= 8 ? 2 : queryToken.length >= 4 ? 1 : 0
  if (allowedDistance === 0 || Math.abs(queryToken.length - candidateToken.length) > allowedDistance) {
    return 0
  }
  const distance = editDistance(queryToken, candidateToken)
  return distance <= allowedDistance ? 30 - distance * 5 : 0
}

/**
 * Scores a result only when every meaningful query token matches its product
 * name, brand, or (at lower weight) serving text. Prefixes and small typos are
 * accepted, but a brand-only match cannot hide an unrelated missing food term.
 */
export function foodSearchRelevance(
  food: Pick<FoodSearchItem, "food_name" | "brand_name" | "serving_description">,
  query: string,
): number | null {
  const queryText = normalizeFoodSearchText(query)
  const queryTokens = searchTokens(query)
  if (!queryText || queryTokens.length === 0) return null

  const nameText = normalizeFoodSearchText(food.food_name)
  const brandText = normalizeFoodSearchText(food.brand_name ?? "")
  const servingText = normalizeFoodSearchText(food.serving_description ?? "")
  const candidates = [
    ...searchTokens(nameText).map((token) => ({ token, weight: 1.25 })),
    ...searchTokens(brandText).map((token) => ({ token, weight: 1.1 })),
    ...searchTokens(servingText).map((token) => ({ token, weight: 0.35 })),
  ]

  let score = 0
  for (const queryToken of queryTokens) {
    const best = candidates.reduce(
      (current, candidate) =>
        Math.max(current, tokenMatchScore(queryToken, candidate.token) * candidate.weight),
      0,
    )
    if (best === 0) return null
    score += best
  }

  const combined = `${brandText} ${nameText}`.trim()
  if (nameText === queryText) score += 150
  else if (nameText.startsWith(queryText)) score += 90
  else if (nameText.includes(queryText)) score += 45
  if (combined === queryText) score += 180
  else if (combined.startsWith(queryText)) score += 110
  else if (combined.includes(queryText)) score += 55
  return score
}

export function rankAndMergeFoodSearchResults(
  query: string,
  groups: FoodSearchItem[][],
  limit = 40,
): FoodSearchItem[] {
  const seen = new Set<string>()
  return groups
    .flat()
    .map((food, index) => ({
      food,
      index,
      relevance: foodSearchRelevance(food, query),
    }))
    .filter((entry) => entry.food.calories != null && entry.food.calories > 0)
    .filter((entry): entry is typeof entry & { relevance: number } => entry.relevance != null)
    .filter(({ food }) => {
      const key = [food.brand_name, food.food_name, food.serving_description]
        .map((value) => normalizeFoodSearchText(value ?? ""))
        .join("|")
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((left, right) => {
      const quality = (entry: {
        food: FoodSearchItem
        index: number
        relevance: number
      }) => {
        const sourceBoost =
          entry.food.source === "catalog" ? 10 : entry.food.source === "restaurant" ? 6 : 0
        const nutritionBoost =
          Number(entry.food.protein != null) +
          Number(entry.food.carbs != null) +
          Number(entry.food.fat != null)
        return entry.relevance + sourceBoost + nutritionBoost + Number(Boolean(entry.food.image_url))
      }
      return quality(right) - quality(left) || left.index - right.index
    })
    .slice(0, limit)
    .map((entry) => entry.food)
}
