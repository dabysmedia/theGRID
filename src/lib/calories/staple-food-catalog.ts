import { rankAndMergeFoodSearchResults } from "@/lib/calories/food-search-ranking"
import type { FoodSearchItem } from "@/lib/calories/open-food-facts"

function staple(
  id: string,
  name: string,
  serving: string,
  servingSizeG: number | null,
  calories: number,
  protein: number | null,
  carbs: number | null,
  fat: number | null,
): FoodSearchItem {
  return {
    food_id: `staple:${id}`,
    food_name: name,
    brand_name: "Generic",
    food_type: "Staple food",
    serving_description: serving,
    serving_size_g: servingSizeG,
    calories,
    protein,
    carbs,
    fat,
    image_url: null,
    source: "catalog",
  }
}

/**
 * Everyday whole foods that product databases often bury under branded hits.
 * Values are typical US household servings (USDA-style), not branded products.
 */
export const STAPLE_FOOD_CATALOG: FoodSearchItem[] = [
  staple("banana-medium", "Banana", "1 medium (118 g)", 118, 105, 1.3, 27, 0.4),
  staple("apple-medium", "Apple", "1 medium (182 g)", 182, 95, 0.5, 25, 0.3),
  staple("orange-medium", "Orange", "1 medium (131 g)", 131, 62, 1.2, 15, 0.2),
  staple("strawberries-cup", "Strawberries", "1 cup (152 g)", 152, 49, 1, 12, 0.5),
  staple("blueberries-cup", "Blueberries", "1 cup (148 g)", 148, 84, 1.1, 21, 0.5),
  staple("avocado-half", "Avocado", "1/2 medium (68 g)", 68, 114, 1.3, 6, 10.5),
  staple("egg-large", "Egg", "1 large (50 g)", 50, 72, 6.3, 0.4, 4.8),
  staple("eggs-2-large", "Eggs", "2 large (100 g)", 100, 143, 13, 0.7, 9.5),
  staple("oatmeal-cup", "Oatmeal, cooked", "1 cup (234 g)", 234, 166, 6, 28, 3.6),
  staple("white-rice-cup", "White rice, cooked", "1 cup (158 g)", 158, 205, 4.3, 45, 0.4),
  staple("brown-rice-cup", "Brown rice, cooked", "1 cup (195 g)", 195, 218, 4.5, 45, 1.6),
  staple("quinoa-cup", "Quinoa, cooked", "1 cup (185 g)", 185, 222, 8.1, 39, 3.6),
  staple("pasta-cup", "Pasta, cooked", "1 cup (140 g)", 140, 221, 8.1, 43, 1.3),
  staple("chicken-breast-4oz", "Chicken breast, cooked", "4 oz (113 g)", 113, 187, 35, 0, 4),
  staple("turkey-breast-4oz", "Turkey breast, cooked", "4 oz (113 g)", 113, 135, 30, 0, 1),
  staple("ground-beef-90-4oz", "Ground beef, 90% lean, cooked", "4 oz (113 g)", 113, 199, 25, 0, 11),
  staple("salmon-4oz", "Salmon, cooked", "4 oz (113 g)", 113, 233, 25, 0, 14),
  staple("tuna-can-3oz", "Tuna, canned in water", "3 oz (85 g)", 85, 73, 16, 0, 0.8),
  staple("shrimp-3oz", "Shrimp, cooked", "3 oz (85 g)", 85, 84, 20, 0, 0.2),
  staple("greek-yogurt-cup", "Greek yogurt, plain nonfat", "1 cup (245 g)", 245, 146, 25, 9, 0.4),
  staple("milk-whole-cup", "Whole milk", "1 cup (244 g)", 244, 149, 8, 12, 8),
  staple("milk-2pct-cup", "2% milk", "1 cup (244 g)", 244, 122, 8, 12, 5),
  staple("cottage-cheese-cup", "Cottage cheese, 1%", "1 cup (226 g)", 226, 163, 28, 6, 2.3),
  staple("cheddar-1oz", "Cheddar cheese", "1 oz (28 g)", 28, 114, 7, 0.4, 9),
  staple("peanut-butter-2tbsp", "Peanut butter", "2 tbsp (32 g)", 32, 188, 8, 6, 16),
  staple("almonds-1oz", "Almonds", "1 oz (28 g)", 28, 164, 6, 6, 14),
  staple("bread-wheat-slice", "Whole wheat bread", "1 slice (32 g)", 32, 81, 4, 14, 1.1),
  staple("bagel-plain", "Bagel, plain", "1 bagel (99 g)", 99, 277, 11, 55, 1.4),
  staple("protein-powder-scoop", "Protein powder", "1 scoop (30 g)", 30, 120, 24, 3, 1.5),
  staple("black-beans-cup", "Black beans, cooked", "1 cup (172 g)", 172, 227, 15, 41, 0.9),
  staple("broccoli-cup", "Broccoli, cooked", "1 cup (156 g)", 156, 55, 3.7, 11, 0.6),
  staple("spinach-2cups", "Spinach, raw", "2 cups (60 g)", 60, 14, 1.8, 2, 0.2),
  staple("sweet-potato-medium", "Sweet potato, baked", "1 medium (114 g)", 114, 103, 2.3, 24, 0.2),
  staple("potato-baked-medium", "Potato, baked", "1 medium (173 g)", 173, 161, 4.3, 37, 0.2),
  staple("olive-oil-tbsp", "Olive oil", "1 tbsp (14 g)", 14, 119, 0, 0, 13.5),
  staple("butter-tbsp", "Butter", "1 tbsp (14 g)", 14, 102, 0.1, 0, 12),
  staple("honey-tbsp", "Honey", "1 tbsp (21 g)", 21, 64, 0.1, 17, 0),
  staple("granola-half-cup", "Granola", "1/2 cup (61 g)", 61, 298, 8, 32, 15),
]

export function searchStapleFoodCatalog(query: string, limit = 8): FoodSearchItem[] {
  return rankAndMergeFoodSearchResults(query, [STAPLE_FOOD_CATALOG], limit)
}
