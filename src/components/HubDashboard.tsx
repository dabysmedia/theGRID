"use client"

import { useEffect, useState } from "react"
import {
  Flame,
  Footprints,
  PersonStanding,
  Dumbbell,
  Moon,
  Beer,
  CircleDot,
  ChevronDown,
} from "lucide-react"
import { DailySummaryCard } from "./DailySummaryCard"
import { DatePicker } from "./DatePicker"
import { WeeklyHero } from "./WeeklyHero"
import { FastingTimer } from "./FastingTimer"
import { FastingHubTile } from "./FastingHubTile"
import { useActiveDate } from "@/context/DateContext"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"

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
}

const categories = [
  { key: "calories" as const, title: "Calories", icon: Flame, href: "/calories", color: "#ef4444" },
  { key: "steps" as const, title: "Steps", icon: Footprints, href: "/steps", color: "#22c55e" },
  { key: "running" as const, title: "Running", icon: PersonStanding, href: "/running", color: "#3b82f6" },
  { key: "workouts" as const, title: "Workouts", icon: Dumbbell, href: "/workouts", color: "#a855f7" },
  { key: "sleep" as const, title: "Sleep", icon: Moon, href: "/sleep", color: "#6366f1" },
  { key: "bowel" as const, title: "Bowel", icon: CircleDot, href: "/bowel", color: "#78716c" },
  { key: "alcohol" as const, title: "Alcohol", icon: Beer, href: "/alcohol", color: "#f59e0b" },
] as const

const mainCategories = categories.filter((c) => c.key !== "alcohol")
const alcoholCategory = categories.find((c) => c.key === "alcohol")!

export function HubDashboard() {
  const { activeDate } = useActiveDate()
  const [data, setData] = useState<DashboardData>(defaultData)
  const [loading, setLoading] = useState(true)
  const [othersOpen, setOthersOpen] = useState(false)

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
      <header className="animate-fade-up">
        <div className="flex flex-col gap-2 sm:gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="status-dot translate-y-px" aria-hidden />
            <h1 className="font-iceberg text-3xl font-semibold leading-none tracking-[-0.03em] sm:text-4xl">
              <span className="text-gradient-glass title-underline-accent inline-block">
                THEGRID
              </span>
            </h1>
          </div>
          <DatePicker />
        </div>
      </header>

      <div className="animate-fade-up stagger-2">
        <WeeklyHero data={data} loading={loading} />
      </div>

      <div className="animate-fade-up stagger-3">
        <FastingTimer />
      </div>

      <div className="animate-fade-up stagger-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="hud-divider flex-1" />
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground/50 shrink-0">
            SYSTEMS
          </span>
          <div className="hud-divider flex-1" />
        </div>

        <div
          className={`grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4 items-stretch transition-opacity duration-500 ${
            loading ? "opacity-50" : "opacity-100"
          }`}
        >
          {mainCategories.map((cat, i) => {
            const summary = data[cat.key]
            return (
              <div
                key={cat.key}
                className={`animate-scale-in aspect-square min-h-0 w-full max-w-full ${staggerClasses[i] ?? ""}`}
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
