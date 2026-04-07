"use client"

import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { format, subDays } from "date-fns"
import { Calendar, ChevronDown, Flame, Trash2, Plus, Star, X } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useActiveDate } from "@/context/DateContext"
import { PageHeader } from "@/components/PageHeader"
import { FoodSearch } from "@/components/FoodSearch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDate, last7Days, parseLocalDate } from "@/lib/utils"
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"

const calorieGoalPresets: GoalPreset[] = [
  { type: "daily", label: "Daily Total", unit: "cal", placeholder: "2000" },
  { type: "weekly_avg", label: "Weekly Average", unit: "cal/day", placeholder: "1800" },
]

interface CalorieEntry {
  id: string
  date: string
  mealType: string
  description: string | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
}

interface SavedMeal {
  id: string
  name: string
  mealType: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  useCount: number
}

const mealTypes = ["breakfast", "lunch", "dinner", "snack"]

function dateGroupLabel(dateKey: string, todayStr: string, yesterdayStr: string) {
  if (dateKey === todayStr) return "Today"
  if (dateKey === yesterdayStr) return "Yesterday"
  return format(parseLocalDate(dateKey), "EEE, MMM d")
}

export default function CaloriesPage() {
  const [entries, setEntries] = useState<CalorieEntry[]>([])
  const [mealType, setMealType] = useState("lunch")
  const [description, setDescription] = useState("")
  const [calories, setCalories] = useState("")
  const [protein, setProtein] = useState("")
  const [carbs, setCarbs] = useState("")
  const [fat, setFat] = useState("")

  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([])
  const [showCreateMeal, setShowCreateMeal] = useState(false)
  const [newMealName, setNewMealName] = useState("")
  const [newMealCal, setNewMealCal] = useState("")
  const [newMealProtein, setNewMealProtein] = useState("")
  const [newMealCarbs, setNewMealCarbs] = useState("")
  const [newMealFat, setNewMealFat] = useState("")
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [saveMealError, setSaveMealError] = useState<string | null>(null)
  const frequentlyAddedDetailsRef = useRef<HTMLDetailsElement>(null)

  const { activeDate } = useActiveDate()
  const today = activeDate
  const yesterday = formatDate(subDays(parseLocalDate(activeDate), 1))

  const fetchSavedMeals = useCallback(async () => {
    try {
      const r = await fetch("/api/saved-meals")
      const data = await r.json()
      setSavedMeals(Array.isArray(data) ? data : [])
    } catch {
      setSavedMeals([])
    }
  }, [])

  useEffect(() => {
    fetch("/api/calories")
      .then(async (r) => {
        const data = await r.json()
        setEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setEntries([]))
    fetchSavedMeals()
  }, [fetchSavedMeals])

  const filteredSavedMeals = useMemo(
    () => savedMeals.filter((m) => m.mealType === mealType),
    [savedMeals, mealType]
  )

  const { dailyTotals, chartData, weekTotal, avg7, bestDay } = useMemo(() => {
    const dailyTotals = new Map<string, number>()
    for (const e of entries) {
      const d = e.date.split("T")[0]
      dailyTotals.set(d, (dailyTotals.get(d) ?? 0) + e.calories)
    }

    const days = last7Days()
    let weekSum = 0
    const chartData = days.map((d) => {
      const key = formatDate(d)
      const total = dailyTotals.get(key) ?? 0
      weekSum += total
      return { label: format(d, "EEE"), total }
    })

    let bestVal = 0
    let bestKey: string | null = null
    for (const [k, v] of dailyTotals) {
      if (v > bestVal) {
        bestVal = v
        bestKey = k
      }
    }

    return {
      dailyTotals,
      chartData,
      weekTotal: weekSum,
      avg7: weekSum / 7,
      bestDay: { value: bestVal, key: bestKey },
    }
  }, [entries])

  const hasChartData = chartData.some((d) => d.total > 0)

  const historyGroups = useMemo(() => {
    const map = new Map<string, CalorieEntry[]>()
    for (const e of entries) {
      const d = e.date.split("T")[0]
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(e)
    }
    const keys = [...map.keys()].sort((a, b) => b.localeCompare(a))
    return keys.map((dateKey) => ({ dateKey, items: map.get(dateKey)! }))
  }, [entries])

  function handleFoodSelect(food: { food_name: string; brand_name: string | null; calories: number | null; protein: number | null; carbs: number | null; fat: number | null }) {
    const label = food.brand_name ? `${food.food_name} (${food.brand_name})` : food.food_name
    setDescription(label)
    if (food.calories != null) setCalories(String(Math.round(food.calories)))
    if (food.protein != null) setProtein(String(Math.round(food.protein)))
    if (food.carbs != null) setCarbs(String(Math.round(food.carbs)))
    if (food.fat != null) setFat(String(Math.round(food.fat)))
    setShowSavePrompt(true)
  }

  function addCalories(n: number) {
    const cur = parseFloat(calories)
    const base = Number.isNaN(cur) ? 0 : cur
    setCalories(String(Math.round(base + n)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!calories) return

    const res = await fetch("/api/calories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: today,
        mealType,
        description: description || null,
        calories,
        protein: protein || null,
        carbs: carbs || null,
        fat: fat || null,
      }),
    })

    if (res.ok) {
      const entry = await res.json()
      setEntries([entry, ...entries])
      setDescription("")
      setCalories("")
      setProtein("")
      setCarbs("")
      setFat("")
      setShowSavePrompt(false)
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/calories?id=${id}`, { method: "DELETE" })
    if (res.ok) setEntries(entries.filter((e) => e.id !== id))
  }

  async function handleUseSavedMeal(meal: SavedMeal) {
    const res = await fetch("/api/calories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: today,
        mealType: meal.mealType,
        description: meal.name,
        calories: String(meal.calories),
        protein: meal.protein != null ? String(meal.protein) : null,
        carbs: meal.carbs != null ? String(meal.carbs) : null,
        fat: meal.fat != null ? String(meal.fat) : null,
      }),
    })

    if (res.ok) {
      const entry = await res.json()
      setEntries([entry, ...entries])
      fetch(`/api/saved-meals?id=${meal.id}`, { method: "PATCH" })
        .then(() => fetchSavedMeals())
        .catch(() => {})
    }
  }

  async function handleCreateMeal(e?: React.FormEvent) {
    e?.preventDefault()
    setSaveMealError(null)
    if (!newMealName.trim() || !newMealCal.trim()) return

    const res = await fetch("/api/saved-meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newMealName.trim(),
        mealType,
        calories: newMealCal,
        protein: newMealProtein || null,
        carbs: newMealCarbs || null,
        fat: newMealFat || null,
      }),
    })

    if (!res.ok) {
      let message = "Could not save meal."
      try {
        const err = await res.json()
        if (err && typeof err.error === "string") message = err.error
      } catch {
        /* ignore */
      }
      setSaveMealError(message)
      return
    }

    await fetchSavedMeals()
    setShowCreateMeal(false)
    setNewMealName("")
    setNewMealCal("")
    setNewMealProtein("")
    setNewMealCarbs("")
    setNewMealFat("")
  }

  async function handleSaveCurrentAsFrequent() {
    if (!description.trim() || !calories.trim()) return

    await fetch("/api/saved-meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: description.trim(),
        mealType,
        calories,
        protein: protein || null,
        carbs: carbs || null,
        fat: fat || null,
      }),
    })

    fetchSavedMeals()
    setShowSavePrompt(false)
  }

  async function handleDeleteSavedMeal(id: string) {
    const res = await fetch(`/api/saved-meals?id=${id}`, { method: "DELETE" })
    if (res.ok) setSavedMeals(savedMeals.filter((m) => m.id !== id))
  }

  const todayTotal = dailyTotals.get(today) ?? 0

  const bestDaySub =
    bestDay.key != null && bestDay.value > 0
      ? format(parseLocalDate(bestDay.key), "EEE, MMM d")
      : undefined

  const estimateCalDisplay =
    calories.trim() === ""
      ? null
      : (() => {
          const c = parseFloat(calories)
          if (Number.isNaN(c) || c <= 0) return null
          return Math.round(c)
        })()

  return (
    <div className="space-y-6">
      <PageHeader title="Calories" icon={Flame} iconColor="#ef4444" />

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none animate-fade-up">
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Today
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {todayTotal.toLocaleString()}
          </span>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">cal</p>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            7-Day Avg
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {Math.round(avg7).toLocaleString()}
          </span>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">cal / day</p>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Week Total
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {weekTotal.toLocaleString()}
          </span>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">last 7 days</p>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Best Day
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {bestDay.value > 0 ? bestDay.value.toLocaleString() : "—"}
          </span>
          {bestDaySub && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{bestDaySub}</p>
          )}
        </div>
      </div>

      <CategoryGoal
        category="calories"
        values={{ daily: todayTotal, weekly_avg: Math.round(avg7) }}
        presets={calorieGoalPresets}
        color="#ef4444"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up stagger-2">
        <div className="space-y-6 min-w-0">
          <div className="glass rounded-2xl p-5">
          <div className="text-center lg:text-left mb-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Today&apos;s Total</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight">{todayTotal.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">calories</p>
          </div>

          <FoodSearch onSelect={handleFoodSelect} />

          <div className="hud-divider my-4" />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {mealTypes.map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={mealType === m ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMealType(m)}
                  className="capitalize"
                >
                  {m}
                </Button>
              ))}
            </div>

            <details className="group rounded-xl border border-glass-border bg-glass-highlight/10 px-3 py-2 open:pb-3">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2 min-w-0">
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-200 group-open:rotate-180" />
                  <span>Estimate</span>
                  {estimateCalDisplay != null && (
                    <span className="font-semibold normal-case tabular-nums text-foreground truncate">
                      · {estimateCalDisplay.toLocaleString()} cal
                    </span>
                  )}
                </span>
              </summary>
              <div className="space-y-2 pt-3 mt-1 border-t border-glass-border/60">
                <Label htmlFor="calories" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Calories *
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <Input
                    id="calories"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="e.g. 450"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                    className="flex-1 min-w-0 sm:min-h-[2.5rem]"
                    required
                  />
                  <div className="flex gap-1.5 shrink-0 flex-wrap sm:flex-nowrap">
                    {(
                      [
                        { n: 250, label: "+250" },
                        { n: 500, label: "+500" },
                        { n: 1000, label: "+1k" },
                      ] as const
                    ).map(({ n, label }) => (
                      <Button
                        key={n}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 sm:flex-none min-w-[4.25rem]"
                        onClick={() => addCalories(n)}
                        title={`Add ${n.toLocaleString()} cal`}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground/80">
                  Type a total or tap quick adds. Calories from food search also count — adjust here if needed.
                </p>
              </div>
            </details>

            {showSavePrompt && description && calories && (
              <button
                type="button"
                onClick={handleSaveCurrentAsFrequent}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-[3px] border border-dashed border-primary/25 text-[11px] font-medium uppercase tracking-wider text-primary/70 hover:bg-primary/5 hover:text-primary transition-colors"
              >
                <Star className="h-3 w-3" />
                Save to Frequently Added
              </button>
            )}

            {/* Frequently Added */}
            <details
              ref={frequentlyAddedDetailsRef}
              className="group rounded-xl border border-glass-border bg-glass-highlight/10 px-3 py-2 open:pb-3"
            >
              <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2 min-w-0">
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-200 group-open:rotate-180" />
                  <Star className="h-3.5 w-3.5 shrink-0 text-primary/60" />
                  <span>Frequently Added</span>
                  <span className="text-[9px] tabular-nums text-muted-foreground/40 capitalize">
                    · {mealType}
                  </span>
                  {filteredSavedMeals.length > 0 && (
                    <span className="font-semibold normal-case tabular-nums text-foreground truncate">
                      · {filteredSavedMeals.length}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (frequentlyAddedDetailsRef.current) {
                      frequentlyAddedDetailsRef.current.open = true
                    }
                    setShowCreateMeal(!showCreateMeal)
                    setSaveMealError(null)
                  }}
                  className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-primary/60 hover:text-primary transition-colors shrink-0"
                >
                  {showCreateMeal ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  {showCreateMeal ? "Cancel" : "Create"}
                </button>
              </summary>

              <div className="space-y-3 pt-3 mt-1 border-t border-glass-border/60">
                {showCreateMeal && (
                  <div
                    data-create-meal
                    className="glass-subtle rounded-[3px] p-3 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200"
                    onKeyDownCapture={(e) => {
                      if (
                        e.key === "Enter" &&
                        (e.target as HTMLElement).closest("[data-create-meal]")
                      ) {
                        e.preventDefault()
                        e.stopPropagation()
                        void handleCreateMeal()
                      }
                    }}
                  >
                    <Input
                      placeholder="Meal name"
                      value={newMealName}
                      onChange={(e) => setNewMealName(e.target.value)}
                      className="bg-background/40 border-primary/15"
                    />
                    <div className="grid grid-cols-4 gap-1.5">
                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Cal *</Label>
                        <Input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={newMealCal}
                          onChange={(e) => setNewMealCal(e.target.value)}
                          className="bg-background/40 border-primary/15 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Protein</Label>
                        <Input
                          type="number"
                          min="0"
                          placeholder="g"
                          value={newMealProtein}
                          onChange={(e) => setNewMealProtein(e.target.value)}
                          className="bg-background/40 border-primary/15 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Carbs</Label>
                        <Input
                          type="number"
                          min="0"
                          placeholder="g"
                          value={newMealCarbs}
                          onChange={(e) => setNewMealCarbs(e.target.value)}
                          className="bg-background/40 border-primary/15 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Fat</Label>
                        <Input
                          type="number"
                          min="0"
                          placeholder="g"
                          value={newMealFat}
                          onChange={(e) => setNewMealFat(e.target.value)}
                          className="bg-background/40 border-primary/15 text-xs"
                        />
                      </div>
                    </div>
                    {saveMealError && (
                      <p className="text-xs text-destructive" role="alert">
                        {saveMealError}
                      </p>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      onClick={() => void handleCreateMeal()}
                    >
                      Save Meal
                    </Button>
                  </div>
                )}

                {filteredSavedMeals.length === 0 && !showCreateMeal && (
                  <div className="glass-subtle rounded-[3px] py-5 text-center">
                    <p className="text-xs text-muted-foreground/50">
                      No saved {mealType} meals yet
                    </p>
                    <p className="text-[10px] text-muted-foreground/30 mt-1">
                      Search a food or create a custom meal to save here
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  {filteredSavedMeals.map((meal) => (
                    <div
                      key={meal.id}
                      className="glass-subtle rounded-[3px] px-3 py-2.5 flex items-center justify-between group hover:bg-grid-accent-dim transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => handleUseSavedMeal(meal)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center justify-center w-7 h-7 rounded-[3px] bg-primary/10 shrink-0">
                          <Plus className="h-3 w-3 text-primary/70" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate leading-tight">{meal.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-semibold tabular-nums text-foreground/80">
                              {meal.calories} cal
                            </span>
                            {meal.protein != null && (
                              <span className="text-[9px] tabular-nums text-blue-400/70">P {Math.round(meal.protein)}g</span>
                            )}
                            {meal.carbs != null && (
                              <span className="text-[9px] tabular-nums text-amber-400/70">C {Math.round(meal.carbs)}g</span>
                            )}
                            {meal.fat != null && (
                              <span className="text-[9px] tabular-nums text-rose-400/70">F {Math.round(meal.fat)}g</span>
                            )}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedMeal(meal.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-[3px] hover:bg-destructive/10 shrink-0"
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground/50" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </details>

            <Button type="submit" className="w-full press-scale" size="lg">
              Log Calories
            </Button>
          </form>
          </div>

          <div className="glass rounded-2xl p-4 lg:p-5 animate-fade-up stagger-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
              7-Day trend
            </p>
            {hasChartData ? (
              <div className="h-40 lg:h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="calBarFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.35} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/25" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      width={32}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.19 0.012 250 / 98%)",
                        border: "1px solid oklch(1 0 0 / 8%)",
                        borderRadius: "3px",
                        fontSize: "12px",
                        backdropFilter: "blur(8px)",
                        color: "var(--muted-foreground)",
                      }}
                      labelStyle={{ color: "var(--muted-foreground)" }}
                      formatter={(value) => [
                        `${Number(value ?? 0).toLocaleString()} cal`,
                        "Total",
                      ]}
                    />
                    <Bar dataKey="total" fill="url(#calBarFill)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-40 lg:h-48 flex items-center justify-center">
                <p className="text-sm text-muted-foreground text-center px-4">Log entries to see trends</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground px-1">History</h2>
          {entries.length === 0 && (
            <div className="glass-subtle rounded-2xl p-6 text-center">
              <p className="text-sm text-muted-foreground">No entries yet</p>
            </div>
          )}
          {historyGroups.map(({ dateKey, items }) => (
            <div key={dateKey} className="space-y-2">
              <div className="flex items-center gap-2 mb-1.5 px-1">
                <Calendar className="h-3 w-3 text-muted-foreground/40" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {dateGroupLabel(dateKey, today, yesterday)}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((entry) => (
                  <div
                    key={entry.id}
                    className="glass-subtle rounded-xl p-3.5 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#ef4444]/10 shrink-0">
                        <span className="text-xs font-semibold text-[#ef4444] capitalize">
                          {entry.mealType.charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{entry.calories} cal</span>
                          <span className="text-xs text-muted-foreground capitalize">{entry.mealType}</span>
                        </div>
                        {(entry.protein != null || entry.carbs != null || entry.fat != null) && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {entry.protein != null && (
                              <span className="text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground">
                                P {entry.protein}g
                              </span>
                            )}
                            {entry.carbs != null && (
                              <span className="text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground">
                                C {entry.carbs}g
                              </span>
                            )}
                            {entry.fat != null && (
                              <span className="text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground">
                                F {entry.fat}g
                              </span>
                            )}
                          </div>
                        )}
                        {entry.description && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{entry.description}</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-destructive/10 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
