import type { FoodSearchItem } from "@/lib/calories/open-food-facts"

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "bowl",
  "bowls",
  "cooked",
  "cup",
  "cups",
  "extra",
  "for",
  "fresh",
  "from",
  "g",
  "gram",
  "grams",
  "homemade",
  "in",
  "large",
  "medium",
  "of",
  "on",
  "organic",
  "ounce",
  "ounces",
  "oz",
  "pack",
  "packs",
  "piece",
  "pieces",
  "raw",
  "serving",
  "servings",
  "small",
  "the",
  "to",
  "with",
])

/** Shorthand queries people actually type when logging food. */
const QUERY_ABBREVIATIONS: Record<string, string> = {
  pb: "peanut butter",
  pbb: "peanut butter",
  oj: "orange juice",
  bk: "burger king",
  cfa: "chick fil a",
  mcd: "mcdonalds",
  wendys: "wendys",
  sf: "sugar free",
}

/**
 * Alternate spellings / names. Values are additional tokens that can satisfy
 * the same query token — they are not extra required terms.
 */
const TOKEN_SYNONYMS: Record<string, string[]> = {
  yogurt: ["yoghurt"],
  yoghurt: ["yogurt"],
  burger: ["hamburger"],
  hamburger: ["burger"],
  fries: ["fry", "french"],
  fry: ["fries"],
  soda: ["pop", "cola"],
  pop: ["soda", "cola"],
  coke: ["cola", "coca"],
  chicken: ["chx"],
  chx: ["chicken"],
  eggs: ["egg"],
  egg: ["eggs"],
  noodles: ["pasta"],
  pasta: ["noodles"],
  chickpea: ["garbanzo"],
  garbanzo: ["chickpea"],
}

export function normalizeFoodSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function searchTokens(value: string): string[] {
  return normalizeFoodSearchText(value)
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token))
}

function expandQueryTokens(query: string): string[] {
  const expanded: string[] = []
  for (const token of searchTokens(query)) {
    const abbreviation = QUERY_ABBREVIATIONS[token]
    if (abbreviation) {
      expanded.push(...searchTokens(abbreviation))
      continue
    }
    expanded.push(token)
  }
  return expanded.length > 0 ? expanded : searchTokens(query)
}

export function expandFoodSearchQuery(query: string): string {
  return expandQueryTokens(query).join(" ")
}

function queryTokenVariants(token: string): string[] {
  const synonyms = TOKEN_SYNONYMS[token] ?? []
  return [token, stemToken(token), ...synonyms].filter(
    (value, index, all) => value.length > 0 && all.indexOf(value) === index,
  )
}

function stemToken(token: string): string {
  if (token.length <= 3) return token
  if (token.endsWith("ies") && token.length > 5) return `${token.slice(0, -3)}y`
  if (token.endsWith("es") && token.length > 4 && !token.endsWith("sses")) {
    return token.slice(0, -2)
  }
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1)
  return token
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

function allowedEditDistance(token: string): number {
  if (token.length >= 8) return 2
  if (token.length >= 3) return 1
  return 0
}

function tokenMatchScore(queryToken: string, candidateToken: string): number {
  if (queryToken === candidateToken) return 60

  const queryStem = stemToken(queryToken)
  const candidateStem = stemToken(candidateToken)
  if (queryStem === candidateStem && queryStem.length >= 3) return 56

  if (queryToken.length >= 2 && candidateToken.startsWith(queryToken)) {
    return queryToken.length >= 3 ? 54 : 40
  }
  if (candidateToken.length >= 3 && queryToken.startsWith(candidateToken)) return 42
  if (queryToken.length >= 3 && candidateToken.includes(queryToken)) return 36
  if (candidateToken.length >= 3 && queryToken.includes(candidateToken)) return 28

  const allowed = allowedEditDistance(queryToken)
  if (allowed > 0 && Math.abs(queryToken.length - candidateToken.length) <= allowed) {
    const distance = editDistance(queryToken, candidateToken)
    if (distance <= allowed) return 30 - distance * 5
  }

  if (queryStem.length >= 3 && candidateStem.length >= 3) {
    const stemAllowed = allowedEditDistance(queryStem)
    if (
      stemAllowed > 0 &&
      Math.abs(queryStem.length - candidateStem.length) <= stemAllowed
    ) {
      const stemDistance = editDistance(queryStem, candidateStem)
      if (stemDistance <= stemAllowed) return 24 - stemDistance * 5
    }
  }

  return 0
}

function bestVariantScore(
  queryToken: string,
  candidateToken: string,
): number {
  return queryTokenVariants(queryToken).reduce(
    (best, variant) => Math.max(best, tokenMatchScore(variant, candidateToken)),
    0,
  )
}

/**
 * Scores a result when the query looks like it is about this food.
 * Prefixes, plurals, abbreviations, and small typos are accepted. Extra filler
 * words are allowed, but a brand-only hit cannot hide a missing food term.
 */
export function foodSearchRelevance(
  food: Pick<FoodSearchItem, "food_name" | "brand_name" | "serving_description">,
  query: string,
): number | null {
  const queryText = normalizeFoodSearchText(query)
  const queryTokens = expandQueryTokens(query)
  if (!queryText || queryTokens.length === 0) return null

  const nameText = normalizeFoodSearchText(food.food_name)
  const brandText = normalizeFoodSearchText(food.brand_name ?? "")
  const servingText = normalizeFoodSearchText(food.serving_description ?? "")
  const nameTokens = searchTokens(nameText).map((token) => ({ token, weight: 1.25, kind: "name" as const }))
  const brandTokens = searchTokens(brandText).map((token) => ({ token, weight: 1.1, kind: "brand" as const }))
  const servingTokens = searchTokens(servingText).map((token) => ({
    token,
    weight: 0.35,
    kind: "serving" as const,
  }))
  const candidates = [...nameTokens, ...brandTokens, ...servingTokens]

  let score = 0
  let matched = 0
  let unmatched = 0
  let nameMatched = false

  for (const queryToken of queryTokens) {
    let bestCovering = 0
    let bestServing = 0
    let matchedName = false

    for (const candidate of candidates) {
      const raw = bestVariantScore(queryToken, candidate.token) * candidate.weight
      if (candidate.kind === "serving") {
        bestServing = Math.max(bestServing, raw)
        continue
      }
      if (raw > bestCovering) {
        bestCovering = raw
        matchedName = candidate.kind === "name"
      }
    }

    if (bestCovering > 0) {
      score += bestCovering
      matched += 1
      if (matchedName) nameMatched = true
      continue
    }

    unmatched += 1
    score += bestServing
  }

  if (matched === 0) return null
  if (unmatched > 0) {
    const unmatchedLimit = queryTokens.length >= 3 ? Math.max(1, Math.floor(queryTokens.length / 2)) : 0
    if (!nameMatched) return null
    if (unmatched > unmatchedLimit) return null
    score -= unmatched * 40
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

export function rankByFoodSearch<T>(
  items: readonly T[],
  query: string,
  getFields: (item: T) => { name: string; extra?: string | null },
  limit?: number,
): T[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return limit == null ? [...items] : [...items].slice(0, limit)
  }

  return items
    .map((item, index) => {
      const fields = getFields(item)
      return {
        item,
        index,
        relevance: foodSearchRelevance(
          {
            food_name: fields.name,
            brand_name: null,
            serving_description: fields.extra ?? null,
          },
          trimmed,
        ),
      }
    })
    .filter((entry): entry is typeof entry & { relevance: number } => entry.relevance != null)
    .sort((left, right) => right.relevance - left.relevance || left.index - right.index)
    .slice(0, limit ?? items.length)
    .map((entry) => entry.item)
}
