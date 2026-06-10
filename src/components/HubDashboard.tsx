"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { CATEGORY_THEME, type CategoryKey } from "@/lib/category-theme"
import { DailySummaryCard } from "./DailySummaryCard"
import { PageHeader } from "./PageHeader"
import { WeeklyHero } from "./WeeklyHero"
import { FastingTimer } from "./FastingTimer"
import {
  HubBowelFooter,
  HubCalorieFooter,
  HubPeptideFooter,
  HubSleepBedtimeFooter,
  HubWorkoutFooter,
} from "./hub/HubTileFooters"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import { cn, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { isVacationBlockingCalendarDay, vacationCalorieDayMask } from "@/lib/vacation-mode"
import {
  HUB_PREFS_CHANGED_EVENT,
  computeNextInjection,
  computeTargetBedtime,
  readDesiredWakeTime,
  readInjectionIntervalDays,
} from "@/lib/hub-tile-prefs"

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
  weightTrend: {
    baselineTrend: "losing" | "maintaining" | "gaining"
    vsBaselineLb: number
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
  weightTrend: null,
}

const categoryOrder = [
  "calories",
  "steps",
  "peptides",
  "workouts",
  "sleep",
  "running",
  "bowel",
  "alcohol",
] satisfies CategoryKey[]

interface PeptideHubEntry {
  injectedAt: string
  doseMg: number
}

function workoutsThisWeek(last7: number[], refDateKey: string): number {
  const refDate = parseLocalDate(refDateKey)
  const dayOfWeek = refDate.getDay()
  const daysIntoWeek = dayOfWeek === 0 ? 7 : dayOfWeek
  const slice = last7.slice(Math.max(0, last7.length - daysIntoWeek))
  return slice.reduce((s, v) => s + v, 0)
}

const OTHERS_KEYS = new Set<CategoryKey>(["running", "alcohol"])

const categories = categoryOrder.map((key) => {
  const t = CATEGORY_THEME[key]
  return { key, title: t.label, icon: t.icon, href: t.href, color: t.color }
})

const mainCategories = categories.filter((c) => !OTHERS_KEYS.has(c.key))
const othersCategories = categories.filter((c) => OTHERS_KEYS.has(c.key))

export function HubDashboard() {
  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const [data, setData] = useState<DashboardData>(defaultData)
  const [peptideEntries, setPeptideEntries] = useState<PeptideHubEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [othersOpen, setOthersOpen] = useState(false)
  const [desiredWakeTime, setDesiredWakeTime] = useState("06:30")
  const [injectionIntervalDays, setInjectionIntervalDays] = useState(7)

  useEffect(() => {
    if (!user?.id) return
    setDesiredWakeTime(readDesiredWakeTime(user.id))
    setInjectionIntervalDays(readInjectionIntervalDays(user.id))
  }, [user?.id])

  useEffect(() => {
    function onPrefsChanged() {
      if (!user?.id) return
      setDesiredWakeTime(readDesiredWakeTime(user.id))
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
    let cancelled = false

    async function fetchDashboard() {
      setLoading(true)
      try {
        const [dashRes, peptideRes] = await Promise.all([
          apiFetch(`/api/dashboard?d=${activeDate}&_ts=${Date.now()}`, { cache: "no-store" }),
          apiFetch("/api/peptides"),
        ])
        if (dashRes.ok && !cancelled) {
          setData(await dashRes.json())
        }
        if (peptideRes.ok && !cancelled) {
          const rows = await peptideRes.json()
          setPeptideEntries(Array.isArray(rows) ? rows : [])
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

  const sleepHoursGoal = data.sleep.goal ?? 8
  const targetBedtime = useMemo(
    () => computeTargetBedtime(desiredWakeTime, sleepHoursGoal),
    [desiredWakeTime, sleepHoursGoal]
  )

  const staggerClasses = ["stagger-1", "stagger-2", "stagger-3", "stagger-4", "stagger-5", "stagger-6", "stagger-7"]

  function tileFooter(key: CategoryKey, color: string) {
    if (key === "calories") {
      return (
        <HubCalorieFooter
          consumed={vacationBlocksCalLog ? 0 : data.calories.todayValue}
          target={data.calories.goal ?? 2000}
          color={color}
        />
      )
    }
    if (key === "workouts") {
      return <HubWorkoutFooter weekCount={weekWorkoutCount} color={color} />
    }
    if (key === "peptides") {
      return (
        <HubPeptideFooter
          lastDoseMg={lastPeptide?.doseMg ?? null}
          nextInjection={nextInjection}
          color={color}
        />
      )
    }
    if (key === "sleep") {
      return (
        <HubSleepBedtimeFooter
          targetBedtime={targetBedtime}
          desiredWakeTime={desiredWakeTime}
          sleepHoursGoal={sleepHoursGoal}
          color={color}
        />
      )
    }
    if (key === "bowel") {
      return (
        <HubBowelFooter
          todayCount={data.bowel.todayValue}
          goal={data.bowel.goal}
          color={color}
        />
      )
    }
    return undefined
  }

  return (
    <div className="space-y-8">
      <PageHeader title="THEGRID" />

      <div className="animate-fade-up stagger-2">
        <WeeklyHero
          data={dashboardForHero}
          loading={loading}
          vacationBlocksCalories={vacationBlocksCalLog}
        />
      </div>

      <div className="animate-fade-up stagger-3">
        <FastingTimer />
      </div>

      <div className="animate-fade-up stagger-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="hud-divider flex-1" />
          <span className="type-hud-rail shrink-0">SYSTEMS</span>
          <div className="hud-divider flex-1" />
        </div>

        <div
          className={`grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4 items-stretch transition-opacity duration-500 ${
            loading ? "opacity-50" : "opacity-100"
          }`}
        >
          {mainCategories.map((cat, i) => {
            const summary = data[cat.key]
            const footer = tileFooter(cat.key, cat.color)
            const chartData =
              footer == null ? summary.last7.map((v) => ({ value: v })) : undefined
            return (
              <div
                key={cat.key}
                className={`animate-scale-in aspect-square min-h-0 w-full max-w-full ${staggerClasses[i] ?? ""}`}
              >
                <DailySummaryCard
                  title={cat.title}
                  value={
                    cat.key === "calories" && vacationBlocksCalLog ? "—" : summary.todayValue
                  }
                  goal={summary.goal ?? undefined}
                  unit={summary.unit}
                  icon={cat.icon}
                  href={cat.href}
                  chartData={chartData}
                  footer={footer}
                  color={cat.color}
                  disabled={cat.key === "calories" && vacationBlocksCalLog}
                  disabledHint={cat.key === "calories" && vacationBlocksCalLog ? "Vacation mode" : undefined}
                />
              </div>
            )
          })}
        </div>

        <div className="relative z-10 mt-3 space-y-2 pb-1">
          <button
            type="button"
            onClick={() => setOthersOpen((o) => !o)}
            aria-expanded={othersOpen}
            className="glass-subtle flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl py-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80 transition-colors hover:text-foreground hover:bg-glass-highlight/25 active:scale-[0.98]"
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", othersOpen && "rotate-180")}
              aria-hidden
            />
            Others
          </button>

          {othersOpen && (
            <div
              className={`grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4 animate-fade-up ${
                loading ? "opacity-50" : "opacity-100"
              }`}
            >
              {othersCategories.map((cat, i) => {
                const summary = data[cat.key]
                return (
                  <div
                    key={cat.key}
                    className={`animate-scale-in aspect-square min-h-0 w-full max-w-full ${staggerClasses[i + 5] ?? "stagger-6"}`}
                  >
                    <DailySummaryCard
                      title={cat.title}
                      value={summary.todayValue}
                      goal={summary.goal ?? undefined}
                      unit={summary.unit}
                      icon={cat.icon}
                      href={cat.href}
                      chartData={summary.last7.map((v) => ({ value: v }))}
                      color={cat.color}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
