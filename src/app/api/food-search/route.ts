import { NextRequest, NextResponse } from "next/server"

/** Avoid Next.js caching upstream food API responses (stale/empty in prod). */
const fetchNoStore: RequestInit = { cache: "no-store" }

export const dynamic = "force-dynamic"

interface FoodItem {
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
  source: "fatsecret" | "usda"
}

/* ═══════════════════════════════════════════════════════
   FatSecret – OAuth 2.0 Client Credentials
   ═══════════════════════════════════════════════════════ */

let cachedToken: string | null = null
let tokenExpiry = 0

async function getFatSecretToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const clientId = process.env.FATSECRET_CLIENT_ID
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error("No FatSecret creds")

  const res = await fetch("https://oauth.fatsecret.com/connect/token", {
    ...fetchNoStore,
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=basic",
  })

  if (!res.ok) throw new Error(`Token failed: ${res.status}`)
  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken!
}

function parseFatSecretDesc(desc: string) {
  const out = { serving: "", serving_size_g: null as number | null, calories: null as number | null, fat: null as number | null, carbs: null as number | null, protein: null as number | null }
  const parts = desc.split(" - ")
  if (parts.length >= 2) {
    out.serving = parts[0].trim()
    const n = parts[1]
    const cal = n.match(/Calories:\s*([\d.]+)/i)
    const fat = n.match(/Fat:\s*([\d.]+)/i)
    const carb = n.match(/Carbs:\s*([\d.]+)/i)
    const prot = n.match(/Protein:\s*([\d.]+)/i)
    if (cal) out.calories = parseFloat(cal[1])
    if (fat) out.fat = parseFloat(fat[1])
    if (carb) out.carbs = parseFloat(carb[1])
    if (prot) out.protein = parseFloat(prot[1])

    const gMatch = out.serving.match(/(\d+(?:\.\d+)?)\s*g\b/i)
    if (gMatch) out.serving_size_g = parseFloat(gMatch[1])
  }
  return out
}

async function searchFatSecret(query: string): Promise<FoodItem[]> {
  const token = await getFatSecretToken()

  const res = await fetch("https://platform.fatsecret.com/rest/server.api", {
    ...fetchNoStore,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      method: "foods.search",
      search_expression: query,
      format: "json",
      max_results: "15",
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`FatSecret ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()

  if (data?.error) throw new Error(`FatSecret error ${data.error.code}: ${data.error.message}`)

  const rawFoods = data?.foods?.food
  if (!rawFoods) return []

  const foodList = Array.isArray(rawFoods) ? rawFoods : [rawFoods]
  return foodList.map((f: Record<string, string>) => {
    const parsed = parseFatSecretDesc(f.food_description ?? "")
    return {
      food_id: f.food_id,
      food_name: f.food_name,
      brand_name: f.brand_name ?? null,
      food_type: f.food_type,
      serving_description: parsed.serving || null,
      serving_size_g: parsed.serving_size_g,
      calories: parsed.calories,
      protein: parsed.protein,
      carbs: parsed.carbs,
      fat: parsed.fat,
      source: "fatsecret" as const,
    }
  })
}

/* ═══════════════════════════════════════════════════════
   USDA FoodData Central – fallback
   ═══════════════════════════════════════════════════════ */

/** USDA FDC nutrient ids when `nutrientNumber` is missing (search/detail payloads vary). */
function nutrientIdFromNumber(number: string): number | null {
  switch (number) {
    case "208":
      return 1008
    case "203":
      return 1003
    case "204":
      return 1004
    case "205":
      return 1005
    default:
      return null
  }
}

function extractNutrient(
  nutrients: Array<Record<string, unknown>>,
  number: string
): number | null {
  const wantId = nutrientIdFromNumber(number)
  for (const x of nutrients) {
    const rawNum = x.nutrientNumber
    const num =
      rawNum == null ? null : typeof rawNum === "string" ? rawNum : String(rawNum)
    if (num === number) {
      const v = x.value
      if (typeof v === "number") return v
    }
    if (wantId != null && x.nutrientId === wantId) {
      const v = x.value
      if (typeof v === "number") return v
    }
    const nested = x.nutrient as { number?: string | number; id?: number } | undefined
    if (nested) {
      const nn = nested.number != null ? String(nested.number) : null
      if (nn === number) {
        const v = x.value
        if (typeof v === "number") return v
      }
      if (wantId != null && nested.id === wantId) {
        const v = x.value
        if (typeof v === "number") return v
      }
    }
  }
  return null
}

async function searchFDC(query: string): Promise<FoodItem[]> {
  const key = process.env.FDC_API_KEY
  if (!key) throw new Error("No FDC key")

  const res = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&pageSize=15`,
    { ...fetchNoStore, method: "GET" }
  )

  if (!res.ok) throw new Error(`FDC ${res.status}`)

  const data = await res.json()
  const rawFoods: Array<Record<string, unknown>> = data?.foods ?? []

  return rawFoods.map((f) => {
    const nutrients = (f.foodNutrients ?? []) as Array<Record<string, unknown>>
    const energy = extractNutrient(nutrients, "208") ?? extractNutrient(nutrients, "957")
    const protein = extractNutrient(nutrients, "203")
    const fat = extractNutrient(nutrients, "204")
    const carbs = extractNutrient(nutrients, "205")

    const servingSize = f.servingSize as number | undefined
    const servingUnit = f.servingSizeUnit as string | undefined
    const household = f.householdServingFullText as string | undefined
    let servingDesc: string | null = null
    if (household) {
      servingDesc = household
    } else if (servingSize && servingUnit) {
      servingDesc = `${servingSize} ${servingUnit}`
    }

    const servingSizeG =
      servingSize && servingUnit?.toLowerCase() === "g"
        ? servingSize
        : null

    return {
      food_id: String(f.fdcId),
      food_name: (f.description as string ?? "").replace(/^(.)(.*)/,
        (_, first: string, rest: string) => first + rest.toLowerCase()
      ),
      brand_name: (f.brandOwner as string) ?? (f.brandName as string) ?? null,
      food_type: (f.dataType as string) ?? "Unknown",
      serving_description: servingDesc,
      serving_size_g: servingSizeG,
      calories: energy != null ? Math.round(energy * 10) / 10 : null,
      protein: protein != null ? Math.round(protein * 10) / 10 : null,
      carbs: carbs != null ? Math.round(carbs * 10) / 10 : null,
      fat: fat != null ? Math.round(fat * 10) / 10 : null,
      source: "usda" as const,
    }
  })
}

/* ═══════════════════════════════════════════════════════
   Route handler — try FatSecret, fall back to USDA FDC
   ═══════════════════════════════════════════════════════ */

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")
  if (!query || query.trim().length < 2) {
    return NextResponse.json({ foods: [], source: null })
  }

  const hasFatSecret =
    Boolean(process.env.FATSECRET_CLIENT_ID?.trim()) &&
    Boolean(process.env.FATSECRET_CLIENT_SECRET?.trim())
  const hasFdc = Boolean(process.env.FDC_API_KEY?.trim())

  if (!hasFatSecret && !hasFdc) {
    console.error(
      "[food-search] No FATSECRET_* or FDC_API_KEY in server environment — set at least one in production."
    )
    return NextResponse.json({
      foods: [],
      source: null,
      error:
        "Food search is not configured on the server (add FDC_API_KEY or FatSecret credentials).",
    })
  }

  // Try FatSecret first when credentials are present
  if (hasFatSecret) {
    try {
      const foods = await searchFatSecret(query)
      if (foods.length > 0) {
        return NextResponse.json({ foods, source: "fatsecret" })
      }
    } catch (err) {
      console.warn(
        "FatSecret unavailable, falling back to USDA FDC:",
        (err as Error).message
      )
    }
  }

  // USDA FoodData Central (fallback or primary when FatSecret is absent / empty)
  if (!hasFdc) {
    console.error("[food-search] FatSecret returned no results and FDC_API_KEY is not set.")
    return NextResponse.json({
      foods: [],
      source: null,
      error: "Food search unavailable (add FDC_API_KEY as a fallback on the server).",
    })
  }

  try {
    const foods = await searchFDC(query)
    return NextResponse.json({ foods, source: "usda" })
  } catch (err) {
    console.error("USDA FDC food search failed:", (err as Error).message)
    return NextResponse.json(
      { foods: [], source: null, error: "Food search unavailable" },
      { status: 502 }
    )
  }
}
