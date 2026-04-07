"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { addDays, differenceInCalendarDays, endOfWeek, format, startOfWeek, subDays } from "date-fns"
import { Calendar, ChevronDown, Flame, Lock, Search, Trash2, Plus, Star, Unlock, X, Pencil, Target, Check } from "lucide-react"
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
import { cn, formatDate, last7Days, parseLocalDate } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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
  const [dayLocked, setDayLocked] = useState(false)
  const [adjustedDailyTarget, setAdjustedDailyTarget] = useState<number | null>(null)
  
  const [logFoodOpen, setLogFoodOpen] = useState(false)
  const [logFoodSearchOpen, setLogFoodSearchOpen] = useState(false)

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
    if (!logFoodOpen) setLogFoodSearchOpen(false)
  }, [logFoodOpen])

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
    setLogFoodOpen(true)
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
        setLogFoodOpen(false)
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
        setLogFoodOpen(false)
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

    const pct = weeklyBudget > 0 ? Math.min(100, (consumedToDate / weeklyBudget) * 100) : 0

    return {
      perDayGoal: Math.round(perDayGoal),
      weeklyBudget: Math.round(weeklyBudget),
      consumedToDate,
      remainingDays,
      remainingBudget,
      pct,
    }
  }, [budget, dailyTotals, today])

  function handleLockDay() {
    if (!budget) return
    const perDayGoal = budget.dailyBudget
    const ref = parseLocalDate(today)
    const weekEnd = endOfWeek(ref, { weekStartsOn: 1 })
    const weekStart = startOfWeek(ref, { weekStartsOn: 1 })
    const weeklyBudget = perDayGoal * 7

    let consumedThrough = 0
    for (let i = 0; i <= differenceInCalendarDays(ref, weekStart); i++) {
      const dayKey = formatDate(addDays(weekStart, i))
      consumedThrough += dailyTotals.get(dayKey) ?? 0
    }

    const remaining = differenceInCalendarDays(weekEnd, ref)
    const leftover = Math.round(weeklyBudget - consumedThrough)
    const perDay = remaining > 0 ? Math.max(0, Math.round(leftover / remaining)) : null

    setAdjustedDailyTarget(perDay)
    setDayLocked(true)
  }

  function handleUnlockDay() {
    setDayLocked(false)
    setAdjustedDailyTarget(null)
  }

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

      {/* Budget bar */}
      <div className="animate-fade-up">
        {editingBudget ? (
          <div className="glass-subtle rounded-xl px-4 py-3 space-y-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Daily budget
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="50"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveBudget() }}
                placeholder="2000"
                className="h-8 w-28 text-sm bg-background/40 border-primary/15"
                autoFocus
              />
              <span className="text-[10px] text-muted-foreground/40">cal / day</span>
              <div className="flex items-center gap-1 ml-auto">
                <button onClick={saveBudget} className="p-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => { setEditingBudget(false); if (budget) setBudgetInput(String(Math.round(budget.dailyBudget))) }} className="p-1.5 rounded-md text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
                {budget && (
                  <button onClick={deleteBudget} className="p-1.5 rounded-md text-muted-foreground/20 hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : budget ? (
          <div className="glass-subtle rounded-xl overflow-hidden">
            <div className="px-4 py-3 space-y-2.5">
              {/* Top row — base budget + edit */}
              {!dayLocked && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Target className="h-3.5 w-3.5 text-red-400/70 shrink-0" />
                    <span className="text-sm font-semibold tabular-nums">
                      {weeklyAdjustment.perDayGoal.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-muted-foreground/40">cal / day</span>
                  </div>
                  <button onClick={() => setEditingBudget(true)} className="p-1 text-muted-foreground/25 hover:text-muted-foreground transition-colors">
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Locked state — adjusted target is hero */}
              {dayLocked && adjustedDailyTarget != null && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Target className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                    <span className="text-sm font-semibold tabular-nums text-primary">
                      {adjustedDailyTarget.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-muted-foreground/40">cal / day remaining</span>
                  </div>
                  <button onClick={() => setEditingBudget(true)} className="p-1 text-muted-foreground/25 hover:text-muted-foreground transition-colors">
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Progress bar */}
              <div className="h-1 w-full rounded-full bg-muted/15 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.min(weeklyAdjustment.pct, 100)}%`,
                    backgroundColor: weeklyAdjustment.pct > 100 ? "#f87171" : "#ef4444",
                    boxShadow: weeklyAdjustment.pct > 0 ? "0 0 6px oklch(0.6 0.2 25 / 25%)" : "none",
                  }}
                />
              </div>

              {/* Stats row */}
              <div className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground/40">
                <span>{weeklyAdjustment.consumedToDate.toLocaleString()} used</span>
                <span className={weeklyAdjustment.remainingBudget < 0 ? "text-red-400/80 font-medium" : ""}>
                  {weeklyAdjustment.remainingBudget.toLocaleString()} left
                </span>
                <span>{weeklyAdjustment.remainingDays}d left</span>
              </div>
            </div>

            {/* Lock / Unlock strip */}
            <button
              type="button"
              onClick={dayLocked ? handleUnlockDay : handleLockDay}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-medium uppercase tracking-wider transition-colors border-t",
                dayLocked
                  ? "bg-primary/5 border-primary/10 text-primary/70 hover:bg-primary/10"
                  : "border-border/20 text-muted-foreground/30 hover:text-muted-foreground/60 hover:bg-glass-highlight/10"
              )}
            >
              {dayLocked ? (
                <>
                  <Lock className="h-3 w-3" />
                  Day closed — unlock to edit
                </>
              ) : (
                <>
                  <Unlock className="h-3 w-3" />
                  Close day &amp; recalculate
                </>
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingBudget(true)}
            className="glass-subtle rounded-xl w-full flex items-center justify-center gap-1.5 py-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/30 hover:text-muted-foreground transition-colors"
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

            <Button
              type="button"
              size="lg"
              className="w-full gap-2"
              onClick={() => setLogFoodOpen(true)}
            >
              <Plus className="h-4 w-4 shrink-0" />
              Log food
            </Button>
            {draftMealItems.length > 0 && (
              <p className="mt-3 text-center text-[11px] text-muted-foreground lg:text-left">
                <span className="font-semibold tabular-nums text-foreground">{draftMealItems.length}</span> item
                {draftMealItems.length === 1 ? "" : "s"} in draft — tap Log food to continue
              </p>
            )}
          </div>

          <Dialog open={logFoodOpen} onOpenChange={setLogFoodOpen}>
            <DialogContent
              showCloseButton
              className={cn(
                "glass-frost flex max-h-[min(88vh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md",
                "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3"
              )}
            >
              {/* Header */}
              <div className="shrink-0 px-4 pt-4 pb-3 pr-12">
                <DialogHeader className="space-y-0">
                  <DialogTitle>{editingEntry ? "Edit entry" : "Log food"}</DialogTitle>
                  <DialogDescription className="sr-only">
                    {editingEntry ? "Edit a calorie entry" : "Add food to your daily log"}
                  </DialogDescription>
                </DialogHeader>
                {editingEntry && (
                  <p className="mt-1 truncate text-[10px] capitalize text-muted-foreground/60">
                    {format(parseLocalDate(editingEntry.date.split("T")[0]), "MMM d")} · {editingEntry.mealType}
                    {editingEntry.description && <> · {editingEntry.description}</>}
                  </p>
                )}
                <div className="mt-3 flex rounded-lg bg-muted/20 p-0.5">
                  {mealTypes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMealType(m)}
                      className={cn(
                        "flex-1 rounded-md py-1.5 text-[11px] font-medium capitalize transition-all duration-150",
                        mealType === m
                          ? "bg-background text-foreground shadow-sm shadow-black/10"
                          : "text-muted-foreground/50 hover:text-muted-foreground"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search — collapsed by default */}
              <div className="relative z-20 shrink-0 border-y border-border/20 px-4 py-2">
                <button
                  type="button"
                  onClick={() => setLogFoodSearchOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg py-1.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="truncate">Search foods</span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 opacity-50 transition-transform duration-200",
                      logFoodSearchOpen && "rotate-180"
                    )}
                  />
                </button>
                {logFoodSearchOpen && (
                  <div className="overflow-visible pt-2.5">
                    <FoodSearch onSelect={handleFoodSelect} compact />
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="relative z-0 min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-3">

                  {/* Saved meals — flat list, add mode only */}
                  {!editingEntry && (
                    <div>
                      {(filteredSavedMeals.length > 0 || showCreateMeal) && (
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                            Saved
                          </p>
                          <button
                            type="button"
                            onClick={() => { setShowCreateMeal(!showCreateMeal); setSaveMealError(null) }}
                            className="text-[10px] font-medium text-primary/50 hover:text-primary transition-colors"
                          >
                            {showCreateMeal ? "Cancel" : "+ New"}
                          </button>
                        </div>
                      )}

                      {showCreateMeal && (
                        <div
                          data-create-meal
                          className="glass-subtle rounded-lg p-3 mb-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200"
                          onKeyDownCapture={(e) => {
                            if (e.key === "Enter" && (e.target as HTMLElement).closest("[data-create-meal]")) {
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
                            className="h-8 bg-background/40 border-primary/15 text-xs"
                          />
                          <div className="grid grid-cols-4 gap-1.5">
                            <div className="space-y-0.5">
                              <Label className="text-[8px] uppercase tracking-wider text-muted-foreground/50">Cal *</Label>
                              <Input type="number" min="0" placeholder="0" value={newMealCal} onChange={(e) => setNewMealCal(e.target.value)} className="h-7 bg-background/40 border-primary/15 text-xs" />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[8px] uppercase tracking-wider text-muted-foreground/50">P</Label>
                              <Input type="number" min="0" placeholder="g" value={newMealProtein} onChange={(e) => setNewMealProtein(e.target.value)} className="h-7 bg-background/40 border-primary/15 text-xs" />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[8px] uppercase tracking-wider text-muted-foreground/50">C</Label>
                              <Input type="number" min="0" placeholder="g" value={newMealCarbs} onChange={(e) => setNewMealCarbs(e.target.value)} className="h-7 bg-background/40 border-primary/15 text-xs" />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[8px] uppercase tracking-wider text-muted-foreground/50">F</Label>
                              <Input type="number" min="0" placeholder="g" value={newMealFat} onChange={(e) => setNewMealFat(e.target.value)} className="h-7 bg-background/40 border-primary/15 text-xs" />
                            </div>
                          </div>
                          {saveMealError && <p className="text-[10px] text-destructive" role="alert">{saveMealError}</p>}
                          <Button type="button" size="sm" className="w-full h-7 text-xs" onClick={() => void handleCreateMeal()}>
                            Save
                          </Button>
                        </div>
                      )}

                      {filteredSavedMeals.length > 0 && (
                        <div className="space-y-0.5">
                          {filteredSavedMeals.map((meal) => (
                            <div
                              key={meal.id}
                              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-glass-highlight/15"
                            >
                              <button
                                type="button"
                                onClick={() => handleUseSavedMeal(meal)}
                                className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                              >
                                <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 shrink-0">
                                  <Plus className="h-2.5 w-2.5 text-primary/60" />
                                </div>
                                <span className="text-xs font-medium truncate">{meal.name}</span>
                              </button>
                              <span className="text-[10px] tabular-nums text-muted-foreground/40 shrink-0">
                                {meal.calories}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteSavedMeal(meal.id)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 shrink-0 transition-opacity"
                              >
                                <Trash2 className="h-2.5 w-2.5 text-muted-foreground/30" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Calorie input */}
                  <form id="log-food-form" onSubmit={handleSubmit} className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Input
                        id="calories"
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        placeholder="Calories"
                        value={calories}
                        onChange={(e) => setCalories(e.target.value)}
                        className="flex-1 min-w-0"
                        required
                      />
                      {([
                        { n: 250, label: "+250" },
                        { n: 500, label: "+500" },
                        { n: 1000, label: "+1k" },
                      ] as const).map(({ n, label }) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => addCalories(n)}
                          className="h-9 rounded-md border border-glass-border px-2 text-[10px] font-medium tabular-nums text-muted-foreground/50 hover:bg-glass-highlight/15 hover:text-foreground transition-colors sm:h-8"
                          title={`Add ${n.toLocaleString()} cal`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {showSavePrompt && description && calories && (
                        <button
                          type="button"
                          onClick={handleSaveCurrentAsFrequent}
                          className="flex items-center gap-1 rounded-md border border-dashed border-primary/20 px-2 py-1.5 text-[10px] font-medium text-primary/50 hover:text-primary hover:bg-primary/5 transition-colors"
                        >
                          <Star className="h-3 w-3" />
                          Save
                        </button>
                      )}
                      {!editingEntry && (
                        <Button type="submit" size="sm" className="flex-1 h-8">
                          {estimateCalDisplay != null
                            ? `Add ${estimateCalDisplay.toLocaleString()} cal`
                            : "Add to meal"}
                        </Button>
                      )}
                    </div>
                  </form>

                  {/* Draft items */}
                  {!editingEntry && draftMealItems.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40 mb-1.5">
                        Draft · {draftMealItems.length}
                      </p>
                      <div className="rounded-lg border border-glass-border/30 divide-y divide-glass-border/20 overflow-hidden">
                        {draftMealItems.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                            <div className="min-w-0">
                              <p className="truncate font-medium leading-tight">
                                {item.description || "Quick add"}
                              </p>
                              <p className="mt-0.5 text-[10px] capitalize tabular-nums text-muted-foreground/40">
                                {item.mealType} · {item.calories} cal
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setDraftMealItems((prev) => prev.filter((x) => x.id !== item.id))}
                              className="p-1 rounded hover:bg-destructive/10 shrink-0"
                            >
                              <X className="h-3 w-3 text-muted-foreground/30" />
                            </button>
                          </div>
                        ))}
                        <div className="px-3 py-1.5 text-[10px] tabular-nums font-medium text-muted-foreground/50 bg-glass-highlight/5">
                          {draftTotals.calories.toLocaleString()} cal
                          {(draftTotals.protein > 0 || draftTotals.carbs > 0 || draftTotals.fat > 0) && (
                            <span className="text-muted-foreground/30">
                              {" "}· P {Math.round(draftTotals.protein)}g · C {Math.round(draftTotals.carbs)}g · F {Math.round(draftTotals.fat)}g
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Footer — Post only when draft exists or posting; edit mode always */}
              {(editingEntry || draftMealItems.length > 0 || postingMeal) && (
                <div className="shrink-0 border-t border-border/30 px-4 py-2.5 bg-background/60 backdrop-blur-sm">
                  {editingEntry ? (
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="flex-1" size="sm" onClick={cancelEdit}>
                        Cancel
                      </Button>
                      <Button type="submit" form="log-food-form" className="flex-1 press-scale" size="sm">
                        Save
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      className="w-full press-scale h-8 text-xs"
                      size="sm"
                      disabled={postingMeal}
                      onClick={handlePostMealToDay}
                    >
                      {postingMeal
                        ? "Posting..."
                        : `Post meal · ${draftMealItems.length} item${draftMealItems.length === 1 ? "" : "s"}`}
                    </Button>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>

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
