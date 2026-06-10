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
import type { LucideIcon } from "lucide-react"
import {
  ChevronDown,
  Trash2,
  Plus,
  Pencil,
  Target,
  Check,
  X,
  Sunrise,
  Sun,
  UtensilsCrossed,
  Cookie,
  Utensils,
  Flame,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import { PageHeader } from "@/components/PageHeader"
import { PageHeroStrip } from "@/components/PageHeroStrip"
import { CaloriePipTracker } from "@/components/calories/CaloriePipTracker"
import { LogFoodDialog } from "@/components/calories/LogFoodDialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { averageOnLoggedDays, cn, formatDate, formatDisplayDate, glassPanelAccentClass, glassPanelAccentStyle, glassPanelClass, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { HistoryArchivedNote, HistoryEarlierSection } from "@/components/HistoryEarlierSection"
import { partitionHistoryDayGroups } from "@/lib/history-display"
import { CALORIES_LOG_FOOD_QUERY } from "@/lib/calories-log-deep-link"
import { isVacationBlockingCalendarDay } from "@/lib/vacation-mode"
import type { CalorieEntry, DraftMealItem } from "@/lib/calories/log-food"

interface WeeklyGoal {
  id: string
  weeklyTarget: number
}

type PendingDelete = { kind: "calorieEntry"; id: string; label: string }

function mealHistoryIcon(mealType: string): LucideIcon {
  const t = mealType.toLowerCase().trim()
  if (t === "breakfast") return Sunrise
  if (t === "lunch") return Sun
  if (t === "dinner") return UtensilsCrossed
  if (t === "snack") return Cookie
  return Utensils
}

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

const CALORIES_COLOR = "#ef4444"

/** Consumed vs daily target: over = red at ≥101%; on track = emerald (≥95%); under = sky */
function calorieTargetTextClass(consumed: number, target: number): string {
  if (target <= 0) return "text-foreground"
  const r = consumed / target
  if (r >= OVER_TARGET_RATIO) return "text-red-500 dark:text-red-400"
  if (r >= 0.95) return "text-emerald-600 dark:text-emerald-400"
  return "text-sky-600 dark:text-sky-400/90"
}

/** 7-day bar fill — cyan / green / red vs adaptive day target (same ratios as totals UI). */
function calorieTrendBarFillHex(consumed: number, dayTarget: number): string {
  if (dayTarget <= 0) return "#22d3ee"
  const r = consumed / dayTarget
  if (r >= OVER_TARGET_RATIO) return "#ef4444"
  if (r >= 0.95) return "#10b981"
  return "#22d3ee"
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

const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const

function groupEntriesByMeal(items: CalorieEntry[]) {
  const map = new Map<string, CalorieEntry[]>()
  for (const entry of items) {
    const key = entry.mealType.toLowerCase().trim() || "other"
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(entry)
  }
  const ordered = MEAL_ORDER.filter((m) => map.has(m)).map((meal) => ({
    meal,
    items: map.get(meal)!,
  }))
  for (const [meal, mealItems] of map) {
    if (!MEAL_ORDER.includes(meal as (typeof MEAL_ORDER)[number])) {
      ordered.push({ meal, items: mealItems })
    }
  }
  return ordered
}

function dayCalorieClass(calories: number, dayTarget: number, weeklyGoal: WeeklyGoal | null) {
  return weeklyGoal != null && dayTarget > 0
    ? calorieTargetTextClass(calories, dayTarget)
    : "text-foreground"
}

function CaloriesDayProgressBar({
  calories,
  dayTarget,
}: {
  calories: number
  dayTarget: number
}) {
  if (dayTarget <= 0) return null
  const pct = Math.min(100, (calories / dayTarget) * 100)
  const fill = calorieTrendBarFillHex(calories, dayTarget)
  return (
    <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-muted/20">
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, backgroundColor: fill }}
      />
    </div>
  )
}

function MacroPills({
  protein,
  carbs,
  fat,
}: {
  protein: number | null
  carbs: number | null
  fat: number | null
}) {
  if (protein == null && carbs == null && fat == null) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {protein != null && (
        <span className="type-hud-micro rounded-md border border-border/25 bg-background/35 px-1.5 py-0.5 tabular-nums normal-case">
          P {protein}g
        </span>
      )}
      {carbs != null && (
        <span className="type-hud-micro rounded-md border border-border/25 bg-background/35 px-1.5 py-0.5 tabular-nums normal-case">
          C {carbs}g
        </span>
      )}
      {fat != null && (
        <span className="type-hud-micro rounded-md border border-border/25 bg-background/35 px-1.5 py-0.5 tabular-nums normal-case">
          F {fat}g
        </span>
      )}
    </div>
  )
}

function CaloriesHistoryEntryRow({
  entry,
  calClass,
  startEdit,
  requestDeleteCalorieEntry,
}: {
  entry: CalorieEntry
  calClass: string
  startEdit: (entry: CalorieEntry) => void
  requestDeleteCalorieEntry: (id: string, label: string) => void
}) {
  return (
    <li className="group/row flex items-stretch gap-3 px-3 py-2.5 transition-colors hover:bg-glass-highlight/15">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cn("type-hud-stat tabular-nums transition-colors", calClass)}>
            {entry.calories.toLocaleString()}
          </span>
          <span className="type-hud-unit">cal</span>
        </div>
        <MacroPills protein={entry.protein} carbs={entry.carbs} fat={entry.fat} />
        {entry.description && (
          <p className="type-hud-caption mt-1.5 normal-case line-clamp-2 text-muted-foreground/75">
            {entry.description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 self-center">
        <button
          type="button"
          onClick={() => startEdit(entry)}
          className="history-row-edit !min-h-9 !min-w-9 !m-0"
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
          className="history-row-delete-row !min-h-9 !min-w-9 !m-0"
          aria-label="Delete entry"
        >
          <Trash2 />
        </button>
      </div>
    </li>
  )
}

function CaloriesMealGroup({
  meal,
  items,
  calClass,
  startEdit,
  requestDeleteCalorieEntry,
}: {
  meal: string
  items: CalorieEntry[]
  calClass: string
  startEdit: (entry: CalorieEntry) => void
  requestDeleteCalorieEntry: (id: string, label: string) => void
}) {
  const mealTotal = items.reduce((s, e) => s + e.calories, 0)
  const MealIcon = mealHistoryIcon(meal)

  return (
    <div className="glass-subtle overflow-hidden rounded-xl">
      <div className="flex items-center gap-2 border-b border-border/15 px-3 py-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/20 bg-background/40 text-muted-foreground"
          aria-hidden
        >
          <MealIcon className="size-3.5 stroke-[1.75]" />
        </div>
        <span className="type-hud-label-soft capitalize">{meal}</span>
        <span className={cn("type-hud-stat-sm ml-auto tabular-nums", calClass)}>
          {mealTotal.toLocaleString()} cal
        </span>
      </div>
      <ul className="divide-y divide-border/15">
        {items.map((entry) => (
          <CaloriesHistoryEntryRow
            key={entry.id}
            entry={entry}
            calClass={calClass}
            startEdit={startEdit}
            requestDeleteCalorieEntry={requestDeleteCalorieEntry}
          />
        ))}
      </ul>
    </div>
  )
}

function CaloriesTodayLog({
  dateKey,
  items,
  today,
  yesterday,
  realToday,
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
  weeklyGoal: WeeklyGoal | null
  dailyTotals: Map<string, number>
  startEdit: (entry: CalorieEntry) => void
  requestDeleteCalorieEntry: (id: string, label: string) => void
}) {
  const summary = summarizeDay(items)
  const label = dateGroupLabel(dateKey, today, yesterday, realToday)
  const subDate =
    dateKey === today || dateKey === yesterday ? format(parseLocalDate(dateKey), "EEE, MMM d") : null
  const dayTarget =
    weeklyGoal != null ? adaptiveDayTargetForDate(dateKey, weeklyGoal.weeklyTarget, dailyTotals) : 0
  const calClass = dayCalorieClass(summary.calories, dayTarget, weeklyGoal)
  const mealGroups = groupEntriesByMeal(items)

  return (
    <div
      className={cn(glassPanelClass, glassPanelAccentClass, "overflow-hidden p-4 lg:p-5")}
      style={glassPanelAccentStyle(CALORIES_COLOR)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3 className="type-hud-title normal-case">{label}</h3>
            {subDate && <span className="type-hud-caption tabular-nums">{subDate}</span>}
          </div>
          <p className="type-hud-caption mt-1 normal-case">
            {summary.count} {summary.count === 1 ? "entry" : "entries"}
            {dayTarget > 0 && (
              <>
                <span className="text-muted-foreground/30"> · </span>
                target {dayTarget.toLocaleString()} cal
              </>
            )}
          </p>
          <CaloriesDayProgressBar calories={summary.calories} dayTarget={dayTarget} />
        </div>
        <div className="text-right">
          <p className={cn("type-hud-value-lg tabular-nums leading-none transition-colors", calClass)}>
            {summary.calories.toLocaleString()}
          </p>
          <p className="type-hud-unit mt-1">cal</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {mealGroups.map(({ meal, items: mealItems }) => (
          <CaloriesMealGroup
            key={meal}
            meal={meal}
            items={mealItems}
            calClass={calClass}
            startEdit={startEdit}
            requestDeleteCalorieEntry={requestDeleteCalorieEntry}
          />
        ))}
      </div>
    </div>
  )
}

function CaloriesHistoryDayAccordion({
  dateKey,
  items,
  today,
  yesterday,
  realToday,
  expandedDays,
  onToggleDay,
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
  weeklyGoal: WeeklyGoal | null
  dailyTotals: Map<string, number>
  startEdit: (entry: CalorieEntry) => void
  requestDeleteCalorieEntry: (id: string, label: string) => void
}) {
  const summary = summarizeDay(items)
  const open = expandedDays.has(dateKey)
  const label = dateGroupLabel(dateKey, today, yesterday, realToday)
  const subDate =
    dateKey === today || dateKey === yesterday ? format(parseLocalDate(dateKey), "EEE, MMM d") : null
  const dayTarget =
    weeklyGoal != null ? adaptiveDayTargetForDate(dateKey, weeklyGoal.weeklyTarget, dailyTotals) : 0
  const calClass = dayCalorieClass(summary.calories, dayTarget, weeklyGoal)
  const mealGroups = groupEntriesByMeal(items)

  return (
    <div className="overflow-hidden rounded-2xl border border-border/20 bg-background/25 transition-colors">
      <button
        type="button"
        onClick={() => onToggleDay(dateKey)}
        aria-expanded={open}
        className="w-full px-4 py-3.5 text-left transition-colors hover:bg-glass-highlight/15 active:bg-glass-highlight/25"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="type-hud-stat-sm">{label}</span>
              {subDate && <span className="type-hud-caption tabular-nums">{subDate}</span>}
            </div>
            <p className="type-hud-caption mt-1 normal-case">
              {summary.count} {summary.count === 1 ? "entry" : "entries"}
              {dayTarget > 0 && (
                <>
                  <span className="text-muted-foreground/30"> · </span>
                  target {dayTarget.toLocaleString()}
                </>
              )}
            </p>
            <CaloriesDayProgressBar calories={summary.calories} dayTarget={dayTarget} />
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <div className="text-right">
              <p className={cn("type-hud-value-lg tabular-nums leading-none transition-colors", calClass)}>
                {summary.calories.toLocaleString()}
              </p>
              <p className="type-hud-unit mt-1">cal</p>
            </div>
            <span
              className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/25 bg-background/35 transition-colors",
                open && "border-primary/25 bg-primary/10"
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
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/20 px-3 pb-3 pt-3">
          {mealGroups.map(({ meal, items: mealItems }) => (
            <CaloriesMealGroup
              key={meal}
              meal={meal}
              items={mealItems}
              calClass={calClass}
              startEdit={startEdit}
              requestDeleteCalorieEntry={requestDeleteCalorieEntry}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function CaloriesPage() {
  const [entries, setEntries] = useState<CalorieEntry[]>([])
  const [editingEntry, setEditingEntry] = useState<CalorieEntry | null>(null)
  const [draftMealItems, setDraftMealItems] = useState<DraftMealItem[]>([])
  const [weeklyGoal, setWeeklyGoal] = useState<WeeklyGoal | null>(null)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState("")
  
  const [logFoodOpen, setLogFoodOpen] = useState(false)
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

  const vacationResumeLabel =
    user?.vacationResumeDate != null && user.vacationResumeDate !== ""
      ? format(parseLocalDate(user.vacationResumeDate), "MMM d, yyyy")
      : null

  useEffect(() => {
    if (!pendingDelete) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pendingDeleteBusy) setPendingDelete(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pendingDelete, pendingDeleteBusy])

  useEffect(() => {
    apiFetch("/api/calories")
      .then(async (r) => {
        const data = await r.json()
        setEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setEntries([]))
  }, [])

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

  const { dailyTotals, chartData, weekTotal, avg7, bestDay } = useMemo(() => {
    const dailyTotals = new Map<string, number>()
    for (const e of entries) {
      const d = e.date.split("T")[0]
      dailyTotals.set(d, (dailyTotals.get(d) ?? 0) + e.calories)
    }

    const weeklyT = weeklyGoal?.weeklyTarget ?? 0

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
      const dayTarget = adaptiveDayTargetForDate(key, weeklyT, dailyTotals)
      const barFill = calorieTrendBarFillHex(total, dayTarget)
      return { label: format(d, "EEE"), total, dateKey: key, barFill }
    })

    let lowestVal = 0
    let lowestKey: string | null = null
    for (const d of days) {
      const key = formatDate(d)
      const v = dailyTotals.get(key) ?? 0
      if (v <= 0) continue
      if (lowestKey === null || v < lowestVal) {
        lowestVal = v
        lowestKey = key
      }
    }

    return {
      dailyTotals,
      chartData,
      weekTotal: weekSum,
      avg7: averageOnLoggedDays(dailyLast7),
      bestDay: { value: lowestVal, key: lowestKey },
    }
  }, [entries, activeDate, weeklyGoal?.weeklyTarget])

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

  function startEdit(entry: CalorieEntry) {
    setEditingEntry(entry)
    setLogFoodOpen(true)
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
      const id = pendingDelete.id
      const res = await apiFetch(`/api/calories?id=${id}`, { method: "DELETE" })
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id))
        setEditingEntry((cur) => (cur?.id === id ? null : cur))
        if (logFoodOpen) setLogFoodOpen(false)
      }
      setPendingDelete(null)
    } finally {
      setPendingDeleteBusy(false)
    }
  }

  const todayTotal = dailyTotals.get(today) ?? 0

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

  if (vacationBlocksLog && vacationResumeLabel) {
    return (
      <>
        <Suspense fallback={null}>
          <OpenLogFoodFromQuery setOpen={setLogFoodOpen} />
        </Suspense>
        <div className="space-y-6">
          <PageHeader title="Calories" />
          <div className="glass-panel border border-amber-500/20 bg-amber-500/5 p-8 text-center space-y-4 max-w-lg mx-auto">
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

      <PageHeroStrip
        color={CALORIES_COLOR}
        icon={Flame}
        eyebrow={`Today · ${formatDisplayDate(parseLocalDate(activeDate))}`}
        value={todayTotal.toLocaleString()}
        unit="cal"
        metrics={[
          { label: "7-day avg", value: Math.round(avg7).toLocaleString(), sub: "logged days" },
          { label: "Week total", value: weekTotal.toLocaleString(), sub: "last 7 days" },
          {
            label: "Lowest day",
            value: bestDay.value > 0 ? bestDay.value.toLocaleString() : "—",
            sub:
              bestDay.key != null && bestDay.value > 0
                ? format(parseLocalDate(bestDay.key), "EEE, MMM d")
                : undefined,
          },
        ]}
      />

      {/* Today: pip tracker + weekly stats + log (combined) */}
      <div className="animate-fade-up">
        {editingGoal ? (
          <div
            className={cn(glassPanelClass, glassPanelAccentClass, "p-4 lg:p-5")}
            style={glassPanelAccentStyle(CALORIES_COLOR)}
          >
            <p className="type-hud-label-soft">Weekly calorie goal</p>
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
              <span className="type-hud-caption normal-case">cal / week</span>
              {goalInput && parseFloat(goalInput) > 0 && (
                <span className="type-hud-caption normal-case tabular-nums">
                  ≈ {Math.round(parseFloat(goalInput) / 7).toLocaleString()} / day
                </span>
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
        ) : weekPlan ? (
          <div
            className={cn(glassPanelClass, glassPanelAccentClass, "p-4 lg:p-5")}
            style={glassPanelAccentStyle(CALORIES_COLOR)}
          >
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-[0.07]"
              style={{ backgroundColor: CALORIES_COLOR }}
              aria-hidden
            />
            <div className="relative min-w-0 space-y-4">
              <CaloriePipTracker
                consumed={weekPlan.consumedToday}
                target={weekPlan.todayTarget}
              />

              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="type-hud-label-soft mb-1">Today</p>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span
                      className={cn(
                        "type-hud-value-xl tabular-nums transition-colors",
                        calorieTargetTextClass(todayTotal, weekPlan.todayTarget)
                      )}
                    >
                      {todayTotal.toLocaleString()}
                    </span>
                    <span className="type-hud-unit">cal</span>
                  </div>
                  <p className="type-hud-caption mt-1 normal-case">
                    Target{" "}
                    <span className="font-semibold tabular-nums text-foreground/85">
                      {weekPlan.todayTarget.toLocaleString()}
                    </span>{" "}
                    today
                  </p>
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

              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <div>
                  <p className="type-hud-label-soft mb-1">Eaten</p>
                  <p className={cn("type-hud-stat transition-colors", calorieTargetTextClass(weekPlan.consumedToday, weekPlan.todayTarget))}>
                    {weekPlan.consumedToday.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="type-hud-label-soft mb-1">Left today</p>
                  <p
                    className={cn(
                      "type-hud-stat transition-colors",
                      weekPlan.todayTarget <= 0
                        ? "text-muted-foreground/40"
                        : calorieTargetTextClass(weekPlan.consumedToday, weekPlan.todayTarget)
                    )}
                  >
                    {weekPlan.todayRemaining.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="type-hud-label-soft mb-1">Week</p>
                  <p className="type-hud-stat-sm">
                    <span className={cn("transition-colors", calorieTargetTextClass(weekPlan.consumedTotal, weekPlan.weeklyTarget))}>
                      {weekPlan.consumedTotal.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground/35 font-normal">
                      {" "}
                      / {weekPlan.weeklyTarget.toLocaleString()}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="type-hud-label-soft mb-1">Week balance</p>
                  <p
                    className={cn(
                      "type-hud-stat-sm",
                      weekPlan.weeklyTarget > 0 &&
                        weekPlan.consumedTotal / weekPlan.weeklyTarget >= OVER_TARGET_RATIO
                        ? "text-red-400/85"
                        : undefined
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
                  <p className="type-hud-label-soft mb-1">Days left</p>
                  <p className="type-hud-stat-sm">{weekPlan.daysLeft}</p>
                </div>
              </div>

              {today > realToday && (
                <p className="type-hud-caption normal-case text-primary/80">Planning mode (date selector)</p>
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
                <p className="type-hud-caption normal-case text-center lg:text-left">
                  <span className="font-semibold tabular-nums text-foreground">{draftMealItems.length}</span> item
                  {draftMealItems.length === 1 ? "" : "s"} in draft — tap Log food to continue
                </p>
              )}
            </div>
          </div>
        ) : (
          <div
            className={cn(glassPanelClass, glassPanelAccentClass, "p-4 lg:p-5")}
            style={glassPanelAccentStyle(CALORIES_COLOR)}
          >
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-[0.07]"
              style={{ backgroundColor: CALORIES_COLOR }}
              aria-hidden
            />
            <div className="relative min-w-0 space-y-4">
              <div className="min-w-0">
                <p className="type-hud-label-soft mb-1">Today</p>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="type-hud-value-xl tabular-nums">{todayTotal.toLocaleString()}</span>
                  <span className="type-hud-unit">cal</span>
                </div>
                {today > realToday && (
                  <p className="type-hud-caption mt-1 normal-case text-primary/80">Planning mode (date selector)</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditingGoal(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/40 py-3 type-hud-label-soft transition-colors hover:border-primary/25 hover:text-muted-foreground"
              >
                <Target className="h-3.5 w-3.5" />
                Set weekly calorie goal
              </button>
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
                <p className="type-hud-caption normal-case text-center lg:text-left">
                  <span className="font-semibold tabular-nums text-foreground">{draftMealItems.length}</span> item
                  {draftMealItems.length === 1 ? "" : "s"} in draft — tap Log food to continue
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <LogFoodDialog
        open={logFoodOpen}
        onOpenChange={setLogFoodOpen}
        editingEntry={editingEntry}
        onEditingEntryChange={setEditingEntry}
        draftMealItems={draftMealItems}
        onDraftMealItemsChange={setDraftMealItems}
        onPosted={(created) => {
          setEntries((prev) => [...created.reverse(), ...prev])
        }}
        onUpdated={(updated) => {
          setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
          setEditingEntry(null)
        }}
      />

      <section className="animate-fade-up stagger-2 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 px-0.5">
          <div>
            <h2 className="type-hud-title">Food log</h2>
            <p className="type-hud-caption mt-1 normal-case">
              {entries.length === 0
                ? "Nothing logged yet"
                : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} across ${historyGroups.length} ${historyGroups.length === 1 ? "day" : "days"}`}
            </p>
          </div>
        </div>

        {entries.length === 0 ? (
          <div
            className={cn(glassPanelClass, glassPanelAccentClass, "p-8 text-center lg:p-10")}
            style={glassPanelAccentStyle(CALORIES_COLOR)}
          >
            <p className="type-hud-stat-sm text-muted-foreground/80">No food logged yet</p>
            <p className="type-hud-caption mx-auto mt-2 max-w-sm normal-case">
              Tap Log food above to start tracking meals, macros, and daily totals.
            </p>
            <Button
              type="button"
              variant="glass"
              size="lg"
              className="mt-5 gap-2"
              onClick={() => setLogFoodOpen(true)}
            >
              <Plus className="h-4 w-4 shrink-0" />
              Log food
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {historyDisplay.todayGroups.map(({ dateKey, items }) => (
              <CaloriesTodayLog
                key={dateKey}
                dateKey={dateKey}
                items={items}
                today={today}
                yesterday={yesterday}
                realToday={realToday}
                weeklyGoal={weeklyGoal}
                dailyTotals={dailyTotals}
                startEdit={startEdit}
                requestDeleteCalorieEntry={requestDeleteCalorieEntry}
              />
            ))}
          </div>
        )}
      </section>

      <details
        className={cn(
          glassPanelClass,
          glassPanelAccentClass,
          "animate-fade-up stagger-3 overflow-hidden [&[open]_summary_.cal-trend-chevron]:rotate-180"
        )}
        style={glassPanelAccentStyle(CALORIES_COLOR)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-glass-highlight/10 lg:px-5 lg:py-4 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <p className="type-hud-label-soft">7-day trend</p>
            <p className="type-hud-caption mt-0.5 normal-case tabular-nums">
              {hasChartData ? (
                <>
                  Avg {Math.round(avg7).toLocaleString()} cal logged · {weekTotal.toLocaleString()} this week
                </>
              ) : (
                "Expand to view daily totals"
              )}
            </p>
          </div>
          <ChevronDown className="cal-trend-chevron h-4 w-4 shrink-0 text-muted-foreground/45 transition-transform duration-200" />
        </summary>
        <div className="border-t border-border/20 px-4 pb-4 pt-3 lg:px-5 lg:pb-5">
          {hasChartData ? (
            <div className="h-44 w-full min-w-0 lg:h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
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
                  <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {chartData.map((row) => (
                      <Cell key={row.dateKey} fill={row.barFill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center">
              <p className="type-hud-caption normal-case text-center">Log entries to see trends</p>
            </div>
          )}
        </div>
      </details>

      {entries.length > 0 && (historyDisplay.earlierGroups.length > 0 || historyDisplay.archivedDayCount > 0) && (
        <section className="animate-fade-up stagger-4 space-y-3">
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
                  weeklyGoal={weeklyGoal}
                  dailyTotals={dailyTotals}
                  startEdit={startEdit}
                  requestDeleteCalorieEntry={requestDeleteCalorieEntry}
                />
              ))}
            </HistoryEarlierSection>
          )}
          <HistoryArchivedNote archivedDayCount={historyDisplay.archivedDayCount} />
        </section>
      )}

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
                Delete log entry?
              </h2>
              <p id="delete-confirm-desc" className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {pendingDelete.label === "this log entry" ? (
                  <>This will remove the entry from your history. This cannot be undone.</>
                ) : (
                  <>
                    This will remove{" "}
                    <span className="font-medium text-foreground">&quot;{pendingDelete.label}&quot;</span> from your
                    history. This cannot be undone.
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
