export type FoodDataSource = "openfoodfacts" | "fatsecret" | "usda" | "restaurant"

export interface FoodSearchItem {
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
  source: FoodDataSource
}

export interface OpenFoodFactsProduct {
  code?: unknown
  product_name?: unknown
  generic_name?: unknown
  brands?: unknown
  serving_size?: unknown
  serving_quantity?: unknown
  quantity?: unknown
  image_front_small_url?: unknown
  image_front_url?: unknown
  nutriments?: unknown
  completeness?: unknown
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return value
}

function asImageUrl(value: unknown): string | null {
  const text = asText(value)
  if (!text) return null
  try {
    const url = new URL(text)
    if (url.protocol !== "https:" || !url.hostname.endsWith("openfoodfacts.org")) return null
    return url.toString()
  } catch {
    return null
  }
}

function rounded(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10) / 10
}

function nutrientForServing(
  nutriments: Record<string, unknown>,
  key: string,
  servingSizeG: number | null,
): number | null {
  const serving = asNumber(nutriments[`${key}_serving`])
  if (serving != null) return rounded(serving)

  const per100g = asNumber(nutriments[`${key}_100g`])
  if (per100g != null) {
    return rounded(servingSizeG ? (per100g * servingSizeG) / 100 : per100g)
  }

  return rounded(asNumber(nutriments[key]))
}

function caloriesForServing(
  nutriments: Record<string, unknown>,
  servingSizeG: number | null,
): number | null {
  const kcal = nutrientForServing(nutriments, "energy-kcal", servingSizeG)
  if (kcal != null) return kcal

  const kj = nutrientForServing(nutriments, "energy-kj", servingSizeG)
  return kj == null ? null : rounded(kj / 4.184)
}

export function mapOpenFoodFactsProduct(product: OpenFoodFactsProduct): FoodSearchItem | null {
  const code = asText(product.code)
  const name = asText(product.product_name) ?? asText(product.generic_name)
  if (!code || !name) return null

  const rawServingSizeG = asNumber(product.serving_quantity)
  const servingSizeG = rawServingSizeG != null && rawServingSizeG > 0 ? rawServingSizeG : null
  const servingDescription =
    asText(product.serving_size) ??
    (servingSizeG ? `${servingSizeG} g` : "100 g")
  const nutriments =
    product.nutriments && typeof product.nutriments === "object"
      ? (product.nutriments as Record<string, unknown>)
      : {}

  return {
    food_id: `off:${code}`,
    food_name: name,
    brand_name: asText(product.brands),
    food_type: "Open Food Facts product",
    serving_description: servingDescription,
    serving_size_g: servingSizeG ?? 100,
    calories: caloriesForServing(nutriments, servingSizeG),
    protein: nutrientForServing(nutriments, "proteins", servingSizeG),
    carbs: nutrientForServing(nutriments, "carbohydrates", servingSizeG),
    fat: nutrientForServing(nutriments, "fat", servingSizeG),
    image_url: asImageUrl(product.image_front_url) ?? asImageUrl(product.image_front_small_url),
    source: "openfoodfacts",
  }
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase()
}

/**
 * Removes incomplete/duplicate community records while preserving Open Food
 * Facts' relevance order. Exact and prefix name matches get a small boost.
 */
export function rankOpenFoodFactsProducts(
  products: OpenFoodFactsProduct[],
  query: string,
  limit = 18,
): FoodSearchItem[] {
  const q = normalized(query)
  const seen = new Set<string>()

  return products
    .map((product, index) => ({
      item: mapOpenFoodFactsProduct(product),
      completeness: asNumber(product.completeness) ?? 0,
      index,
    }))
    .filter((entry): entry is typeof entry & { item: FoodSearchItem } => {
      if (!entry.item || entry.item.calories == null || entry.item.calories <= 0) return false
      const key = [
        normalized(entry.item.food_name),
        normalized(entry.item.brand_name ?? ""),
        entry.item.serving_description,
      ].join("|")
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => {
      const aName = normalized(a.item.food_name)
      const bName = normalized(b.item.food_name)
      const score = (name: string, brand: string | null, completeness: number, index: number) => {
        let value = Math.max(0, 30 - index)
        if (name === q) value += 100
        else if (name.startsWith(q)) value += 55
        else if (name.includes(q)) value += 25
        if (normalized(brand ?? "").includes(q)) value += 18
        value += completeness * 8
        return value
      }
      return (
        score(bName, b.item.brand_name, b.completeness, b.index) -
        score(aName, a.item.brand_name, a.completeness, a.index)
      )
    })
    .slice(0, limit)
    .map((entry) => entry.item)
}
