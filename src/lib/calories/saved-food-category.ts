export const SAVED_FOOD_CATEGORIES = [
  { id: "shake", label: "Shakes", singular: "Shake" },
  { id: "bar", label: "Bars", singular: "Bar" },
  { id: "snack", label: "Snacks & treats", singular: "Snack / treat" },
  { id: "meal", label: "Meals & plates", singular: "Meal / plate" },
  { id: "restaurant", label: "Restaurant", singular: "Restaurant" },
  { id: "ingredient", label: "Ingredients & sides", singular: "Ingredient / side" },
  { id: "drink", label: "Drinks", singular: "Drink" },
  { id: "other", label: "Other", singular: "Other" },
] as const

export type SavedFoodCategory = (typeof SAVED_FOOD_CATEGORIES)[number]["id"]

const CATEGORY_SET = new Set<string>(SAVED_FOOD_CATEGORIES.map((category) => category.id))

export function isSavedFoodCategory(value: unknown): value is SavedFoodCategory {
  return typeof value === "string" && CATEGORY_SET.has(value)
}

export function savedFoodCategoryLabel(category: SavedFoodCategory): string {
  return (
    SAVED_FOOD_CATEGORIES.find((option) => option.id === category)?.singular ?? "Other"
  )
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term))
}

function normalizeCategoryQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * A one-word query that names a library category ("shakes", "bars", "snacks").
 * Longer queries stay on name search so "protein bar" still finds that food.
 */
export function categoryFromSearchQuery(query: string): SavedFoodCategory | null {
  const normalized = normalizeCategoryQuery(query)
  if (!normalized || normalized.includes(" ")) return null
  for (const category of SAVED_FOOD_CATEGORIES) {
    if (normalized === category.id || normalized === `${category.id}s`) return category.id
    const labels = [category.label, category.singular].map(normalizeCategoryQuery)
    if (
      labels.some(
        (label) =>
          label === normalized ||
          (normalized.length >= category.id.length && label.startsWith(normalized)),
      )
    ) {
      return category.id
    }
  }
  return null
}

export function groupBySavedFoodCategory<T>(
  items: readonly T[],
  categoryOf: (item: T) => SavedFoodCategory,
): Array<{ id: SavedFoodCategory; label: string; items: T[] }> {
  const buckets = new Map<SavedFoodCategory, T[]>()
  for (const item of items) {
    const id = categoryOf(item)
    const bucket = buckets.get(id)
    if (bucket) bucket.push(item)
    else buckets.set(id, [item])
  }
  return SAVED_FOOD_CATEGORIES.flatMap((category) => {
    const grouped = buckets.get(category.id)
    return grouped && grouped.length > 0
      ? [{ id: category.id, label: category.label, items: grouped }]
      : []
  })
}

export function inferSavedFoodCategory(input: {
  name: string
  mealType?: string | null
  calories?: number | null
}): SavedFoodCategory {
  const name = input.name.trim().toLowerCase()
  const mealTags = (input.mealType ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())

  if (
    includesAny(name, [
      "mcdonald",
      "chipotle",
      "taco bell",
      "wendy",
      "burger king",
      "chick-fil-a",
      "subway",
      "starbucks",
      "dunkin",
      "panera",
      "popeyes",
      "kfc",
      "domino",
      "pizza hut",
      "cava",
      "sweetgreen",
      "wingstop",
      "five guys",
      "shake shack",
      "panda express",
      "jersey mike",
      "jimmy john",
      "qdoba",
      "in-n-out",
      "ihop",
      "denny",
      "olive garden",
      "cheesecake factory",
      "restaurant",
      "takeout",
      "take-out",
      "uber eats",
      "doordash",
    ])
  ) {
    return "restaurant"
  }

  if (
    includesAny(name, [
      "shake",
      "smoothie",
      "protein drink",
      "meal replacement",
      "blended protein",
    ])
  ) {
    return "shake"
  }

  if (/\b(protein|granola|cereal|energy|snack)?\s*bars?\b/.test(name)) return "bar"

  if (
    includesAny(name, [
      "bowl",
      "plate",
      "sandwich",
      "burger",
      "pizza",
      "burrito",
      "wrap",
      "salad",
      "casserole",
      "stir fry",
      "stir-fry",
    ])
  ) {
    return "meal"
  }

  if (
    includesAny(name, [
      "chips",
      "crisps",
      "cheetos",
      "doritos",
      "fritos",
      "cookie",
      "oreo",
      "candy",
      "chocolate",
      "gummy",
      "gummies",
      "donut",
      "doughnut",
      "cake",
      "ice cream",
      "popcorn",
      "pretzel",
      "cracker",
      "nachos",
      "brownie",
      "muffin",
      "junk food",
    ])
  ) {
    return "snack"
  }

  if (
    includesAny(name, [
      "coffee",
      "latte",
      "cappuccino",
      "espresso",
      "soda",
      "juice",
      "lemonade",
      "iced tea",
      "energy drink",
      "sports drink",
      "water",
    ])
  ) {
    return "drink"
  }

  if (
    /\beggs?\b/.test(name) ||
    includesAny(name, [
      "olive oil",
      "cooking oil",
      "sauce",
      "dressing",
      "mayonnaise",
      "ketchup",
      "mustard",
      "tortilla",
      "bread",
      "rice",
      "beans",
      "cheese",
      "yogurt",
      "yoghurt",
      "oats",
      "oatmeal",
      "banana",
      "apple",
      "avocado",
      "vegetable",
      "fruit",
      "chicken",
      "beef",
      "turkey",
      "steak",
      "pork",
      "salmon",
      "tuna",
      "shrimp",
      "fish",
      "milk",
      "potato",
      "broccoli",
      "spinach",
      "quinoa",
      "pasta",
      "protein powder",
      "whey",
      "casein",
    ])
  ) {
    return "ingredient"
  }

  if (mealTags.includes("snack")) return "snack"
  if (mealTags.some((tag) => tag === "breakfast" || tag === "lunch" || tag === "dinner")) {
    return "meal"
  }
  if ((input.calories ?? 0) >= 350) return "meal"
  return "other"
}
