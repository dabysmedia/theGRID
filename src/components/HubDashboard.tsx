"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Flame,
  Footprints,
  PersonStanding,
  Dumbbell,
  Moon,
  Beer,
  CircleDot,
  ChevronDown,
  Activity,
} from "lucide-react"
import { DailySummaryCard } from "./DailySummaryCard"
import { PageHeader } from "./PageHeader"
import { WeeklyHero } from "./WeeklyHero"
import { FastingTimer } from "./FastingTimer"
import { FastingHubTile } from "./FastingHubTile"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { isVacationBlockingCalendarDay, vacationCalorieDayMask } from "@/lib/vacation-mode"

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
  alcohol: { todayValue: 0, goal: null, unit: "units", last7: emptyLast7() },
  bowel: { todayValue: 0, goal: null, unit: "", last7: emptyLast7() },
  recovery: { todayValue: 0, goal: 7, unit: "/10", last7: emptyLast7() },
  weightTrend: null,
}

const categories = [
  { key: "calories" as const, title: "Calories", icon: Flame, href: "/calories", color: "#ef4444" },
  { key: "steps" as const, title: "Steps", icon: Footprints, href: "/steps", color: "#22c55e" },
  { key: "running" as const, title: "Running", icon: PersonStanding, href: "/running", color: "#3b82f6" },
  { key: "workouts" as const, title: "Workouts", icon: Dumbbell, href: "/workouts", color: "#c4d632" },
  { key: "sleep" as const, title: "Sleep", icon: Moon, href: "/sleep", color: "#6366f1" },
  { key: "bowel" as const, title: "Bowel", icon: CircleDot, href: "/bowel", color: "#92400e" },
  { key: "recovery" as const, title: "Recovery", icon: Activity, href: "/recovery", color: "#2dd4bf" },
  { key: "alcohol" as const, title: "Alcohol", icon: Beer, href: "/alcohol", color: "#f59e0b" },
] as const

const mainCategories = categories.filter((c) => c.key !== "alcohol")
const alcoholCategory = categories.find((c) => c.key === "alcohol")!

export function HubDashboard() {
  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const [data, setData] = useState<DashboardData>(defaultData)
  const [loading, setLoading] = useState(true)
  const [othersOpen, setOthersOpen] = useState(false)

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
    setLoading(true)
    async function fetchDashboard() {
      try {
        const res = await apiFetch(`/api/dashboard?d=${activeDate}&_ts=${Date.now()}`, {
          cache: "no-store",
        })
        if (res.ok && !cancelled) {
          setData(await res.json())
        }
      } catch {
        // DB not yet connected
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchDashboard()
    return () => { cancelled = true }
  }, [activeDate])

  const staggerClasses = ["stagger-1", "stagger-2", "stagger-3", "stagger-4", "stagger-5", "stagger-6", "stagger-7"]

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
            const chartData =
              cat.key === "calories"
                ? summary.last7.map((v, j) => ({ value: calorieDayMask[j] ? 0 : v }))
                : summary.last7.map((v) => ({ value: v }))
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
                  color={cat.color}
                  disabled={cat.key === "calories" && vacationBlocksCalLog}
                  disabledHint={cat.key === "calories" && vacationBlocksCalLog ? "Vacation mode" : undefined}
                />
              </div>
            )
          })}
          <div
            className={`animate-scale-in aspect-square min-h-0 w-full max-w-full ${staggerClasses[mainCategories.length] ?? ""}`}
          >
            <FastingHubTile />
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() => setOthersOpen((o) => !o)}
            aria-expanded={othersOpen}
            className="glass-subtle flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80 transition-colors hover:text-foreground hover:bg-glass-highlight/25"
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
              <div className="animate-scale-in aspect-square min-h-0 w-full max-w-full stagger-6">
                <DailySummaryCard
                  title={alcoholCategory.title}
                  value={data.alcohol.todayValue}
                  goal={data.alcohol.goal ?? undefined}
                  unit={data.alcohol.unit}
                  icon={alcoholCategory.icon}
                  href={alcoholCategory.href}
                  chartData={data.alcohol.last7.map((v) => ({ value: v }))}
                  color={alcoholCategory.color}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
