"use client"
/* eslint-disable @next/next/no-img-element -- product art is supplied dynamically by the food database */

import { useState, useRef, useCallback, useEffect } from "react"
import { Search, Plus, X, Loader2, Check, Minus, ScanBarcode, ArrowRight, Bookmark } from "lucide-react"
import { Input } from "@/components/ui/input"
import { apiFetch } from "@/lib/api-fetch"
import { Button } from "@/components/ui/button"
import { BarcodeScanner } from "@/components/calories/BarcodeScanner"
import { cn } from "@/lib/utils"

interface FoodResult {
  food_id: string
  food_name: string
  brand_name: string | null
  food_type: string
  serving_description: string | null
  serving_size_g?: number | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  image_url?: string | null
  source?: "openfoodfacts" | "fatsecret" | "usda"
}

interface FoodSearchProps {
  onSelect: (food: FoodResult) => void
  /** Persist a search result in the user's saved-food library. */
  onSave?: (food: FoodResult) => Promise<boolean>
  /** Less chrome (e.g. in modals) */
  compact?: boolean
  /** Skip portion editor — add on result tap (adjust qty in meal draft). */
  instantAdd?: boolean
}

type PortionMode = "servings" | "grams"

function scaleVal(value: number | null, multiplier: number): number | null {
  if (value == null) return null
  return Math.round(value * multiplier * 10) / 10
}

export function FoodSearch({ onSelect, onSave, compact = false, instantAdd = false }: FoodSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<FoodResult[]>([])
  const [source, setSource] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<FoodResult | null>(null)
  const [portionMode, setPortionMode] = useState<PortionMode>("servings")
  const [servings, setServings] = useState("1")
  const [grams, setGrams] = useState("")
  const [scannerOpen, setScannerOpen] = useState(false)
  const [recentQueries, setRecentQueries] = useState<string[]>([])
  const [savingFoodId, setSavingFoodId] = useState<string | null>(null)
  const [savedFoodIds, setSavedFoodIds] = useState<Set<string>>(() => new Set())
  const [saveFailedFoodId, setSaveFailedFoodId] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const pickFood = useCallback((food: FoodResult) => {
    if (instantAdd) {
      onSelect(food)
      setQuery("")
      setResults([])
      setOpen(false)
      return
    }
    setSelected(food)
    setServings("1")
    setGrams(food.serving_size_g ? String(food.serving_size_g) : "100")
    setPortionMode("servings")
    setOpen(false)
  }, [instantAdd, onSelect])

  const search = useCallback(async (q: string, options?: { barcode?: boolean; suggestion?: boolean }) => {
    if (q.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    setOpen(true)
    try {
      const parameter = options?.barcode ? "barcode" : "q"
      const res = await apiFetch(`/api/food-search?${parameter}=${encodeURIComponent(q.trim())}`)
      const data = await res.json()
      if (requestId !== requestIdRef.current) return
      const foods = (data.foods ?? []) as FoodResult[]
      setResults(foods)
      setSource(data.source ?? null)
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Search unavailable")
        setOpen(true)
        return
      }
      if (typeof data.error === "string" && data.error) {
        setError(data.error)
      } else {
        setError(null)
      }
      if (!options?.barcode && !options?.suggestion && foods.length > 0) {
        setRecentQueries((current) => [q.trim(), ...current.filter((item) => item !== q.trim())].slice(0, 4))
      }
      if (options?.barcode && foods.length === 1) pickFood(foods[0])
    } catch {
      if (requestId !== requestIdRef.current) return
      setError("Search unavailable")
      setResults([])
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [pickFood])

  useEffect(() => {
    const value = query.trim()
    if (value.length < 2) {
      requestIdRef.current += 1
      setResults([])
      setOpen(false)
      setLoading(false)
      setError(null)
      return
    }

    // Barcodes are exact lookups; names and brands get live suggestions.
    if (/^\d{4,18}$/.test(value)) return

    const timeout = window.setTimeout(() => {
      void search(value, { suggestion: true })
    }, 320)

    return () => window.clearTimeout(timeout)
  }, [query, search])

  function handleInput(value: string) {
    setQuery(value)
    setError(null)
  }

  function handlePick(food: FoodResult) {
    pickFood(food)
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    const value = query.trim()
    if (/^\d{4,18}$/.test(value)) {
      void search(value, { barcode: true })
      return
    }
    void search(value)
  }

  function handleBarcode(barcode: string) {
    setScannerOpen(false)
    setQuery(barcode)
    void search(barcode, { barcode: true })
  }

  function getMultiplier(): number {
    if (!selected) return 1
    if (portionMode === "servings") {
      return parseFloat(servings) || 1
    }
    const g = parseFloat(grams) || 0
    const base = selected.serving_size_g
    if (base && base > 0) return g / base
    return g / 100
  }

  function handleConfirm() {
    if (!selected) return
    const mult = getMultiplier()
    const scaled: FoodResult = {
      ...selected,
      calories: scaleVal(selected.calories, mult),
      protein: scaleVal(selected.protein, mult),
      carbs: scaleVal(selected.carbs, mult),
      fat: scaleVal(selected.fat, mult),
    }
    onSelect(scaled)
    setSelected(null)
    setQuery("")
    setResults([])
  }

  async function handleSave(food: FoodResult) {
    if (!onSave || savingFoodId) return
    setSavingFoodId(food.food_id)
    setSaveFailedFoodId(null)
    try {
      if (await onSave(food)) {
        setSavedFoodIds((current) => new Set(current).add(food.food_id))
      } else {
        setSaveFailedFoodId(food.food_id)
      }
    } catch {
      setSaveFailedFoodId(food.food_id)
    } finally {
      setSavingFoodId(null)
    }
  }

  function scaledSelectedFood(): FoodResult | null {
    if (!selected) return null
    const mult = getMultiplier()
    return {
      ...selected,
      calories: scaleVal(selected.calories, mult),
      protein: scaleVal(selected.protein, mult),
      carbs: scaleVal(selected.carbs, mult),
      fat: scaleVal(selected.fat, mult),
    }
  }

  function handleCancel() {
    setSelected(null)
  }

  function handleClear() {
    requestIdRef.current += 1
    setQuery("")
    setResults([])
    setOpen(false)
    setError(null)
    setLoading(false)
  }

  function adjustServings(delta: number) {
    const cur = parseFloat(servings) || 1
    const next = Math.max(0.25, Math.round((cur + delta) * 4) / 4)
    setServings(String(next))
  }

  function adjustGrams(delta: number) {
    const cur = parseFloat(grams) || 0
    const next = Math.max(1, Math.round(cur + delta))
    setGrams(String(next))
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const mult = getMultiplier()

  return (
    <div ref={containerRef} className="relative">
      {!compact && (
        <div className="flex items-center gap-2 mb-2">
          <div className="status-dot" style={{ width: 4, height: 4 }} />
          <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Open Food Facts
          </span>
        </div>
      )}

      {/* Portion editor */}
      {selected ? (
        <div className="space-y-3 border-y border-white/[0.07] px-1 py-4 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Food info */}
          <div className="flex items-start gap-4">
            {selected.image_url ? (
              <img
                src={selected.image_url}
                alt=""
                className="h-24 w-20 shrink-0 object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.3)]"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-tight truncate">{selected.food_name}</p>
              {selected.brand_name && (
                <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mt-0.5 truncate">
                  {selected.brand_name}
                </p>
              )}
              {selected.serving_description && (
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                  1 serving = {selected.serving_description}
                  {selected.serving_size_g ? ` (${selected.serving_size_g}g)` : ""}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/40 hover:bg-white/[0.04] hover:text-muted-foreground"
              aria-label="Close selected food"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-xl border border-glass-border overflow-hidden">
            <button
              type="button"
              onClick={() => setPortionMode("servings")}
              className={`flex-1 py-2.5 text-xs font-medium uppercase tracking-[0.12em] transition-colors touch-manipulation ${
                portionMode === "servings"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-glass-highlight/20"
              }`}
            >
              Servings
            </button>
            <button
              type="button"
              onClick={() => setPortionMode("grams")}
              className={`flex-1 py-2.5 text-xs font-medium uppercase tracking-[0.12em] border-l border-glass-border transition-colors touch-manipulation ${
                portionMode === "grams"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-glass-highlight/20"
              }`}
            >
              Grams
            </button>
          </div>

          {/* Controls */}
          {portionMode === "servings" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustServings(-0.25)}
                  disabled={parseFloat(servings) <= 0.25}
                  className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl border border-glass-border transition-colors hover:bg-grid-accent-dim disabled:cursor-not-allowed disabled:opacity-30 sm:h-8 sm:w-8"
                >
                  <Minus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
                <Input
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                  className="w-20 text-center text-lg font-semibold tabular-nums bg-background/40 border-primary/15"
                />
                <button
                  type="button"
                  onClick={() => adjustServings(0.25)}
                  className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl border border-glass-border transition-colors hover:bg-grid-accent-dim sm:h-8 sm:w-8"
                >
                  <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
                <div className="flex gap-1.5 ml-1">
                  {[0.5, 1, 1.5, 2].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setServings(String(v))}
                      className={`px-2.5 py-2 text-xs tabular-nums rounded-md border transition-colors touch-manipulation ${
                        parseFloat(servings) === v
                          ? "bg-primary/15 border-primary/30 text-primary font-semibold"
                          : "border-glass-border text-muted-foreground/60 hover:bg-grid-accent-dim hover:text-foreground"
                      }`}
                    >
                      {v}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustGrams(-10)}
                  disabled={parseFloat(grams) <= 10}
                  className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl border border-glass-border transition-colors hover:bg-grid-accent-dim disabled:cursor-not-allowed disabled:opacity-30 sm:h-8 sm:w-8"
                >
                  <Minus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
                <div className="relative">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                    className="w-24 text-center text-lg font-semibold tabular-nums bg-background/40 border-primary/15 pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 font-medium">g</span>
                </div>
                <button
                  type="button"
                  onClick={() => adjustGrams(10)}
                  className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl border border-glass-border transition-colors hover:bg-grid-accent-dim sm:h-8 sm:w-8"
                >
                  <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
                <div className="flex gap-1.5 ml-1">
                  {[50, 100, 150, 200].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setGrams(String(v))}
                      className={`px-2.5 py-2 text-xs tabular-nums rounded-md border transition-colors touch-manipulation ${
                        parseFloat(grams) === v
                          ? "bg-primary/15 border-primary/30 text-primary font-semibold"
                          : "border-glass-border text-muted-foreground/60 hover:bg-grid-accent-dim hover:text-foreground"
                      }`}
                    >
                      {v}g
                    </button>
                  ))}
                </div>
              </div>
              {!selected.serving_size_g && (
                <p className="text-[9px] text-muted-foreground/40 italic">
                  No serving weight available — using per 100g basis
                </p>
              )}
            </div>
          )}

          {/* Scaled nutrition preview */}
          <div className="flex flex-wrap divide-x divide-white/[0.07] border-y border-white/[0.06] py-2">
            {selected.calories != null && (
              <div className="min-w-[4rem] px-2.5 py-1 text-center">
                <p className="text-sm font-bold tabular-nums">{Math.round(scaleVal(selected.calories, mult)!)}</p>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">cal</p>
              </div>
            )}
            {selected.protein != null && (
              <div className="min-w-[3.5rem] px-2.5 py-1 text-center">
                <p className="text-sm font-bold tabular-nums text-blue-400/90">{Math.round(scaleVal(selected.protein, mult)!)}g</p>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">protein</p>
              </div>
            )}
            {selected.carbs != null && (
              <div className="min-w-[3.5rem] px-2.5 py-1 text-center">
                <p className="text-sm font-bold tabular-nums text-amber-400/90">{Math.round(scaleVal(selected.carbs, mult)!)}g</p>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">carbs</p>
              </div>
            )}
            {selected.fat != null && (
              <div className="min-w-[3.5rem] px-2.5 py-1 text-center">
                <p className="text-sm font-bold tabular-nums text-rose-400/90">{Math.round(scaleVal(selected.fat, mult)!)}g</p>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">fat</p>
              </div>
            )}
          </div>

          {/* Confirm */}
          <div className="flex gap-2">
            {onSave ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const food = scaledSelectedFood()
                  if (food) void handleSave(food)
                }}
                disabled={savingFoodId === selected.food_id || savedFoodIds.has(selected.food_id)}
                size="default"
                className="h-11 flex-1 gap-1.5 text-sm"
              >
                {savedFoodIds.has(selected.food_id) ? <Check className="size-4" /> : <Bookmark className="size-4" />}
                {savedFoodIds.has(selected.food_id)
                  ? "Saved"
                  : saveFailedFoodId === selected.food_id
                    ? "Try again"
                    : "Save food"}
              </Button>
            ) : null}
            <Button variant="glass" onClick={handleConfirm} size="default" className="h-11 flex-1 gap-1.5 text-sm">
              <Plus className="h-4 w-4" />
              Add to meal
            </Button>
          </div>
        </div>
      ) : (
        <>
            <div className="border-b border-white/[0.07] px-1 pb-3">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/45">
                  Global food database
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/65">
                  Search a product or brand, or scan its package.
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
                Open Food Facts
              </span>
            </div>

            <form onSubmit={submitSearch} className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  type="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  placeholder="Food, brand, or barcode"
                  value={query}
                  onChange={(e) => handleInput(e.target.value)}
                  onFocus={() => { if (results.length > 0 || error) setOpen(true) }}
                  className="h-12 border-white/[0.09] bg-black/20 pl-9 pr-9 text-base focus-visible:border-primary/35 focus-visible:ring-primary/10 sm:text-sm"
                />
                {query && !loading && (
                  <button
                    type="button"
                    onClick={handleClear}
                    aria-label="Clear food search"
                    className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground/45 transition-colors hover:bg-white/[0.05] hover:text-muted-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
                {loading && (
                  <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary/70" />
                )}
              </div>
              <Button
                type="submit"
                variant="outline"
                aria-label="Search food database"
                disabled={query.trim().length < 2 || loading}
                className="size-12 shrink-0 border-white/[0.08] bg-white/[0.025] p-0 text-primary hover:border-white/[0.13] hover:bg-white/[0.05] hover:text-primary"
              >
                <ArrowRight className="size-4.5" />
              </Button>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                aria-label="Scan a food barcode"
                className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-primary/80 transition-all hover:border-white/[0.13] hover:bg-white/[0.05] hover:text-primary active:scale-95 touch-manipulation"
              >
                <ScanBarcode className="size-5" />
              </button>
            </form>

            {recentQueries.length > 0 && !open && (
              <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <span className="shrink-0 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/35">Recent</span>
                {recentQueries.map((recent) => (
                  <button
                    key={recent}
                    type="button"
                    onClick={() => {
                      setQuery(recent)
                      void search(recent)
                    }}
                    className="h-7 shrink-0 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 text-[10px] text-muted-foreground/65 transition-colors hover:text-foreground touch-manipulation"
                  >
                    {recent}
                  </button>
                ))}
              </div>
            )}
          </div>

          {open && (
            <div
              className={cn(
                "z-[100] mt-2 max-h-[390px] overflow-y-auto overscroll-contain",
                compact
                  ? "border-t border-white/[0.07]"
                  : "absolute left-0 right-0 rounded-2xl border border-glass-border glass-strong shadow-xl",
              )}
              style={compact ? undefined : { backdropFilter: "blur(24px)" }}
            >
              {source && results.length > 0 && (
                <div className="flex items-center justify-between border-b border-glass-border/50 px-3.5 py-2">
                  <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/40">
                    {results.length} best matches
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40">
                    {source === "openfoodfacts"
                      ? "Open Food Facts"
                      : source === "fatsecret"
                        ? "FatSecret fallback"
                        : "USDA fallback"}
                  </span>
                </div>
              )}

              {error && (
                <div className="px-5 py-6 text-center">
                  <ScanBarcode className="mx-auto mb-2 size-6 text-muted-foreground/25" />
                  <p className="text-xs font-medium text-destructive/90">{error}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/50">Try another search or enter the barcode manually.</p>
                </div>
              )}

              {!error && results.length === 0 && !loading && (
                <div className="px-5 py-7 text-center">
                  <Search className="mx-auto mb-2 size-6 text-muted-foreground/25" />
                  <p className="text-xs font-medium text-muted-foreground">No matching products</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/45">Try the brand name, fewer words, or scan the barcode.</p>
                </div>
              )}

              {loading && results.length === 0 && (
                <div className="space-y-1 p-1.5" aria-label="Searching foods">
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="flex animate-pulse items-center gap-3 rounded-xl px-2 py-2.5">
                      <div className="size-11 rounded-xl bg-white/[0.06]" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-3/5 rounded bg-white/[0.07]" />
                        <div className="h-2 w-2/5 rounded bg-white/[0.045]" />
                      </div>
                      <div className="h-4 w-12 rounded bg-white/[0.06]" />
                    </div>
                  ))}
                </div>
              )}

              {results.map((food) => {
                const saved = savedFoodIds.has(food.food_id)
                const saving = savingFoodId === food.food_id
                const saveFailed = saveFailedFoodId === food.food_id
                return (
                  <div
                    key={food.food_id}
                    className="group flex min-h-[6rem] items-stretch gap-1 border-b border-glass-border/50 px-2 py-2.5 last:border-0 transition-colors hover:bg-grid-accent-dim"
                  >
                    <button
                      type="button"
                      onClick={() => handlePick(food)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left touch-manipulation"
                    >
                      {food.image_url ? (
                        <img
                          src={food.image_url}
                          alt=""
                          className="h-20 w-16 shrink-0 object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.3)] sm:h-16 sm:w-14"
                        />
                      ) : (
                        <span className="flex h-16 w-12 shrink-0 items-center justify-center text-muted-foreground/20">
                          <ScanBarcode className="size-5" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold leading-tight">
                          {food.food_name}
                        </span>
                        {food.brand_name && (
                          <span className="mt-0.5 block truncate text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            {food.brand_name}
                          </span>
                        )}
                        <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          {food.calories != null ? (
                            <span className="text-sm font-bold tabular-nums text-foreground/90">
                              {Math.round(food.calories)} <span className="text-[8px] font-medium uppercase tracking-wider text-muted-foreground/50">cal</span>
                            </span>
                          ) : null}
                          {food.serving_description ? (
                            <span className="truncate text-[9px] text-muted-foreground/45">per {food.serving_description}</span>
                          ) : null}
                        </span>
                        {(food.protein != null || food.carbs != null || food.fat != null) && (
                          <span className="mt-1.5 flex gap-1.5">
                            {food.protein != null && <span className="text-[9px] font-medium tabular-nums text-blue-400/75">P {Math.round(food.protein)}g</span>}
                            {food.carbs != null && <span className="text-[9px] font-medium tabular-nums text-amber-400/75">C {Math.round(food.carbs)}g</span>}
                            {food.fat != null && <span className="text-[9px] font-medium tabular-nums text-rose-400/75">F {Math.round(food.fat)}g</span>}
                          </span>
                        )}
                      </span>
                    </button>
                    <div className="flex w-11 shrink-0 flex-col items-center justify-center gap-1">
                      {onSave ? (
                        <button
                          type="button"
                          onClick={() => void handleSave(food)}
                          disabled={saving || saved}
                          className={cn(
                            "flex size-10 items-center justify-center rounded-xl transition-colors touch-manipulation",
                            saved
                              ? "bg-primary/10 text-primary"
                              : saveFailed
                                ? "bg-destructive/10 text-destructive"
                              : "text-muted-foreground/45 hover:bg-primary/[0.07] hover:text-primary",
                          )}
                          aria-label={saved ? `${food.food_name} saved` : saveFailed ? `Retry saving ${food.food_name}` : `Save ${food.food_name}`}
                        >
                          {saving ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : saveFailed ? <X className="size-4" /> : <Bookmark className="size-4" />}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handlePick(food)}
                        className="food-search-add-chip !m-0"
                        aria-label={`Add ${food.food_name} to meal`}
                      >
                        <Plus />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
      {scannerOpen && (
        <BarcodeScanner
          onClose={() => setScannerOpen(false)}
          onDetected={handleBarcode}
        />
      )}
    </div>
  )
}
