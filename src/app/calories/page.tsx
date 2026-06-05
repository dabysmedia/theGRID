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
import { LogFoodDialog } from "@/components/calories/LogFoodDialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { averageOnLoggedDays, cn, formatDate, formatDisplayDate, parseLocalDate } from "@/lib/utils"
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
            {items.map((entry) => {
              const MealIcon = mealHistoryIcon(entry.mealType)
              return (
              <li
                key={entry.id}
                className="flex items-stretch gap-3 px-3 py-2.5 transition-colors hover:bg-glass-highlight/10 group/row"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-glass-border/40 bg-muted/30 text-muted-foreground"
                  aria-hidden
                  title={entry.mealType}
                >
                  <MealIcon className="size-5 shrink-0 stroke-[1.75]" />
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
              )
            })}
          </ul>
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
        color="#ef4444"
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

      {/* Today: ring + weekly stats + log (combined) */}
      <div className="animate-fade-up">
        {editingGoal ? (
          <div className="glass-panel border border-border/20 p-5 lg:p-6 shadow-sm">
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
          <div className="glass-panel border border-border/20 p-6 lg:p-7 shadow-sm">
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

          <div className="glass-panel p-4 lg:p-5 animate-fade-up stagger-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
              7-Day trend
            </p>
            {hasChartData ? (
              <div className="h-40 lg:h-48 w-full">
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
              <div className="h-40 lg:h-48 flex items-center justify-center">
                <p className="text-sm text-muted-foreground text-center px-4">Log entries to see trends</p>
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel p-4 lg:p-5 animate-fade-up stagger-2">
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
