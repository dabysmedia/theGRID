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

  if (/\b(protein|granola|cereal|energy|snack)?\s*bar\b/.test(name)) return "bar"

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
      "oats",
      "banana",
      "apple",
      "avocado",
      "vegetable",
      "fruit",
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
