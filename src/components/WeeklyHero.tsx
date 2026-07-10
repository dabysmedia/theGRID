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
import {
  HubCaloriesExpand,
  HubPeptidesExpand,
  HubSleepExpand,
  HubVitalsExpand,
  HubWeightExpand,
  HubWorkoutsExpand,
  HubBackToOverview,
  type HubExpandedPanel,
} from "@/components/hub/HubExpandPanels"
import { HubCollapse, HubPresence, HUB_MOTION_MS, HUB_SECTION_MOTION_MS } from "@/components/hub/HubMotion"
import { PeptideVialGraphic } from "@/components/PeptideVialGraphic"
import { WeekWorkoutGoalRing, WEEKLY_WORKOUT_GOAL } from "@/components/WeekWorkoutGoalRing"
import { useActiveDate } from "@/context/DateContext"
import type { NextInjectionInfo } from "@/lib/hub-tile-prefs"
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
  peptides?: CategorySummary
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
  /** Selected / expanded ring — slight scale + brighter wash. */
  selected?: boolean
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
  selected = false,
}: ProgressRingProps) {
  const radius = 34
  const trackR = 38
  const stroke = 5
  const trackStroke = 2.5
  const circumference = 2 * Math.PI * radius
  const pct = disabled ? 0 : max > 0 ? Math.min(value / max, 1) : 0
  const offset = circumference - pct * circumference
  const strokeColor = disabled ? "oklch(0.32 0.01 250 / 35%)" : color
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
          "relative size-[var(--hub-ring-size)] motion-safe:animate-ring-pop motion-reduce:animate-none lg:h-[124px] lg:w-[124px]",
          staggerClass,
          "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          selected && "scale-[1.06]",
        )}
      >
        {/* Soft steel instrument wash behind the ring */}
        <div
          className="pointer-events-none absolute inset-[12%] rounded-full opacity-80"
          style={{
            background:
              "radial-gradient(circle, oklch(0.36 0.015 250 / 18%) 0%, oklch(0.22 0.01 250 / 10%) 42%, transparent 72%)",
            boxShadow: disabled
              ? undefined
              : selected
                ? `inset 0 0 22px ${color}33, 0 0 28px ${color}22`
                : "inset 0 0 18px oklch(0.28 0.015 250 / 16%)",
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
            stroke="oklch(0.38 0.015 250)"
            strokeWidth="0.6"
            opacity={disabled ? 0.12 : selected ? 0.5 : 0.32}
          />
          <circle
            cx="44"
            cy="44"
            r={trackR}
            fill="none"
            stroke="oklch(0.32 0.01 250)"
            strokeWidth={trackStroke}
            opacity={disabled ? 0.12 : 0.26}
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
                  stroke="oklch(0.40 0.015 250)"
                  strokeWidth={major ? 1 : 0.55}
                  opacity={major ? 0.42 : 0.22}
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
        aria-label={ariaLabel ?? `Expand ${label.toLowerCase()}`}
        aria-expanded={selected}
        className={cn(
          "group flex flex-col items-center gap-1.5 rounded-xl px-1 py-0.5 touch-manipulation transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          selected && "scale-[1.02]",
        )}
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
  /** Controlled expansion from HubDashboard (fades SYSTEMS when set). */
  expanded?: HubExpandedPanel | null
  onExpandedChange?: (panel: HubExpandedPanel | null) => void
  /**
   * Collapsed overview: fill remaining hub column height on mobile and
   * distribute instrument sections (no default page scroll).
   */
  fillViewport?: boolean
  /** Peptides / workouts summary for the protocol/training instrument rail + expand panels. */
  peptideSummary?: {
    lastDoseMg: number | null
    lastInjectedAt: string | null
    nextInjection: NextInjectionInfo | null
    todayMg: number
    intervalDays: number
    recentEntries: Array<{
      id?: string
      injectedAt: string
      doseMg: number
      injectionSite?: string
      compound?: string
    }>
    lastSiteUsed?: string | null
    /** Distinct Monday-start weeks with ≥1 dose. */
    dosedWeekCount?: number
    hungerLogs?: Array<{ date: string; hungerLevel: number }>
  }
  workoutSummary?: {
    weekCount: number
    todayCount: number
    last7: number[]
    recoveryScore: number | null
  }
}

/** Mean over days with logged data only (0 = no data for that day in dashboard aggregates). */
function weekAvgFromLoggedDays(last7: number[]): number {
  const logged = last7.filter((v) => v > 0)
  if (!logged.length) return 0
  return logged.reduce((s, v) => s + v, 0) / logged.length
}

type OverviewView = "today" | "week"

function FadeSection({
  show,
  children,
  className,
}: {
  show: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <HubCollapse open={show} durationMs={HUB_SECTION_MOTION_MS} className={className}>
      {children}
    </HubCollapse>
  )
}

export function WeeklyHero({
  data,
  loading,
  vacationBlocksCalories = false,
  expanded: expandedProp,
  onExpandedChange,
  fillViewport = false,
  peptideSummary,
  workoutSummary,
}: WeeklyHeroProps) {
  const { activeDate, isToday } = useActiveDate()
  const [showWeighInPrompt, setShowWeighInPrompt] = useState(false)
  const [viewMode, setViewMode] = useState<OverviewView>("today")
  const [expandedLocal, setExpandedLocal] = useState<HubExpandedPanel | null>(null)
  const expanded = expandedProp !== undefined ? expandedProp : expandedLocal
  const setExpanded = (panel: HubExpandedPanel | null) => {
    onExpandedChange?.(panel)
    if (expandedProp === undefined) setExpandedLocal(panel)
  }

  const toggleExpand = (panel: HubExpandedPanel) => {
    setExpanded(expanded === panel ? null : panel)
  }

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

  // Collapse when the active day changes
  useLayoutEffect(() => {
    setExpanded(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset on date change
  }, [activeDate])

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

  const showRings =
    expanded == null || expanded === "calories" || expanded === "steps" || expanded === "sleep"
  const showStepsBars =
    expanded == null || expanded === "steps" || expanded === "vitals"
  const showWeighIn = showWeighInPrompt && (expanded == null || expanded === "weight")
  const showProtocolRail =
    expanded == null || expanded === "peptides" || expanded === "workouts"
  const dimUnrelatedRings =
    expanded === "calories" || expanded === "steps" || expanded === "sleep"

  const peptideNext = peptideSummary?.nextInjection ?? null
  let peptideCue = "Log first shot"
  if (peptideNext) {
    if (peptideNext.overdue) peptideCue = `${Math.abs(peptideNext.daysUntil)}d overdue`
    else if (peptideNext.dueToday) peptideCue = "Due today"
    else if (peptideNext.daysUntil === 1) peptideCue = "Next · tomorrow"
    else peptideCue = `${peptideNext.daysUntil}d until next`
  }

  const weekWo = workoutSummary?.weekCount ?? 0
  const woMet = weekWo >= WEEKLY_WORKOUT_GOAL
  const workoutCue = woMet
    ? "Goal met"
    : weekWo === 0
      ? "Not yet"
      : `${weekWo}/${WEEKLY_WORKOUT_GOAL} this week`

  return (
    <div
      className={cn(
        glassPanelClass,
        // Keep mobile padding stable across overview/expand so the card top
        // does not shift when fillViewport turns off.
        "flex flex-col p-4 transition-opacity duration-500 max-lg:p-3 lg:p-5",
        fillViewport && expanded == null && "max-lg:h-full max-lg:min-h-0",
        // glass-panel CSS sets overflow:hidden; sticky back control needs visible
        expanded != null && "!overflow-visible",
        loading ? "opacity-50" : "opacity-100",
      )}
    >
      {/* Full-card HUD wash — one continuous dark steel → near-black fade */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "linear-gradient(180deg, oklch(0.20 0.01 250 / 10%) 0%, oklch(0.14 0.008 250 / 14%) 34%, oklch(0.08 0.005 250 / 22%) 68%, oklch(0.04 0.004 250 / 32%) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.10]"
        aria-hidden
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0.30 0.01 250 / 18%) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.30 0.01 250 / 12%) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "linear-gradient(180deg, black 0%, transparent 62%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent"
        aria-hidden
      />

      {/* Header — same h-7 slot; overview title ↔ back chrome crossfade (no push-down) */}
      <div
        className={cn(
          "relative flex h-7 shrink-0 items-center mb-[var(--hub-section-gap)]",
          expanded != null ? "z-20 sticky top-0" : "z-10",
        )}
      >
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-between transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            expanded != null
              ? "pointer-events-none translate-y-0.5 opacity-0"
              : "translate-y-0 opacity-100",
          )}
          aria-hidden={expanded != null}
        >
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
              tabIndex={expanded != null ? -1 : undefined}
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
          className={cn(
            "absolute inset-0 flex items-center transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            expanded != null
              ? "translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-0.5 opacity-0",
          )}
          aria-hidden={expanded == null}
        >
          <HubBackToOverview onBack={() => setExpanded(null)} />
        </div>
      </div>

      <div
        key={viewMode}
        className={cn(
          "relative z-10 motion-safe:animate-fade-up motion-reduce:animate-none",
          fillViewport && expanded == null
            ? "max-lg:flex max-lg:min-h-0 max-lg:flex-1 max-lg:flex-col max-lg:justify-between max-lg:gap-[var(--hub-section-gap)] space-y-4 max-lg:space-y-0"
            : "space-y-4",
        )}
      >
        {/* Rings — open instrument bay (no nested frame) */}
        <FadeSection show={showRings} className={fillViewport ? "shrink-0" : undefined}>
          <div className="relative px-0.5 py-0.5 sm:px-1 sm:py-1">
            <div className="relative z-10 flex justify-around">
              <div
                className={cn(
                  "transition-opacity duration-500 ease-out",
                  dimUnrelatedRings && expanded !== "calories" && "pointer-events-none opacity-25",
                )}
              >
                <ProgressRing
                  value={calValue}
                  max={calGoal}
                  label="Calories"
                  unit={isWeekView ? "avg" : "cal"}
                  color="#ef4444"
                  icon={<Flame className="h-4 w-4 text-[#ef4444]" />}
                  disabled={vacationBlocksCalories}
                  centerLabel="—"
                  onClick={() => toggleExpand("calories")}
                  ariaLabel={expanded === "calories" ? "Collapse calories" : "Expand calories"}
                  animationIndex={0}
                  selected={expanded === "calories"}
                />
              </div>
              <div
                className={cn(
                  "transition-opacity duration-500 ease-out",
                  dimUnrelatedRings && expanded !== "steps" && "pointer-events-none opacity-25",
                )}
              >
                <ProgressRing
                  value={stepsValue}
                  max={stepsGoal}
                  label="Steps"
                  unit={isWeekView ? "avg" : "steps"}
                  color="#22c55e"
                  icon={<Footprints className="h-4 w-4 text-[#22c55e]" />}
                  onClick={() => toggleExpand("steps")}
                  ariaLabel={expanded === "steps" ? "Collapse steps" : "Expand steps"}
                  animationIndex={1}
                  selected={expanded === "steps"}
                />
              </div>
              <div
                className={cn(
                  "transition-opacity duration-500 ease-out",
                  dimUnrelatedRings && expanded !== "sleep" && "pointer-events-none opacity-25",
                )}
              >
                <ProgressRing
                  value={sleepValue}
                  max={sleepGoal}
                  label="Sleep"
                  unit={isWeekView ? "hrs avg" : "hrs"}
                  color="#6366f1"
                  icon={<Moon className="h-4 w-4 text-[#6366f1]" />}
                  onClick={() => toggleExpand("sleep")}
                  ariaLabel={expanded === "sleep" ? "Collapse sleep" : "Expand sleep"}
                  animationIndex={2}
                  selected={expanded === "sleep"}
                />
              </div>
            </div>
          </div>
        </FadeSection>

        <HubCollapse
          open={
            expanded === "calories" || expanded === "sleep" || expanded === "vitals"
          }
          durationMs={HUB_MOTION_MS}
        >
          <div
            className="pointer-events-none h-px bg-gradient-to-r from-transparent via-white/7 to-transparent"
            aria-hidden
          />
        </HubCollapse>

        <HubPresence open={expanded === "calories"} durationMs={HUB_MOTION_MS}>
          <HubCaloriesExpand
            consumed={data.calories.todayValue}
            target={calGoal}
            vacationBlocked={vacationBlocksCalories}
          />
        </HubPresence>

        <HubPresence open={expanded === "sleep"} durationMs={HUB_MOTION_MS}>
          <HubSleepExpand
            hours={data.sleep.todayValue}
            goal={sleepGoal}
            last7={data.sleep.last7}
            dayLabels={dayLabels}
          />
        </HubPresence>

        <FadeSection
          show={showStepsBars}
          className={cn(fillViewport && expanded == null && "min-h-0 shrink")}
        >
          {expanded == null ? (
            <div
              className="pointer-events-none h-px bg-gradient-to-r from-transparent via-white/7 to-transparent"
              aria-hidden
            />
          ) : null}
          {/* Keep StepsActivityBars mounted across expand/collapse — no key flip on
              expanded so the isometric bars grow in place instead of remounting. */}
          <StepsActivityBars
            values={data.steps.last7}
            labels={dayLabels}
            goal={stepsGoal}
            readiness={readinessValue}
            hrvMs={hrvMs}
            restingHeartRate={restingHeartRate}
            isWeekView={isWeekView}
            expanded={expanded === "steps"}
            onStepsClick={() => toggleExpand("steps")}
            onReadinessClick={() => toggleExpand("vitals")}
            readinessSelected={expanded === "vitals"}
            hideSteps={expanded === "vitals"}
            scaleToFit={fillViewport && expanded == null}
            className="animate-fade-up stagger-3 motion-safe:animate-fade-up motion-reduce:animate-none"
          />
        </FadeSection>

        <HubPresence open={expanded === "vitals"} durationMs={HUB_MOTION_MS}>
          <HubVitalsExpand
            readiness={readinessValue}
            fallbackHrvMs={hrvMs}
            fallbackRhr={restingHeartRate}
          />
        </HubPresence>

        {/* Protocol / training instrument rail — open HUD band above weigh-in coda */}
        <FadeSection show={showProtocolRail} className={fillViewport ? "shrink-0" : undefined}>
          <HubCollapse
            open={expanded !== "peptides" && expanded !== "workouts"}
            durationMs={HUB_MOTION_MS}
          >
            <div
              className="relative z-10 px-0.5 py-0.5 sm:px-1 sm:py-1"
              role="group"
              aria-label="Protocol and training"
            >
              {/* 2-col rail: vial @ 2/3 of left cell (=1/3), workout @ 1/3 of right (=2/3) — matches ring gaps */}
              <div className="relative grid grid-cols-2 items-stretch">
                <button
                  type="button"
                  onClick={() => toggleExpand("peptides")}
                  aria-label="Expand peptides"
                  aria-expanded={false}
                  className="group relative flex min-h-[var(--hub-protocol-min-h)] min-w-0 items-center py-2 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/25 sm:min-h-[6rem] sm:py-3.5"
                >
                  <span className="pointer-events-none absolute left-2/3 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                    <PeptideVialGraphic
                      color="#94a3b8"
                      doseMg={peptideSummary?.lastDoseMg ?? null}
                      size="md"
                      className="mx-0 shrink-0 opacity-90"
                    />
                  </span>
                  <div className="min-w-0 w-[calc(66.666%-3.25rem)] pr-1 text-right sm:w-[calc(66.666%-3.5rem)]">
                    <p className="type-hud-micro text-muted-foreground/70">Protocol</p>
                    <p
                      className={cn(
                        "truncate text-[13px] font-semibold tracking-wide text-foreground/90",
                        peptideNext?.overdue && "text-negative",
                        peptideNext?.dueToday && "text-primary",
                      )}
                    >
                      {peptideCue}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground/55">
                      {peptideSummary?.lastDoseMg != null
                        ? `Last ${peptideSummary.lastDoseMg} mg`
                        : "No dose logged"}
                    </p>
                  </div>
                </button>

                <div
                  className="pointer-events-none absolute inset-y-3 left-1/2 z-[1] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/12 to-transparent"
                  aria-hidden
                />

                <button
                  type="button"
                  onClick={() => toggleExpand("workouts")}
                  aria-label="Expand workouts"
                  aria-expanded={false}
                  className="group relative flex min-h-[var(--hub-protocol-min-h)] min-w-0 items-center py-2 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/25 sm:min-h-[6rem] sm:py-3.5"
                >
                  <span className="pointer-events-none absolute left-1/3 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                    <WeekWorkoutGoalRing
                      count={weekWo}
                      size="md"
                      color="#c4d632"
                      className="shrink-0"
                    />
                  </span>
                  <div className="min-w-0 w-full pl-[calc(33.333%+3.25rem)] sm:pl-[calc(33.333%+3.5rem)]">
                    <p className="type-hud-micro text-muted-foreground/70">Training</p>
                    <p
                      className="truncate text-[13px] font-semibold tracking-wide text-foreground/90"
                      style={woMet ? { color: "#c4d632" } : undefined}
                    >
                      {workoutCue}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground/55">
                      {workoutSummary?.recoveryScore != null
                        ? `Recovery ${workoutSummary.recoveryScore}/10`
                        : weekWo === 0
                          ? "No sessions yet"
                          : `${weekWo} logged`}
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </HubCollapse>

          <HubPresence open={expanded === "peptides"} durationMs={HUB_MOTION_MS}>
            <HubPeptidesExpand
              lastDoseMg={peptideSummary?.lastDoseMg ?? null}
              lastInjectedAt={peptideSummary?.lastInjectedAt ?? null}
              nextInjection={peptideNext}
              todayMg={peptideSummary?.todayMg ?? 0}
              intervalDays={peptideSummary?.intervalDays ?? 7}
              recentEntries={peptideSummary?.recentEntries ?? []}
              lastSiteUsed={peptideSummary?.lastSiteUsed ?? null}
              dosedWeekCount={peptideSummary?.dosedWeekCount ?? 0}
              hungerLogs={peptideSummary?.hungerLogs ?? []}
            />
          </HubPresence>

          <HubPresence open={expanded === "workouts"} durationMs={HUB_MOTION_MS}>
            <HubWorkoutsExpand
              weekCount={weekWo}
              todayCount={workoutSummary?.todayCount ?? data.workouts.todayValue}
              last7={workoutSummary?.last7 ?? data.workouts.last7}
              dayLabels={dayLabels}
              recoveryScore={workoutSummary?.recoveryScore ?? null}
            />
          </HubPresence>
        </FadeSection>

        {/* Weigh-in stays the coda — always last in the overview stack */}
        <FadeSection show={showWeighIn} className={fillViewport ? "shrink-0" : undefined}>
          <div className="relative z-10 space-y-3 px-0.5 py-0.5">
            <DailyWeighIn
              embedded
              weightTrend={data.weightTrend}
              onActivate={expanded === "weight" ? undefined : () => toggleExpand("weight")}
            />
            <HubPresence open={expanded === "weight"} durationMs={HUB_MOTION_MS}>
              <HubWeightExpand />
            </HubPresence>
          </div>
        </FadeSection>
      </div>
    </div>
  )
}
