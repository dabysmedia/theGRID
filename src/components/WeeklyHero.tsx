"use client"

import { useLayoutEffect, useState } from "react"
import {
  Flame,
  Footprints,
  Moon,
  ChevronRight,
} from "lucide-react"
import { DailyWeighIn } from "@/components/DailyWeighIn"
import { ReadinessHeartTile } from "@/components/hub/ReadinessHeartTile"
import { useActiveDate } from "@/context/DateContext"
import { useQuickLog } from "@/context/QuickLogContext"
import { cn, glassPanelClass, parseLocalDate } from "@/lib/utils"

/** Show today’s weigh-in prompt on the hub only from this local hour onward (inclusive). */
const WEIGH_IN_PROMPT_FROM_HOUR = 4

/** Single-letter weekday labels indexed by `Date#getDay()` (Sun–Sat). */
const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] as const

/** Labels for a rolling last-N window ending on `refDate` (matches `/api/dashboard` last7 order). */
function lastNWeekdayLabels(refDate: Date, length: number): string[] {
  return Array.from({ length }, (_, i) => {
    const day = new Date(refDate)
    day.setDate(refDate.getDate() - (length - 1 - i))
    return WEEKDAY_LETTERS[day.getDay()]
  })
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
  alcohol: CategorySummary
  bowel: CategorySummary
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
  } | null
}

interface ProgressRingProps {
  value: number
  max: number
  label: string
  unit: string
  color: string
  icon: React.ReactNode
  /** Muted ring; center shows `centerLabel` instead of value (e.g. vacation). */
  disabled?: boolean
  centerLabel?: string
  valueLabel?: string
  onClick?: () => void
  ariaLabel?: string
  /** Stagger index (0–2) for ring pop-in when the overview view changes. */
  animationIndex?: number
}

function formatRingValue(value: number): string {
  const rounded = Math.round(value * 10) / 10
  if (rounded >= 1000) {
    return `${(rounded / 1000).toFixed(1)}k`
  }
  return rounded.toFixed(1)
}

function ProgressRing({
  value,
  max,
  label,
  unit,
  color,
  icon,
  disabled,
  centerLabel,
  valueLabel,
  onClick,
  ariaLabel,
  animationIndex = 0,
}: ProgressRingProps) {
  const radius = 38
  const stroke = 3
  const circumference = 2 * Math.PI * radius
  const pct = disabled ? 0 : max > 0 ? Math.min(value / max, 1) : 0
  const offset = circumference - pct * circumference
  const strokeColor = disabled ? "oklch(0.45 0.01 250 / 35%)" : color
  const clickable = Boolean(onClick) && !disabled
  const displayValue =
    disabled && centerLabel != null ? centerLabel : valueLabel ?? formatRingValue(value)
  const staggerClass =
    animationIndex === 1 ? "stagger-2" : animationIndex === 2 ? "stagger-3" : "stagger-1"

  const ringBody = (
    <>
      <div
        className={cn(
          "relative w-[108px] h-[108px] lg:w-[120px] lg:h-[120px] motion-safe:animate-ring-pop motion-reduce:animate-none",
          staggerClass
        )}
      >
        <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-muted/30"
          />
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeLinecap="butt"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={
              disabled
                ? undefined
                : {
                    filter: `drop-shadow(0 0 8px ${color}50)`,
                    animation: `draw-ring 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both`,
                    // @ts-expect-error CSS custom properties
                    "--ring-circumference": circumference,
                    "--ring-offset": offset,
                  }
            }
          />
          {!disabled &&
            [0, 90, 180, 270].map((deg) => (
              <line
                key={deg}
                x1="44"
                y1="3"
                x2="44"
                y2="5"
                stroke={color}
                strokeWidth="0.5"
                opacity="0.3"
                transform={`rotate(${deg} 44 44)`}
              />
            ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              disabled ? "opacity-40" : undefined,
              "motion-safe:animate-scale-in motion-reduce:animate-none"
            )}
          >
            {icon}
          </span>
          <span
            key={displayValue}
            className={cn(
              "type-hud-stat mt-0.5 motion-safe:animate-count-up motion-reduce:animate-none",
              disabled && "text-muted-foreground/50 tabular-nums"
            )}
          >
            {displayValue}
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className={cn("type-hud-label", disabled && "text-muted-foreground/55")}>{label}</p>
        <p className={cn("type-hud-caption", disabled && "text-muted-foreground/40")}>
          {disabled ? "Vacation" : `/ ${max >= 1000 ? `${(max / 1000).toFixed(max % 1000 === 0 ? 0 : 1)}k` : max} ${unit}`}
        </p>
      </div>
    </>
  )

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? `Log ${label.toLowerCase()}`}
        className="group flex flex-col items-center gap-1.5 rounded-xl px-1 py-0.5 touch-manipulation transition-transform duration-150 hover:scale-[1.03] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {ringBody}
      </button>
    )
  }

  return <div className="flex flex-col items-center gap-1.5">{ringBody}</div>
}

interface WeeklyHeroProps {
  data: DashboardData
  loading: boolean
  /** Hub day is in vacation — hide calories ring from scoring and show paused UI. */
  vacationBlocksCalories?: boolean
}

/** Mean over days with logged data only (0 = no data for that day in dashboard aggregates). */
function weekAvgFromLoggedDays(last7: number[]): number {
  const logged = last7.filter((v) => v > 0)
  if (!logged.length) return 0
  return logged.reduce((s, v) => s + v, 0) / logged.length
}

type OverviewView = "today" | "week"

export function WeeklyHero({ data, loading, vacationBlocksCalories = false }: WeeklyHeroProps) {
  const { activeDate, isToday } = useActiveDate()
  const { openQuickLog } = useQuickLog()
  const [showWeighInPrompt, setShowWeighInPrompt] = useState(false)
  const [viewMode, setViewMode] = useState<OverviewView>("today")
  const refDate = parseLocalDate(activeDate)
  const dayOfWeek = refDate.getDay()
  const weekStart = new Date(refDate)
  weekStart.setDate(refDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  useLayoutEffect(() => {
    if (!isToday) {
      setShowWeighInPrompt(true)
      return
    }
    const apply = () =>
      setShowWeighInPrompt(new Date().getHours() >= WEIGH_IN_PROMPT_FROM_HOUR)
    apply()
    const id = setInterval(apply, 60_000)
    return () => clearInterval(id)
  }, [isToday])
  const calAvg = weekAvgFromLoggedDays(data.calories.last7)
  const stepsAvg = weekAvgFromLoggedDays(data.steps.last7)
  const sleepAvg = Math.round(weekAvgFromLoggedDays(data.sleep.last7) * 10) / 10

  const calGoal = data.calories.goal ?? 2000
  const stepsGoal = data.steps.goal ?? 10000
  const sleepGoal = data.sleep.goal ?? 8

  const isWeekView = viewMode === "week"
  const calValue = isWeekView ? calAvg : data.calories.todayValue
  const stepsValue = isWeekView ? stepsAvg : data.steps.todayValue
  const sleepValue = isWeekView ? sleepAvg : data.sleep.todayValue
  const readinessValue = isWeekView
    ? (data.readiness?.weekAvg ?? null)
    : (data.readiness?.todayValue ?? null)
  const hrvMs = data.readiness?.hrvMs ?? null
  const restingHeartRate = data.readiness?.restingHeartRate ?? null

  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
  const dateRange = `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()} – ${monthNames[weekEnd.getMonth()]} ${weekEnd.getDate()}`
  const dayLabel = isToday
    ? "Today"
    : `${monthNames[refDate.getMonth()]} ${refDate.getDate()}`

  const dayLabels = lastNWeekdayLabels(refDate, data.steps.last7.length)
  const stepsMax = Math.max(...data.steps.last7, 1)

  return (
    <div
      className={cn(
        glassPanelClass,
        "bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-primary/[0.03] p-5 lg:p-6 transition-opacity duration-500 dark:from-glass-highlight/[0.1] dark:to-primary/[0.05]",
        loading ? "opacity-50" : "opacity-100"
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-8%,oklch(1_0_0/14%),transparent_58%)] dark:bg-[radial-gradient(ellipse_90%_50%_at_50%_-6%,oklch(1_0_0/10%),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-glass-highlight/45 to-transparent dark:via-white/12"
        aria-hidden
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-5 relative z-10">
        <div className="flex items-center gap-2">
          <div className="status-dot" />
          <h2
            key={viewMode}
            className="type-hud-title motion-safe:animate-fade-up motion-reduce:animate-none"
          >
            {isWeekView ? "Weekly Overview" : "Daily Overview"}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            key={`${viewMode}-eyebrow`}
            className="type-hud-eyebrow motion-safe:animate-fade-up motion-reduce:animate-none"
          >
            {isWeekView ? dateRange : dayLabel}
          </span>
          <button
            type="button"
            onClick={() => setViewMode((mode) => (mode === "today" ? "week" : "today"))}
            aria-label={isWeekView ? "Show today's values" : "Show weekly values"}
            className="flex h-7 w-7 items-center justify-center rounded-lg glass-subtle text-muted-foreground transition-colors hover:text-foreground hover:bg-glass-highlight/30 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-300 ease-out",
                isWeekView && "rotate-180"
              )}
              aria-hidden
            />
          </button>
        </div>
      </div>

      <div
        key={viewMode}
        className="relative z-10 motion-safe:animate-fade-up motion-reduce:animate-none"
      >
      {/* Progress rings row */}
      <div className="flex justify-around mb-6">
        <ProgressRing
          value={calValue}
          max={calGoal}
          label="Calories"
          unit={isWeekView ? "avg" : "cal"}
          color="#ef4444"
          icon={<Flame className="h-4 w-4 text-[#ef4444]" />}
          disabled={vacationBlocksCalories}
          centerLabel="—"
          onClick={() => openQuickLog("calories")}
          ariaLabel="Log food"
          animationIndex={0}
        />
        <ProgressRing
          value={stepsValue}
          max={stepsGoal}
          label="Steps"
          unit={isWeekView ? "avg" : "steps"}
          color="#22c55e"
          icon={<Footprints className="h-4 w-4 text-[#22c55e]" />}
          onClick={() => openQuickLog("steps")}
          ariaLabel="Log steps"
          animationIndex={1}
        />
        <ProgressRing
          value={sleepValue}
          max={sleepGoal}
          label="Sleep"
          unit={isWeekView ? "hrs avg" : "hrs"}
          color="#6366f1"
          icon={<Moon className="h-4 w-4 text-[#6366f1]" />}
          onClick={() => openQuickLog("sleep")}
          ariaLabel="Log sleep"
          animationIndex={2}
        />
      </div>

      <ReadinessHeartTile
        key={`${viewMode}-readiness`}
        readiness={readinessValue}
        hrvMs={hrvMs}
        restingHeartRate={restingHeartRate}
        isWeekView={isWeekView}
        className="motion-safe:animate-fade-up motion-reduce:animate-none"
      />

      {/* Weekly activity bars */}
      <div className="animate-fade-up stagger-3">
        <p className="type-hud-subsection mb-2">Steps Activity</p>
        <div className="flex items-end justify-between gap-1.5 h-10">
          {data.steps.last7.map((val, i) => {
            const pct = stepsMax > 0 ? (val / stepsMax) * 100 : 0
            const isTodayBar = i === data.steps.last7.length - 1
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full relative" style={{ height: "32px" }}>
                  <div
                    className="absolute bottom-0 w-full animate-bar-grow"
                    style={{
                      height: `${Math.max(pct, 4)}%`,
                      backgroundColor: isTodayBar ? "#22c55e" : "#22c55e50",
                      boxShadow: isTodayBar ? '0 0 6px #22c55e40' : 'none',
                      borderRadius: '1px',
                      animationDelay: `${300 + i * 60}ms`,
                    }}
                  />
                </div>
                <span className={`text-[10px] tracking-wider ${isTodayBar ? "text-foreground font-semibold" : "text-muted-foreground/50"}`}>
                  {dayLabels[i]}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      </div>

      {showWeighInPrompt && (
        <div className="mt-5 pt-5 border-t border-glass-border relative z-10">
          <DailyWeighIn embedded weightTrend={data.weightTrend} />
        </div>
      )}
    </div>
  )
}
