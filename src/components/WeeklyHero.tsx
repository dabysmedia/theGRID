"use client"

import { useLayoutEffect, useState } from "react"
import {
  Flame,
  Footprints,
  Moon,
  PersonStanding,
  Dumbbell,
  Check,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react"
import { DailyWeighIn } from "@/components/DailyWeighIn"
import { useActiveDate } from "@/context/DateContext"
import { useQuickLog } from "@/context/QuickLogContext"
import { cn, glassPanelClass, parseLocalDate } from "@/lib/utils"

/** Show today’s weigh-in prompt on the hub only from this local hour onward (inclusive). */
const WEIGH_IN_PROMPT_FROM_HOUR = 4
const WEEKLY_WORKOUT_GOAL = 3

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
}: ProgressRingProps) {
  const radius = 38
  const stroke = 3
  const circumference = 2 * Math.PI * radius
  const pct = disabled ? 0 : max > 0 ? Math.min(value / max, 1) : 0
  const offset = circumference - pct * circumference
  const strokeColor = disabled ? "oklch(0.45 0.01 250 / 35%)" : color
  const clickable = Boolean(onClick) && !disabled

  const ringBody = (
    <>
      <div className="relative w-[88px] h-[88px] lg:w-[96px] lg:h-[96px]">
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
                    filter: `drop-shadow(0 0 6px ${color}50)`,
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
          <span className={disabled ? "opacity-40" : undefined}>{icon}</span>
          <span className={cn("type-hud-stat mt-0.5", disabled && "text-muted-foreground/50 tabular-nums")}>
            {disabled && centerLabel != null
              ? centerLabel
              : valueLabel ?? formatRingValue(value)}
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

function weekTotal(last7: number[]): number {
  return last7.reduce((s, v) => s + v, 0)
}

function currentWeekValuesFromLast7(last7: number[], refDate: Date): number[] {
  const dayOfWeek = refDate.getDay()
  const daysIntoWeek = dayOfWeek === 0 ? 7 : dayOfWeek
  return last7.slice(Math.max(0, last7.length - daysIntoWeek))
}

/** Tiny goal ring matching workouts page behavior (checkmark at goal). */
function WeekWorkoutGoalRing({ count }: { count: number }) {
  const stroke = 2.8
  const vb = 24
  const r = (vb - stroke) / 2
  const cx = vb / 2
  const cy = vb / 2
  const circumference = 2 * Math.PI * r
  const pct =
    Math.min(Math.max(count, 0), WEEKLY_WORKOUT_GOAL) /
    WEEKLY_WORKOUT_GOAL
  const dash = circumference * pct

  if (count >= WEEKLY_WORKOUT_GOAL) {
    return <Check className="h-4 w-4 text-emerald-500" strokeWidth={2.8} aria-hidden />
  }

  return (
    <svg
      viewBox={`0 0 ${vb} ${vb}`}
      className="h-4 w-4 -rotate-90"
      aria-hidden
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-muted-foreground/25"
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        className="text-emerald-500"
      />
    </svg>
  )
}

/** 0–1, caps over-performance at 100% for scoring */
function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, 1)
}

/**
 * Weekly score 0–100: equal weight on calories avg vs goal, steps avg vs goal, and avg of
 * running + workout vs goals. When `skipCalories`, calories are omitted (vacation on hub day).
 */
function computeWeeklyScore(d: DashboardData, skipCalories: boolean): number {
  const calGoal = d.calories.goal ?? 2000
  const stepsGoal = d.steps.goal ?? 10000
  const calAvg = weekAvgFromLoggedDays(d.calories.last7)
  const stepsAvg = weekAvgFromLoggedDays(d.steps.last7)

  const calScore = calGoal > 0 ? clamp01(calAvg / calGoal) : 0
  const stepsScore = stepsGoal > 0 ? clamp01(stepsAvg / stepsGoal) : 0

  const runGoalDaily = d.running.goal ?? 3
  const runAvg = weekAvgFromLoggedDays(d.running.last7)
  const runScore = runGoalDaily > 0 ? clamp01(runAvg / runGoalDaily) : 0

  const workoutGoalDaily = d.workouts.goal ?? 1
  const workoutAvg = weekAvgFromLoggedDays(d.workouts.last7)
  const workoutScore =
    workoutGoalDaily > 0 ? clamp01(workoutAvg / workoutGoalDaily) : 0

  const activityScore = (runScore + workoutScore) / 2
  if (skipCalories) {
    return Math.round(((stepsScore + activityScore) / 2) * 100)
  }
  return Math.round(((calScore + stepsScore + activityScore) / 3) * 100)
}

export function WeeklyHero({ data, loading, vacationBlocksCalories = false }: WeeklyHeroProps) {
  const { activeDate, isToday } = useActiveDate()
  const { openQuickLog } = useQuickLog()
  const [showWeighInPrompt, setShowWeighInPrompt] = useState(false)
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
  const workoutsThisWeek = weekTotal(currentWeekValuesFromLast7(data.workouts.last7, refDate))

  const calGoal = data.calories.goal ?? 2000
  const stepsGoal = data.steps.goal ?? 10000
  const sleepGoal = data.sleep.goal ?? 8

  const weeklyScore = computeWeeklyScore(data, vacationBlocksCalories)
  const weightTrend = data.weightTrend?.baselineTrend ?? "maintaining"
  const weightDelta = data.weightTrend?.vsBaselineLb ?? 0
  const weightIcon =
    weightTrend === "losing"
      ? <TrendingDown className="h-4 w-4" style={{ color: "#22c55e" }} />
      : weightTrend === "gaining"
        ? <TrendingUp className="h-4 w-4" style={{ color: "#ef4444" }} />
        : <Minus className="h-4 w-4" style={{ color: "#14b8a6" }} />
  const weightLabel =
    weightTrend === "losing"
      ? "Losing"
      : weightTrend === "gaining"
        ? "Gaining"
        : "Maintaining"

  const secondaryStats = [
    {
      icon: <PersonStanding className="h-4 w-4" style={{ color: "#3b82f6" }} />,
      label: "Running",
      value: `${(weekTotal(data.running.last7)).toFixed(1)} mi`,
    },
    {
      icon: <WeekWorkoutGoalRing count={workoutsThisWeek} />,
      label: "Workouts",
      value: `${workoutsThisWeek}/${WEEKLY_WORKOUT_GOAL} this wk`,
    },
    {
      icon: weightIcon,
      label: "Weight",
      value: `${weightLabel} ${weightDelta > 0 ? `+${weightDelta}` : weightDelta} lb`,
    },
  ]

  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
  const dateRange = `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()} – ${monthNames[weekEnd.getMonth()]} ${weekEnd.getDate()}`

  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"]
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
          <h2 className="type-hud-title">Weekly Overview</h2>
        </div>
          <span className="type-hud-eyebrow">{dateRange}</span>
      </div>

      {/* Progress rings row */}
      <div className="flex justify-around mb-5 relative z-10 animate-fade-up stagger-1">
        <ProgressRing
          value={calAvg}
          max={calGoal}
          label="Calories"
          unit="avg"
          color="#ef4444"
          icon={<Flame className="h-3.5 w-3.5 text-[#ef4444]" />}
          disabled={vacationBlocksCalories}
          centerLabel="—"
          onClick={() => openQuickLog("calories")}
          ariaLabel="Log food"
        />
        <ProgressRing
          value={stepsAvg}
          max={stepsGoal}
          label="Steps"
          unit="avg"
          color="#22c55e"
          icon={<Footprints className="h-3.5 w-3.5 text-[#22c55e]" />}
          onClick={() => openQuickLog("steps")}
          ariaLabel="Log steps"
        />
        <ProgressRing
          value={sleepAvg}
          max={sleepGoal}
          label="Sleep"
          unit="hrs avg"
          color="#6366f1"
          icon={<Moon className="h-3.5 w-3.5 text-[#6366f1]" />}
          onClick={() => openQuickLog("sleep")}
          ariaLabel="Log sleep"
        />
      </div>

      {/* Weekly score */}
      <div className="mb-5 relative z-10 animate-fade-up stagger-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="type-hud-label-soft">Weekly score</span>
          <span className="type-hud-stat-xs text-primary tracking-wider">
            {weeklyScore}%
          </span>
        </div>
        <div className="h-1 w-full bg-muted/20 overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-700 ease-out"
            style={{
              width: `${weeklyScore}%`,
              boxShadow: '0 0 8px oklch(0.82 0.18 110 / 25%)',
            }}
          />
        </div>
      </div>

      {/* Weekly activity bars */}
      <div className="mb-4 relative z-10 animate-fade-up stagger-3">
        <p className="type-hud-subsection mb-2">Steps Activity</p>
        <div className="flex items-end justify-between gap-1.5 h-10">
          {data.steps.last7.map((val, i) => {
            const pct = stepsMax > 0 ? (val / stepsMax) * 100 : 0
            const isToday = i === data.steps.last7.length - 1
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full relative" style={{ height: "32px" }}>
                  <div
                    className="absolute bottom-0 w-full animate-bar-grow"
                    style={{
                      height: `${Math.max(pct, 4)}%`,
                      backgroundColor: isToday ? "#22c55e" : "#22c55e50",
                      boxShadow: isToday ? '0 0 6px #22c55e40' : 'none',
                      borderRadius: '1px',
                      animationDelay: `${300 + i * 60}ms`,
                    }}
                  />
                </div>
                <span className={`text-[10px] tracking-wider ${isToday ? "text-foreground font-semibold" : "text-muted-foreground/50"}`}>
                  {dayLabels[i]}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Secondary stats pills */}
      <div className="flex gap-2 relative z-10 animate-fade-up stagger-4">
        {secondaryStats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-1 items-center gap-1.5 rounded-xl glass-subtle px-2.5 py-2.5"
          >
            <div className="flex h-4 w-4 shrink-0 items-center justify-center">
              {stat.icon}
            </div>
            <div className="min-w-0 pl-0.5 text-left">
              <p className="type-hud-caption-tight truncate text-left leading-none">{stat.label}</p>
              <p className="type-hud-stat-sm mt-1 leading-none">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {showWeighInPrompt && (
        <div className="mt-5 pt-5 border-t border-glass-border relative z-10">
          <DailyWeighIn embedded />
        </div>
      )}
    </div>
  )
}
