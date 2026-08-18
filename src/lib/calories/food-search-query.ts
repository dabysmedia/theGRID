import { expandFoodSearchQuery, normalizeFoodSearchText, searchTokens } from "@/lib/calories/food-search-ranking"
import { PREPARED_FOOD_CATALOG } from "@/lib/calories/prepared-food-catalog"
import { RESTAURANT_MENUS } from "@/lib/calories/restaurant-menu-catalog"
import { STAPLE_FOOD_CATALOG } from "@/lib/calories/staple-food-catalog"

const COMMON_MISSPELLINGS: Record<string, string> = {
  avacado: "avocado",
  avacodo: "avocado",
  bananna: "banana",
  bannana: "banana",
  brocolli: "broccoli",
  brocoli: "broccoli",
  califlower: "cauliflower",
  cheeze: "cheese",
  chiken: "chicken",
  chickn: "chicken",
  chcken: "chicken",
  omlet: "omelette",
  omlette: "omelette",
  protien: "protein",
  reciepe: "recipe",
  sandwhich: "sandwich",
  sandwitch: "sandwich",
  spagetti: "spaghetti",
  spagheti: "spaghetti",
  tomatos: "tomatoes",
  potatos: "potatoes",
  yougurt: "yogurt",
  youghurt: "yogurt",
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

function catalogDictionary(): Set<string> {
  const words = new Set<string>()
  const add = (value: string) => {
    for (const token of searchTokens(value)) {
      if (token.length >= 3) words.add(token)
    }
  }

  for (const food of [...PREPARED_FOOD_CATALOG, ...STAPLE_FOOD_CATALOG]) {
    add(food.food_name)
    if (food.brand_name) add(food.brand_name)
  }
  for (const restaurant of RESTAURANT_MENUS) {
    add(restaurant.name)
    for (const alias of restaurant.aliases) add(alias)
    for (const section of restaurant.sections) {
      for (const item of section.items) add(item.name)
    }
  }
  for (const correction of Object.values(COMMON_MISSPELLINGS)) add(correction)
  return words
}

const DICTIONARY = catalogDictionary()

function fuzzyCorrectToken(token: string): string {
  if (token.length < 4 || DICTIONARY.has(token)) return token

  const prefixMatches = [...DICTIONARY].filter(
    (word) => word.startsWith(token) && word.length - token.length <= 6,
  )
  if (prefixMatches.length === 1) return prefixMatches[0]

  const allowed = token.length >= 8 ? 2 : 1
  const close: string[] = []
  for (const word of DICTIONARY) {
    if (Math.abs(word.length - token.length) > allowed) continue
    if (editDistance(token, word) <= allowed) close.push(word)
  }
  return close.length === 1 ? close[0] : token
}

export function correctFoodSearchQuery(query: string): {
  corrected: string
  didCorrect: boolean
} {
  const original = normalizeFoodSearchText(query)
  const expanded = expandFoodSearchQuery(query)
  const rewritten = searchTokens(expanded)
    .map((token) => COMMON_MISSPELLINGS[token] ?? fuzzyCorrectToken(token))
    .join(" ")

  if (!rewritten || rewritten === original) {
    return { corrected: query.trim(), didCorrect: false }
  }
  return { corrected: rewritten, didCorrect: true }
}
