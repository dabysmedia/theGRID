import type { FoodSearchItem } from "@/lib/calories/open-food-facts"

export interface RestaurantMenuItem {
  id: string
  name: string
  serving: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  servingSizeG?: number
}

export interface RestaurantMenuSection {
  id: string
  name: string
  items: RestaurantMenuItem[]
}

export interface RestaurantMenu {
  id: string
  name: string
  shortName: string
  aliases: string[]
  region: "US"
  sourceUrl: string
  sourceLabel: string
  sections: RestaurantMenuSection[]
}

function item(
  id: string,
  name: string,
  calories: number,
  protein: number | null,
  carbs: number | null,
  fat: number | null,
  serving = "1 menu item",
  servingSizeG?: number,
): RestaurantMenuItem {
  return { id, name, calories, protein, carbs, fat, serving, servingSizeG }
}

/**
 * A small, dependable starter catalog for the restaurant browser.
 *
 * Values are standard US menu servings published by each restaurant. Menus and
 * formulations vary by location and change over time, so the UI links to the
 * official source and labels values as estimates.
 */
export const RESTAURANT_MENUS: RestaurantMenu[] = [
  {
    id: "mcdonalds",
    name: "McDonald's",
    shortName: "M",
    aliases: ["mcdonalds", "mcdonald's", "mcd"],
    region: "US",
    sourceLabel: "McDonald's Nutrition Calculator",
    sourceUrl: "https://www.mcdonalds.com/us/en-us/about-our-food/nutrition-calculator.html",
    sections: [
      {
        id: "burgers-chicken",
        name: "Burgers & chicken",
        items: [
          item("big-mac", "Big Mac", 590, 25, 46, 34),
          item("quarter-pounder-cheese", "Quarter Pounder with Cheese", 520, 30, 42, 26),
          item("double-quarter-pounder-cheese", "Double Quarter Pounder with Cheese", 740, 48, 43, 42),
          item("mcchicken", "McChicken", 400, 14, 39, 21),
          item("mcnuggets-10", "Chicken McNuggets, 10 piece", 410, 23, 26, 24, "10 pieces"),
        ],
      },
      {
        id: "breakfast-sides",
        name: "Breakfast & sides",
        items: [
          item("egg-mcmuffin", "Egg McMuffin", 310, 17, 30, 13),
          item("sausage-mcmuffin-egg", "Sausage McMuffin with Egg", 480, 20, 30, 31),
          item("fries-medium", "World Famous Fries, medium", 320, 5, 43, 15, "1 medium order"),
        ],
      },
    ],
  },
  {
    id: "chipotle",
    name: "Chipotle",
    shortName: "C",
    aliases: ["chipotle", "chipotle mexican grill"],
    region: "US",
    sourceLabel: "Chipotle Nutrition Calculator",
    sourceUrl: "https://www.chipotle.com/nutrition-calculator",
    sections: [
      {
        id: "proteins",
        name: "Proteins",
        items: [
          item("chicken", "Adobo Chicken", 180, 32, 0, 7, "4 oz serving", 113),
          item("steak", "Steak", 150, 21, 1, 6, "4 oz serving", 113),
          item("barbacoa", "Barbacoa", 170, 24, 2, 7, "4 oz serving", 113),
          item("carnitas", "Carnitas", 210, 23, 0, 12, "4 oz serving", 113),
          item("sofritas", "Sofritas", 150, 8, 9, 10, "4 oz serving", 113),
        ],
      },
      {
        id: "bases",
        name: "Rice, beans & vegetables",
        items: [
          item("white-rice", "Cilantro-Lime White Rice", 210, 4, 40, 4, "4 oz serving", 113),
          item("brown-rice", "Cilantro-Lime Brown Rice", 210, 4, 36, 6, "4 oz serving", 113),
          item("black-beans", "Black Beans", 130, 8, 22, 1, "4 oz serving", 113),
          item("pinto-beans", "Pinto Beans", 130, 8, 21, 1, "4 oz serving", 113),
          item("fajita-vegetables", "Fajita Vegetables", 20, 1, 5, 0, "3.5 oz serving", 99),
        ],
      },
      {
        id: "toppings-sides",
        name: "Toppings & sides",
        items: [
          item("fresh-tomato-salsa", "Fresh Tomato Salsa", 25, 0, 4, 0, "3.5 oz serving", 99),
          item("corn-salsa", "Roasted Chili-Corn Salsa", 80, 3, 16, 1, "3.5 oz serving", 99),
          item("cheese", "Cheese", 110, 6, 1, 8, "1 oz serving", 28),
          item("sour-cream", "Sour Cream", 110, 2, 2, 9, "2 oz serving", 57),
          item("guacamole", "Guacamole", 230, 2, 8, 22, "4 oz serving", 113),
          item("chips", "Chips", 540, 7, 73, 25, "4 oz serving", 113),
        ],
      },
    ],
  },
  {
    id: "chick-fil-a",
    name: "Chick-fil-A",
    shortName: "CFA",
    aliases: ["chick fil a", "chick-fil-a", "chickfila"],
    region: "US",
    sourceLabel: "Chick-fil-A Nutrition & Allergens",
    sourceUrl: "https://www.chick-fil-a.com/nutrition-allergens",
    sections: [
      {
        id: "entrees",
        name: "Entrées",
        items: [
          item("chicken-sandwich", "Chick-fil-A Chicken Sandwich", 420, 29, 41, 18),
          item("spicy-chicken-sandwich", "Spicy Chicken Sandwich", 450, 28, 45, 19),
          item("nuggets-8", "Chick-fil-A Nuggets, 8 count", 250, 27, 11, 11, "8 pieces"),
          item("nuggets-12", "Chick-fil-A Nuggets, 12 count", 380, 40, 16, 17, "12 pieces"),
          item("grilled-nuggets-8", "Grilled Nuggets, 8 count", 130, 25, 1, 3, "8 pieces"),
        ],
      },
      {
        id: "sides",
        name: "Sides",
        items: [
          item("waffle-fries-small", "Waffle Potato Fries, small", 320, 4, 35, 19, "1 small order", 96),
          item("waffle-fries-medium", "Waffle Potato Fries, medium", 420, 5, 45, 24, "1 medium order", 125),
          item("waffle-fries-large", "Waffle Potato Fries, large", 600, 7, 65, 35, "1 large order", 179),
        ],
      },
    ],
  },
  {
    id: "taco-bell",
    name: "Taco Bell",
    shortName: "TB",
    aliases: ["taco bell", "tacobell"],
    region: "US",
    sourceLabel: "Taco Bell Nutrition Information",
    sourceUrl: "https://www.tacobell.com/nutrition/info",
    sections: [
      {
        id: "tacos-specialties",
        name: "Tacos & specialties",
        items: [
          item("crunchy-taco", "Crunchy Taco", 170, 8, 13, 10),
          item("soft-taco", "Soft Taco", 180, 9, 18, 9),
          item("doritos-locos-taco", "Nacho Cheese Doritos Locos Taco", 170, 8, 13, 9),
          item("crunchwrap-supreme", "Crunchwrap Supreme", 540, 16, 71, 21),
          item("cheesy-gordita-crunch", "Cheesy Gordita Crunch", 490, 20, 41, 29),
        ],
      },
      {
        id: "burritos-quesadillas",
        name: "Burritos & quesadillas",
        items: [
          item("bean-burrito", "Bean Burrito", 360, 13, 54, 9),
          item("beefy-five-layer-burrito", "Beefy 5-Layer Burrito", 490, 18, 63, 18),
          item("chicken-quesadilla", "Chicken Quesadilla", 510, null, null, null),
          item("cheese-quesadilla", "Cheese Quesadilla", 440, null, null, null),
        ],
      },
    ],
  },
]

export function restaurantMenuItemToFood(
  restaurant: RestaurantMenu,
  menuItem: RestaurantMenuItem,
): FoodSearchItem {
  return {
    food_id: `restaurant:${restaurant.id}:${menuItem.id}`,
    food_name: menuItem.name,
    brand_name: restaurant.name,
    food_type: "Restaurant",
    serving_description: menuItem.serving,
    serving_size_g: menuItem.servingSizeG ?? null,
    calories: menuItem.calories,
    protein: menuItem.protein,
    carbs: menuItem.carbs,
    fat: menuItem.fat,
    image_url: null,
    source: "restaurant",
  }
}

export function restaurantMenuFoods(restaurant: RestaurantMenu): FoodSearchItem[] {
  return restaurant.sections.flatMap((section) =>
    section.items.map((menuItem) => restaurantMenuItemToFood(restaurant, menuItem)),
  )
}

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function searchRestaurantMenus(query: string, limit = 30): FoodSearchItem[] {
  const normalizedQuery = normalizeSearch(query)
  if (normalizedQuery.length < 2) return []

  const terms = normalizedQuery.split(/\s+/)
  return RESTAURANT_MENUS.flatMap((restaurant) => {
    const brandText = normalizeSearch([restaurant.name, ...restaurant.aliases].join(" "))
    return restaurantMenuFoods(restaurant).map((food) => {
      const itemText = normalizeSearch(food.food_name)
      const searchable = `${brandText} ${itemText}`
      if (!terms.every((term) => searchable.includes(term))) return null
      const score =
        brandText === normalizedQuery
          ? 4
          : itemText === normalizedQuery
            ? 3
            : itemText.startsWith(normalizedQuery)
              ? 2
              : 1
      return { food, score }
    })
  })
    .filter((match): match is { food: FoodSearchItem; score: number } => match != null)
    .sort((a, b) => b.score - a.score || a.food.food_name.localeCompare(b.food.food_name))
    .slice(0, limit)
    .map((match) => match.food)
}

export function getRestaurantMenu(id: string): RestaurantMenu | null {
  return RESTAURANT_MENUS.find((restaurant) => restaurant.id === id) ?? null
}
