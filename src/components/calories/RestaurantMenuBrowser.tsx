"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowUpRight,
  ChevronLeft,
  Loader2,
  MapPin,
  Plus,
  Search,
  Store,
  Utensils,
} from "lucide-react"
import { apiFetch } from "@/lib/api-fetch"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type {
  CatalogFoodResult,
  PortionSelection,
} from "@/components/calories/food-search-types"
import {
  availableFoodUnits,
  foodPortionMultiplier,
  measurementUnitLabel,
  type FoodMeasurementUnit,
} from "@/lib/calories/measurements"
import type {
  RestaurantMenu,
  RestaurantMenuItem,
} from "@/lib/calories/restaurant-menu-catalog"

export function RestaurantMenuBrowser({
  onAdd,
}: {
  onAdd: (food: CatalogFoodResult, portion: PortionSelection) => void
}) {
  const [restaurants, setRestaurants] = useState<RestaurantMenu[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null)
  const [selectedFood, setSelectedFood] = useState<CatalogFoodResult | null>(null)

  useEffect(() => {
    let active = true
    void apiFetch("/api/restaurant-menu")
      .then(async (response) => {
        const data = await response.json()
        if (!active) return
        if (!response.ok || !Array.isArray(data.restaurants)) {
          throw new Error("Restaurant menus are unavailable.")
        }
        setRestaurants(data.restaurants)
      })
      .catch(() => {
        if (active) setError("Restaurant menus are unavailable.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const selectedRestaurant =
    restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) ?? null
  const normalizedQuery = query.trim().toLowerCase()
  const visibleRestaurants = useMemo(
    () =>
      restaurants.filter((restaurant) => {
        if (!normalizedQuery) return true
        const restaurantMatch = [restaurant.name, ...restaurant.aliases].some((name) =>
          name.toLowerCase().includes(normalizedQuery),
        )
        const itemMatch = restaurant.sections.some((section) =>
          section.items.some((menuItem) =>
            menuItem.name.toLowerCase().includes(normalizedQuery),
          ),
        )
        return restaurantMatch || itemMatch
      }),
    [normalizedQuery, restaurants],
  )

  if (selectedFood) {
    return (
      <RestaurantPortionPanel
        food={selectedFood}
        onBack={() => setSelectedFood(null)}
        onAdd={(food, portion) => {
          onAdd(food, portion)
          setSelectedFood(null)
        }}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-label="Loading restaurant menus" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/[0.06] px-4 py-5 text-sm text-destructive">
        {error}
      </div>
    )
  }

  if (selectedRestaurant) {
    return (
      <RestaurantMenuView
        restaurant={selectedRestaurant}
        query={query}
        onQueryChange={setQuery}
        onBack={() => {
          setSelectedRestaurantId(null)
          setQuery("")
        }}
        onSelect={(menuItem) =>
          setSelectedFood(toCatalogFood(selectedRestaurant, menuItem))
        }
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-red-200/45" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search restaurants or menu items"
          className="food-search-input h-12 rounded-2xl pl-10"
          autoFocus
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="type-hud-subsection">Restaurant menus</p>
          <p className="type-hud-caption">{visibleRestaurants.length} restaurants</p>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visibleRestaurants.map((restaurant) => {
            const menuItems = restaurant.sections.flatMap((section) => section.items)
            const matchCount = normalizedQuery
              ? menuItems.filter((menuItem) =>
                  menuItem.name.toLowerCase().includes(normalizedQuery),
                ).length
              : menuItems.length
            return (
              <button
                key={restaurant.id}
                type="button"
                onClick={() => {
                  setSelectedRestaurantId(restaurant.id)
                  if (
                    [restaurant.name, ...restaurant.aliases].some((name) =>
                      name.toLowerCase().includes(normalizedQuery),
                    )
                  ) {
                    setQuery("")
                  }
                }}
                className="group flex min-h-20 items-center gap-3 rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.12] to-transparent p-3 text-left transition-colors hover:border-[#ef4444]/25 hover:bg-[#ef4444]/[0.04]"
              >
                <RestaurantMark restaurant={restaurant} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{restaurant.name}</span>
                  <span className="type-hud-caption mt-1 block normal-case">
                    {normalizedQuery && matchCount > 0
                      ? `${matchCount} matching item${matchCount === 1 ? "" : "s"}`
                      : `${menuItems.length} menu items`}
                  </span>
                </span>
                <ChevronLeft className="size-4 rotate-180 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
              </button>
            )
          })}
        </div>
        {visibleRestaurants.length === 0 ? (
          <div className="py-10 text-center">
            <Store className="mx-auto size-6 text-muted-foreground/35" />
            <p className="mt-3 text-sm font-semibold">No restaurant found</p>
            <p className="type-hud-caption mt-1 normal-case">
              Try a chain name or a menu item such as “nuggets”.
            </p>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-border/20 bg-glass-highlight/[0.06] px-3 py-3">
        <div className="flex gap-2">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-[#ef4444]/70" />
          <p className="type-hud-caption normal-case leading-relaxed">
            US standard menu values. Portions, recipes, and availability can vary by location.
          </p>
        </div>
      </div>
    </div>
  )
}

function RestaurantMenuView({
  restaurant,
  query,
  onQueryChange,
  onBack,
  onSelect,
}: {
  restaurant: RestaurantMenu
  query: string
  onQueryChange: (value: string) => void
  onBack: () => void
  onSelect: (menuItem: RestaurantMenuItem) => void
}) {
  const normalizedQuery = query.trim().toLowerCase()
  const sections = restaurant.sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (menuItem) =>
          !normalizedQuery || menuItem.name.toLowerCase().includes(normalizedQuery),
      ),
    }))
    .filter((section) => section.items.length > 0)

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex h-9 items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        All restaurants
      </button>

      <div className="flex items-center gap-3 rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.14] to-transparent p-4">
        <RestaurantMark restaurant={restaurant} large />
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-xl font-semibold">{restaurant.name}</h3>
          <p className="type-hud-caption mt-1 normal-case">{restaurant.region} standard menu</p>
        </div>
        <a
          href={restaurant.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="flex size-9 items-center justify-center rounded-xl border border-border/25 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Open ${restaurant.sourceLabel}`}
        >
          <ArrowUpRight className="size-4" />
        </a>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-red-200/45" />
        <Input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={`Search ${restaurant.name}'s menu`}
          className="food-search-input h-12 rounded-2xl pl-10"
          autoFocus
        />
      </div>

      {sections.map((section) => (
        <section key={section.id}>
          <div className="flex items-center border-b border-border/20 pb-2">
            <p className="type-hud-subsection">{section.name}</p>
            <p className="type-hud-caption ml-auto">{section.items.length} items</p>
          </div>
          <div className="divide-y divide-border/20">
            {section.items.map((menuItem) => (
              <button
                key={menuItem.id}
                type="button"
                onClick={() => onSelect(menuItem)}
                className="group flex min-h-16 w-full items-center gap-3 py-2.5 text-left"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#ef4444]/[0.07] text-[#ef4444]/70">
                  <Utensils className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{menuItem.name}</span>
                  <span className="mt-1 flex flex-wrap gap-x-2 text-[10px] tabular-nums text-muted-foreground/60">
                    <span>{menuItem.serving}</span>
                    {menuItem.protein != null ? <span>P {menuItem.protein}g</span> : null}
                    {menuItem.carbs != null ? <span>C {menuItem.carbs}g</span> : null}
                    {menuItem.fat != null ? <span>F {menuItem.fat}g</span> : null}
                  </span>
                </span>
                <span className="w-14 shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums text-red-200/90">
                    {menuItem.calories}
                  </span>
                  <span className="type-hud-micro block">cal</span>
                </span>
                <span className="food-search-add-chip flex size-9 shrink-0 items-center justify-center rounded-full border">
                  <Plus className="size-3.5" />
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {sections.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm font-semibold">No menu items found</p>
          <p className="type-hud-caption mt-1 normal-case">Try a shorter food name.</p>
        </div>
      ) : null}

      <p className="type-hud-caption pb-2 normal-case leading-relaxed">
        Nutrition is estimated from {restaurant.sourceLabel}. Customizations and local
        preparation can change these values.
      </p>
    </div>
  )
}

function RestaurantPortionPanel({
  food,
  onBack,
  onAdd,
}: {
  food: CatalogFoodResult
  onBack: () => void
  onAdd: (food: CatalogFoodResult, portion: PortionSelection) => void
}) {
  const [amount, setAmount] = useState("1")
  const [unit, setUnit] = useState<FoodMeasurementUnit>("serving")
  const numericAmount = Number(amount)
  const multiplier = foodPortionMultiplier({
    amount: numericAmount,
    unit,
    basisAmount: 1,
    basisUnit: "serving",
    servingWeightG: food.serving_size_g,
  })
  const units = availableFoodUnits("serving", food.serving_size_g)
  const scale = (value: number | null) =>
    value == null || multiplier == null ? null : Math.round(value * multiplier * 10) / 10

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex h-9 items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to menu
      </button>
      <div>
        <p className="type-hud-label-soft">{food.brand_name}</p>
        <h3 className="mt-1 font-heading text-xl font-semibold">{food.food_name}</h3>
        <p className="type-hud-caption mt-1 normal-case">{food.serving_description}</p>
      </div>

      <div className="flex rounded-xl border border-glass-border bg-glass-highlight/20 p-1">
        {units.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setUnit(option)
              if (option === "g") setAmount(String(food.serving_size_g ?? 100))
              else if (option === "oz") {
                setAmount(String(Math.round(((food.serving_size_g ?? 28.35) / 28.3495) * 10) / 10))
              } else setAmount("1")
            }}
            className={cn(
              "flex-1 rounded-lg py-2.5 text-[12px] font-semibold tracking-wide transition-colors",
              unit === option
                ? "bg-background/90 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option === "g" ? "Grams" : option === "oz" ? "Ounces" : "Servings"}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-[#ef4444]/[0.06] px-4 py-5 text-center">
        <p className="type-hud-label-soft mb-1">Portion</p>
        <Input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          type="number"
          min="0.01"
          step={unit === "g" ? "1" : "0.1"}
          inputMode="decimal"
          className="h-14 border-0 bg-transparent px-0 text-center font-heading text-5xl font-semibold tabular-nums shadow-none focus-visible:ring-0"
          autoFocus
        />
        <p className="type-hud-unit mt-1">{measurementUnitLabel(unit, numericAmount)}</p>
      </div>

      <div className="grid grid-cols-4 divide-x divide-border/25 border-y border-border/25 py-3">
        <NutritionCell label="Calories" value={scale(food.calories)} />
        <NutritionCell label="Protein" value={scale(food.protein)} suffix="g" />
        <NutritionCell label="Carbs" value={scale(food.carbs)} suffix="g" />
        <NutritionCell label="Fat" value={scale(food.fat)} suffix="g" />
      </div>

      <Button
        type="button"
        variant="glass"
        className="h-12 w-full"
        disabled={multiplier == null}
        onClick={() => {
          if (multiplier == null) return
          onAdd(food, { amount: numericAmount, unit, multiplier })
        }}
      >
        <Plus className="size-4" />
        Add to meal
      </Button>
    </div>
  )
}

function RestaurantMark({
  restaurant,
  large = false,
}: {
  restaurant: RestaurantMenu
  large?: boolean
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl border border-[#ef4444]/20 bg-[#ef4444]/[0.08] font-heading font-semibold text-[#ef4444]",
        large ? "size-12 text-sm" : "size-11 text-xs",
      )}
      aria-hidden
    >
      {restaurant.shortName}
    </span>
  )
}

function NutritionCell({
  label,
  value,
  suffix = "",
}: {
  label: string
  value: number | null
  suffix?: string
}) {
  return (
    <div className="px-1 text-center">
      <p className="type-hud-stat-sm">{value == null ? "—" : `${value}${suffix}`}</p>
      <p className="type-hud-micro mt-1">{label}</p>
    </div>
  )
}

function toCatalogFood(
  restaurant: RestaurantMenu,
  menuItem: RestaurantMenuItem,
): CatalogFoodResult {
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
