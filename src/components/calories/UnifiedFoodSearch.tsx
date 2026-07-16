"use client"
/* eslint-disable @next/next/no-img-element -- food art can come from user uploads or food databases */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Barcode,
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  Loader2,
  Plus,
  Search,
  Store,
  Utensils,
  X,
} from "lucide-react"
import { apiFetch } from "@/lib/api-fetch"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { BarcodeScanner } from "@/components/calories/BarcodeScanner"
import { FoodFallbackIcon } from "@/components/calories/FoodFallbackIcon"
import type { Recipe, SavedMeal } from "@/lib/calories/log-food"
import {
  availableFoodUnits,
  foodPortionMultiplier,
  measurementUnitLabel,
  type FoodMeasurementUnit,
} from "@/lib/calories/measurements"
import type {
  CatalogFoodResult,
  PortionSelection,
} from "@/components/calories/food-search-types"

export type { CatalogFoodResult, PortionSelection } from "@/components/calories/food-search-types"

type SelectedFood =
  | { kind: "catalog"; food: CatalogFoodResult }
  | { kind: "saved"; food: SavedMeal }

type LibraryFilter = "all" | "saved" | "recipes"

export function UnifiedFoodSearch({
  savedMeals,
  recipes,
  onAddCatalog,
  onAddSaved,
  onAddRecipe,
  onSaveCatalog,
}: {
  savedMeals: SavedMeal[]
  recipes: Recipe[]
  onAddCatalog: (food: CatalogFoodResult, portion: PortionSelection) => void
  onAddSaved: (food: SavedMeal, portion: PortionSelection) => void
  onAddRecipe: (recipe: Recipe) => void
  onSaveCatalog?: (food: CatalogFoodResult) => Promise<boolean>
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<LibraryFilter>("all")
  const [catalog, setCatalog] = useState<CatalogFoodResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedFood | null>(null)
  const [amount, setAmount] = useState("1")
  const [unit, setUnit] = useState<FoodMeasurementUnit>("serving")
  const [scannerOpen, setScannerOpen] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const requestRef = useRef(0)

  const searchCatalog = useCallback(async (value: string, barcode = false) => {
    const trimmed = value.trim()
    if (!barcode && trimmed.length < 2) {
      setCatalog([])
      return
    }
    const requestId = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const parameter = barcode ? "barcode" : "q"
      const response = await apiFetch(
        `/api/food-search?${parameter}=${encodeURIComponent(trimmed)}`,
      )
      const data = await response.json()
      if (requestId !== requestRef.current) return
      setCatalog(Array.isArray(data.foods) ? data.foods : [])
      if (!response.ok || data.error) {
        setError(typeof data.error === "string" ? data.error : "Food search is unavailable.")
      }
    } catch {
      if (requestId !== requestRef.current) return
      setCatalog([])
      setError("Food search is unavailable.")
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2 || filter !== "all") {
      requestRef.current += 1
      setCatalog([])
      setLoading(false)
      setError(null)
      return
    }
    if (/^\d{4,18}$/.test(trimmed)) return
    const timeout = window.setTimeout(() => void searchCatalog(trimmed), 260)
    return () => window.clearTimeout(timeout)
  }, [filter, query, searchCatalog])

  const localQuery = query.trim().toLowerCase()
  const matchingSaved = useMemo(
    () =>
      savedMeals
        .filter((food) => !localQuery || food.name.toLowerCase().includes(localQuery))
        .slice(0, localQuery ? 20 : 8),
    [localQuery, savedMeals],
  )
  const matchingRecipes = useMemo(
    () =>
      recipes
        .filter(
          (recipe) =>
            !localQuery ||
            recipe.name.toLowerCase().includes(localQuery) ||
            recipe.ingredients.some((ingredient) =>
              ingredient.name.toLowerCase().includes(localQuery),
            ),
        )
        .slice(0, localQuery ? 20 : 8),
    [localQuery, recipes],
  )

  const selectedBasis = useMemo(() => {
    if (!selected) return null
    if (selected.kind === "catalog") {
      return {
        amount: 1,
        unit: "serving" as const,
        weightG: selected.food.serving_size_g,
        calories: selected.food.calories,
        protein: selected.food.protein,
        carbs: selected.food.carbs,
        fat: selected.food.fat,
      }
    }
    return {
      amount: selected.food.servingAmount || 1,
      unit: selected.food.servingUnit || ("serving" as const),
      weightG: selected.food.servingWeightG,
      calories: selected.food.calories,
      protein: selected.food.protein,
      carbs: selected.food.carbs,
      fat: selected.food.fat,
    }
  }, [selected])

  const numericAmount = Number(amount)
  const multiplier =
    selectedBasis == null
      ? null
      : foodPortionMultiplier({
          amount: numericAmount,
          unit,
          basisAmount: selectedBasis.amount,
          basisUnit: selectedBasis.unit,
          servingWeightG: selectedBasis.weightG,
        })
  const unitOptions = selectedBasis
    ? availableFoodUnits(selectedBasis.unit, selectedBasis.weightG)
    : []

  function chooseFood(next: SelectedFood) {
    const basisUnit =
      next.kind === "catalog"
        ? "serving"
        : next.food.servingUnit || "serving"
    const basisAmount =
      next.kind === "catalog" ? 1 : next.food.servingAmount || 1
    setSelected(next)
    setUnit(basisUnit)
    setAmount(String(basisAmount))
  }

  function confirmPortion() {
    if (!selected || multiplier == null || multiplier <= 0) return
    const portion = { amount: numericAmount, unit, multiplier }
    if (selected.kind === "catalog") onAddCatalog(selected.food, portion)
    else onAddSaved(selected.food, portion)
    setSelected(null)
    setQuery("")
  }

  function scaled(value: number | null) {
    if (value == null || multiplier == null) return null
    return Math.round(value * multiplier * 10) / 10
  }

  async function saveCatalogFood(food: CatalogFoodResult) {
    if (!onSaveCatalog || savingId) return
    setSavingId(food.food_id)
    try {
      if (await onSaveCatalog(food)) {
        setSavedIds((current) => new Set(current).add(food.food_id))
      }
    } finally {
      setSavingId(null)
    }
  }

  function handleBarcode(value: string) {
    setScannerOpen(false)
    setFilter("all")
    setQuery(value)
    void searchCatalog(value, true)
  }

  if (selected && selectedBasis) {
    const name =
      selected.kind === "catalog" ? selected.food.food_name : selected.food.name
    const image =
      selected.kind === "catalog" ? selected.food.image_url : selected.food.imageUrl
    const subtitle =
      selected.kind === "catalog"
        ? selected.food.brand_name || selected.food.serving_description
        : "Saved food"
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col py-1 motion-safe:animate-fade-up">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="mb-4 flex h-10 w-fit items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to results
        </button>
        <div className="flex items-center gap-4">
          <FoodArtwork src={image} label={name} large />
          <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold leading-tight tracking-tight">{name}</p>
            {subtitle ? (
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-6">
          <p className="type-hud-label-soft">
            Choose a measurement
          </p>
          <div className="mt-2 flex rounded-xl border border-glass-border bg-glass-highlight/20 p-1">
            {unitOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setUnit(option)
                  if (option === "g") setAmount(String(selectedBasis.weightG ?? 100))
                  else if (option === "oz") {
                    setAmount(
                      String(
                        Math.round(((selectedBasis.weightG ?? 28.35) / 28.3495) * 10) /
                          10,
                      ),
                    )
                  } else setAmount(String(selectedBasis.amount))
                }}
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-[12px] font-semibold tracking-wide transition-colors",
                  unit === option
                    ? "bg-background/90 text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option === "g"
                  ? "Grams"
                  : option === "oz"
                    ? "Ounces"
                    : option === "piece"
                      ? "Pieces"
                      : "Servings"}
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-[#ef4444]/[0.06] px-4 py-4 text-center">
            <p className="type-hud-label-soft">Portion</p>
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              type="number"
              min="0.01"
              step={unit === "g" ? "1" : "0.1"}
              inputMode="decimal"
              className="h-14 border-0 bg-transparent px-0 text-center font-heading text-5xl font-semibold tabular-nums shadow-none focus-visible:ring-0"
              aria-label="Portion amount"
              autoFocus
            />
            <p className="type-hud-unit mt-1">
              {measurementUnitLabel(unit, numericAmount)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 divide-x divide-border/25 border-y border-border/25 py-4">
          <NutritionNumber label="Calories" value={scaled(selectedBasis.calories)} />
          <NutritionNumber label="Protein" value={scaled(selectedBasis.protein)} suffix="g" />
          <NutritionNumber label="Carbs" value={scaled(selectedBasis.carbs)} suffix="g" />
          <NutritionNumber label="Fat" value={scaled(selectedBasis.fat)} suffix="g" />
        </div>

        <Button
          type="button"
          variant="glass"
          className="mt-6 h-14 w-full text-sm font-semibold"
          disabled={multiplier == null}
          onClick={confirmPortion}
        >
          <Plus className="size-4" />
          Add to meal
        </Button>
      </div>
    )
  }

  const showSaved = filter === "all" || filter === "saved"
  const showRecipes = filter === "all" || filter === "recipes"
  const restaurantCatalog = catalog.filter((food) => food.source === "restaurant")
  const generalCatalog = catalog.filter((food) => food.source !== "restaurant")
  const noResults =
    !loading &&
    catalog.length === 0 &&
    (!showSaved || matchingSaved.length === 0) &&
    (!showRecipes || matchingRecipes.length === 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="z-20 pb-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-red-200/45" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search foods, recipes, restaurants…"
              className="food-search-input h-12 rounded-2xl pl-11 pr-10 text-sm"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground hover:bg-white/[0.05]"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="food-search-scan-button flex size-12 shrink-0 items-center justify-center rounded-2xl border text-red-200/80 transition-colors hover:text-red-100"
            aria-label="Scan barcode"
          >
            <Barcode className="size-5" />
          </button>
        </div>
        <div className="food-search-filters mt-2 flex rounded-xl border p-1">
          {([
            ["all", "All foods"],
            ["saved", "My foods"],
            ["recipes", "Recipes"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                "flex-1 rounded-lg py-2 text-[11px] font-semibold transition-colors",
                filter === id
                  ? "food-search-filter-active text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6 pb-5">
        {showRecipes && matchingRecipes.length > 0 ? (
          <ResultSection
            icon={BookOpen}
            title={localQuery ? "Matching recipes" : "Your recipes"}
            caption="Adds every ingredient"
          >
            {matchingRecipes.map((recipe) => (
              <RecipeResult key={recipe.id} recipe={recipe} onAdd={() => onAddRecipe(recipe)} />
            ))}
          </ResultSection>
        ) : null}

        {showSaved && matchingSaved.length > 0 ? (
          <ResultSection
            icon={Bookmark}
            title={localQuery ? "Saved foods" : "Frequently logged"}
            caption="Your private library"
          >
            {matchingSaved.map((food) => (
              <FoodResultRow
                key={food.id}
                name={food.name}
                subtitle="Saved food"
                calories={food.calories}
                protein={food.protein}
                image={food.imageUrl}
                onClick={() => chooseFood({ kind: "saved", food })}
              />
            ))}
          </ResultSection>
        ) : null}

        {filter === "all" && restaurantCatalog.length > 0 ? (
          <ResultSection
            icon={Store}
            title="Restaurant menus"
            caption={`${restaurantCatalog.length} matches`}
          >
            {restaurantCatalog.map((food) => (
              <FoodResultRow
                key={food.food_id}
                name={food.food_name}
                subtitle={[food.brand_name, food.serving_description].filter(Boolean).join(" · ")}
                calories={food.calories}
                protein={food.protein}
                image={food.image_url}
                onClick={() => chooseFood({ kind: "catalog", food })}
                accessory={
                  onSaveCatalog ? (
                    <SaveCatalogButton
                      food={food}
                      saving={savingId === food.food_id}
                      saved={savedIds.has(food.food_id)}
                      onSave={saveCatalogFood}
                    />
                  ) : null
                }
              />
            ))}
          </ResultSection>
        ) : null}

        {filter === "all" && (generalCatalog.length > 0 || loading || error) ? (
          <ResultSection
            icon={Search}
            title="Food database"
            caption={loading ? "Searching…" : `${generalCatalog.length} matches`}
          >
            {loading && catalog.length === 0
              ? [0, 1, 2].map((item) => (
                  <div key={item} className="flex animate-pulse items-center gap-3 border-b border-white/[0.06] py-3">
                    <div className="size-14 rounded-2xl bg-white/[0.05]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 rounded bg-white/[0.07]" />
                      <div className="h-2 w-1/3 rounded bg-white/[0.04]" />
                    </div>
                  </div>
                ))
              : null}
            {error ? <p className="py-4 text-xs text-destructive">{error}</p> : null}
            {generalCatalog.map((food) => (
              <FoodResultRow
                key={food.food_id}
                name={food.food_name}
                subtitle={[food.brand_name, food.serving_description].filter(Boolean).join(" · ")}
                calories={food.calories}
                protein={food.protein}
                image={food.image_url}
                onClick={() => chooseFood({ kind: "catalog", food })}
                accessory={
                  onSaveCatalog ? (
                    <SaveCatalogButton
                      food={food}
                      saving={savingId === food.food_id}
                      saved={savedIds.has(food.food_id)}
                      onSave={saveCatalogFood}
                    />
                  ) : null
                }
              />
            ))}
          </ResultSection>
        ) : null}

        {noResults ? (
          <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-white/[0.035] text-muted-foreground/40">
              <Utensils className="size-6" />
            </span>
            <p className="mt-4 text-sm font-semibold">
              {localQuery ? "No foods found" : "Your food library is empty"}
            </p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
              {localQuery
                ? "Try a shorter name, a brand, or scan the barcode."
                : "Search the food database to start building your meal."}
            </p>
          </div>
        ) : null}
      </div>
      {scannerOpen ? (
        <BarcodeScanner onClose={() => setScannerOpen(false)} onDetected={handleBarcode} />
      ) : null}
    </div>
  )
}

function SaveCatalogButton({
  food,
  saving,
  saved,
  onSave,
}: {
  food: CatalogFoodResult
  saving: boolean
  saved: boolean
  onSave: (food: CatalogFoodResult) => Promise<void>
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        void onSave(food)
      }}
      disabled={saving || saved}
      className="flex size-9 items-center justify-center rounded-xl text-muted-foreground/45 hover:bg-primary/10 hover:text-primary"
      aria-label={`Save ${food.food_name}`}
    >
      {saving ? (
        <Loader2 className="size-4 animate-spin" />
      ) : saved ? (
        <Check className="size-4 text-primary" />
      ) : (
        <Bookmark className="size-4" />
      )}
    </button>
  )
}

function ResultSection({
  icon: Icon,
  title,
  caption,
  children,
}: {
  icon: typeof Search
  title: string
  caption: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-2 border-b border-white/[0.07] pb-2">
        <Icon className="size-3.5 text-primary/75" />
        <h3 className="type-hud-subsection text-foreground/75">
          {title}
        </h3>
        <span className="ml-auto text-[9px] text-muted-foreground/45">{caption}</span>
      </div>
      <div>{children}</div>
    </section>
  )
}

function FoodResultRow({
  name,
  subtitle,
  calories,
  protein,
  image,
  onClick,
  accessory,
}: {
  name: string
  subtitle: string | null
  calories: number | null
  protein: number | null
  image: string | null
  onClick: () => void
  accessory?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[4.75rem] w-full items-center gap-3 border-b border-border/20 py-2.5 text-left transition-colors hover:bg-glass-highlight/[0.06]"
    >
      <FoodArtwork src={image} label={name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{name}</span>
        {subtitle ? (
          <span className="mt-1 block truncate text-[10px] text-muted-foreground/55">
            {subtitle}
          </span>
        ) : null}
        <span className="mt-1.5 flex items-center gap-2 text-[10px] tabular-nums">
          {calories != null ? (
            <span className="font-semibold text-foreground/80">{Math.round(calories)} cal</span>
          ) : null}
          {protein != null ? (
            <span className="text-blue-300/70">P {Math.round(protein)}g</span>
          ) : null}
        </span>
      </span>
      {accessory}
      <span className="food-search-add-chip flex size-9 shrink-0 items-center justify-center rounded-full border transition-transform group-active:scale-90">
        <Plus className="size-4" />
      </span>
    </button>
  )
}

function RecipeResult({ recipe, onAdd }: { recipe: Recipe; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="group flex min-h-[4.75rem] w-full items-center gap-3 border-b border-border/20 py-2.5 text-left transition-colors hover:bg-glass-highlight/[0.06]"
    >
      <FoodArtwork src={recipe.imageUrl} label={recipe.name} recipe />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{recipe.name}</span>
        <span className="mt-1 block text-[10px] text-muted-foreground/55">
          {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? "" : "s"}
        </span>
        <span className="mt-1.5 text-[10px] font-semibold tabular-nums text-foreground/75">
          {recipe.calories.toLocaleString()} cal
        </span>
      </span>
      <span className="food-search-add-chip flex size-9 shrink-0 items-center justify-center rounded-full border transition-transform group-active:scale-90">
        <Plus className="size-4" />
      </span>
    </button>
  )
}

function FoodArtwork({
  src,
  label,
  large = false,
  recipe = false,
}: {
  src: string | null
  label: string
  large?: boolean
  recipe?: boolean
}) {
  return src ? (
    <img
      src={src}
      alt=""
      className={cn(
        "shrink-0 rounded-2xl bg-white/[0.035]",
        recipe ? "object-cover" : "object-contain",
        large ? "size-24" : "size-12",
      )}
    />
  ) : (
    <FoodFallbackIcon label={label} large={large} recipe={recipe} />
  )
}

function NutritionNumber({
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
      <p className="type-hud-stat-sm">
        {value == null ? "—" : `${Math.round(value * 10) / 10}${suffix}`}
      </p>
      <p className="type-hud-micro mt-1">
        {label}
      </p>
    </div>
  )
}
