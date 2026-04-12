"use client"

import { useLayoutEffect, useState } from "react"
import {
  Flame,
  Footprints,
  Moon,
  PersonStanding,
  Dumbbell,
} from "lucide-react"
import { DailyWeighIn } from "@/components/DailyWeighIn"
import { useActiveDate } from "@/context/DateContext"
import { parseLocalDate } from "@/lib/utils"

/** Show today’s weigh-in prompt on the hub only from this local hour onward (inclusive). */
const WEIGH_IN_PROMPT_FROM_HOUR = 4

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

interface ProgressRingProps {
  value: number
  max: number
  label: string
  unit: string
  color: string
  icon: React.ReactNode
}

function ProgressRing({ value, max, label, unit, color, icon }: ProgressRingProps) {
  const radius = 38
  const stroke = 3
  const circumference = 2 * Math.PI * radius
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  const offset = circumference - pct * circumference

  return (
    <div className="flex flex-col items-center gap-1.5">
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
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="butt"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              filter: `drop-shadow(0 0 6px ${color}50)`,
              animation: `draw-ring 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both`,
              // @ts-expect-error CSS custom properties
              "--ring-circumference": circumference,
              "--ring-offset": offset,
            }}
          />
          {/* Tick marks */}
          {[0, 90, 180, 270].map((deg) => (
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
          {icon}
          <span className="text-sm font-bold tabular-nums mt-0.5">
            {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : Math.round(value)}
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </p>
        <p className="text-[10px] text-muted-foreground/60 tracking-wider">
          / {max >= 1000 ? `${(max / 1000).toFixed(max % 1000 === 0 ? 0 : 1)}k` : max} {unit}
        </p>
      </div>
    </div>
  )
}

interface WeeklyHeroProps {
  data: DashboardData
  loading: boolean
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

/** 0–1, caps over-performance at 100% for scoring */
function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, 1)
}

/** Weekly score 0–100: equal weight on calories avg vs goal, steps avg vs goal, and avg of running + workout vs goals */
function computeWeeklyScore(d: DashboardData): number {
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
  return Math.round(((calScore + stepsScore + activityScore) / 3) * 100)
}

export function WeeklyHero({ data, loading }: WeeklyHeroProps) {
  const { activeDate, isToday } = useActiveDate()
  const [showWeighInPrompt, setShowWeighInPrompt] = useState(false)

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
  const calAvg = Math.round(weekAvgFromLoggedDays(data.calories.last7))
  const stepsAvg = Math.round(weekAvgFromLoggedDays(data.steps.last7))
  const sleepAvg = Math.round(weekAvgFromLoggedDays(data.sleep.last7) * 10) / 10

  const calGoal = data.calories.goal ?? 2000
  const stepsGoal = data.steps.goal ?? 10000
  const sleepGoal = data.sleep.goal ?? 8

  const weeklyScore = computeWeeklyScore(data)

  const secondaryStats = [
    {
      icon: <PersonStanding className="h-3 w-3" style={{ color: "#3b82f6" }} />,
      label: "Running",
      value: `${(weekTotal(data.running.last7)).toFixed(1)} mi`,
    },
    {
      icon: <Dumbbell className="h-3 w-3" style={{ color: "#c4d632" }} />,
      label: "Workouts",
      value: `${weekTotal(data.workouts.last7)}`,
    },
    {
      icon: <Moon className="h-3 w-3" style={{ color: "#6366f1" }} />,
      label: "Sleep",
      value: `${sleepAvg} hrs avg`,
    },
  ]

  const refDate = parseLocalDate(activeDate)
  const dayOfWeek = refDate.getDay()
  const weekStart = new Date(refDate)
  weekStart.setDate(refDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
  const dateRange = `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()} – ${monthNames[weekEnd.getMonth()]} ${weekEnd.getDate()}`

  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"]
  const stepsMax = Math.max(...data.steps.last7, 1)

  return (
    <div
      className={`glass relative overflow-hidden rounded-2xl border border-border/20 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-primary/[0.03] p-5 lg:p-6 shadow-[inset_0_1px_0_0_oklch(1_0_0/10%),0_22px_56px_-20px_oklch(0_0_0/42%)] transition-opacity duration-500 dark:border-[oklch(1_0_0/9%)] dark:from-glass-highlight/[0.1] dark:to-primary/[0.05] dark:shadow-[inset_0_1px_0_0_oklch(1_0_0/12%),0_28px_72px_-24px_oklch(0_0_0/62%)] ${
        loading ? "opacity-50" : "opacity-100"
      }`}
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
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.25em]">Weekly Overview</h2>
        </div>
          <span className="text-[10px] text-muted-foreground/70 font-medium tracking-[0.12em]">{dateRange}</span>
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
        />
        <ProgressRing
          value={stepsAvg}
          max={stepsGoal}
          label="Steps"
          unit="avg"
          color="#22c55e"
          icon={<Footprints className="h-3.5 w-3.5 text-[#22c55e]" />}
        />
        <ProgressRing
          value={sleepAvg}
          max={sleepGoal}
          label="Sleep"
          unit="hrs avg"
          color="#6366f1"
          icon={<Moon className="h-3.5 w-3.5 text-[#6366f1]" />}
        />
      </div>

      {/* Weekly score */}
      <div className="mb-5 relative z-10 animate-fade-up stagger-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-[0.15em]">
            Weekly score
          </span>
          <span className="text-[10px] font-bold tabular-nums text-primary tracking-wider">
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
        <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-[0.15em] mb-2">
          Steps Activity
        </p>
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
            className="flex flex-1 items-center gap-1.5 rounded-xl glass-subtle px-2.5 py-2"
          >
            {stat.icon}
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.12em] truncate">
                {stat.label}
              </p>
              <p className="text-[11px] font-semibold tabular-nums">{stat.value}</p>
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
