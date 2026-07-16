import type { FoodSearchItem } from "@/lib/calories/open-food-facts"
import { rankAndMergeFoodSearchResults } from "@/lib/calories/food-search-ranking"

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

function popularMenu(
  id: string,
  name: string,
  shortName: string,
  aliases: string[],
  sourceLabel: string,
  sourceUrl: string,
  items: RestaurantMenuItem[],
): RestaurantMenu {
  return {
    id,
    name,
    shortName,
    aliases,
    region: "US",
    sourceLabel,
    sourceUrl,
    sections: [{ id: "popular", name: "Popular items", items }],
  }
}

/**
 * A dependable built-in catalog for the restaurant browser.
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
  popularMenu(
    "burger-king",
    "Burger King",
    "BK",
    ["burger king", "bk"],
    "Burger King Nutrition Explorer",
    "https://www.bk.com/nutrition-explorer",
    [
      item("whopper", "Whopper", 670, 31, 54, 40),
      item("whopper-jr", "Whopper Jr.", 330, 15, 30, 18),
      item("original-chicken-sandwich", "Original Chicken Sandwich", 680, 28, 54, 39),
      item("chicken-nuggets-8", "Chicken Nuggets, 8 piece", 390, 20, 20, 25, "8 pieces"),
      item("fries-medium", "French Fries, medium", 370, 5, 56, 15, "1 medium order"),
    ],
  ),
  popularMenu(
    "wendys",
    "Wendy's",
    "W",
    ["wendys", "wendy's"],
    "Wendy's Nutrition & Allergens",
    "https://order.wendys.com/us/en/national/menu/nutrition",
    [
      item("daves-single", "Dave's Single", 590, 29, 37, 37),
      item("baconator", "Baconator", 960, 57, 36, 66),
      item("spicy-chicken-sandwich", "Spicy Chicken Sandwich", 490, 28, 51, 20),
      item("nuggets-10", "Crispy Chicken Nuggets, 10 piece", 450, 25, 24, 29, "10 pieces"),
      item("fries-medium", "Natural-Cut Fries, medium", 350, 5, 47, 16, "1 medium order"),
    ],
  ),
  popularMenu(
    "subway",
    "Subway",
    "SUB",
    ["subway", "sub way"],
    "Subway Nutrition",
    "https://www.subway.com/en-us/menunutrition/nutrition",
    [
      item("turkey-6", "Oven-Roasted Turkey, 6 inch", 270, 20, 40, 4, "1 six-inch sandwich"),
      item("italian-bmt-6", "Italian B.M.T., 6 inch", 410, 20, 42, 17, "1 six-inch sandwich"),
      item("steak-cheese-6", "Steak & Cheese, 6 inch", 360, 24, 42, 10, "1 six-inch sandwich"),
      item("tuna-6", "Tuna, 6 inch", 480, 20, 44, 25, "1 six-inch sandwich"),
      item("veggie-delite-6", "Veggie Delite, 6 inch", 210, 10, 39, 3, "1 six-inch sandwich"),
    ],
  ),
  popularMenu(
    "starbucks",
    "Starbucks",
    "SB",
    ["starbucks", "star bucks"],
    "Starbucks Menu Nutrition",
    "https://www.starbucks.com/menu",
    [
      item("turkey-bacon-sandwich", "Turkey Bacon, Cheddar & Egg White Sandwich", 230, 17, 28, 5),
      item("bacon-gouda-sandwich", "Bacon, Gouda & Egg Sandwich", 360, 19, 35, 18),
      item("spinach-feta-wrap", "Spinach, Feta & Egg White Wrap", 290, 20, 34, 8),
      item("egg-bites-bacon-gruyere", "Bacon & Gruyère Egg Bites", 300, 19, 9, 20, "2 egg bites"),
      item("caffe-latte-grande", "Caffè Latte, grande", 190, 13, 18, 7, "16 fl oz"),
    ],
  ),
  popularMenu(
    "dunkin",
    "Dunkin'",
    "DD",
    ["dunkin", "dunkin donuts", "dunkin'"],
    "Dunkin' Nutrition Guide",
    "https://www.dunkindonuts.com/en/menu/nutrition",
    [
      item("bacon-egg-cheese-bagel", "Bacon, Egg & Cheese on a Bagel", 520, 23, 67, 18),
      item("egg-cheese-wakeup-wrap", "Egg & Cheese Wake-Up Wrap", 180, 7, 15, 10),
      item("glazed-donut", "Glazed Donut", 240, 4, 33, 11),
      item("hash-browns", "Hash Browns", 110, 2, 13, 6, "6 pieces"),
      item("latte-medium", "Latte with Whole Milk, medium", 170, 9, 14, 9, "1 medium"),
    ],
  ),
  popularMenu(
    "kfc",
    "KFC",
    "KFC",
    ["kfc", "kentucky fried chicken"],
    "KFC Nutrition",
    "https://www.kfc.com/nutrition",
    [
      item("original-breast", "Original Recipe Chicken Breast", 390, 39, 11, 21),
      item("original-drumstick", "Original Recipe Drumstick", 130, 12, 4, 8),
      item("chicken-sandwich", "KFC Chicken Sandwich", 650, 34, 49, 35),
      item("famous-bowl", "Famous Bowl", 590, 25, 81, 16),
      item("mashed-potatoes-gravy", "Mashed Potatoes with Gravy", 130, 3, 20, 4, "1 individual side"),
      item("biscuit", "Buttermilk Biscuit", 180, 4, 23, 8),
    ],
  ),
  popularMenu(
    "popeyes",
    "Popeyes",
    "P",
    ["popeyes", "popeye's", "popeyes louisiana kitchen"],
    "Popeyes Nutrition Information",
    "https://www.popeyes.com/nutritional-information",
    [
      item("chicken-sandwich", "Classic Chicken Sandwich", 700, 28, 50, 42),
      item("spicy-chicken-sandwich", "Spicy Chicken Sandwich", 700, 28, 50, 42),
      item("tenders-3", "Chicken Tenders, 3 piece", 310, 28, 16, 15, "3 pieces"),
      item("signature-leg", "Signature Chicken Leg", 160, 14, 5, 9),
      item("cajun-fries-regular", "Cajun Fries, regular", 270, 4, 33, 14, "1 regular order"),
      item("biscuit", "Biscuit", 210, 3, 24, 13),
    ],
  ),
  popularMenu(
    "panera",
    "Panera Bread",
    "PB",
    ["panera", "panera bread"],
    "Panera Nutrition Guide",
    "https://www.panerabread.com/en-us/menu/nutrition.html",
    [
      item("broccoli-cheddar-cup", "Broccoli Cheddar Soup, cup", 240, 9, 17, 16, "1 cup"),
      item("mac-cheese-small", "Mac & Cheese, small", 480, 17, 36, 30, "1 small bowl"),
      item("frontega-chicken-whole", "Frontega Chicken Sandwich, whole", 750, 43, 72, 32),
      item("chipotle-avocado-melt-whole", "Chipotle Chicken Avocado Melt, whole", 920, 46, 77, 48),
      item("greek-salad-whole", "Greek Salad, whole", 400, 8, 17, 36),
    ],
  ),
  popularMenu(
    "panda-express",
    "Panda Express",
    "PX",
    ["panda express", "panda"],
    "Panda Express Nutrition Information",
    "https://www.pandaexpress.com/nutritioninformation",
    [
      item("orange-chicken", "The Original Orange Chicken", 490, 25, 51, 23, "1 entrée serving"),
      item("teriyaki-chicken", "Grilled Teriyaki Chicken", 275, 33, 14, 10, "1 entrée serving"),
      item("broccoli-beef", "Broccoli Beef", 150, 9, 13, 7, "1 entrée serving"),
      item("chow-mein", "Chow Mein", 510, 13, 80, 20, "1 side serving"),
      item("fried-rice", "Fried Rice", 520, 11, 85, 16, "1 side serving"),
    ],
  ),
  popularMenu(
    "dominos",
    "Domino's",
    "D",
    ["dominos", "domino's", "domino pizza"],
    "Domino's Cal-O-Meter",
    "https://www.dominos.com/en/pages/content/nutritional/cal-o-meter",
    [
      item("hand-tossed-cheese", "Hand Tossed Cheese Pizza, medium slice", 200, 8, 25, 8, "1 slice"),
      item("hand-tossed-pepperoni", "Hand Tossed Pepperoni Pizza, medium slice", 210, 9, 25, 9, "1 slice"),
      item("pan-cheese", "Handmade Pan Cheese Pizza, medium slice", 290, 11, 29, 14, "1 slice"),
      item("parmesan-bread-bites-4", "Parmesan Bread Bites, 4 piece", 220, 6, 27, 10, "4 pieces"),
      item("hot-buffalo-wings-4", "Hot Buffalo Wings, 4 piece", 260, 15, 7, 19, "4 pieces"),
    ],
  ),
  popularMenu(
    "five-guys",
    "Five Guys",
    "5G",
    ["five guys", "5 guys"],
    "Five Guys Nutrition & Allergen Information",
    "https://www.fiveguys.com/menu/nutrition-allergen-info/",
    [
      item("hamburger", "Hamburger", 840, 39, 39, 55),
      item("cheeseburger", "Cheeseburger", 980, 47, 40, 67),
      item("little-hamburger", "Little Hamburger", 540, 23, 39, 32),
      item("hot-dog", "Kosher Style Hot Dog", 520, 18, 40, 35),
      item("fries-little", "Five Guys Style Fries, little", 530, 8, 72, 23, "1 little order"),
    ],
  ),
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

export function searchRestaurantMenus(query: string, limit = 30): FoodSearchItem[] {
  if (query.trim().length < 2) return []
  const foods = RESTAURANT_MENUS.flatMap((restaurant) =>
    restaurantMenuFoods(restaurant).map((food) => ({
      ...food,
      brand_name: [restaurant.name, ...restaurant.aliases].join(" · "),
    })),
  )
  return rankAndMergeFoodSearchResults(query, [foods], limit).map((food) => ({
    ...food,
    brand_name:
      RESTAURANT_MENUS.find((restaurant) => food.food_id.startsWith(`restaurant:${restaurant.id}:`))
        ?.name ?? food.brand_name,
  }))
}

export function getRestaurantMenu(id: string): RestaurantMenu | null {
  return RESTAURANT_MENUS.find((restaurant) => restaurant.id === id) ?? null
}
