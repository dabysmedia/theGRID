"use client"

import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { addDays, differenceInCalendarDays, endOfWeek, format, startOfWeek, subDays } from "date-fns"
import { Calendar, ChevronDown, Flame, Trash2, Plus, Star, X, Pencil, Target, Check } from "lucide-react"
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

interface CalorieBudget {
  id: string
  dailyBudget: number
}

interface DraftMealItem {
  id: string
  mealType: string
  description: string | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
}

const mealTypes = ["breakfast", "lunch", "dinner", "snack"]

function dateGroupLabel(
  dateKey: string,
  todayStr: string,
  yesterdayStr: string,
  realTodayStr: string
) {
  if (dateKey === todayStr) return "Today"
  if (dateKey === yesterdayStr) return "Yesterday"
  if (dateKey > realTodayStr) return `Planned · ${format(parseLocalDate(dateKey), "EEE, MMM d")}`
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
  const [editingEntry, setEditingEntry] = useState<CalorieEntry | null>(null)
  const [draftMealItems, setDraftMealItems] = useState<DraftMealItem[]>([])
  const [postingMeal, setPostingMeal] = useState(false)
  const [budget, setBudget] = useState<CalorieBudget | null>(null)
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetInput, setBudgetInput] = useState("")
  const frequentlyAddedDetailsRef = useRef<HTMLDetailsElement>(null)

  const { activeDate } = useActiveDate()
  const today = activeDate
  const yesterday = formatDate(subDays(parseLocalDate(activeDate), 1))
  const realToday = formatDate(new Date())

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

  useEffect(() => {
    fetch("/api/goals?category=calories")
      .then(async (r) => {
        const data = await r.json()
        if (data && typeof data.target === "number") {
          setBudget({ id: data.id, dailyBudget: data.target })
          setBudgetInput(String(Math.round(data.target)))
        } else {
          setBudget(null)
        }
      })
      .catch(() => setBudget(null))
  }, [])

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

  function resetCurrentItemFields() {
    setDescription("")
    setCalories("")
    setProtein("")
    setCarbs("")
    setFat("")
    setShowSavePrompt(false)
  }

  function addCurrentItemToMeal() {
    const cal = parseFloat(calories)
    if (!Number.isFinite(cal) || cal <= 0) return

    const p = protein.trim() === "" ? null : parseFloat(protein)
    const c = carbs.trim() === "" ? null : parseFloat(carbs)
    const f = fat.trim() === "" ? null : parseFloat(fat)

    const item: DraftMealItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mealType,
      description: description.trim() || null,
      calories: Math.round(cal),
      protein: Number.isFinite(p) ? p : null,
      carbs: Number.isFinite(c) ? c : null,
      fat: Number.isFinite(f) ? f : null,
    }

    setDraftMealItems((prev) => [...prev, item])
    resetCurrentItemFields()
  }

  function cancelEdit() {
    setEditingEntry(null)
    resetCurrentItemFields()
    setMealType("lunch")
  }

  function startEdit(entry: CalorieEntry) {
    setEditingEntry(entry)
    setMealType(entry.mealType)
    setDescription(entry.description ?? "")
    setCalories(String(entry.calories))
    setProtein(entry.protein != null ? String(entry.protein) : "")
    setCarbs(entry.carbs != null ? String(entry.carbs) : "")
    setFat(entry.fat != null ? String(entry.fat) : "")
    setShowSavePrompt(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!calories) return

    if (editingEntry) {
      const res = await fetch("/api/calories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEntry.id,
          date: editingEntry.date.split("T")[0],
          mealType,
          description: description || null,
          calories,
          protein: protein || null,
          carbs: carbs || null,
          fat: fat || null,
        }),
      })

      if (res.ok) {
        const updated = (await res.json()) as CalorieEntry
        setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
        cancelEdit()
      }
      return
    }
    addCurrentItemToMeal()
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/calories?id=${id}`, { method: "DELETE" })
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== id))
      setEditingEntry((cur) => {
        if (cur?.id === id) {
          queueMicrotask(() => cancelEdit())
        }
        return cur?.id === id ? null : cur
      })
    }
  }

  async function handleUseSavedMeal(meal: SavedMeal) {
    const item: DraftMealItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mealType: meal.mealType,
      description: meal.name,
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
    }
    setDraftMealItems((prev) => [...prev, item])
    fetch(`/api/saved-meals?id=${meal.id}`, { method: "PATCH" })
      .then(() => fetchSavedMeals())
      .catch(() => {})
  }

  async function handlePostMealToDay() {
    if (draftMealItems.length === 0 || postingMeal) return
    setPostingMeal(true)
    try {
      const created: CalorieEntry[] = []
      for (const item of draftMealItems) {
        const res = await fetch("/api/calories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: today,
            mealType: item.mealType,
            description: item.description,
            calories: String(item.calories),
            protein: item.protein != null ? String(item.protein) : null,
            carbs: item.carbs != null ? String(item.carbs) : null,
            fat: item.fat != null ? String(item.fat) : null,
          }),
        })
        if (res.ok) {
          created.push(await res.json())
        }
      }
      if (created.length > 0) {
        setEntries((prev) => [...created.reverse(), ...prev])
      }
      setDraftMealItems([])
    } finally {
      setPostingMeal(false)
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

  const draftTotals = useMemo(() => {
    return draftMealItems.reduce(
      (acc, item) => {
        acc.calories += item.calories
        if (item.protein != null) acc.protein += item.protein
        if (item.carbs != null) acc.carbs += item.carbs
        if (item.fat != null) acc.fat += item.fat
        return acc
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )
  }, [draftMealItems])

  const weeklyAdjustment = useMemo(() => {
    const perDayGoal = budget ? budget.dailyBudget : 0

    const ref = parseLocalDate(today)
    const weekStart = startOfWeek(ref, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(ref, { weekStartsOn: 1 })
    const weeklyBudget = perDayGoal * 7

    let consumedToDate = 0
    for (let i = 0; i <= differenceInCalendarDays(ref, weekStart); i++) {
      const dayKey = formatDate(addDays(weekStart, i))
      consumedToDate += dailyTotals.get(dayKey) ?? 0
    }

    const remainingDays = differenceInCalendarDays(weekEnd, ref)
    const remainingBudget = Math.round(weeklyBudget - consumedToDate)
    const recommendedPerDay =
      remainingDays > 0 ? Math.max(0, Math.round(remainingBudget / remainingDays)) : null

    const pct = weeklyBudget > 0 ? Math.min(100, (consumedToDate / weeklyBudget) * 100) : 0

    return {
      perDayGoal: Math.round(perDayGoal),
      weeklyBudget: Math.round(weeklyBudget),
      consumedToDate,
      remainingDays,
      remainingBudget,
      recommendedPerDay,
      todayOverBy: Math.max(0, todayTotal - perDayGoal),
      pct,
    }
  }, [budget, dailyTotals, today, todayTotal])

  async function saveBudget() {
    const val = parseFloat(budgetInput)
    if (Number.isNaN(val) || val <= 0) return

    const method = budget ? "PUT" : "POST"
    const payload = budget
      ? { id: budget.id, target: val, unit: "cal", goalType: "daily", direction: "down" }
      : { category: "calories", goalType: "daily", direction: "down", target: val, unit: "cal", active: true }

    const res = await fetch("/api/goals", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const saved = await res.json()
      setBudget({ id: saved.id, dailyBudget: saved.target })
      setBudgetInput(String(Math.round(saved.target)))
      setEditingBudget(false)
    }
  }

  async function deleteBudget() {
    if (!budget) return
    const res = await fetch(`/api/goals?id=${budget.id}`, { method: "DELETE" })
    if (res.ok) {
      setBudget(null)
      setBudgetInput("")
      setEditingBudget(false)
    }
  }

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

      <div className="glass-subtle px-3.5 py-2.5 animate-fade-up space-y-2" style={{ borderRadius: "3px" }}>
        {editingBudget ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-red-400 shrink-0" />
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Daily Budget</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="50"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveBudget() }}
                placeholder="2000"
                className="h-7 w-28 text-xs bg-background/40 border-primary/15"
                autoFocus
              />
              <span className="text-[10px] text-muted-foreground/50">cal / day</span>
              {budgetInput && parseFloat(budgetInput) > 0 && (
                <span className="text-[10px] text-muted-foreground/40 tabular-nums">= {(parseFloat(budgetInput) * 7).toLocaleString()} / wk</span>
              )}
              <div className="flex items-center gap-0.5 ml-auto">
                <button onClick={saveBudget} className="p-1 text-primary hover:bg-primary/10 rounded-[2px] transition-colors">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => { setEditingBudget(false); if (budget) setBudgetInput(String(Math.round(budget.dailyBudget))) }} className="p-1 text-muted-foreground/50 hover:text-muted-foreground rounded-[2px] transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
                {budget && (
                  <button onClick={deleteBudget} className="p-1 text-muted-foreground/30 hover:text-destructive rounded-[2px] transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : budget ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Target className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Budget</span>
                <span className="text-xs font-semibold tabular-nums">{weeklyAdjustment.perDayGoal.toLocaleString()}<span className="text-muted-foreground/40 font-normal text-[10px]"> /day</span></span>
                <span className="text-[10px] text-muted-foreground/30">·</span>
                <span className="text-[10px] tabular-nums text-muted-foreground/50">{weeklyAdjustment.weeklyBudget.toLocaleString()} /wk</span>
              </div>
              <button onClick={() => setEditingBudget(true)} className="p-1 text-muted-foreground/30 hover:text-muted-foreground transition-colors">
                <Pencil className="h-3 w-3" />
              </button>
            </div>
            <div className="h-1.5 w-full bg-muted/20 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-700 ease-out rounded-full"
                style={{
                  width: `${Math.min(weeklyAdjustment.pct, 100)}%`,
                  backgroundColor: weeklyAdjustment.pct > 100 ? "#f87171" : "#ef4444",
                  boxShadow: weeklyAdjustment.pct > 0 ? "0 0 8px oklch(0.6 0.2 25 / 30%)" : "none",
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] tabular-nums">
              <span className="text-muted-foreground/60">{weeklyAdjustment.consumedToDate.toLocaleString()} consumed</span>
              <span className={`font-semibold ${weeklyAdjustment.remainingBudget < 0 ? "text-red-400" : "text-primary/85"}`}>
                {weeklyAdjustment.remainingBudget.toLocaleString()} left
              </span>
              <span className="text-muted-foreground/40">{weeklyAdjustment.remainingDays}d remain</span>
            </div>
            {weeklyAdjustment.remainingDays > 0 && weeklyAdjustment.recommendedPerDay != null && (
              <p className={`text-[10px] ${weeklyAdjustment.remainingBudget >= 0 ? "text-primary/70" : "text-red-400/80"}`}>
                {weeklyAdjustment.remainingBudget >= 0
                  ? <>Aim for <span className="font-semibold tabular-nums">{weeklyAdjustment.recommendedPerDay.toLocaleString()} cal</span> / day remaining</>
                  : <>Over budget by <span className="font-semibold tabular-nums">{Math.abs(weeklyAdjustment.remainingBudget).toLocaleString()}</span> — keep low</>}
              </p>
            )}
            {weeklyAdjustment.remainingDays === 0 && (
              <p className="text-[10px] text-muted-foreground/60">
                Week avg: <span className="tabular-nums font-medium">{Math.round(weeklyAdjustment.consumedToDate / 7).toLocaleString()} cal/day</span>
              </p>
            )}
          </>
        ) : (
          <button
            onClick={() => setEditingBudget(true)}
            className="w-full flex items-center justify-center gap-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <Target className="h-3 w-3" />
            Set calorie budget
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up stagger-2">
        <div className="space-y-6 min-w-0">
          <div className="glass rounded-2xl p-5">
          <div className="text-center lg:text-left mb-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Today&apos;s Total</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight">{todayTotal.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">calories</p>
            {today > realToday && (
              <p className="text-[10px] uppercase tracking-wider text-primary/80 mt-1">
                Planning mode (using top date selector)
              </p>
            )}
          </div>

          <FoodSearch onSelect={handleFoodSelect} />

          {editingEntry && (
            <div
              className="glass-subtle flex items-center justify-between gap-3 px-3 py-2.5 mb-1"
              style={{ borderRadius: "4px" }}
            >
              <p className="text-xs text-muted-foreground leading-snug">
                Editing{" "}
                <span className="text-foreground font-medium">
                  {format(parseLocalDate(editingEntry.date.split("T")[0]), "MMM d, yyyy")}
                </span>
                <span className="capitalize"> · {editingEntry.mealType}</span>
              </p>
              <Button type="button" variant="ghost" size="sm" className="shrink-0 h-8 px-2" onClick={cancelEdit}>
                <X className="h-4 w-4" />
                <span className="sr-only">Cancel edit</span>
              </Button>
            </div>
          )}

          <div className="hud-divider my-4" />

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

          {!editingEntry && (
            <div className="glass-subtle rounded-[3px] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Meal Builder
                </p>
                <span className="text-[10px] tabular-nums text-muted-foreground/70">
                  {draftMealItems.length} item{draftMealItems.length === 1 ? "" : "s"}
                </span>
              </div>
              {draftMealItems.length === 0 ? (
                <p className="text-xs text-muted-foreground/60">
                  Add foods below. Nothing posts until you press <span className="font-medium">Post Meal</span>.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {draftMealItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate">
                          {item.description || "Quick add"} · <span className="capitalize">{item.mealType}</span>
                        </p>
                        <p className="text-muted-foreground/65 tabular-nums">
                          {item.calories} cal
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftMealItems((prev) => prev.filter((x) => x.id !== item.id))
                        }
                        className="p-1 rounded-[3px] hover:bg-destructive/10 shrink-0"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                  <div className="pt-1 border-t border-glass-border/60 text-[10px] text-muted-foreground/80 tabular-nums">
                    Total: {draftTotals.calories.toLocaleString()} cal
                    {(draftTotals.protein > 0 || draftTotals.carbs > 0 || draftTotals.fat > 0) && (
                      <span> · P {Math.round(draftTotals.protein)}g · C {Math.round(draftTotals.carbs)}g · F {Math.round(draftTotals.fat)}g</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
                <Button type="submit" className="w-full" size="sm">
                  {editingEntry ? "Save changes" : "Add item to meal"}
                </Button>
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

            <div className="flex flex-col gap-2">
              {editingEntry && (
                <Button type="button" variant="outline" className="w-full" size="lg" onClick={cancelEdit}>
                  Cancel edit
                </Button>
              )}
              {!editingEntry && (
                <Button
                  type="button"
                  className="w-full press-scale"
                  size="lg"
                  variant="default"
                  disabled={draftMealItems.length === 0 || postingMeal}
                  onClick={handlePostMealToDay}
                >
                  {postingMeal
                    ? "Posting..."
                    : `Post meal to ${today > realToday ? "planned day" : "day"}`}
                </Button>
              )}
            </div>
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
                        fontSize: "10px",
                        padding: "4px 6px",
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
                  {dateGroupLabel(dateKey, today, yesterday, realToday)}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((entry) => (
                  <div
                    key={entry.id}
                    className="glass-subtle rounded-xl p-3.5 flex items-center justify-between gap-2 group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
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
                    <div className="flex items-center gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => startEdit(entry)}
                        className="p-1.5 rounded-lg hover:bg-primary/10 shrink-0"
                        title="Edit"
                        aria-label="Edit entry"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 shrink-0"
                        title="Delete"
                        aria-label="Delete entry"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
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
