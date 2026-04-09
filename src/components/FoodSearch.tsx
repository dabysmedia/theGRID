"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Search, Plus, X, Loader2, Check, Minus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

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
  source?: "fatsecret" | "usda"
}

interface FoodSearchProps {
  onSelect: (food: FoodResult) => void
  /** Less chrome (e.g. in modals) */
  compact?: boolean
}

type PortionMode = "servings" | "grams"

function scaleVal(value: number | null, multiplier: number): number | null {
  if (value == null) return null
  return Math.round(value * multiplier * 10) / 10
}

export function FoodSearch({ onSelect, compact = false }: FoodSearchProps) {
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
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/food-search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      const foods = data.foods ?? []
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
      setOpen(true)
    } catch {
      setError("Search unavailable")
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleInput(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 350)
  }

  function handlePick(food: FoodResult) {
    setSelected(food)
    setServings("1")
    setGrams(food.serving_size_g ? String(food.serving_size_g) : "100")
    setPortionMode("servings")
    setOpen(false)
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

  function handleCancel() {
    setSelected(null)
  }

  function handleClear() {
    setQuery("")
    setResults([])
    setOpen(false)
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
            Food Database
          </span>
        </div>
      )}

      {/* Portion editor */}
      {selected ? (
        <div className="glass-subtle rounded-xl p-3.5 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Food info */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
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
              onClick={handleCancel}
              className="p-1 text-muted-foreground/40 hover:text-muted-foreground shrink-0"
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
          <div className="flex gap-2 flex-wrap">
            {selected.calories != null && (
              <div className="glass-subtle rounded-xl px-2.5 py-1.5 text-center min-w-[4rem]">
                <p className="text-sm font-bold tabular-nums">{Math.round(scaleVal(selected.calories, mult)!)}</p>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">cal</p>
              </div>
            )}
            {selected.protein != null && (
              <div className="glass-subtle rounded-xl px-2.5 py-1.5 text-center min-w-[3.5rem]">
                <p className="text-sm font-bold tabular-nums text-blue-400/90">{Math.round(scaleVal(selected.protein, mult)!)}g</p>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">protein</p>
              </div>
            )}
            {selected.carbs != null && (
              <div className="glass-subtle rounded-xl px-2.5 py-1.5 text-center min-w-[3.5rem]">
                <p className="text-sm font-bold tabular-nums text-amber-400/90">{Math.round(scaleVal(selected.carbs, mult)!)}g</p>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">carbs</p>
              </div>
            )}
            {selected.fat != null && (
              <div className="glass-subtle rounded-xl px-2.5 py-1.5 text-center min-w-[3.5rem]">
                <p className="text-sm font-bold tabular-nums text-rose-400/90">{Math.round(scaleVal(selected.fat, mult)!)}g</p>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">fat</p>
              </div>
            )}
          </div>

          {/* Confirm */}
          <Button variant="glass" onClick={handleConfirm} size="default" className="w-full gap-1.5 h-11 text-sm">
            <Check className="h-4 w-4" />
            Add to entry
          </Button>
        </div>
      ) : (
        <>
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search foods..."
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              onFocus={() => { if (results.length > 0) setOpen(true) }}
              className="pl-9 pr-9 bg-background/40 border-primary/15 focus-visible:border-primary/40 focus-visible:ring-primary/15"
            />
            {query && (
              <button
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {loading && (
              <Loader2 className="absolute right-9 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/50 animate-spin" />
            )}
          </div>

          {/* Results dropdown */}
          {open && (
            <div
              className="absolute z-[100] left-0 right-0 mt-1.5 max-h-[340px] overflow-y-auto glass-strong rounded-xl border border-glass-border shadow-lg"
              style={{ backdropFilter: "blur(24px)" }}
            >
              {source && results.length > 0 && (
                <div className="px-3.5 py-1.5 border-b border-glass-border/50 flex items-center justify-end">
                  <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40">
                    via {source === "fatsecret" ? "FatSecret" : "USDA FoodData Central"}
                  </span>
                </div>
              )}

              {error && (
                <div className="px-4 py-3 text-xs text-destructive text-center">
                  {error}
                </div>
              )}

              {!error && results.length === 0 && !loading && (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-muted-foreground">No results found</p>
                </div>
              )}

              {results.map((food) => (
                <button
                  key={food.food_id}
                  onClick={() => handlePick(food)}
                  className="w-full text-left px-3.5 py-3.5 hover:bg-grid-accent-dim transition-colors border-b border-glass-border/50 last:border-0 group touch-manipulation"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate leading-tight">
                        {food.food_name}
                      </p>
                      {food.brand_name && (
                        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mt-0.5 truncate">
                          {food.brand_name}
                        </p>
                      )}
                      {food.serving_description && (
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5 truncate">
                          {food.serving_description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {food.calories != null && (
                        <span className="text-sm font-semibold tabular-nums text-foreground/90">
                          {Math.round(food.calories)}
                          <span className="text-[10px] font-normal text-muted-foreground/60 ml-0.5">cal</span>
                        </span>
                      )}
                      <div className="food-search-add-chip" aria-hidden>
                        <Plus />
                      </div>
                    </div>
                  </div>

                  {(food.protein != null || food.carbs != null || food.fat != null) && (
                    <div className="flex gap-1.5 mt-1.5">
                      {food.protein != null && (
                        <span className="text-[9px] font-medium tabular-nums px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400/80">
                          P {Math.round(food.protein)}g
                        </span>
                      )}
                      {food.carbs != null && (
                        <span className="text-[9px] font-medium tabular-nums px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400/80">
                          C {Math.round(food.carbs)}g
                        </span>
                      )}
                      {food.fat != null && (
                        <span className="text-[9px] font-medium tabular-nums px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-400/80">
                          F {Math.round(food.fat)}g
                        </span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
