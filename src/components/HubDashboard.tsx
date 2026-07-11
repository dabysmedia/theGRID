"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { subDays } from "date-fns"
import { WeeklyHero } from "./WeeklyHero"
import type { HubExpandedPanel } from "./hub/HubExpandPanels"
import { useActiveDate } from "@/context/DateContext"
import { useQuickLog } from "@/context/QuickLogContext"
import { useUser } from "@/context/UserContext"
import { cn, formatDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { utcCalendarDayKeyFromIso } from "@/lib/dateStorage"
import { isVacationBlockingCalendarDay, vacationCalorieDayMask } from "@/lib/vacation-mode"
import {
  HUB_PREFS_CHANGED_EVENT,
  HUB_RESET_OVERVIEW_EVENT,
  computeNextInjection,
  readInjectionIntervalDays,
} from "@/lib/hub-tile-prefs"
import {
  HUB_EXPAND_QUERY,
  parseHubExpandPanel,
  shouldOpenLogFood,
} from "@/lib/hub-expand-deep-link"
import { CALORIES_LOG_FOOD_QUERY } from "@/lib/calories-log-deep-link"
import { countDosedWeeks } from "@/lib/peptides"

/**
 * Consumes `?expand=<panel>` (+ optional `logFood=1`) once, then strips the query.
 * Suspense-wrapped because it reads search params.
 */
function HubExpandFromQuery({
  onExpand,
}: {
  onExpand: (panel: HubExpandedPanel) => void
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { openQuickLog } = useQuickLog()
  const handledRef = useRef<string | null>(null)

  useEffect(() => {
    const expandRaw = searchParams.get(HUB_EXPAND_QUERY)
    const logFood = shouldOpenLogFood(searchParams)
    if (!expandRaw && !logFood) return

    const key = `${expandRaw ?? ""}|${logFood ? "1" : "0"}`
    if (handledRef.current === key) return
    handledRef.current = key

    const panel = parseHubExpandPanel(expandRaw)
    if (panel) onExpand(panel)
    if (logFood) openQuickLog("calories")

    if (expandRaw || logFood) {
      const next = new URLSearchParams(searchParams.toString())
      next.delete(HUB_EXPAND_QUERY)
      next.delete(CALORIES_LOG_FOOD_QUERY)
      const qs = next.toString()
      router.replace(qs ? `/?${qs}` : "/", { scroll: false })
    }
  }, [searchParams, router, onExpand, openQuickLog])

  return null
}

interface CategorySummary {
  todayValue: number
  goal: number | null
  unit: string
  last7: number[]
}

interface DashboardData {
  calories: CategorySummary
  steps: CategorySummary
  running: CategorySummary
  workouts: CategorySummary
  sleep: CategorySummary
  peptides: CategorySummary
  alcohol: CategorySummary
  bowel: CategorySummary
  recovery: CategorySummary
  vitals: CategorySummary
  readiness?: {
    todayValue: number | null
    weekAvg: number | null
    hrvMs: number | null
    restingHeartRate: number | null
    last7: number[]
  }
  weightTrend: {
    baselineTrend: "losing" | "maintaining" | "gaining"
    vsBaselineLb: number
    last7: (number | null)[]
  } | null
}

const emptyLast7 = () => Array.from({ length: 7 }, () => 0)

const defaultData: DashboardData = {
  calories: { todayValue: 0, goal: 2000, unit: "cal", last7: emptyLast7() },
  steps: { todayValue: 0, goal: 10000, unit: "steps", last7: emptyLast7() },
  running: { todayValue: 0, goal: null, unit: "mi", last7: emptyLast7() },
  workouts: { todayValue: 0, goal: null, unit: "sessions", last7: emptyLast7() },
  sleep: { todayValue: 0, goal: 8, unit: "hrs", last7: emptyLast7() },
  peptides: { todayValue: 0, goal: null, unit: "mg", last7: emptyLast7() },
  alcohol: { todayValue: 0, goal: null, unit: "units", last7: emptyLast7() },
  bowel: { todayValue: 0, goal: null, unit: "", last7: emptyLast7() },
  recovery: { todayValue: 0, goal: 7, unit: "/10", last7: emptyLast7() },
  vitals: { todayValue: 0, goal: null, unit: "ms", last7: emptyLast7() },
  readiness: {
    todayValue: null,
    weekAvg: null,
    hrvMs: null,
    restingHeartRate: null,
    last7: emptyLast7(),
  },
  weightTrend: null,
}

interface PeptideHubEntry {
  id?: string
  injectedAt: string
  doseMg: number
  injectionSite?: string
  compound?: string
}

function workoutsThisWeek(last7: number[], refDateKey: string): number {
  const refDate = parseLocalDate(refDateKey)
  const dayOfWeek = refDate.getDay()
  const daysIntoWeek = dayOfWeek === 0 ? 7 : dayOfWeek
  const slice = last7.slice(Math.max(0, last7.length - daysIntoWeek))
  return slice.reduce((s, v) => s + v, 0)
}

export function HubDashboard() {
  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const [data, setData] = useState<DashboardData>(defaultData)
  const [peptideEntries, setPeptideEntries] = useState<PeptideHubEntry[]>([])
  const [peptideHungerLogs, setPeptideHungerLogs] = useState<
    Array<{ date: string; hungerLevel: number }>
  >([])
  const [loading, setLoading] = useState(true)
  const [injectionIntervalDays, setInjectionIntervalDays] = useState(7)
  const [hubExpanded, setHubExpanded] = useState<HubExpandedPanel | null>(null)

  useEffect(() => {
    if (!user?.id) return
    setInjectionIntervalDays(readInjectionIntervalDays(user.id))
  }, [user?.id])

  useEffect(() => {
    function onPrefsChanged() {
      if (!user?.id) return
      setInjectionIntervalDays(readInjectionIntervalDays(user.id))
    }
    window.addEventListener(HUB_PREFS_CHANGED_EVENT, onPrefsChanged)
    return () => window.removeEventListener(HUB_PREFS_CHANGED_EVENT, onPrefsChanged)
  }, [user?.id])

  const vacationBlocksCalLog = useMemo(
    () => isVacationBlockingCalendarDay(user?.vacationResumeDate, activeDate),
    [user?.vacationResumeDate, activeDate]
  )

  const calorieDayMask = useMemo(
    () => vacationCalorieDayMask(user?.vacationResumeDate, activeDate),
    [user?.vacationResumeDate, activeDate]
  )

  const dashboardForHero = useMemo(() => {
    if (!calorieDayMask.some(Boolean)) return data
    return {
      ...data,
      calories: {
        ...data.calories,
        last7: data.calories.last7.map((v, i) => (calorieDayMask[i] ? 0 : v)),
      },
    }
  }, [data, calorieDayMask])

  useEffect(() => {
    setHubExpanded(null)
  }, [activeDate])

  useEffect(() => {
    function onResetOverview() {
      setHubExpanded(null)
    }
    window.addEventListener(HUB_RESET_OVERVIEW_EVENT, onResetOverview)
    return () => window.removeEventListener(HUB_RESET_OVERVIEW_EVENT, onResetOverview)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function fetchDashboard() {
      setLoading(true)
      try {
        const from = formatDate(subDays(parseLocalDate(activeDate), 21))
        const [dashRes, peptideRes, hungerRes] = await Promise.all([
          apiFetch(`/api/dashboard?d=${activeDate}&_ts=${Date.now()}`, { cache: "no-store" }),
          apiFetch("/api/peptides"),
          apiFetch(`/api/peptides/daily?from=${from}&to=${activeDate}`),
        ])
        if (dashRes.ok && !cancelled) {
          setData(await dashRes.json())
        }
        if (peptideRes.ok && !cancelled) {
          const rows = await peptideRes.json()
          setPeptideEntries(Array.isArray(rows) ? rows : [])
        }
        if (hungerRes.ok && !cancelled) {
          const rows = await hungerRes.json()
          setPeptideHungerLogs(
            Array.isArray(rows)
              ? rows
                  .map((r: { date?: string; hungerLevel?: number }) => ({
                    date:
                      typeof r.date === "string"
                        ? utcCalendarDayKeyFromIso(r.date)
                        : "",
                    hungerLevel:
                      typeof r.hungerLevel === "number" ? r.hungerLevel : 0,
                  }))
                  .filter((r) => r.date && r.hungerLevel >= 1)
              : [],
          )
        }
      } catch {
        // DB not yet connected
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchDashboard()

    function onLogSaved() {
      void fetchDashboard()
    }
    window.addEventListener("grid:log-saved", onLogSaved)
    return () => {
      cancelled = true
      window.removeEventListener("grid:log-saved", onLogSaved)
    }
  }, [activeDate])

  const weekWorkoutCount = useMemo(
    () => workoutsThisWeek(data.workouts.last7, activeDate),
    [data.workouts.last7, activeDate]
  )

  const lastPeptide = peptideEntries[0] ?? null
  const nextInjection = useMemo(
    () =>
      computeNextInjection(
        lastPeptide?.injectedAt,
        injectionIntervalDays,
        activeDate
      ),
    [lastPeptide?.injectedAt, injectionIntervalDays, activeDate]
  )
  const dosedWeekCount = useMemo(
    () => countDosedWeeks(peptideEntries),
    [peptideEntries],
  )

  const overview = hubExpanded == null

  return (
    <div
      className={cn(
        // Keep header↔hub gap identical in overview and expand (lg:gap-8 only —
        // never introduce a mobile gap on expand that shoves the hub down).
        "flex h-full min-h-0 flex-col overflow-hidden [scrollbar-gutter:stable]",
        // Collapsed hub: fill main (above dock clearance) and lock overflow on
        // mobile so the overview fits one screen. Expanded panels grow in place.
        overview && "max-lg:flex-1 max-lg:overflow-hidden",
        !overview && "overflow-y-auto overscroll-contain",
      )}
    >
      <Suspense fallback={null}>
        <HubExpandFromQuery onExpand={setHubExpanded} />
      </Suspense>
      <div
        className={cn(
          "route-enter min-h-0 max-lg:min-h-full",
          overview && "max-lg:flex max-lg:min-h-0 max-lg:flex-1 max-lg:flex-col",
        )}
      >
        <WeeklyHero
          data={dashboardForHero}
          loading={loading}
          vacationBlocksCalories={vacationBlocksCalLog}
          expanded={hubExpanded}
          onExpandedChange={setHubExpanded}
          fillViewport
          peptideSummary={{
            lastDoseMg: lastPeptide?.doseMg ?? null,
            lastInjectedAt: lastPeptide?.injectedAt ?? null,
            nextInjection,
            todayMg: data.peptides.todayValue,
            intervalDays: injectionIntervalDays,
            recentEntries: peptideEntries,
            lastSiteUsed: lastPeptide?.injectionSite ?? null,
            dosedWeekCount,
            hungerLogs: peptideHungerLogs,
          }}
          workoutSummary={{
            weekCount: weekWorkoutCount,
            todayCount: data.workouts.todayValue,
            last7: data.workouts.last7,
            recoveryScore:
              data.recovery.todayValue > 0 ? data.recovery.todayValue : null,
          }}
        />
      </div>
    </div>
  )
}
