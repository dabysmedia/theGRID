"use client"

import { useLayoutEffect, useState } from "react"
import {
  Flame,
  Footprints,
  Moon,
  ChevronRight,
} from "lucide-react"
import { DailyWeighIn } from "@/components/DailyWeighIn"
import { StepsActivityBars } from "@/components/hub/StepsActivityBars"
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
  const radius = 34
  const trackR = 38
  const stroke = 5
  const trackStroke = 2.5
  const circumference = 2 * Math.PI * radius
  const pct = disabled ? 0 : max > 0 ? Math.min(value / max, 1) : 0
  const offset = circumference - pct * circumference
  const strokeColor = disabled ? "oklch(0.45 0.01 250 / 35%)" : color
  const clickable = Boolean(onClick) && !disabled
  const displayValue =
    disabled && centerLabel != null ? centerLabel : valueLabel ?? formatRingValue(value)
  const staggerClass =
    animationIndex === 1 ? "stagger-2" : animationIndex === 2 ? "stagger-3" : "stagger-1"
  const goalLabel =
    max >= 1000
      ? `${(max / 1000).toFixed(max % 1000 === 0 ? 0 : 1)}k`
      : String(max)

  const ringBody = (
    <>
      <div
        className={cn(
          "relative h-[112px] w-[112px] motion-safe:animate-ring-pop motion-reduce:animate-none lg:h-[124px] lg:w-[124px]",
          staggerClass,
        )}
      >
        {/* Soft steel instrument wash behind the ring */}
        <div
          className="pointer-events-none absolute inset-[12%] rounded-full opacity-80"
          style={{
            background:
              "radial-gradient(circle, oklch(0.72 0.02 250 / 14%) 0%, oklch(0.55 0.015 250 / 06%) 42%, transparent 72%)",
            boxShadow: disabled ? undefined : "inset 0 0 18px oklch(0.7 0.02 250 / 12%)",
          }}
          aria-hidden
        />
        <svg className="relative z-10 h-full w-full -rotate-90" viewBox="0 0 88 88">
          <defs>
            <linearGradient id={`ring-grad-${label}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="55%" stopColor={color} stopOpacity="0.85" />
              <stop offset="100%" stopColor={color} stopOpacity="0.55" />
            </linearGradient>
          </defs>
          {/* Outer steel bezel */}
          <circle
            cx="44"
            cy="44"
            r={trackR + 2}
            fill="none"
            stroke="oklch(0.72 0.02 250)"
            strokeWidth="0.6"
            opacity={disabled ? 0.12 : 0.28}
          />
          <circle
            cx="44"
            cy="44"
            r={trackR}
            fill="none"
            stroke="oklch(0.68 0.015 250)"
            strokeWidth={trackStroke}
            opacity={disabled ? 0.12 : 0.22}
          />
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-muted/25"
          />
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke={disabled ? strokeColor : `url(#ring-grad-${label})`}
            strokeWidth={stroke}
            strokeLinecap="butt"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={
              disabled
                ? undefined
                : {
                    filter: `drop-shadow(0 0 10px ${color}55)`,
                    animation: `draw-ring 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both`,
                    // @ts-expect-error CSS custom properties
                    "--ring-circumference": circumference,
                    "--ring-offset": offset,
                  }
            }
          />
          {!disabled &&
            Array.from({ length: 12 }, (_, i) => {
              const deg = i * 30
              const major = i % 3 === 0
              return (
                <line
                  key={deg}
                  x1="44"
                  y1={major ? 2.5 : 4}
                  x2="44"
                  y2={major ? 7 : 6}
                  stroke="oklch(0.75 0.02 250)"
                  strokeWidth={major ? 1 : 0.55}
                  opacity={major ? 0.4 : 0.2}
                  transform={`rotate(${deg} 44 44)`}
                />
              )
            })}
        </svg>
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
          <span
            className={cn(
              disabled ? "opacity-40" : undefined,
              "motion-safe:animate-scale-in motion-reduce:animate-none",
            )}
            style={disabled ? undefined : { filter: `drop-shadow(0 0 6px ${color}66)` }}
          >
            {icon}
          </span>
          <span
            key={displayValue}
            className={cn(
              "type-hud-stat mt-0.5 motion-safe:animate-count-up motion-reduce:animate-none",
              disabled && "tabular-nums text-muted-foreground/50",
            )}
          >
            {displayValue}
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className={cn("type-hud-label", disabled && "text-muted-foreground/55")}>{label}</p>
        <p className={cn("type-hud-caption", disabled && "text-muted-foreground/40")}>
          {disabled ? "Vacation" : `/ ${goalLabel} ${unit}`}
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

  return (
    <div
      className={cn(
        glassPanelClass,
        "overflow-hidden p-4 transition-opacity duration-500 lg:p-5",
        loading ? "opacity-50" : "opacity-100",
      )}
    >
      {/* Full-card HUD wash — steel chrome */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "linear-gradient(180deg, oklch(0.72 0.02 250 / 10%) 0%, oklch(0.65 0.015 250 / 05%) 42%, oklch(0.55 0.01 250 / 03%) 72%, transparent 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        aria-hidden
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0.75 0.015 250 / 18%) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.75 0.015 250 / 12%) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "linear-gradient(180deg, black 0%, transparent 78%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
        aria-hidden
      />

      {/* Header */}
      <div className="relative z-10 mb-4 flex items-center justify-between">
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
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-300 ease-out",
                isWeekView && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        </div>
      </div>

      <div
        key={viewMode}
        className="relative z-10 space-y-4 motion-safe:animate-fade-up motion-reduce:animate-none"
      >
        {/* Rings — open instrument bay (no nested frame) */}
        <div className="relative px-0.5 py-1 sm:px-1">
          <div className="relative z-10 flex justify-around">
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
        </div>

        <div
          className="pointer-events-none h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
          aria-hidden
        />

        <StepsActivityBars
          key={`${viewMode}-activity`}
          values={data.steps.last7}
          labels={dayLabels}
          goal={stepsGoal}
          readiness={readinessValue}
          hrvMs={hrvMs}
          restingHeartRate={restingHeartRate}
          isWeekView={isWeekView}
          className="animate-fade-up stagger-3 motion-safe:animate-fade-up motion-reduce:animate-none"
        />

        {showWeighInPrompt ? (
          <>
            <div
              className="pointer-events-none h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
              aria-hidden
            />
            <div className="relative z-10 px-0.5 py-0.5">
              <DailyWeighIn embedded weightTrend={data.weightTrend} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
