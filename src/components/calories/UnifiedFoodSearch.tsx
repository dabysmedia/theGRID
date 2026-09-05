"use client"
/* eslint-disable @next/next/no-img-element -- food art can come from user uploads or food databases */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PencilLine,
  EyeOff,
  Minus,
  Plus,
  Search,
  Store,
  Utensils,
} from "lucide-react"
import { PortionMacros } from "./PortionMacros"
import { apiFetch } from "@/lib/api-fetch"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { FoodFallbackIcon } from "@/components/calories/FoodFallbackIcon"
import type { Recipe, SavedMeal } from "@/lib/calories/log-food"
import { type FrequentFoodSuggestion } from "@/lib/calories/frequent-foods"
import { MEAL_SLOT_LABEL, asMealSlot } from "@/lib/calories/meal-slots"
import {
  foodSearchRelevance,
  normalizeFoodSearchText,
  rankByFoodSearch,
} from "@/lib/calories/food-search-ranking"
import {
  availableFoodUnits,
  convertFoodAmount,
  portionStep,
  foodPortionMultiplier,
  isFoodMeasurementUnit,
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
  | { kind: "frequent"; food: FrequentFoodSuggestion }

/** Which shelf of foods the composer is showing. */
export type FoodBrowseMode = "search" | "library"

/** A match from the user's own foods, ranked across history and saved foods. */
type LocalHit =
  | { kind: "frequent"; food: FrequentFoodSuggestion; score: number }
  | { kind: "saved"; food: SavedMeal; score: number }

const MACRO_COLOR = {
  protein: "#38bdf8",
  fat: "#fbbf24",
  carbs: "#4ade80",
} as const

function round1(value: number | null | undefined): number | null {
  return value == null ? null : Math.round(value * 10) / 10
}

export function UnifiedFoodSearch({
  savedMeals,
  recipes,
  mealSlot,
  query,
  mode,
  barcodeScan,
  renderRestaurants,
  onCreateRecipe,
  onAddCatalog,
  onAddSaved,
  onAddFrequent,
  onAddRecipe,
  onSaveCatalog,
  onEditSaved,
  onPortionChange,
}: {
  savedMeals: SavedMeal[]
  recipes: Recipe[]
  /** Timeline block the picked food will be logged into. */
  mealSlot: string | null
  /** Search text, owned by the composer above the results. */
  query: string
  mode: FoodBrowseMode
  /**
   * A resolved barcode scan. Carries an id so scanning the same code twice
   * still re-runs the lookup.
   */
  barcodeScan: { code: string; id: number } | null
  /** Restaurant menu browser, shown as a Library shelf. */
  renderRestaurants?: () => React.ReactNode
  /** Opens the recipe builder from the Library's Recipes shelf. */
  onCreateRecipe?: () => void
  onAddCatalog: (food: CatalogFoodResult, portion: PortionSelection) => void
  onAddSaved: (food: SavedMeal, portion: PortionSelection) => void
  onAddFrequent: (food: FrequentFoodSuggestion, portion: PortionSelection) => void
  onAddRecipe: (recipe: Recipe) => void
  onPortionChange?: (open: boolean) => void
  onEditSaved?: (food: SavedMeal) => void
  onSaveCatalog?: (food: CatalogFoodResult) => Promise<boolean>
}) {
  const [catalog, setCatalog] = useState<CatalogFoodResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedFood | null>(null)
  const [customWeight, setCustomWeight] = useState("")
  const [amount, setAmount] = useState("1")
  const [unit, setUnit] = useState<FoodMeasurementUnit>("serving")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const [restaurantsOpen, setRestaurantsOpen] = useState(false)
  const [picks, setPicks] = useState<FrequentFoodSuggestion[]>([])
  const [recent, setRecent] = useState<FrequentFoodSuggestion[]>([])
  const [library, setLibrary] = useState<FrequentFoodSuggestion[]>([])
  const requestRef = useRef(0)
  const frequentRequestRef = useRef(0)
  const [suggestionRevision, setSuggestionRevision] = useState(0)
  const [hiddenFoods, setHiddenFoods] = useState<string[]>([])
  const [hiddenName, setHiddenName] = useState<string | null>(null)
  const [suggestionBusy, setSuggestionBusy] = useState(false)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)
  const [addedName, setAddedName] = useState<string | null>(null)

  useEffect(() => { onPortionChange?.(selected != null) }, [selected, onPortionChange])
  useEffect(() => () => onPortionChange?.(false), [onPortionChange])
  useEffect(() => {
    const refresh = () => setSuggestionRevision((value) => value + 1)
    window.addEventListener("grid:food-suggestions-changed", refresh)
    return () => window.removeEventListener("grid:food-suggestions-changed", refresh)
  }, [])
  useEffect(() => {
    if (!addedName) return
    const timer = window.setTimeout(() => setAddedName(null), 2200)
    return () => window.clearTimeout(timer)
  }, [addedName])

  async function changeSuggestion(name: string, hidden: boolean) {
    if (suggestionBusy) return
    setSuggestionBusy(true)
    setSuggestionError(null)
    try {
      const response = await apiFetch("/api/calories/frequent", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, hidden }),
      })
      if (!response.ok) throw new Error("Could not update picks. Please try again.")
      setHiddenName(hidden ? name : null)
      window.dispatchEvent(new Event("grid:food-suggestions-changed"))
    } catch { setSuggestionError("Could not update picks. Please try again.") }
    finally { setSuggestionBusy(false) }
  }

  function hideAction(food: FrequentFoodSuggestion) {
    return <button type="button" disabled={suggestionBusy} onClick={() => void changeSuggestion(food.name, true)} aria-label={`Hide ${food.name} from suggestions`} title="Hide from picks" className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:bg-white/[0.05] hover:text-foreground disabled:opacity-40"><EyeOff className="size-4" /></button>
  }


  const activeSlot = asMealSlot(mealSlot)
  const slotLabel = activeSlot ? MEAL_SLOT_LABEL[activeSlot] : "This block"

  useEffect(() => {
    const slot = asMealSlot(mealSlot)
    const requestId = ++frequentRequestRef.current
    if (!slot) {
      setPicks([])
      setRecent([])
      setLibrary([])
      return
    }
    void apiFetch(`/api/calories/frequent?slot=${encodeURIComponent(slot)}`)
      .then(async (response) => {
        const data = await response.json()
        if (requestId !== frequentRequestRef.current) return
        setHiddenFoods(response.ok && Array.isArray(data?.hiddenNames) ? data.hiddenNames : [])
        setPicks(response.ok && Array.isArray(data?.picks) ? data.picks : [])
        setRecent(response.ok && Array.isArray(data?.recent) ? data.recent : [])
        setLibrary(response.ok && Array.isArray(data?.library) ? data.library : [])
      })
      .catch(() => {
        if (requestId !== frequentRequestRef.current) return
        setPicks([])
        setRecent([])
        setLibrary([])
      })
  }, [mealSlot, suggestionRevision])

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
    if (trimmed.length < 2 || mode !== "search") {
      requestRef.current += 1
      setCatalog([])
      setLoading(false)
      setError(null)
      return
    }
    if (/^\d{4,18}$/.test(trimmed)) return
    const timeout = window.setTimeout(() => void searchCatalog(trimmed), 260)
    return () => window.clearTimeout(timeout)
  }, [mode, query, searchCatalog])

  useEffect(() => {
    if (!barcodeScan) return
    void searchCatalog(barcodeScan.code, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id makes a repeat scan a new event
  }, [barcodeScan?.id, searchCatalog])

  const localQuery = query.trim()
  const matchingSaved = useMemo(() => {
    if (!localQuery) {
      return [...savedMeals].sort(
        (left, right) => right.useCount - left.useCount || left.name.localeCompare(right.name),
      )
    }
    return rankByFoodSearch(savedMeals, localQuery, (food) => ({ name: food.name }), 20)
  }, [localQuery, savedMeals])
  const matchingRecipes = useMemo(() => {
    if (!localQuery) return recipes
    return rankByFoodSearch(
      recipes,
      localQuery,
      (recipe) => ({
        name: recipe.name,
        extra: recipe.ingredients.map((ingredient) => ingredient.name).join(" "),
      }),
      20,
    )
  }, [localQuery, recipes])
  /**
   * While searching, everything the user already eats collapses into one
   * ranked list — their own history and saved foods together, scored against
   * the same relevance function and shown above the food database.
   */
  const yourFoods = useMemo((): LocalHit[] => {
    if (!localQuery) return []
    const score = (name: string) =>
      foodSearchRelevance(
        { food_name: name, brand_name: null, serving_description: null },
        localQuery,
      )

    const hits: LocalHit[] = []
    for (const food of savedMeals) {
      const relevance = score(food.name)
      // Saved foods are deliberate picks, so they edge out a bare log.
      if (relevance != null) hits.push({ kind: "saved", food, score: relevance + 25 })
    }
    for (const food of library) {
      const relevance = score(food.name)
      if (relevance != null) {
        // A food logged many times is more likely the one being reached for.
        hits.push({ kind: "frequent", food, score: relevance + Math.min(food.logCount, 10) * 4 })
      }
    }

    const seen = new Set<string>()
    return hits
      .sort((left, right) => right.score - left.score)
      .filter((hit) => {
        const key = normalizeFoodSearchText(hit.food.name)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 12)
  }, [localQuery, library, savedMeals])

  const selectedBasis = useMemo(() => {
    if (!selected) return null
    if (selected.kind === "catalog") {
      return {
        amount: 1,
        unit: "serving" as const,
        weightG: selected.food.serving_size_g || (Number(customWeight) > 0 ? Number(customWeight) : null),
        calories: selected.food.calories,
        protein: selected.food.protein,
        carbs: selected.food.carbs,
        fat: selected.food.fat,
      }
    }
    return {
      amount:
        selected.kind === "frequent"
          ? selected.food.portionAmount || 1
          : selected.food.servingAmount || 1,
      unit:
        selected.kind === "frequent"
          ? isFoodMeasurementUnit(selected.food.portionUnit)
            ? selected.food.portionUnit
            : "serving"
          : selected.food.servingUnit || ("serving" as const),
      weightG: (selected.kind === "frequent" ? null : selected.food.servingWeightG) || (Number(customWeight) > 0 ? Number(customWeight) : null),
      calories: selected.food.calories,
      protein: selected.food.protein,
      carbs: selected.food.carbs,
      fat: selected.food.fat,
    }
  }, [selected, customWeight])

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

  function openPortion(next: SelectedFood) {
    setCustomWeight("")
    const basisUnit =
      next.kind === "catalog"
        ? "serving"
        : next.kind === "frequent"
          ? isFoodMeasurementUnit(next.food.portionUnit)
            ? next.food.portionUnit
            : "serving"
          : next.food.servingUnit || "serving"
    const basisAmount =
      next.kind === "catalog"
        ? 1
        : next.kind === "frequent"
          ? next.food.portionAmount || 1
          : next.food.servingAmount || 1
    ;(document.activeElement as HTMLElement)?.blur()
    setSelected(next)
    const weight = next.kind === "catalog" ? next.food.serving_size_g : next.kind === "saved" ? next.food.servingWeightG : null
    const grams = convertFoodAmount(basisAmount, basisUnit, "g", weight)
    setUnit(grams != null ? "g" : basisUnit)
    setAmount(String(grams ?? basisAmount))
  }

  function confirmPortion() {
    if (!selected || multiplier == null || multiplier <= 0) return
    ;(document.activeElement as HTMLElement)?.blur()
    setAddedName(selected.kind === "catalog" ? selected.food.food_name : selected.food.name)
    const portion = { amount: numericAmount, unit, multiplier }
    if (selected.kind === "catalog") onAddCatalog(selected.food, portion)
    else if (selected.kind === "saved") onAddSaved(selected.food, portion)
    else onAddFrequent(selected.food, portion)
    setSelected(null)
  }

  /** The + button logs the food at its usual portion, with no extra screen. */
  function addNow(next: SelectedFood) {
    setAddedName(next.kind === "catalog" ? next.food.food_name : next.food.name)
    if (next.kind === "catalog") {
      onAddCatalog(next.food, { amount: 1, unit: "serving", multiplier: 1 })
      return
    }
    if (next.kind === "saved") {
      onAddSaved(next.food, {
        amount: next.food.servingAmount || 1,
        unit: next.food.servingUnit || "serving",
        multiplier: 1,
      })
      return
    }
    onAddFrequent(next.food, {
      amount: next.food.portionAmount || 1,
      unit: isFoodMeasurementUnit(next.food.portionUnit) ? next.food.portionUnit : "serving",
      multiplier: 1,
    })
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

  /* ── portion detail ───────────────────────────────────── */

  if (selected && selectedBasis) {
    const name = selected.kind === "catalog" ? selected.food.food_name : selected.food.name
    const image = selected.kind === "catalog" ? selected.food.image_url : selected.food.imageUrl
    const subtitle =
      selected.kind === "catalog"
        ? selected.food.brand_name || selected.food.serving_description
        : selected.kind === "frequent"
          ? `${selected.food.logCount} ${slotLabel.toLowerCase()} logs`
          : "Saved food"
    return (
      <div className="food-portion-view mx-auto flex min-h-full w-full max-w-2xl flex-col">
        <button
          type="button"
          onClick={() => { (document.activeElement as HTMLElement)?.blur(); setSelected(null) }}
          className="mb-3 flex h-9 w-fit items-center gap-1 rounded-lg px-1.5 type-hud-micro text-muted-foreground/70 transition-colors hover:bg-white/[0.04] hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          Back to foods
        </button>

        <div className="flex items-center gap-3">
          <FoodArtwork src={image} label={name} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-snug tracking-tight">{name}</p>
            {subtitle ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground/65">{subtitle}</p>
            ) : null}
          </div>
        </div>

        {selectedBasis.unit !== "g" && selectedBasis.unit !== "oz" && (customWeight || !selectedBasis.weightG) ? <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer py-2">Set grams per {measurementUnitLabel(selectedBasis.unit, 1)}</summary>
          <label className="mt-2 flex items-center gap-3"><span className="flex-1">Weight of one {measurementUnitLabel(selectedBasis.unit, 1)} (g)</span><Input type="number" min="0.01" step="any" inputMode="decimal" value={customWeight} onChange={(event) => setCustomWeight(event.target.value)} aria-label="Grams per serving or piece" className="h-11 w-24" /></label>
          <p className="mt-2">Use the package label or your food scale.</p>
        </details> : null}
        {unitOptions.length > 1 ? (
          <div className="mt-4 flex rounded-xl border border-white/[0.08] bg-white/[0.02] p-1">
            {unitOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  const converted = convertFoodAmount(numericAmount, unit, option, selectedBasis.weightG)
                  setUnit(option)
                  setAmount(converted == null ? "" : String(Math.round(converted * 10000) / 10000))
                }}
                className={cn(
                  "flex-1 rounded-lg py-2 text-[11px] font-semibold tracking-wide transition-colors",
                  unit === option
                    ? "bg-background/85 text-foreground shadow-sm"
                    : "text-muted-foreground/70 hover:text-foreground",
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
        ) : null}

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-3 py-3">
          <button type="button" aria-label="Decrease portion" disabled={!Number.isFinite(numericAmount) || numericAmount <= portionStep(unit)} onClick={() => setAmount(String(Math.max(portionStep(unit), Math.round((numericAmount - portionStep(unit)) * 10000) / 10000)))} className="food-portion-step"><Minus className="size-5" /></button>
          <div className="min-w-0 flex-1 text-center">
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            type="number"
            min="0.01"
            step={unit === "g" ? "1" : "0.1"}
            inputMode="decimal"
            className="h-12 border-0 bg-transparent px-0 text-center font-heading text-4xl font-semibold tabular-nums shadow-none focus-visible:ring-0"
            aria-label="Portion amount"
            enterKeyHint="done"
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }}
          />
          <p className="type-hud-unit mt-0.5">{measurementUnitLabel(unit, numericAmount)}</p>
          </div>
          <button type="button" aria-label="Increase portion" onClick={() => setAmount(String(Math.round(((Number.isFinite(numericAmount) ? numericAmount : 0) + portionStep(unit)) * 10000) / 10000))} className="food-portion-step"><Plus className="size-5" /></button>
        </div>

        <p className="mt-2 text-center text-xs text-muted-foreground">
          Nutrition updates for the amount above.
          {selectedBasis.weightG ? ` 1 ${measurementUnitLabel(selectedBasis.unit === "piece" ? "piece" : "serving", 1)} = ${selectedBasis.weightG} g.` : ""}
        </p>
        <PortionMacros calories={scaled(selectedBasis.calories)} protein={scaled(selectedBasis.protein)} carbs={scaled(selectedBasis.carbs)} fat={scaled(selectedBasis.fat)} />

        <div className="food-portion-action">
        <Button
          type="button"
          variant="glass"
          className="mt-4 h-12 w-full text-sm font-semibold"
          disabled={multiplier == null}
          onClick={confirmPortion}
        >
          <Plus className="size-4" />
          Add to {slotLabel.toLowerCase()}
        </Button>
        </div>
      </div>
    )
  }

  /* ── browse / results ─────────────────────────────────── */

  const restaurantCatalog = catalog.filter((food) => food.source === "restaurant")
  const generalCatalog = catalog.filter((food) => food.source !== "restaurant")
  const favorites = !localQuery ? matchingSaved.slice(0, 8) : []
  const showLibrary = mode === "library"
  const showSearchShelves = mode === "search"

  const nothingToShow =
    !loading &&
    yourFoods.length === 0 &&
    picks.length === 0 &&
    recent.length === 0 &&
    matchingSaved.length === 0 &&
    matchingRecipes.length === 0 &&
    catalog.length === 0 &&
    !(showLibrary && renderRestaurants)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {suggestionError ? <p role="alert" className="mb-3 text-sm text-destructive">{suggestionError}</p> : null}
      {hiddenName ? <div className="food-feedback mb-3 flex items-center gap-2 rounded-xl border border-white/10 p-3 text-xs"><span className="min-w-0 flex-1">Hidden from picks: {hiddenName}</span><button type="button" disabled={suggestionBusy} className="min-h-11 px-3 font-semibold text-primary" onClick={() => void changeSuggestion(hiddenName, false)}>Undo</button></div> : null}
      {addedName ? <p role="status" className="food-feedback mb-3 flex items-center gap-2 text-sm text-primary"><Check className="size-4" /> {addedName} added to meal</p> : null}
      <div key={mode} className="food-browse-view space-y-5 pb-2">
        {showLibrary && hiddenFoods.length > 0 ? <details className="rounded-xl border border-white/[0.08] p-3">
          <summary className="cursor-pointer py-2 text-sm text-muted-foreground">Hidden suggestions · {hiddenFoods.length}</summary>
          <p className="mb-2 text-xs text-muted-foreground">These foods remain in your past logs.</p>
          {hiddenFoods.map((name) => <div key={name} className="flex items-center gap-3 border-t border-white/[0.05] text-sm"><span className="min-w-0 flex-1 capitalize">{name}</span><button type="button" disabled={suggestionBusy} onClick={() => void changeSuggestion(name, false)} className="min-h-11 px-2 text-primary">Restore</button></div>)}
        </details> : null}
        {showLibrary ? (
          <>
            {matchingSaved.length > 0 ? (
              <ResultSection icon={Bookmark} title="Saved foods" caption={`${matchingSaved.length}`}>
                {matchingSaved.map((food) => (
                  <FoodRow
                    key={food.id}
                    name={food.name}
                    calories={food.calories}
                    protein={food.protein}
                    fat={food.fat}
                    carbs={food.carbs}
                    portion={`${food.servingAmount} ${food.servingUnit}`}
                    image={food.imageUrl}
                    onOpen={() => openPortion({ kind: "saved", food })}
                    onAdd={() => addNow({ kind: "saved", food })}
                    accessory={onEditSaved ? <button type="button" onClick={() => onEditSaved(food)} aria-label={`Edit ${food.name}`} className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-white/[0.06] hover:text-foreground"><PencilLine className="size-4" /></button> : null}
                  />
                ))}
              </ResultSection>
            ) : null}

            {matchingRecipes.length > 0 || onCreateRecipe ? (
              <section>
                <div className="flex items-center gap-2 border-b border-white/[0.07] pb-2">
                  <BookOpen className="size-3.5 text-muted-foreground/60" />
                  <h3 className="type-hud-subsection text-foreground/75">Recipes</h3>
                  {onCreateRecipe ? (
                    <button
                      type="button"
                      onClick={onCreateRecipe}
                      className="ml-auto inline-flex h-7 items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.025] px-2.5 type-hud-micro text-foreground/75 transition-colors hover:border-white/[0.2] hover:bg-white/[0.05] hover:text-foreground"
                    >
                      <Plus className="size-3" />
                      New
                    </button>
                  ) : (
                    <span className="ml-auto text-[9px] text-muted-foreground/45">
                      Adds every ingredient
                    </span>
                  )}
                </div>
                {matchingRecipes.length === 0 ? (
                  <p className="px-1 py-4 text-[11px] leading-relaxed text-muted-foreground/55">
                    Build a recipe once — the ingredients, the photo, the totals — then log the
                    whole thing in a tap.
                  </p>
                ) : null}
                {matchingRecipes.map((recipe) => (
                  <FoodRow
                    key={recipe.id}
                    name={recipe.name}
                    calories={recipe.calories}
                    protein={recipe.protein}
                    fat={recipe.fat}
                    carbs={recipe.carbs}
                    portion={`${recipe.ingredients.length} ingredient${recipe.ingredients.length === 1 ? "" : "s"}`}
                    image={recipe.imageUrl}
                    recipe
                    onOpen={() => onAddRecipe(recipe)}
                    onAdd={() => onAddRecipe(recipe)}
                  />
                ))}
              </section>
            ) : null}

            {renderRestaurants ? (
              <section>
                <button
                  type="button"
                  onClick={() => setRestaurantsOpen((open) => !open)}
                  aria-expanded={restaurantsOpen}
                  className="flex w-full items-center gap-2 border-b border-white/[0.07] pb-2 text-left"
                >
                  <Store className="size-3.5 text-muted-foreground/60" />
                  <h3 className="type-hud-subsection text-foreground/75">Restaurant menus</h3>
                  <ChevronRight
                    className={cn(
                      "ml-auto size-3.5 text-muted-foreground/50 transition-transform",
                      restaurantsOpen && "rotate-90",
                    )}
                  />
                </button>
                {restaurantsOpen ? <div className="pt-3">{renderRestaurants()}</div> : null}
              </section>
            ) : null}
          </>
        ) : null}

        {showSearchShelves && !localQuery && favorites.length > 0 ? (
          <section>
            <SectionHeading icon={Bookmark} title="Favorites" caption="Tap to add" />
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pt-2.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {favorites.map((food) => (
                <button
                  key={`fav-${food.id}`}
                  type="button"
                  onClick={() => addNow({ kind: "saved", food })}
                  className="group/fav flex w-[5.5rem] shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-2 py-2.5 transition-colors hover:border-white/[0.18] hover:bg-white/[0.05]"
                >
                  <span className="relative">
                    <FoodArtwork src={food.imageUrl} label={food.name} size="sm" />
                    <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-white/10 bg-[#12161d] text-muted-foreground/70 transition-colors group-hover/fav:text-foreground">
                      <Plus className="size-3" />
                    </span>
                  </span>
                  <span className="line-clamp-2 text-center text-[10px] font-medium leading-tight text-foreground/80">
                    {food.name}
                  </span>
                  <span className="text-[9px] tabular-nums text-muted-foreground/50">
                    {Math.round(food.calories)} cal
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* Searching: one ranked list of foods the user already eats. */}
        {showSearchShelves && localQuery && yourFoods.length > 0 ? (
          <ResultSection
            icon={Utensils}
            title="Your foods"
            caption={`${yourFoods.length} from your history`}
          >
            {yourFoods.map((hit) =>
              hit.kind === "saved" ? (
                <FoodRow
                  key={`yours-saved-${hit.food.id}`}
                  name={hit.food.name}
                  calories={hit.food.calories}
                  protein={hit.food.protein}
                  fat={hit.food.fat}
                  carbs={hit.food.carbs}
                  portion={`${hit.food.servingAmount} ${hit.food.servingUnit}`}
                  image={hit.food.imageUrl}
                  onOpen={() => openPortion({ kind: "saved", food: hit.food })}
                  onAdd={() => addNow({ kind: "saved", food: hit.food })}
                    accessory={onEditSaved ? <button type="button" onClick={() => onEditSaved(hit.food)} aria-label={`Edit ${hit.food.name}`} className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-white/[0.06] hover:text-foreground"><PencilLine className="size-4" /></button> : null}
                />
              ) : (
                <FoodRow
                  key={`yours-log-${hit.food.id}`}
                  name={hit.food.name}
                  calories={hit.food.calories}
                  protein={hit.food.protein}
                  fat={hit.food.fat}
                  carbs={hit.food.carbs}
                  portion={portionLabel(hit.food)}
                  image={hit.food.imageUrl}
                  onOpen={() => openPortion({ kind: "frequent", food: hit.food })}
                  onAdd={() => addNow({ kind: "frequent", food: hit.food })}
                  accessory={hideAction(hit.food)}
                />
              ),
            )}
          </ResultSection>
        ) : null}

        {/* Idle: the block's regulars, then what was logged most recently. */}
        {showSearchShelves && !localQuery && picks.length > 0 ? (
          <ResultSection
            icon={Utensils}
            title={`${slotLabel} picks`}
            caption="Learned from your history"
          >
            {picks.map((food) => (
              <FoodRow
                key={`pick-${food.id}`}
                name={food.name}
                calories={food.calories}
                protein={food.protein}
                fat={food.fat}
                carbs={food.carbs}
                portion={portionLabel(food)}
                image={food.imageUrl}
                onOpen={() => openPortion({ kind: "frequent", food })}
                onAdd={() => addNow({ kind: "frequent", food })}
                accessory={hideAction(food)}
              />
            ))}
          </ResultSection>
        ) : null}

        {showSearchShelves && !localQuery && recent.length > 0 ? (
          <ResultSection icon={Utensils} title="Recent" caption="Most recently logged">
            {recent
              .filter((food) => !picks.some((pick) => pick.id === food.id))
              .map((food) => (
                <FoodRow
                  key={`recent-${food.id}`}
                  name={food.name}
                  calories={food.calories}
                  protein={food.protein}
                  fat={food.fat}
                  carbs={food.carbs}
                  portion={portionLabel(food)}
                  image={food.imageUrl}
                  onOpen={() => openPortion({ kind: "frequent", food })}
                  onAdd={() => addNow({ kind: "frequent", food })}
                accessory={hideAction(food)}
                />
              ))}
          </ResultSection>
        ) : null}

        {showSearchShelves && restaurantCatalog.length > 0 ? (
          <ResultSection
            icon={Store}
            title="Restaurant menus"
            caption={`${restaurantCatalog.length} matches`}
          >
            {restaurantCatalog.map((food) => (
              <FoodRow
                key={food.food_id}
                name={food.food_name}
                calories={food.calories}
                protein={food.protein}
                fat={food.fat}
                carbs={food.carbs}
                portion={[food.brand_name, food.serving_description].filter(Boolean).join(" · ")}
                image={food.image_url}
                onOpen={() => openPortion({ kind: "catalog", food })}
                onAdd={() => addNow({ kind: "catalog", food })}
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

        {showSearchShelves && (generalCatalog.length > 0 || loading || error) ? (
          <ResultSection
            icon={Search}
            title="Food database"
            caption={loading ? "Searching…" : `${generalCatalog.length} matches`}
          >
            {loading && catalog.length === 0
              ? [0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="flex animate-pulse items-center gap-3 border-b border-white/[0.05] py-2.5"
                  >
                    <div className="size-11 rounded-xl bg-white/[0.05]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 rounded bg-white/[0.07]" />
                      <div className="h-2 w-1/3 rounded bg-white/[0.04]" />
                    </div>
                  </div>
                ))
              : null}
            {error ? <p className="py-3 text-[11px] text-destructive">{error}</p> : null}
            {generalCatalog.map((food) => (
              <FoodRow
                key={food.food_id}
                name={food.food_name}
                calories={food.calories}
                protein={food.protein}
                fat={food.fat}
                carbs={food.carbs}
                portion={[food.brand_name, food.serving_description].filter(Boolean).join(" · ")}
                image={food.image_url}
                onOpen={() => openPortion({ kind: "catalog", food })}
                onAdd={() => addNow({ kind: "catalog", food })}
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

        {nothingToShow ? (
          <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white/[0.035] text-muted-foreground/40">
              <Utensils className="size-5" />
            </span>
            <p className="mt-3 text-sm font-semibold">
              {localQuery
                ? "No foods found"
                : showLibrary
                  ? "Nothing saved yet"
                  : "Nothing logged yet"}
            </p>
            <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-muted-foreground/65">
              {localQuery
                ? "Try a shorter name or a brand, or scan the barcode. Spelling does not need to be perfect."
                : showLibrary
                  ? "Save a food from search and it will show up here."
                  : "Search below to add your first food — what you log starts showing up here."}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function portionLabel(food: FrequentFoodSuggestion): string {
  const amount = food.portionAmount || 1
  const rounded = Math.round(amount * 100) / 100
  return `${rounded} ${food.portionUnit}`
}

function SectionHeading({
  icon: Icon,
  title,
  caption,
}: {
  icon: typeof Search
  title: string
  caption: string
}) {
  return (
    <div className="flex items-center gap-2 border-b border-white/[0.07] pb-2">
      <Icon className="size-3.5 text-muted-foreground/60" />
      <h3 className="type-hud-subsection text-foreground/75">{title}</h3>
      <span className="ml-auto text-[9px] text-muted-foreground/45">{caption}</span>
    </div>
  )
}

function ResultSection({
  icon,
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
      <SectionHeading icon={icon} title={title} caption={caption} />
      <div>{children}</div>
    </section>
  )
}

/**
 * One food. Tapping the body opens the portion editor; the + logs it at its
 * usual portion — the same split MacroFactor uses, so a repeat log is one tap
 * and an unusual one is two.
 */
function FoodRow({
  name,
  calories,
  protein,
  fat,
  carbs,
  portion,
  image,
  recipe = false,
  onOpen,
  onAdd,
  accessory,
}: {
  name: string
  calories: number | null
  protein: number | null
  fat: number | null
  carbs: number | null
  portion: string | null
  image: string | null
  recipe?: boolean
  onOpen: () => void
  onAdd: () => void
  accessory?: React.ReactNode
}) {
  return (
    <div className="group flex items-center gap-2.5 border-b border-white/[0.05] transition-colors hover:bg-white/[0.02]">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 rounded-lg"
      >
        <FoodArtwork src={image} label={name} recipe={recipe} />
        <span className="min-w-0 flex-1">
          <span className="block line-clamp-2 text-sm font-medium leading-snug text-foreground/92">
            {name}
          </span>
          <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[10px] tabular-nums">
            {calories != null ? (
              <span className="font-semibold text-red-200/85">{Math.round(calories)}</span>
            ) : null}
            {protein != null ? (
              <span style={{ color: MACRO_COLOR.protein }}>{round1(protein)}P</span>
            ) : null}
            {fat != null ? <span style={{ color: MACRO_COLOR.fat }}>{round1(fat)}F</span> : null}
            {carbs != null ? (
              <span style={{ color: MACRO_COLOR.carbs }}>{round1(carbs)}C</span>
            ) : null}
            {portion ? (
              <span className="truncate text-muted-foreground/50">· {portion}</span>
            ) : null}
          </span>
        </span>
      </button>
      {accessory}
      <button
        type="button"
        onClick={onAdd}
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/[0.09] text-muted-foreground/70 transition-[transform,color,border-color,background-color] hover:border-white/[0.22] hover:bg-white/[0.06] hover:text-foreground active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
        aria-label={`Add ${name}`}
      >
        <Plus className="size-4" />
      </button>
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
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/40 hover:bg-white/[0.05] hover:text-foreground/70"
      aria-label={`Save ${food.food_name}`}
    >
      {saving ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : saved ? (
        <Check className="size-3.5 text-foreground/70" />
      ) : (
        <Bookmark className="size-3.5" />
      )}
    </button>
  )
}

function FoodArtwork({
  src,
  label,
  size = "md",
  recipe = false,
}: {
  src: string | null
  label: string
  size?: "sm" | "md" | "lg"
  recipe?: boolean
}) {
  const box =
    size === "lg"
      ? "size-20 rounded-2xl text-3xl"
      : size === "sm"
        ? "size-9 rounded-xl text-base"
        : "size-11 rounded-xl text-lg"
  return src ? (
    <img
      src={src}
      alt=""
      className={cn(
        "shrink-0 rounded-xl bg-white/[0.035]",
        recipe ? "object-cover" : "object-contain",
        box,
      )}
    />
  ) : (
    <FoodFallbackIcon label={label} large={size === "lg"} recipe={recipe} className={box} />
  )
}
