import type { FoodMeasurementUnit } from "@/lib/calories/measurements"

export interface CatalogFoodResult {
  food_id: string
  food_name: string
  brand_name: string | null
  food_type: string
  serving_description: string | null
  serving_size_g: number | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  image_url: string | null
  source?: "openfoodfacts" | "fatsecret" | "usda" | "restaurant"
}

export interface PortionSelection {
  amount: number
  unit: FoodMeasurementUnit
  multiplier: number
}
