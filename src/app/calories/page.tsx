"use client"

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { addDays, differenceInCalendarDays, endOfWeek, format, startOfWeek, subDays } from "date-fns"
import { ChevronDown, Search, Trash2, Plus, Star, X, Pencil, Target, Check } from "lucide-react"
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
import { useUser } from "@/context/UserContext"
import { PageHeader } from "@/components/PageHeader"
import { PageStatTile } from "@/components/PageStatTile"
import { FoodSearch } from "@/components/FoodSearch"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { averageOnLoggedDays, cn, formatDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { HistoryArchivedNote, HistoryEarlierSection } from "@/components/HistoryEarlierSection"
import { partitionHistoryDayGroups } from "@/lib/history-display"
import { CALORIES_LOG_FOOD_QUERY } from "@/lib/calories-log-deep-link"
import { isVacationBlockingCalendarDay } from "@/lib/vacation-mode"

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
  /** Single tag or comma-separated tags (breakfast, lunch, …) */
  mealType: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  useCount: number
}

interface WeeklyGoal {
  id: string
  weeklyTarget: number
}

interface DraftMealItem {
  id: string
  mealType: string
  description: string | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  /** Set when added from a saved meal — used for list highlight */
  savedMealId?: string
}

type PendingDelete =
  | { kind: "calorieEntry"; id: string; label: string }
  | { kind: "savedMeal"; id: string; name: string }

const mealTypes = ["breakfast", "lunch", "dinner", "snack"] as const
const mealTypeSet = new Set<string>(mealTypes)

function OpenLogFoodFromQuery({ setOpen }: { setOpen: (open: boolean) => void }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const v = searchParams.get(CALORIES_LOG_FOOD_QUERY)
    if (v !== "1" && v?.toLowerCase() !== "true") return
    setOpen(true)
    const next = new URLSearchParams(searchParams.toString())
    next.delete(CALORIES_LOG_FOOD_QUERY)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [pathname, router, searchParams, setOpen])

  return null
}

function savedMealTagList(meal: Pick<SavedMeal, "mealType">): string[] {
  if (!meal.mealType?.trim()) return []
  return [
    ...new Set(
      meal.mealType
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => mealTypeSet.has(t))
    ),
  ]
}

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

/** Over budget (red) only at ≥101% of target */
const OVER_TARGET_RATIO = 1.01

/** Consumed vs daily target: over = red at ≥101%; on track = emerald (≥95%); under = sky */
function calorieTargetTextClass(consumed: number, target: number): string {
  if (target <= 0) return "text-foreground"
  const r = consumed / target
  if (r >= OVER_TARGET_RATIO) return "text-red-500 dark:text-red-400"
  if (r >= 0.95) return "text-emerald-600 dark:text-emerald-400"
  return "text-sky-600 dark:text-sky-400/90"
}

/** Weekly consumed vs weekly goal (same bands) */
function weeklyProgressTextClass(consumed: number, weeklyGoal: number): string {
  if (weeklyGoal <= 0) return "text-foreground"
  return calorieTargetTextClass(consumed, weeklyGoal)
}

/** Calories still available today — red “over” only at ≥101% of today’s target */
function remainingVsTargetTextClass(consumed: number, target: number): string {
  if (target <= 0) return "text-muted-foreground/40"
  const r = consumed / target
  if (r >= OVER_TARGET_RATIO) return "text-red-400/90 font-medium"
  if (r >= 0.95) return "text-emerald-600 dark:text-emerald-400 font-medium"
  return "text-sky-600/80 dark:text-sky-400/80"
}

/** Circular ring stroke — same bands as the calorie number */
function todayProgressRingStrokeHex(consumed: number, target: number): string {
  if (target <= 0) return "#38bdf8"
  const r = consumed / target
  if (r >= OVER_TARGET_RATIO) return "#f87171"
  if (r >= 0.95) return "#059669"
  return "#0284c7"
}

/** Rolling daily slice for any calendar day (same math as the weekly goal card). */
function adaptiveDayTargetForDate(
  dateKey: string,
  weeklyTarget: number,
  dailyTotals: Map<string, number>
): number {
  const ref = parseLocalDate(dateKey)
  const weekStart = startOfWeek(ref, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(ref, { weekStartsOn: 1 })
  let consumedPriorDays = 0
  const daysPast = differenceInCalendarDays(ref, weekStart)
  for (let i = 0; i < daysPast; i++) {
    consumedPriorDays += dailyTotals.get(formatDate(addDays(weekStart, i))) ?? 0
  }
  const daysLeft = differenceInCalendarDays(weekEnd, ref) + 1
  const remaining = Math.round(weeklyTarget - consumedPriorDays)
  return daysLeft > 0 ? Math.max(0, Math.round(remaining / daysLeft)) : 0
}

function summarizeDay(items: CalorieEntry[]) {
  let calories = 0
  let protein = 0
  let carbs = 0
  let fat = 0
  let hasP = false
  let hasC = false
  let hasF = false
  for (const e of items) {
    calories += e.calories
    if (e.protein != null) {
      protein += e.protein
      hasP = true
    }
    if (e.carbs != null) {
      carbs += e.carbs
      hasC = true
    }
    if (e.fat != null) {
      fat += e.fat
      hasF = true
    }
  }
  const round = (n: number) => Math.round(n * 10) / 10
  return {
    calories,
    protein: hasP ? round(protein) : null,
    carbs: hasC ? round(carbs) : null,
    fat: hasF ? round(fat) : null,
    count: items.length,
  }
}

function CaloriesHistoryDayAccordion({
  dateKey,
  items,
  today,
  yesterday,
  realToday,
  expandedDays,
  onToggleDay,
  lockOpen,
  weeklyGoal,
  dailyTotals,
  startEdit,
  requestDeleteCalorieEntry,
}: {
  dateKey: string
  items: CalorieEntry[]
  today: string
  yesterday: string
  realToday: string
  expandedDays: ReadonlySet<string>
  onToggleDay: (dateKey: string) => void
  lockOpen: boolean
  weeklyGoal: WeeklyGoal | null
  dailyTotals: Map<string, number>
  startEdit: (entry: CalorieEntry) => void
  requestDeleteCalorieEntry: (id: string, label: string) => void
}) {
  const summary = summarizeDay(items)
  const open = lockOpen || expandedDays.has(dateKey)
  const label = dateGroupLabel(dateKey, today, yesterday, realToday)
  const subDate =
    dateKey === today || dateKey === yesterday ? format(parseLocalDate(dateKey), "EEE, MMM d") : null
  const dayTarget =
    weeklyGoal != null ? adaptiveDayTargetForDate(dateKey, weeklyGoal.weeklyTarget, dailyTotals) : 0
  const historyDayCalClass =
    weeklyGoal != null && dayTarget > 0
      ? calorieTargetTextClass(summary.calories, dayTarget)
      : "text-foreground"

  return (
    <div className="rounded-lg overflow-hidden border border-glass-border/30 bg-glass-highlight/5 transition-colors">
      <button
        type="button"
        onClick={() => {
          if (!lockOpen) onToggleDay(dateKey)
        }}
        aria-expanded={open}
        className="w-full text-left px-3.5 py-3 flex items-start gap-3 transition-colors hover:bg-glass-highlight/25 active:bg-glass-highlight/35"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold tracking-tight text-foreground">{label}</span>
                {subDate && (
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/55 tabular-nums">
                    {subDate}
                  </span>
                )}
              </div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                {summary.count} {summary.count === 1 ? "entry" : "entries"}
                {(summary.protein != null || summary.carbs != null || summary.fat != null) && (
                  <>
                    <span className="text-muted-foreground/25"> · </span>
                    <span className="normal-case font-normal tracking-normal text-muted-foreground/65">
                      {summary.protein != null && <span className="tabular-nums">P {summary.protein}g</span>}
                      {summary.protein != null && (summary.carbs != null || summary.fat != null) && (
                        <span className="text-muted-foreground/30"> · </span>
                      )}
                      {summary.carbs != null && <span className="tabular-nums">C {summary.carbs}g</span>}
                      {summary.carbs != null && summary.fat != null && (
                        <span className="text-muted-foreground/30"> · </span>
                      )}
                      {summary.fat != null && <span className="tabular-nums">F {summary.fat}g</span>}
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-start gap-2 shrink-0">
              <div className="text-right">
                <p
                  className={cn(
                    "text-lg font-bold tabular-nums leading-none transition-colors",
                    historyDayCalClass
                  )}
                >
                  {summary.calories.toLocaleString()}
                </p>
                <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/45 mt-1">
                  kcal
                </p>
              </div>
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-glass-border/50 bg-background/30 transition-transform duration-200",
                  open && "bg-primary/10 border-primary/25"
                )}
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground/50 transition-transform duration-200",
                    open && "rotate-180 text-primary/80"
                  )}
                />
              </span>
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-glass-border/30 bg-muted/15">
          <ul className="divide-y divide-glass-border/20">
            {items.map((entry) => (
              <li
                key={entry.id}
                className="flex items-stretch gap-3 px-3 py-2.5 transition-colors hover:bg-glass-highlight/10 group/row"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-glass-border/40 bg-[#ef4444]/8">
                  <span className="text-sm font-semibold capitalize text-[#ef4444]">
                    {entry.mealType.charAt(0)}
                  </span>
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                    <span
                      className={cn("text-sm font-semibold tabular-nums transition-colors", historyDayCalClass)}
                    >
                      {entry.calories}{" "}
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                        cal
                      </span>
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/55 capitalize">
                      {entry.mealType}
                    </span>
                  </div>
                  {(entry.protein != null || entry.carbs != null || entry.fat != null) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {entry.protein != null && (
                        <span className="text-[10px] font-medium tabular-nums rounded-[3px] border border-glass-border/35 bg-muted/30 px-1.5 py-0.5 text-muted-foreground">
                          P {entry.protein}g
                        </span>
                      )}
                      {entry.carbs != null && (
                        <span className="text-[10px] font-medium tabular-nums rounded-[3px] border border-glass-border/35 bg-muted/30 px-1.5 py-0.5 text-muted-foreground">
                          C {entry.carbs}g
                        </span>
                      )}
                      {entry.fat != null && (
                        <span className="text-[10px] font-medium tabular-nums rounded-[3px] border border-glass-border/35 bg-muted/30 px-1.5 py-0.5 text-muted-foreground">
                          F {entry.fat}g
                        </span>
                      )}
                    </div>
                  )}
                  {entry.description && (
                    <p className="mt-1 text-xs leading-snug text-muted-foreground/75 line-clamp-2">
                      {entry.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4 shrink-0 self-center opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => startEdit(entry)}
                    className="history-row-edit"
                    title="Edit"
                    aria-label="Edit entry"
                  >
                    <Pencil />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      requestDeleteCalorieEntry(
                        entry.id,
                        entry.description?.trim() || `${entry.calories} cal · ${entry.mealType}`
                      )
                    }
                    className="history-row-delete-row"
                    aria-label="Delete entry"
                  >
                    <Trash2 />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
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
  const [newMealTags, setNewMealTags] = useState<string[]>(["lunch"])
  const [editingSavedMealId, setEditingSavedMealId] = useState<string | null>(null)
  const [editSavedName, setEditSavedName] = useState("")
  const [editSavedCal, setEditSavedCal] = useState("")
  const [editSavedProtein, setEditSavedProtein] = useState("")
  const [editSavedCarbs, setEditSavedCarbs] = useState("")
  const [editSavedFat, setEditSavedFat] = useState("")
  const [editSavedTags, setEditSavedTags] = useState<string[]>([])
  const [editSavedError, setEditSavedError] = useState<string | null>(null)
  const [savingSavedMealEdit, setSavingSavedMealEdit] = useState(false)
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [saveMealError, setSaveMealError] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<CalorieEntry | null>(null)
  const [draftMealItems, setDraftMealItems] = useState<DraftMealItem[]>([])
  const [postingMeal, setPostingMeal] = useState(false)
  const [weeklyGoal, setWeeklyGoal] = useState<WeeklyGoal | null>(null)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState("")
  
  const [logFoodOpen, setLogFoodOpen] = useState(false)
  const [logFoodSearchOpen, setLogFoodSearchOpen] = useState(false)
  const [logFoodManualOpen, setLogFoodManualOpen] = useState(false)
  const [flashSavedMealId, setFlashSavedMealId] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set())
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [pendingDeleteBusy, setPendingDeleteBusy] = useState(false)

  const toggleHistoryDay = useCallback((dateKey: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(dateKey)) next.delete(dateKey)
      else next.add(dateKey)
      return next
    })
  }, [])

  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const today = activeDate
  const yesterday = formatDate(subDays(parseLocalDate(activeDate), 1))
  const realToday = formatDate(new Date())

  const vacationBlocksLog = useMemo(
    () => isVacationBlockingCalendarDay(user?.vacationResumeDate, today),
    [user?.vacationResumeDate, today]
  )

  const vacationBlocksEditingEntry = useMemo(
    () =>
      editingEntry
        ? isVacationBlockingCalendarDay(
            user?.vacationResumeDate,
            editingEntry.date.split("T")[0]
          )
        : false,
    [user?.vacationResumeDate, editingEntry]
  )

  const vacationResumeLabel =
    user?.vacationResumeDate != null && user.vacationResumeDate !== ""
      ? format(parseLocalDate(user.vacationResumeDate), "MMM d, yyyy")
      : null

  const fetchSavedMeals = useCallback(async () => {
    try {
      const r = await apiFetch("/api/saved-meals")
      const data = await r.json()
      setSavedMeals(Array.isArray(data) ? data : [])
    } catch {
      setSavedMeals([])
    }
  }, [])

  useEffect(() => {
    if (!logFoodOpen) {
      setLogFoodSearchOpen(false)
      setLogFoodManualOpen(false)
      setEditingSavedMealId(null)
      setEditSavedError(null)
    }
  }, [logFoodOpen])

  useEffect(() => {
    if (!pendingDelete) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pendingDeleteBusy) setPendingDelete(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pendingDelete, pendingDeleteBusy])

  useEffect(() => {
    if (!logFoodOpen) return
    const html = document.documentElement
    const body = document.body
    const prevHtml = html.style.overflow
    const prevBody = body.style.overflow
    html.style.overflow = "hidden"
    body.style.overflow = "hidden"
    return () => {
      html.style.overflow = prevHtml
      body.style.overflow = prevBody
    }
  }, [logFoodOpen])

  useEffect(() => {
    apiFetch("/api/calories")
      .then(async (r) => {
        const data = await r.json()
        setEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setEntries([]))
    fetchSavedMeals()
  }, [fetchSavedMeals])

  useEffect(() => {
    apiFetch("/api/goals?category=calories")
      .then(async (r) => {
        const data = await r.json()
        if (data && typeof data.target === "number") {
          setWeeklyGoal({ id: data.id, weeklyTarget: data.target })
          setGoalInput(String(Math.round(data.target)))
        } else {
          setWeeklyGoal(null)
        }
      })
      .catch(() => setWeeklyGoal(null))
  }, [])

  /** Saved items tagged for the selected meal slot (breakfast / lunch / …). */
  const displayedSavedMeals = useMemo(() => {
    const mt = mealType.toLowerCase()
    return savedMeals.filter((m) => savedMealTagList(m).includes(mt))
  }, [savedMeals, mealType])

  const { dailyTotals, chartData, weekTotal, avg7, bestDay } = useMemo(() => {
    const dailyTotals = new Map<string, number>()
    for (const e of entries) {
      const d = e.date.split("T")[0]
      dailyTotals.set(d, (dailyTotals.get(d) ?? 0) + e.calories)
    }

    const days = Array.from({ length: 7 }, (_, i) =>
      subDays(parseLocalDate(activeDate), 6 - i)
    )
    let weekSum = 0
    const dailyLast7: number[] = []
    const chartData = days.map((d) => {
      const key = formatDate(d)
      const total = dailyTotals.get(key) ?? 0
      weekSum += total
      dailyLast7.push(total)
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
      avg7: averageOnLoggedDays(dailyLast7),
      bestDay: { value: bestVal, key: bestKey },
    }
  }, [entries, activeDate])

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

  const historyDisplay = useMemo(
    () => partitionHistoryDayGroups(historyGroups, (g) => g.dateKey, today),
    [historyGroups, today]
  )

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
    if (vacationBlocksLog) return
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
      if (vacationBlocksEditingEntry) return
      const res = await apiFetch("/api/calories", {
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

  function requestDeleteCalorieEntry(id: string, summary?: string) {
    const detail =
      summary && summary.trim().length > 0
        ? summary.trim().length > 90
          ? `${summary.trim().slice(0, 90)}…`
          : summary.trim()
        : null
    setPendingDelete({
      kind: "calorieEntry",
      id,
      label: detail ?? "this log entry",
    })
  }

  async function executePendingDelete() {
    if (!pendingDelete || pendingDeleteBusy) return
    setPendingDeleteBusy(true)
    try {
      if (pendingDelete.kind === "calorieEntry") {
        const id = pendingDelete.id
        const res = await apiFetch(`/api/calories?id=${id}`, { method: "DELETE" })
        if (res.ok) {
          setEntries((prev) => prev.filter((e) => e.id !== id))
          setEditingEntry((cur) => {
            if (cur?.id === id) queueMicrotask(() => cancelEdit())
            return cur?.id === id ? null : cur
          })
        }
      } else {
        const id = pendingDelete.id
        const res = await apiFetch(`/api/saved-meals?id=${id}`, { method: "DELETE" })
        if (res.ok) {
          setSavedMeals((prev) => prev.filter((m) => m.id !== id))
          setEditingSavedMealId((cur) => (cur === id ? null : cur))
          setDraftMealItems((prev) => prev.filter((i) => i.savedMealId !== id))
        }
      }
      setPendingDelete(null)
    } finally {
      setPendingDeleteBusy(false)
    }
  }

  function handleUseSavedMeal(meal: SavedMeal) {
    if (vacationBlocksLog) return
    const alreadyIn = draftMealItems.some((i) => i.savedMealId === meal.id)
    if (alreadyIn) {
      setDraftMealItems((prev) => prev.filter((i) => i.savedMealId !== meal.id))
      return
    }
    const item: DraftMealItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mealType,
      description: meal.name,
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
      savedMealId: meal.id,
    }
    setFlashSavedMealId(meal.id)
    window.setTimeout(() => setFlashSavedMealId(null), 900)
    setDraftMealItems((prev) => [...prev, item])
    void apiFetch(`/api/saved-meals?id=${meal.id}`, { method: "PATCH" })
      .then(() => fetchSavedMeals())
      .catch(() => {})
  }

  function openEditSavedMeal(meal: SavedMeal) {
    setSaveMealError(null)
    setShowCreateMeal(false)
    setEditingSavedMealId(meal.id)
    setEditSavedError(null)
    setEditSavedName(meal.name)
    setEditSavedCal(String(meal.calories))
    setEditSavedProtein(meal.protein != null ? String(meal.protein) : "")
    setEditSavedCarbs(meal.carbs != null ? String(meal.carbs) : "")
    setEditSavedFat(meal.fat != null ? String(meal.fat) : "")
    setEditSavedTags(savedMealTagList(meal))
  }

  function cancelEditSavedMeal() {
    setEditingSavedMealId(null)
    setEditSavedError(null)
  }

  async function handleUpdateSavedMeal() {
    if (!editingSavedMealId || savingSavedMealEdit) return
    setEditSavedError(null)
    if (!editSavedName.trim() || !editSavedCal.trim()) {
      setEditSavedError("Name and calories are required.")
      return
    }
    if (editSavedTags.length === 0) {
      setEditSavedError("Pick at least one meal tag.")
      return
    }
    setSavingSavedMealEdit(true)
    try {
      const res = await apiFetch(`/api/saved-meals?id=${editingSavedMealId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editSavedName.trim(),
          mealTags: editSavedTags,
          calories: editSavedCal,
          protein: editSavedProtein || null,
          carbs: editSavedCarbs || null,
          fat: editSavedFat || null,
        }),
      })
      if (!res.ok) {
        let message = "Could not update meal."
        try {
          const err = await res.json()
          if (err && typeof err.error === "string") message = err.error
        } catch {
          /* ignore */
        }
        setEditSavedError(message)
        return
      }
      await fetchSavedMeals()
      cancelEditSavedMeal()
    } finally {
      setSavingSavedMealEdit(false)
    }
  }

  async function handlePostMealToDay() {
    if (vacationBlocksLog || draftMealItems.length === 0 || postingMeal) return
    setPostingMeal(true)
    try {
      const created: CalorieEntry[] = []
      for (const item of draftMealItems) {
        const res = await apiFetch("/api/calories", {
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
    if (newMealTags.length === 0) {
      setSaveMealError("Pick at least one meal tag (breakfast, lunch, …).")
      return
    }

    const res = await apiFetch("/api/saved-meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newMealName.trim(),
        mealTags: newMealTags,
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
    setNewMealTags([mealType])
  }

  async function handleSaveCurrentAsFrequent() {
    if (!description.trim() || !calories.trim()) return

    await apiFetch("/api/saved-meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: description.trim(),
        mealTags: [mealType],
        calories,
        protein: protein || null,
        carbs: carbs || null,
        fat: fat || null,
      }),
    })

    fetchSavedMeals()
    setShowSavePrompt(false)
  }

  function requestDeleteSavedMeal(id: string, name: string) {
    setPendingDelete({ kind: "savedMeal", id, name })
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

  const savedMealIdsInDraft = useMemo(
    () =>
      new Set(
        draftMealItems
          .map((i) => i.savedMealId)
          .filter((x): x is string => Boolean(x))
      ),
    [draftMealItems]
  )

  const weekPlan = useMemo(() => {
    if (!weeklyGoal) return null
    const wt = weeklyGoal.weeklyTarget

    const ref = parseLocalDate(today)
    const weekStart = startOfWeek(ref, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(ref, { weekStartsOn: 1 })

    let consumedPriorDays = 0
    const daysPast = differenceInCalendarDays(ref, weekStart)
    for (let i = 0; i < daysPast; i++) {
      consumedPriorDays += dailyTotals.get(formatDate(addDays(weekStart, i))) ?? 0
    }

    const consumedToday = todayTotal
    const consumedTotal = consumedPriorDays + consumedToday
    const daysLeft = differenceInCalendarDays(weekEnd, ref) + 1
    const remaining = Math.round(wt - consumedPriorDays)
    const todayTarget = daysLeft > 0 ? Math.max(0, Math.round(remaining / daysLeft)) : 0
    const todayRemaining = Math.max(0, todayTarget - consumedToday)
    const pct = wt > 0 ? Math.min(100, (consumedTotal / wt) * 100) : 0
    const overUnder = consumedTotal - wt

    return {
      weeklyTarget: wt,
      consumedTotal,
      consumedToday,
      todayTarget,
      todayRemaining,
      remaining,
      daysLeft,
      pct,
      overUnder,
    }
  }, [weeklyGoal, dailyTotals, today, todayTotal])

  async function saveGoal() {
    const val = parseFloat(goalInput)
    if (Number.isNaN(val) || val <= 0) return

    const method = weeklyGoal ? "PUT" : "POST"
    const payload = weeklyGoal
      ? { id: weeklyGoal.id, target: val, unit: "cal", goalType: "weekly", direction: "down" }
      : { category: "calories", goalType: "weekly", direction: "down", target: val, unit: "cal", active: true }

    const res = await apiFetch("/api/goals", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const saved = await res.json()
      setWeeklyGoal({ id: saved.id, weeklyTarget: saved.target })
      setGoalInput(String(Math.round(saved.target)))
      setEditingGoal(false)
    }
  }

  async function deleteGoal() {
    if (!weeklyGoal) return
    const res = await apiFetch(`/api/goals?id=${weeklyGoal.id}`, { method: "DELETE" })
    if (res.ok) {
      setWeeklyGoal(null)
      setGoalInput("")
      setEditingGoal(false)
    }
  }

  const todayRing =
    weekPlan != null
      ? {
          radius: 56,
          circumference: 2 * Math.PI * 56,
          progress:
            weekPlan.todayTarget > 0
              ? Math.min(1, weekPlan.consumedToday / weekPlan.todayTarget)
              : 0,
          stroke: todayProgressRingStrokeHex(weekPlan.consumedToday, weekPlan.todayTarget),
        }
      : null

  if (vacationBlocksLog && vacationResumeLabel) {
    return (
      <>
        <Suspense fallback={null}>
          <OpenLogFoodFromQuery setOpen={setLogFoodOpen} />
        </Suspense>
        <div className="space-y-6">
          <PageHeader title="Calories" />
          <div className="glass rounded-2xl border border-amber-500/20 bg-amber-500/5 p-8 text-center space-y-4 max-w-lg mx-auto">
            <p className="text-sm text-amber-100/95 leading-relaxed">
              Vacation mode is on for this day. The calories log is hidden until{" "}
              <span className="font-semibold tabular-nums">{vacationResumeLabel}</span>.
            </p>
            <p className="text-xs text-muted-foreground/80">
              Adjust your return date or turn vacation off in Settings.
            </p>
            <Link
              href="/more"
              className={cn(buttonVariants({ variant: "glass", size: "sm" }), "mt-2 inline-flex")}
            >
              Open Settings
            </Link>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Suspense fallback={null}>
        <OpenLogFoodFromQuery setOpen={setLogFoodOpen} />
      </Suspense>
      <div className="space-y-6">
      <PageHeader title="Calories" />

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none animate-fade-up">
        <PageStatTile className="flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            7-Day Avg
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {Math.round(avg7).toLocaleString()}
          </span>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">avg on logged days</p>
        </PageStatTile>
        <PageStatTile className="flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Week Total
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {weekTotal.toLocaleString()}
          </span>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">last 7 days</p>
        </PageStatTile>
        <PageStatTile className="flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Best Day
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {bestDay.value > 0 ? bestDay.value.toLocaleString() : "—"}
          </span>
          {bestDaySub && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{bestDaySub}</p>
          )}
        </PageStatTile>
      </div>

      {/* Today: ring + weekly stats + log (combined) */}
      <div className="animate-fade-up">
        {editingGoal ? (
          <div className="glass rounded-2xl border border-border/20 p-5 lg:p-6 shadow-sm">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Weekly calorie goal
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min="0"
                step="500"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveGoal() }}
                placeholder="14000"
                className="h-9 w-32 text-sm bg-background/40 border-primary/15"
                autoFocus
              />
              <span className="text-[10px] text-muted-foreground/40">cal / week</span>
              {goalInput && parseFloat(goalInput) > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground/30">≈ {Math.round(parseFloat(goalInput) / 7).toLocaleString()} / day</span>
              )}
              <div className="flex items-center gap-1 ml-auto">
                <button type="button" onClick={saveGoal} className="p-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => { setEditingGoal(false); if (weeklyGoal) setGoalInput(String(Math.round(weeklyGoal.weeklyTarget))) }} className="p-1.5 rounded-md text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
                {weeklyGoal && (
                  <button type="button" onClick={deleteGoal} className="p-1.5 rounded-md text-muted-foreground/20 hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : weekPlan && todayRing ? (
          <div className="glass relative overflow-hidden rounded-3xl border border-border/20 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-primary/[0.03] p-6 shadow-[inset_0_1px_0_0_oklch(1_0_0/10%),0_22px_56px_-20px_oklch(0_0_0/42%)] lg:p-8 dark:border-[oklch(1_0_0/9%)] dark:from-glass-highlight/[0.1] dark:to-primary/[0.05] dark:shadow-[inset_0_1px_0_0_oklch(1_0_0/12%),0_28px_72px_-24px_oklch(0_0_0/62%)]">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-8%,oklch(1_0_0/14%),transparent_58%)] dark:bg-[radial-gradient(ellipse_90%_50%_at_50%_-6%,oklch(1_0_0/10%),transparent_55%)]"
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-glass-highlight/45 to-transparent dark:via-white/12" aria-hidden />
            <div className="relative z-[1] flex flex-col items-stretch gap-8 lg:flex-row lg:items-center lg:gap-10">
              <div className="flex justify-center lg:justify-start lg:shrink-0">
                <div className="relative aspect-square w-full max-w-[min(100%,280px)] min-h-[220px] min-w-[220px] sm:min-h-[260px] sm:min-w-[260px] overflow-visible">
                  <div
                    className="pointer-events-none absolute inset-[9%] rounded-full blur-[1px]"
                    style={{
                      background: `radial-gradient(circle at 50% 42%, ${todayRing.stroke}22 0%, ${todayRing.stroke}08 38%, transparent 68%)`,
                    }}
                    aria-hidden
                  />
                  <svg
                    className="relative z-[1] h-full w-full -rotate-90 overflow-visible"
                    viewBox="0 0 128 128"
                    aria-hidden
                  >
                    <circle
                      cx="64"
                      cy="64"
                      r={todayRing.radius}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="7"
                      className="text-muted/24"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r={todayRing.radius}
                      fill="none"
                      stroke={todayRing.stroke}
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={todayRing.circumference}
                      strokeDashoffset={todayRing.circumference * (1 - todayRing.progress)}
                      className="transition-[stroke-dashoffset] duration-700 ease-out"
                      style={{
                        filter: [
                          `drop-shadow(0 0 1px ${todayRing.stroke})`,
                          `drop-shadow(0 0 4px ${todayRing.stroke}33)`,
                        ].join(" "),
                      }}
                    />
                  </svg>
                  <div className="pointer-events-none absolute inset-0 z-[2] flex flex-col items-center justify-center px-5">
                    <p
                      className={cn(
                        "text-4xl font-bold tabular-nums tracking-[-0.02em] transition-colors sm:text-5xl dark:[text-shadow:0_1px_0_oklch(0_0_0/35%)]",
                        calorieTargetTextClass(todayTotal, weekPlan.todayTarget)
                      )}
                    >
                      {todayTotal.toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/40 sm:text-[11px]">
                      calories
                    </p>
                    <p className="mt-3 max-w-[13rem] text-center text-[11px] leading-snug text-muted-foreground/60 sm:text-xs">
                      Target{" "}
                      <span className="font-semibold tabular-nums text-foreground/85">
                        {weekPlan.todayTarget.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground/35"> today</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/38">
                      Today
                    </p>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums leading-snug">
                      <span className={cn("font-medium transition-colors", calorieTargetTextClass(weekPlan.consumedToday, weekPlan.todayTarget))}>
                        {weekPlan.consumedToday.toLocaleString()}{" "}
                        <span className="text-muted-foreground/50 font-normal">eaten</span>
                      </span>
                      <span className={cn("font-medium transition-colors", remainingVsTargetTextClass(weekPlan.consumedToday, weekPlan.todayTarget))}>
                        {weekPlan.todayRemaining.toLocaleString()}{" "}
                        <span className="text-muted-foreground/50 font-normal">left</span>
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingGoal(true)}
                    className="rounded-xl border border-border/25 bg-background/45 p-2 text-muted-foreground/45 shadow-[inset_0_1px_0_0_oklch(1_0_0/8%)] backdrop-blur-sm transition-colors hover:border-border/45 hover:bg-background/60 hover:text-foreground dark:bg-background/25 dark:shadow-[inset_0_1px_0_0_oklch(1_0_0/6%)] dark:hover:bg-background/40"
                    title="Edit weekly goal"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border/20 bg-gradient-to-b from-background/40 to-background/[0.12] px-3 py-3 text-center tabular-nums shadow-[inset_0_1px_0_0_oklch(1_0_0/10%)] sm:gap-3 sm:px-4 dark:from-background/30 dark:to-background/[0.08] dark:shadow-[inset_0_1px_0_0_oklch(1_0_0/6%)]">
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/32">Week</p>
                    <p className="text-[12px] font-semibold leading-tight text-foreground/90">
                      <span className={cn("transition-colors", weeklyProgressTextClass(weekPlan.consumedTotal, weekPlan.weeklyTarget))}>
                        {weekPlan.consumedTotal.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground/30 font-normal"> / {weekPlan.weeklyTarget.toLocaleString()}</span>
                    </p>
                  </div>
                  <div className="border-x border-border/20">
                    <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/32">Left</p>
                    <p
                      className={cn(
                        "text-[12px] font-semibold leading-tight",
                        weekPlan.weeklyTarget > 0 &&
                          weekPlan.consumedTotal / weekPlan.weeklyTarget >= OVER_TARGET_RATIO
                          ? "text-red-400/85"
                          : "text-foreground/90"
                      )}
                    >
                      {Math.abs(weekPlan.weeklyTarget - weekPlan.consumedTotal).toLocaleString()}
                      <span className="text-muted-foreground/40 font-normal">
                        {" "}
                        {weekPlan.overUnder > 0 ? "over" : "left"}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/32">Days</p>
                    <p className="text-[12px] font-semibold leading-tight text-foreground/90">{weekPlan.daysLeft}</p>
                  </div>
                </div>

                {today > realToday && (
                  <p className="text-[10px] uppercase tracking-wider text-primary/75">
                    Planning mode (date selector)
                  </p>
                )}

                <Button
                  type="button"
                  variant="glass"
                  size="lg"
                  className="w-full gap-2"
                  disabled={vacationBlocksLog && draftMealItems.length === 0}
                  onClick={() => setLogFoodOpen(true)}
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  Log food
                </Button>
                {draftMealItems.length > 0 && (
                  <p className="text-center text-[11px] text-muted-foreground lg:text-left">
                    <span className="font-semibold tabular-nums text-foreground">{draftMealItems.length}</span> item
                    {draftMealItems.length === 1 ? "" : "s"} in draft — tap Log food to continue
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass rounded-2xl border border-border/20 p-6 lg:p-7 shadow-sm">
            <div className="text-center lg:text-left">
              <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/45">Today</p>
              <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight text-foreground">{todayTotal.toLocaleString()}</p>
              <p className="mt-1 text-sm text-muted-foreground">calories</p>
              {today > realToday && (
                <p className="mt-2 text-[10px] uppercase tracking-wider text-primary/80">Planning mode (date selector)</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditingGoal(true)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/40 py-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40 transition-colors hover:border-primary/25 hover:text-muted-foreground"
            >
              <Target className="h-3.5 w-3.5" />
              Set weekly calorie goal
            </button>
            <Button
              type="button"
              variant="glass"
              size="lg"
              className="mt-4 w-full gap-2"
              disabled={vacationBlocksLog && draftMealItems.length === 0}
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
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up stagger-2">
        <div className="space-y-6 min-w-0">
          <Dialog open={logFoodOpen} onOpenChange={setLogFoodOpen}>
            <DialogContent
              showCloseButton
              className={cn(
                "glass-frost flex min-h-0 flex-col gap-0 overflow-hidden p-0",
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
                {vacationBlocksLog && !editingEntry && vacationResumeLabel && (
                  <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] leading-snug text-amber-100/85">
                    Vacation mode until{" "}
                    <span className="font-semibold tabular-nums">{vacationResumeLabel}</span>. Clear the
                    draft or wait until then to post.
                  </p>
                )}
                {editingEntry && vacationBlocksEditingEntry && vacationResumeLabel && (
                  <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] leading-snug text-amber-100/85">
                    This day is in vacation mode (before{" "}
                    <span className="font-semibold tabular-nums">{vacationResumeLabel}</span>). Editing is
                    disabled.
                  </p>
                )}
                <div className="mt-3 flex rounded-lg bg-muted/20 p-0.5">
                  {mealTypes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={vacationBlocksLog && !editingEntry}
                      onClick={() => setMealType(m)}
                      className={cn(
                        "flex-1 rounded-md py-2.5 text-xs font-medium capitalize transition-all duration-150",
                        mealType === m
                          ? "bg-background text-foreground shadow-sm shadow-black/10"
                          : "text-muted-foreground/50 hover:text-muted-foreground",
                        vacationBlocksLog && !editingEntry && "opacity-45"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search — collapsed by default */}
              <div className="relative z-20 shrink-0 border-y border-border/20 px-4 py-2.5">
                <button
                  type="button"
                  disabled={vacationBlocksLog && !editingEntry}
                  onClick={() => setLogFoodSearchOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
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
              <div className="relative z-0 min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-4">

                  {/* Saved meals — flat list, add mode only */}
                  {!editingEntry && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                          Saved
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setSaveMealError(null)
                            setEditingSavedMealId(null)
                            if (!showCreateMeal) setNewMealTags([mealType])
                            setShowCreateMeal(!showCreateMeal)
                          }}
                          className="min-h-10 shrink-0 rounded-lg border border-primary/25 bg-primary/10 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-primary transition-colors hover:border-primary/40 hover:bg-primary/18 active:scale-[0.98] touch-manipulation"
                        >
                          {showCreateMeal ? "Cancel" : "+ New"}
                        </button>
                      </div>

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
                            className="h-10 bg-background/40 border-primary/15 text-sm"
                          />
                          <div className="space-y-1">
                            <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">Tags</Label>
                            <div className="flex flex-wrap gap-1.5">
                              {mealTypes.map((m) => {
                                const on = newMealTags.includes(m)
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => {
                                      setNewMealTags((prev) => {
                                        if (prev.includes(m)) {
                                          if (prev.length <= 1) return prev
                                          return prev.filter((x) => x !== m)
                                        }
                                        return [...prev, m]
                                      })
                                    }}
                                    className={cn(
                                      "rounded-md px-2.5 py-1.5 text-[11px] font-medium capitalize transition-colors touch-manipulation",
                                      on
                                        ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                                        : "bg-muted/25 text-muted-foreground/70 hover:bg-muted/40"
                                    )}
                                  >
                                    {m}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">Cal *</Label>
                              <Input type="number" min="0" placeholder="0" value={newMealCal} onChange={(e) => setNewMealCal(e.target.value)} className="h-9 bg-background/40 border-primary/15 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">P</Label>
                              <Input type="number" min="0" placeholder="g" value={newMealProtein} onChange={(e) => setNewMealProtein(e.target.value)} className="h-9 bg-background/40 border-primary/15 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">C</Label>
                              <Input type="number" min="0" placeholder="g" value={newMealCarbs} onChange={(e) => setNewMealCarbs(e.target.value)} className="h-9 bg-background/40 border-primary/15 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">F</Label>
                              <Input type="number" min="0" placeholder="g" value={newMealFat} onChange={(e) => setNewMealFat(e.target.value)} className="h-9 bg-background/40 border-primary/15 text-sm" />
                            </div>
                          </div>
                          {saveMealError && <p className="text-[10px] text-destructive" role="alert">{saveMealError}</p>}
                          <Button
                            type="button"
                            variant="glass"
                            size="sm"
                            className="w-full h-10 text-sm"
                            onClick={() => void handleCreateMeal()}
                          >
                            Save
                          </Button>
                        </div>
                      )}

                      {savedMeals.length > 0 && displayedSavedMeals.length === 0 && (
                        <p className="mb-2 text-[11px] text-muted-foreground/70">
                          No saved meals tagged for <span className="capitalize font-medium text-foreground/80">{mealType}</span>.
                          Switch meal type or add one with this tag.
                        </p>
                      )}

                      {displayedSavedMeals.length > 0 && (
                        <div
                          className="max-h-[min(42vh,300px)] overflow-y-auto overscroll-y-contain touch-pan-y space-y-0.5 pr-0.5 [-webkit-overflow-scrolling:touch]"
                          aria-label="Saved meals for this meal type"
                        >
                          {displayedSavedMeals.map((meal) => {
                            const inDraft = savedMealIdsInDraft.has(meal.id)
                            const flash = flashSavedMealId === meal.id
                            const tags = savedMealTagList(meal)
                            const editingThis = editingSavedMealId === meal.id
                            return (
                              <div key={meal.id} className="space-y-0">
                                <div
                                  className={cn(
                                    "group flex items-center gap-2 rounded-xl px-2.5 py-2.5 transition-all duration-300",
                                    inDraft
                                      ? "ring-1 ring-primary/35 bg-gradient-to-r from-primary/[0.09] to-transparent shadow-[inset_0_1px_0_0_oklch(1_0_0/6%)]"
                                      : "hover:bg-glass-highlight/15",
                                    flash && "animate-in zoom-in-95 duration-300 ring-2 ring-primary/45"
                                  )}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleUseSavedMeal(meal)}
                                    className="flex items-center gap-3 min-w-0 flex-1 text-left touch-manipulation"
                                  >
                                    <div
                                      className={cn(
                                        "flex h-7 w-7 items-center justify-center rounded-md shrink-0 transition-colors duration-300",
                                        inDraft ? "bg-primary/20 text-primary" : "bg-primary/10"
                                      )}
                                    >
                                      {inDraft ? (
                                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                                      ) : (
                                        <Plus className="h-3.5 w-3.5 text-primary/60" />
                                      )}
                                    </div>
                                    <span className="flex min-w-0 flex-1 flex-col gap-1 text-left sm:flex-row sm:items-center sm:flex-wrap sm:gap-2">
                                      <span className="text-sm font-medium truncate">{meal.name}</span>
                                      <span className="flex flex-wrap items-center gap-1">
                                        {tags.map((t) => (
                                          <span
                                            key={t}
                                            className={cn(
                                              "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize",
                                              t === mealType
                                                ? "bg-primary/15 text-primary/90"
                                                : "bg-muted/40 text-muted-foreground/80"
                                            )}
                                          >
                                            {t}
                                          </span>
                                        ))}
                                        {inDraft && (
                                          <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary/80">
                                            In meal
                                          </span>
                                        )}
                                      </span>
                                    </span>
                                  </button>
                                  <span className="text-xs tabular-nums text-muted-foreground/40 shrink-0">
                                    {meal.calories}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => requestDeleteSavedMeal(meal.id, meal.name)}
                                    className="history-row-delete rounded-md"
                                    aria-label={`Delete saved meal ${meal.name}`}
                                  >
                                    <Trash2 />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditSavedMeal(meal)}
                                    className="history-row-delete rounded-md"
                                    aria-label={`Edit saved meal ${meal.name}`}
                                  >
                                    <Pencil />
                                  </button>
                                </div>
                                {editingThis && (
                                  <div
                                    data-edit-saved-meal
                                    className="glass-subtle mt-1 mb-2 rounded-lg p-3 space-y-2 border border-border/25"
                                    onKeyDownCapture={(e) => {
                                      if (
                                        e.key === "Enter" &&
                                        (e.target as HTMLElement).closest("[data-edit-saved-meal]")
                                      ) {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        void handleUpdateSavedMeal()
                                      }
                                    }}
                                  >
                                    <Input
                                      value={editSavedName}
                                      onChange={(e) => setEditSavedName(e.target.value)}
                                      className="h-10 bg-background/40 border-primary/15 text-sm"
                                      placeholder="Meal name"
                                    />
                                    <div className="space-y-1">
                                      <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
                                        Tags
                                      </Label>
                                      <div className="flex flex-wrap gap-1.5">
                                        {mealTypes.map((m) => {
                                          const on = editSavedTags.includes(m)
                                          return (
                                            <button
                                              key={m}
                                              type="button"
                                              onClick={() => {
                                                setEditSavedTags((prev) => {
                                                  if (prev.includes(m)) {
                                                    if (prev.length <= 1) return prev
                                                    return prev.filter((x) => x !== m)
                                                  }
                                                  return [...prev, m]
                                                })
                                              }}
                                              className={cn(
                                                "rounded-md px-2.5 py-1.5 text-[11px] font-medium capitalize transition-colors touch-manipulation",
                                                on
                                                  ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                                                  : "bg-muted/25 text-muted-foreground/70 hover:bg-muted/40"
                                              )}
                                            >
                                              {m}
                                            </button>
                                          )
                                        })}
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                      <div className="space-y-1">
                                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
                                          Cal *
                                        </Label>
                                        <Input
                                          type="number"
                                          min="0"
                                          value={editSavedCal}
                                          onChange={(e) => setEditSavedCal(e.target.value)}
                                          className="h-9 bg-background/40 border-primary/15 text-sm"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
                                          P
                                        </Label>
                                        <Input
                                          type="number"
                                          min="0"
                                          value={editSavedProtein}
                                          onChange={(e) => setEditSavedProtein(e.target.value)}
                                          className="h-9 bg-background/40 border-primary/15 text-sm"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
                                          C
                                        </Label>
                                        <Input
                                          type="number"
                                          min="0"
                                          value={editSavedCarbs}
                                          onChange={(e) => setEditSavedCarbs(e.target.value)}
                                          className="h-9 bg-background/40 border-primary/15 text-sm"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
                                          F
                                        </Label>
                                        <Input
                                          type="number"
                                          min="0"
                                          value={editSavedFat}
                                          onChange={(e) => setEditSavedFat(e.target.value)}
                                          className="h-9 bg-background/40 border-primary/15 text-sm"
                                        />
                                      </div>
                                    </div>
                                    {editSavedError && (
                                      <p className="text-[10px] text-destructive" role="alert">
                                        {editSavedError}
                                      </p>
                                    )}
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="flex-1 h-10"
                                        onClick={cancelEditSavedMeal}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="glass"
                                        size="sm"
                                        className="flex-1 h-10"
                                        disabled={savingSavedMealEdit}
                                        onClick={() => void handleUpdateSavedMeal()}
                                      >
                                        {savingSavedMealEdit ? "Saving…" : "Update"}
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manual estimate — collapsed by default (add mode); always open when editing */}
                  {!editingEntry && (
                    <button
                      type="button"
                      disabled={vacationBlocksLog && !editingEntry}
                      onClick={() => setLogFoodManualOpen((v) => !v)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-border/25 bg-glass-highlight/[0.04] py-2.5 px-3 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-glass-highlight/10 disabled:pointer-events-none disabled:opacity-45"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Target className="h-3.5 w-3.5 shrink-0 opacity-50" />
                        <span className="truncate">Estimate calories</span>
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 opacity-40 transition-transform duration-200",
                          logFoodManualOpen && "rotate-180"
                        )}
                      />
                    </button>
                  )}

                  {(editingEntry || logFoodManualOpen) && (
                    <form id="log-food-form" onSubmit={handleSubmit} className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="flex items-center gap-2">
                        <Input
                          id="calories"
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          placeholder="Calories"
                          value={calories}
                          onChange={(e) => setCalories(e.target.value)}
                          className="flex-1 min-w-0 h-11"
                          required
                          disabled={vacationBlocksLog && !editingEntry ? true : vacationBlocksEditingEntry}
                        />
                        {([
                          { n: 250, label: "+250" },
                          { n: 500, label: "+500" },
                          { n: 1000, label: "+1k" },
                        ] as const).map(({ n, label }) => (
                          <button
                            key={n}
                            type="button"
                            disabled={
                              (vacationBlocksLog && !editingEntry) || vacationBlocksEditingEntry
                            }
                            onClick={() => addCalories(n)}
                            className="h-11 rounded-md border border-glass-border px-3 text-xs font-medium tabular-nums text-muted-foreground/50 hover:bg-glass-highlight/15 hover:text-foreground transition-colors touch-manipulation disabled:pointer-events-none disabled:opacity-40"
                            title={`Add ${n.toLocaleString()} cal`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {showSavePrompt && description && calories && (
                          <button
                            type="button"
                            onClick={handleSaveCurrentAsFrequent}
                            className="flex items-center gap-1.5 rounded-md border border-dashed border-primary/20 px-3 py-2.5 text-xs font-medium text-primary/50 hover:text-primary hover:bg-primary/5 transition-colors touch-manipulation"
                          >
                            <Star className="h-3.5 w-3.5" />
                            Save
                          </button>
                        )}
                        {!editingEntry && (
                          <Button
                            type="submit"
                            variant="glass"
                            size="sm"
                            className="flex-1 h-11 text-sm"
                            disabled={vacationBlocksLog}
                          >
                            {estimateCalDisplay != null
                              ? `Add ${estimateCalDisplay.toLocaleString()} cal`
                              : "Add to meal"}
                          </Button>
                        )}
                      </div>
                    </form>
                  )}

                  {/* Draft items */}
                  {!editingEntry && draftMealItems.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40 mb-1.5">
                        Draft · {draftMealItems.length}
                      </p>
                      <div className="rounded-lg border border-glass-border/30 divide-y divide-glass-border/20 overflow-hidden">
                        {draftMealItems.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-3 text-xs">
                            <div className="min-w-0">
                              <p className="truncate font-medium leading-tight text-sm">
                                {item.description || "Quick add"}
                              </p>
                              <p className="mt-0.5 text-[11px] capitalize tabular-nums text-muted-foreground/40">
                                {item.mealType} · {item.calories} cal
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setDraftMealItems((prev) => prev.filter((x) => x.id !== item.id))}
                              className="p-2 rounded-md hover:bg-destructive/10 shrink-0 touch-manipulation"
                            >
                              <X className="h-4 w-4 text-muted-foreground/30" />
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
                <div className="shrink-0 border-t border-border/30 px-4 py-3 bg-background/60 backdrop-blur-sm">
                  {editingEntry ? (
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="flex-1 h-11" size="default" onClick={cancelEdit}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="glass"
                        form="log-food-form"
                        className="flex-1 press-scale h-11"
                        size="default"
                        disabled={vacationBlocksEditingEntry}
                      >
                        Save
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="glass"
                      className="w-full press-scale h-11 text-sm"
                      size="default"
                      disabled={postingMeal || vacationBlocksLog}
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
                        borderRadius: "8px",
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

        <div className="glass rounded-2xl p-4 lg:p-5 animate-fade-up stagger-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
            History
          </p>
          {entries.length === 0 ? (
            <div className="h-40 lg:h-48 flex items-center justify-center">
              <p className="text-sm text-muted-foreground text-center px-4">No entries yet</p>
            </div>
          ) : (
          <div className="space-y-2">
            {historyDisplay.todayGroups.length > 0 && (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Today
              </p>
            )}
            {historyDisplay.todayGroups.map(({ dateKey, items }) => (
              <CaloriesHistoryDayAccordion
                key={dateKey}
                dateKey={dateKey}
                items={items}
                today={today}
                yesterday={yesterday}
                realToday={realToday}
                expandedDays={expandedDays}
                onToggleDay={toggleHistoryDay}
                lockOpen
                weeklyGoal={weeklyGoal}
                dailyTotals={dailyTotals}
                startEdit={startEdit}
                requestDeleteCalorieEntry={requestDeleteCalorieEntry}
              />
            ))}
            {historyDisplay.earlierGroups.length > 0 && (
              <HistoryEarlierSection dayCount={historyDisplay.earlierGroups.length}>
                {historyDisplay.earlierGroups.map(({ dateKey, items }) => (
                  <CaloriesHistoryDayAccordion
                    key={dateKey}
                    dateKey={dateKey}
                    items={items}
                    today={today}
                    yesterday={yesterday}
                    realToday={realToday}
                    expandedDays={expandedDays}
                    onToggleDay={toggleHistoryDay}
                    lockOpen={false}
                    weeklyGoal={weeklyGoal}
                    dailyTotals={dailyTotals}
                    startEdit={startEdit}
                    requestDeleteCalorieEntry={requestDeleteCalorieEntry}
                  />
                ))}
              </HistoryEarlierSection>
            )}
            <HistoryArchivedNote archivedDayCount={historyDisplay.archivedDayCount} />
          </div>
          )}
        </div>
      </div>

      {pendingDelete &&
        createPortal(
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[3px]"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            aria-describedby="delete-confirm-desc"
            onClick={() => {
              if (!pendingDeleteBusy) setPendingDelete(null)
            }}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-border/35 bg-popover p-5 shadow-2xl ring-1 ring-foreground/5"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="delete-confirm-title" className="font-heading text-base font-semibold text-foreground">
                {pendingDelete.kind === "savedMeal" ? "Delete saved meal?" : "Delete log entry?"}
              </h2>
              <p id="delete-confirm-desc" className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {pendingDelete.kind === "calorieEntry" ? (
                  pendingDelete.label === "this log entry" ? (
                    <>This will remove the entry from your history. This cannot be undone.</>
                  ) : (
                    <>
                      This will remove{" "}
                      <span className="font-medium text-foreground">&quot;{pendingDelete.label}&quot;</span> from
                      your history. This cannot be undone.
                    </>
                  )
                ) : (
                  <>
                    This will remove{" "}
                    <span className="font-medium text-foreground">&quot;{pendingDelete.name}&quot;</span> from saved
                    meals. This cannot be undone.
                  </>
                )}
              </p>
              <div className="mt-5 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-11"
                  disabled={pendingDeleteBusy}
                  onClick={() => setPendingDelete(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="flex-1 h-11"
                  disabled={pendingDeleteBusy}
                  onClick={() => void executePendingDelete()}
                >
                  {pendingDeleteBusy ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </>
  )
}
