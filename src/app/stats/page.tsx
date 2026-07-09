"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { format, subMonths, addMonths, addDays, parseISO, startOfISOWeek } from "date-fns"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts"
import {
  Flame,
  Footprints,
  PersonStanding,
  Dumbbell,
  Moon,
  Beer,
  CircleDot,
  Weight,
  ChevronLeft,
  ChevronRight,
  Activity,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react"
import { cn, formatDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { useUser } from "@/context/UserContext"
import { isVacationBlockingCalendarDay } from "@/lib/vacation-mode"
import { CATEGORY_THEME } from "@/lib/category-theme"

interface DayData {
  date: string
  label: string
  calories: number
  steps: number
  runMiles: number
  pace: number | null
  workouts: number
  sleepHrs: number | null
  alcohol: number
  bowel: number
  weight: number | null
  /** Bodyweight on day+1, else day+2 (from extended fetch); null if neither logged */
  weightForward: number | null
}

function weightForwardSourceDayKey(
  rowDate: string,
  dailyByDate: Map<string, DayData>
): string | null {
  const k1 = formatDate(addDays(parseLocalDate(rowDate), 1))
  const k2 = formatDate(addDays(parseLocalDate(rowDate), 2))
  if (dailyByDate.get(k1)?.weight != null) return k1
  if (dailyByDate.get(k2)?.weight != null) return k2
  return null
}

/** Lagged metric vs next weigh-in: skip predictor or outcome day inside vacation window. */
function includeLaggedWeightCorrelationRow(
  vacationResumeDate: string | null | undefined,
  d: DayData,
  dailyByDate: Map<string, DayData>
): boolean {
  if (d.weightForward == null) return false
  if (isVacationBlockingCalendarDay(vacationResumeDate, d.date)) return false
  const fwd = weightForwardSourceDayKey(d.date, dailyByDate)
  if (fwd != null && isVacationBlockingCalendarDay(vacationResumeDate, fwd)) return false
  return true
}

interface Summary {
  calories: { avg: number | null; total: number; daysLogged: number }
  steps: { avg: number | null; total: number; daysLogged: number }
  running: {
    totalMiles: number
    runs: number
    daysActive?: number
    avgPace: number | null
    bestPace: number | null
  }
  workouts: { total: number; daysActive: number }
  sleep: { avg: number | null; daysLogged: number }
  alcohol: { avg: number | null; total: number; daysLogged: number }
  bowel: { avg: number | null; total: number; daysLogged: number }
  weight: { start: number | null; end: number | null; change: number | null; daysLogged: number }
}

interface MonthlyData {
  month: string
  monthLabel: string
  daysInMonth: number
  /** Calendar days that have actually occurred (equals daysInMonth for past months). */
  daysElapsed?: number
  isCurrentMonth?: boolean
  daily: DayData[]
  summary: Summary
}

const WEIGHT_COLOR = CATEGORY_THEME.weight.color

function formatPace(mins: number | null): string {
  if (mins == null || mins <= 0) return "--"
  const m = Math.floor(mins)
  const s = Math.round((mins - m) * 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function ChartTooltipContent({ active, payload, label, unit, formatter }: {
  active?: boolean
  payload?: Array<{ value: number | null }>
  label?: string
  unit?: string
  formatter?: (v: number) => string
}) {
  if (!active || !payload?.length || payload[0].value == null) return null
  const val = payload[0].value
  const display = formatter ? formatter(val) : `${val}`
  return (
    <div className="glass-frost rounded-xl border border-border/40 px-2.5 py-1.5 font-sans text-[10px] tabular-nums">
      <div className="type-hud-caption">{label}</div>
      <div className="font-semibold">{display}{unit ? ` ${unit}` : ""}</div>
    </div>
  )
}

function StatCard({ label, value, sub, color }: {
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="glass-subtle relative space-y-0.5 overflow-hidden rounded-xl p-3">
      {color && (
        <span
          className="absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}66` }}
        />
      )}
      <div className="type-hud-label-soft">{label}</div>
      <div
        className="type-hud-stat text-base tracking-wide"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      {sub && <div className="type-hud-caption tabular-nums">{sub}</div>}
    </div>
  )
}

function SectionChart({
  title, icon: Icon, color, href, children, summaryCards, stagger = 0,
}: {
  title: string
  icon: React.ElementType
  color: string
  href: string
  children: React.ReactNode
  summaryCards: React.ReactNode
  stagger?: number
}) {
  return (
    <div
      className="glass-panel animate-fade-up space-y-3 p-4 lg:p-5"
      style={stagger > 0 ? { animationDelay: `${Math.min(stagger, 7) * 45}ms` } : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}2e` }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color }} />
          </div>
          <h2 className="type-hud-rail text-foreground">{title}</h2>
        </div>
        <Link
          href={href}
          className="press-scale type-hud-chip rounded-lg px-2 py-1.5 text-primary/70 transition-colors hover:text-primary"
        >
          View all &rarr;
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{summaryCards}</div>
      <div className="animate-chart-wipe min-h-[8rem] min-w-0">{children}</div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Correlation Panel — weight vs metrics composite chart
   ═══════════════════════════════════════════════════════════ */

type MetricKey = "steps" | "calories" | "sleepHrs" | "bowel"

type CorrelationMode = "sameDay" | "lagged1to2"

const METRIC_META: Record<
  MetricKey,
  {
    label: string
    unit: string
    color: string
    icon: React.ElementType
    /** Noun phrase for “higher X …” copy in correlation cards */
    compareNoun: string
    /** Sleep: same-day weight. Food/activity: weight 1–2 days later. */
    correlationMode: CorrelationMode
  }
> = {
  steps: { label: "Steps", unit: "steps", color: CATEGORY_THEME.steps.color, icon: Footprints, compareNoun: "steps", correlationMode: "lagged1to2" },
  calories: { label: "Calories", unit: "cal", color: CATEGORY_THEME.calories.color, icon: Flame, compareNoun: "calories", correlationMode: "lagged1to2" },
  sleepHrs: { label: "Sleep", unit: "hrs", color: CATEGORY_THEME.sleep.color, icon: Moon, compareNoun: "sleep", correlationMode: "sameDay" },
  bowel: { label: "Bowel", unit: "entries", color: CATEGORY_THEME.bowel.color, icon: CircleDot, compareNoun: "bowel entries", correlationMode: "lagged1to2" },
}

const METRIC_KEYS: MetricKey[] = ["steps", "calories", "sleepHrs", "bowel"]

/** Max |lb| difference to call "maintaining" vs mean of weekly averages. */
const WEEKLY_WEIGHT_MAINTAIN_LB = 0.45

type WeeklyWeightInsight = {
  weekCount: number
  /** Mean of each ISO week’s average weight (only weeks with ≥1 weigh-in). */
  grandMeanOfWeeklyAverages: number
  /** Most recent ISO week in range (by calendar). */
  lastWeekAverage: number
  /** lastWeekAverage − grandMeanOfWeeklyAverages */
  vsBaselineLb: number
  /** lastWeekAverage − previous week’s average; null if only one week. */
  weekOverWeekLb: number | null
  /** Based on last week vs baseline (lower weight = losing). */
  baselineTrend: "losing" | "maintaining" | "gaining"
}

function computeWeeklyWeightInsight(
  daily: DayData[],
  vacationResumeDate?: string | null
): WeeklyWeightInsight | null {
  const byWeekStart = new Map<number, number[]>()
  for (const d of daily) {
    if (d.weight == null) continue
    if (isVacationBlockingCalendarDay(vacationResumeDate, d.date)) continue
    const t = startOfISOWeek(parseISO(d.date)).getTime()
    if (!byWeekStart.has(t)) byWeekStart.set(t, [])
    byWeekStart.get(t)!.push(d.weight)
  }
  if (byWeekStart.size === 0) return null

  const weeks = [...byWeekStart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, vals]) => vals.reduce((s, v) => s + v, 0) / vals.length)

  const round1 = (n: number) => Math.round(n * 10) / 10
  const grandMean = weeks.reduce((s, v) => s + v, 0) / weeks.length
  const lastWeekAverage = weeks[weeks.length - 1]!
  const prev =
    weeks.length >= 2 ? weeks[weeks.length - 2]! : null
  const vsBaselineLb = lastWeekAverage - grandMean
  const weekOverWeekLb = prev != null ? lastWeekAverage - prev : null

  let baselineTrend: WeeklyWeightInsight["baselineTrend"] = "maintaining"
  if (vsBaselineLb < -WEEKLY_WEIGHT_MAINTAIN_LB) baselineTrend = "losing"
  else if (vsBaselineLb > WEEKLY_WEIGHT_MAINTAIN_LB) baselineTrend = "gaining"

  return {
    weekCount: weeks.length,
    grandMeanOfWeeklyAverages: round1(grandMean),
    lastWeekAverage: round1(lastWeekAverage),
    vsBaselineLb: round1(vsBaselineLb),
    weekOverWeekLb: weekOverWeekLb != null ? round1(weekOverWeekLb) : null,
    baselineTrend,
  }
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 3 || xs.length !== ys.length) return null
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx2 = 0
  let dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    num += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  const denom = Math.sqrt(dx2 * dy2)
  if (denom === 0) return null
  return Math.round((num / denom) * 100) / 100
}

function correlationStrengthWord(r: number): string {
  const a = Math.abs(r)
  if (a < 0.15) return "none"
  if (a < 0.35) return "weak"
  if (a < 0.55) return "moderate"
  if (a < 0.75) return "strong"
  return "very strong"
}

function formatR(x: number): string {
  return `${x > 0 ? "+" : ""}${x.toFixed(2)}`
}

function strengthShort(r: number): string {
  const s = correlationStrengthWord(r)
  if (s === "very strong") return "Very strong"
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Whoop-style: short headline + light context (r stays small). */
const CORR_VOICE: Record<
  MetricKey,
  { lagPos: string; lagNeg: string; sleepPos: string; sleepNeg: string }
> = {
  steps: {
    lagPos: "Big step days often showed up before a heavier next weigh-in.",
    lagNeg: "More steps tended to line up with a lighter weigh-in a day or two later.",
    sleepPos: "",
    sleepNeg: "",
  },
  calories: {
    lagPos: "Higher intake days often came before a bump on the scale.",
    lagNeg: "Lighter eating often came before an easier next weigh-in.",
    sleepPos: "",
    sleepNeg: "",
  },
  sleepHrs: {
    lagPos: "",
    lagNeg: "",
    sleepPos: "More sleep and a heavier weigh-in often landed on the same day.",
    sleepNeg: "Better sleep tended to match a lighter number that same day.",
  },
  bowel: {
    lagPos:
      "More bowel logs and a heavier next weigh-in moved together this month — a weaker fit for the “emptying lightens the scale” story; sodium, carbs, and training still drive a lot of short noise.",
    lagNeg:
      "More logged bowel days tended to come before a lighter next weigh-in — that matches food volume and GI contents nudging the scale, not necessarily fat change overnight.",
    sleepPos: "",
    sleepNeg: "",
  },
}

function correlationCardCopy(
  metricKey: MetricKey,
  r: number | null,
  pairCount: number,
  mode: CorrelationMode
): { title: string; sub: string } {
  if (pairCount < 3) {
    return {
      title: "Hang tight — we need a few more days here.",
      sub: `${pairCount} paired so far · 3+ to read the signal`,
    }
  }
  if (r == null) {
    return {
      title: "Not enough movement to score this one.",
      sub: "Weight or this metric barely budged on the days we could pair.",
    }
  }
  const a = Math.abs(r)
  if (a < 0.15) {
    return {
      title: "No real pattern jumped out this month.",
      sub: `Noise level · r ${formatR(r)}`,
    }
  }

  const v = CORR_VOICE[metricKey]
  const title =
    mode === "sameDay"
      ? r > 0
        ? v.sleepPos
        : v.sleepNeg
      : r > 0
        ? v.lagPos
        : v.lagNeg

  let sub = `${strengthShort(r)} signal · r ${formatR(r)}`
  if (metricKey === "bowel" && mode === "lagged1to2" && r < -0.15) {
    sub = `${sub} · negative r here supports transit/volume showing up on the scale`
  }

  return { title, sub }
}

function lastWeightAtOrBefore(
  daily: DayData[],
  index: number,
  vacationResumeDate?: string | null
): number | null {
  for (let i = index; i >= 0; i--) {
    const row = daily[i]!
    if (row.weight == null) continue
    if (isVacationBlockingCalendarDay(vacationResumeDate, row.date)) continue
    return row.weight
  }
  return null
}

/** Forward weigh-in vs last known weight at/before that day (lagged metrics). */
function forwardDeltaLb(
  daily: DayData[],
  i: number,
  vacationResumeDate?: string | null
): number | null {
  const wf = daily[i]!.weightForward
  if (wf == null) return null
  const prev = lastWeightAtOrBefore(daily, i, vacationResumeDate)
  if (prev == null) return null
  return Math.round((wf - prev) * 10) / 10
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** Metric-aware scale cues merged into the correlation summary (heuristic, not medical). */
function buildScaleCues(
  daily: DayData[],
  key: MetricKey,
  vacationResumeDate?: string | null,
  dailyByDate?: Map<string, DayData>
): string[] {
  const lines: string[] = []
  const byDate = dailyByDate ?? new Map(daily.map((x) => [x.date, x]))

  if (key === "calories") {
    const rows: { val: number; delta: number; label: string }[] = []
    for (let i = 0; i < daily.length; i++) {
      const d = daily[i]!
      if (!includeLaggedWeightCorrelationRow(vacationResumeDate, d, byDate)) continue
      const delta = forwardDeltaLb(daily, i, vacationResumeDate)
      if (delta == null) continue
      rows.push({ val: d.calories, delta, label: d.label })
    }
    if (rows.length < 4) {
      lines.push("Need a few more next-day weigh-ins after logged intake to read bounce patterns.")
      return lines
    }
    const sorted = [...rows].sort((a, b) => a.val - b.val)
    const idx = (q: number) => Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)))
    const p25 = sorted[idx(0.25)]!.val
    const p75 = sorted[idx(0.75)]!.val
    const high = rows.filter((r) => r.val >= p75)
    const low = rows.filter((r) => r.val <= p25 && r.val > 0)
    if (high.length && low.length) {
      const hi = mean(high.map((r) => r.delta))
      const lo = mean(low.map((r) => r.delta))
      const gap = Math.round((hi - lo) * 10) / 10
      if (gap >= 0.4) {
        lines.push(
          `After your bigger intake days, the next weigh-in ran about ${gap} lb higher on average than after lighter days — that’s often fluid and glycogen, not “real” fat that fast.`
        )
      } else if (gap <= -0.2) {
        lines.push(
          "Big eating days didn’t consistently show a higher next weigh-in — calmer scale behavior this month."
        )
      }
    }
    const topIntake = [...rows].sort((a, b) => b.val - a.val).slice(0, Math.max(1, Math.ceil(rows.length * 0.15)))
    if (topIntake.length) {
      const spike = topIntake.reduce((a, b) => (b.delta > a.delta ? b : a))
      if (spike.delta >= 1.0) {
        lines.push(
          `Largest jump after a peak intake day: about +${spike.delta} lb by the next weigh-in (day ${spike.label}). Sharp spikes usually ease over a few days.`
        )
      }
    }
    if (lines.length === 0) {
      lines.push("No big intake-vs-next-weigh-in swing stood out — your scale looked fairly steady around calories.")
    }
    return lines.slice(0, 3)
  }

  if (key === "steps") {
    const rows: { val: number; delta: number; label: string }[] = []
    for (let i = 0; i < daily.length; i++) {
      const d = daily[i]!
      if (!includeLaggedWeightCorrelationRow(vacationResumeDate, d, byDate)) continue
      const delta = forwardDeltaLb(daily, i, vacationResumeDate)
      if (delta == null) continue
      rows.push({ val: d.steps, delta, label: d.label })
    }
    if (rows.length < 4) {
      lines.push("Need more paired step days with a follow-up weigh-in to compare movement vs the scale.")
      return lines
    }
    const sorted = [...rows].sort((a, b) => a.val - b.val)
    const idx = (q: number) => Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)))
    const p25 = sorted[idx(0.25)]!.val
    const p75 = sorted[idx(0.75)]!.val
    const high = rows.filter((r) => r.val >= p75)
    const low = rows.filter((r) => r.val <= p25)
    if (high.length && low.length) {
      const hi = mean(high.map((r) => r.delta))
      const lo = mean(low.map((r) => r.delta))
      const gap = Math.round((lo - hi) * 10) / 10
      if (gap >= 0.35) {
        lines.push(
          `Low-step days averaged about ${gap} lb heavier on the next weigh-in than your highest-step days — could be water, food timing, or rest, not steps alone.`
        )
      } else if (gap <= -0.35) {
        lines.push(
          "Your busiest movement days tended to precede a slightly heavier next weigh-in — worth eyeing fueling and sodium if that’s not what you expected."
        )
      }
    }
    if (lines.length === 0) {
      lines.push("Steps and the next weigh-in didn’t show a strong split between high and low movement this month.")
    }
    return lines.slice(0, 3)
  }

  if (key === "sleepHrs") {
    const paired = daily.filter(
      (d) =>
        d.weight != null &&
        d.sleepHrs != null &&
        !isVacationBlockingCalendarDay(vacationResumeDate, d.date)
    )
    if (paired.length < 4) {
      lines.push("Log a few more nights with sleep and weight the same day to compare short vs long sleep.")
      return lines
    }
    const longN = paired.filter((d) => d.sleepHrs! >= 8)
    const shortN = paired.filter((d) => d.sleepHrs! <= 6.5)
    if (longN.length && shortN.length) {
      const wl = mean(longN.map((d) => d.weight!))
      const ws = mean(shortN.map((d) => d.weight!))
      const gap = Math.round((wl - ws) * 10) / 10
      if (Math.abs(gap) >= 0.35) {
        lines.push(
          gap > 0
            ? `Mornings after 8h+ sleep averaged about ${gap} lb heavier than after 6.5h or less — same-day weight catches salt, late meals, and how you slept, not just time in bed.`
            : `Mornings after longer sleep averaged about ${Math.abs(gap)} lb lighter than short-sleep nights — a soft signal, but it’s there this month.`
        )
      }
    }
    if (lines.length === 0) {
      lines.push("Short vs longer sleep didn’t split your scale much this month — recovery still matters beyond the number.")
    }
    return lines.slice(0, 3)
  }

  // bowel — interpret no-log days + spikes as possible retained volume on the scale
  const rows: { val: number; delta: number; label: string }[] = []
  for (let i = 0; i < daily.length; i++) {
    const d = daily[i]!
    if (!includeLaggedWeightCorrelationRow(vacationResumeDate, d, byDate)) continue
    const delta = forwardDeltaLb(daily, i, vacationResumeDate)
    if (delta == null) continue
    rows.push({ val: d.bowel, delta, label: d.label })
  }
  if (rows.length < 5) {
    lines.push("Log a few more days with bowel notes and a follow-up weigh-in to compare transit vs the scale.")
    return lines
  }
  const withLogs = rows.filter((r) => r.val > 0)
  const none = rows.filter((r) => r.val === 0)
  if (withLogs.length && none.length) {
    const meanAfterLog = mean(withLogs.map((r) => r.delta))
    const meanAfterNone = mean(none.map((r) => r.delta))
    const gap = Math.round((meanAfterNone - meanAfterLog) * 10) / 10
    if (gap >= 0.35) {
      lines.push(
        `Days with no bowel log averaged about ${gap} lb heavier on the next weigh-in than days with at least one — consistent with food volume and contents still sitting in the pipeline when you step on the scale.`
      )
    } else if (gap <= -0.35) {
      lines.push(
        "No-log days didn’t reliably run heavier before the next weigh-in — other drivers may be louder than transit this month."
      )
    }
  }
  const spikesNoBowel = rows.filter((r) => r.val === 0 && r.delta >= 0.8)
  if (spikesNoBowel.length) {
    const worst = spikesNoBowel.reduce((a, b) => (b.delta > a.delta ? b : a))
    lines.push(
      `After at least one day with no bowel entry, the next weigh-in jumped up to +${worst.delta} lb (day ${worst.label}) — a pattern that often lines up with meal volume and GI load, not a sudden fat gain.`
    )
  }
  if (lines.length === 0) {
    lines.push(
      "Bowel logging vs the next weigh-in stayed fairly flat — when the scale jumps, still cross-check calories, sodium, and sleep alongside gut rhythm."
    )
  }
  return lines.slice(0, 3)
}

function CorrelationTooltip({
  active,
  payload,
  label,
  metricKey,
  weightLineKey,
}: {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  label?: string
  metricKey: MetricKey
  weightLineKey: "weight" | "weightForward"
}) {
  if (!active || !payload?.length) return null
  const meta = METRIC_META[metricKey]
  const metricVal = payload.find((p) => p.dataKey === metricKey)?.value as number | null | undefined
  const weightVal = payload.find((p) => p.dataKey === weightLineKey)?.value as number | null | undefined
  return (
    <div className="glass rounded-lg border border-border px-3 py-2 font-sans text-[10px] tabular-nums space-y-0.5 min-w-[7rem]">
      <div className="text-muted-foreground/70 mb-1">{label}</div>
      {metricVal != null && (
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
          <span className="font-semibold">
            {metricKey === "sleepHrs" ? metricVal : metricVal.toLocaleString()} {meta.unit}
          </span>
        </div>
      )}
      {weightVal != null && (
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: WEIGHT_COLOR }} />
          <span className="font-semibold">
            {weightVal} lbs
            {weightLineKey === "weightForward" && (
              <span className="font-normal text-muted-foreground/70"> · next weigh-in</span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

const METRIC_Y_AXIS = 0
const WEIGHT_Y_AXIS = 1

function CorrelationPanel({ daily }: { daily: DayData[] }) {
  const { user } = useUser()
  const vacationResumeDate = user?.vacationResumeDate
  const dailyByDate = useMemo(() => new Map(daily.map((x) => [x.date, x])), [daily])

  const [active, setActive] = useState<MetricKey>("steps")

  const weightLineKey: "weight" | "weightForward" =
    METRIC_META[active].correlationMode === "sameDay" ? "weight" : "weightForward"

  /** Left axis must match only the active metric; explicit domain avoids wrong scale when dual Y-axes bind. */
  const metricAxisDomain = useMemo((): [number, number] => {
    const vals: number[] = []
    for (const row of daily) {
      const v = row[active]
      if (typeof v === "number" && !Number.isNaN(v)) vals.push(v)
    }
    if (vals.length === 0) return [0, 1]
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const span = max - min
    const pad = span > 0 ? span * 0.08 : max > 0 ? max * 0.08 : 1
    const low = Math.max(0, min - pad)
    const high = max + pad
    return low < high ? [low, high] : [0, Math.max(1, high)]
  }, [daily, active])

  const metricTickFormatter = useCallback(
    (v: number) => {
      if (active === "sleepHrs") return Number(v).toFixed(1)
      return Math.round(v).toLocaleString()
    },
    [active]
  )

  const laggedPairCount = useMemo(
    () =>
      daily.filter((d) => includeLaggedWeightCorrelationRow(vacationResumeDate, d, dailyByDate))
        .length,
    [daily, vacationResumeDate, dailyByDate]
  )

  const sameDaySleepPairCount = useMemo(
    () =>
      daily.filter(
        (d) =>
          d.weight != null &&
          d.sleepHrs != null &&
          !isVacationBlockingCalendarDay(vacationResumeDate, d.date)
      ).length,
    [daily, vacationResumeDate]
  )

  const correlations = useMemo(() => {
    const out: Record<MetricKey, number | null> = {
      steps: null,
      calories: null,
      sleepHrs: null,
      bowel: null,
    }
    for (const k of METRIC_KEYS) {
      const mode = METRIC_META[k].correlationMode
      if (mode === "sameDay") {
        const paired = daily.filter(
          (d) =>
            d.weight != null &&
            d.sleepHrs != null &&
            !isVacationBlockingCalendarDay(vacationResumeDate, d.date)
        )
        const xs = paired.map((d) => d.sleepHrs!)
        const ys = paired.map((d) => d.weight!)
        out[k] = pearson(xs, ys)
      } else {
        const paired = daily.filter((d) =>
          includeLaggedWeightCorrelationRow(vacationResumeDate, d, dailyByDate)
        )
        const xs = paired.map((d) => {
          const v = d[k]
          return typeof v === "number" ? v : 0
        })
        const ys = paired.map((d) => d.weightForward!)
        out[k] = pearson(xs, ys)
      }
    }
    return out
  }, [daily, vacationResumeDate, dailyByDate])

  const meta = METRIC_META[active]
  const hasWeight = daily.some((d) => d.weight != null || d.weightForward != null)

  const pairCountForActive =
    meta.correlationMode === "sameDay" ? sameDaySleepPairCount : laggedPairCount
  const rActive = correlations[active]
  const activeCopy = useMemo(
    () => correlationCardCopy(active, rActive, pairCountForActive, meta.correlationMode),
    [active, rActive, pairCountForActive, meta.correlationMode]
  )
  const scaleCues = useMemo(
    () => buildScaleCues(daily, active, vacationResumeDate, dailyByDate),
    [daily, active, vacationResumeDate, dailyByDate]
  )

  const weeklyWeightInsight = useMemo(
    () => computeWeeklyWeightInsight(daily, vacationResumeDate),
    [daily, vacationResumeDate]
  )

  if (!hasWeight) return null

  return (
    <div className="glass-panel animate-fade-up space-y-3 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${WEIGHT_COLOR}26` }}
          >
            <Activity className="h-4 w-4" style={{ color: WEIGHT_COLOR }} />
          </div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground/95">
            Weight Correlation
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:justify-end sm:max-w-[min(100%,28rem)]">
          {METRIC_KEYS.map((k) => {
            const m = METRIC_META[k]
            const Icon = m.icon
            const isActive = k === active
            return (
              <button
                key={k}
                type="button"
                onClick={() => setActive(k)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all duration-150",
                  isActive
                    ? "bg-background/80 text-foreground shadow-sm ring-1"
                    : "glass-subtle text-muted-foreground/70 hover:text-foreground hover:bg-glass-highlight/25"
                )}
                style={
                  isActive
                    ? {
                        ["--tw-ring-color" as string]: `${m.color}55`,
                        boxShadow: `0 0 12px ${m.color}18`,
                      }
                    : undefined
                }
              >
                <Icon className="h-3 w-3 shrink-0" style={isActive ? { color: m.color } : undefined} />
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="h-56 sm:h-64 lg:h-72 w-full min-w-0 -mx-0.5 sm:mx-0 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={daily} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="corrMetricFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={meta.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={meta.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{
                fontSize: 9,
                fill: "oklch(0.55 0.01 250)",
                fontFamily:
                  "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
              }}
              tickLine={false}
              axisLine={false}
              interval={4}
            />
            <YAxis
              yAxisId={METRIC_Y_AXIS}
              type="number"
              domain={metricAxisDomain}
              tickFormatter={metricTickFormatter}
              tick={{
                fontSize: 9,
                fill: "oklch(0.55 0.01 250)",
                fontFamily:
                  "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
              }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <YAxis
              yAxisId={WEIGHT_Y_AXIS}
              orientation="right"
              type="number"
              tick={{
                fontSize: 9,
                fill: WEIGHT_COLOR,
                fontFamily:
                  "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
              }}
              tickLine={false}
              axisLine={false}
              width={40}
              domain={["dataMin - 2", "dataMax + 2"]}
            />
            <Tooltip content={<CorrelationTooltip metricKey={active} weightLineKey={weightLineKey} />} />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
              iconSize={8}
              formatter={(value: string) => {
                if (value === "weight_lagged") return "Next weigh-in (lbs)"
                if (value === "weight_same") return "Weight that day (lbs)"
                return `${meta.label} (${meta.unit})`
              }}
            />
            <Area
              yAxisId={METRIC_Y_AXIS}
              type="monotone"
              dataKey={active}
              stroke={meta.color}
              fill="url(#corrMetricFill)"
              strokeWidth={2}
              dot={false}
              connectNulls
              name={active}
            />
            <Line
              yAxisId={WEIGHT_Y_AXIS}
              type="monotone"
              dataKey={weightLineKey}
              stroke={WEIGHT_COLOR}
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: WEIGHT_COLOR, strokeWidth: 0 }}
              connectNulls
              name={weightLineKey === "weightForward" ? "weight_lagged" : "weight_same"}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-border/50 min-w-0 bg-muted/5 px-3 py-3 sm:px-4 sm:py-3.5 shrink-0">
        <p className="text-[10px] sm:text-[11px] leading-relaxed text-foreground/90 text-pretty m-0">
          <span className="font-semibold text-foreground">{meta.label}</span>
          {". "}
          {activeCopy.title} {activeCopy.sub}
          {scaleCues.length > 0 ? ` ${scaleCues.join(" ")}` : ""}
        </p>
      </div>

      {weeklyWeightInsight && (
        <WeeklyWeightPaceSection insight={weeklyWeightInsight} />
      )}
    </div>
  )
}

function WeeklyWeightPaceSection({ insight }: { insight: WeeklyWeightInsight }) {
  const TrendIcon =
    insight.baselineTrend === "losing"
      ? TrendingDown
      : insight.baselineTrend === "gaining"
        ? TrendingUp
        : Minus
  const trendLabel =
    insight.baselineTrend === "losing"
      ? "Losing"
      : insight.baselineTrend === "gaining"
        ? "Gaining"
        : "Maintaining"
  const trendClass =
    insight.baselineTrend === "losing"
      ? "text-positive"
      : insight.baselineTrend === "gaining"
        ? "text-negative"
        : "text-muted-foreground"
  const signedBaseline =
    insight.vsBaselineLb > 0
      ? `+${insight.vsBaselineLb}`
      : `${insight.vsBaselineLb}`
  const wow = insight.weekOverWeekLb
  const signedWow =
    wow == null ? null : wow > 0 ? `+${wow}` : `${wow}`

  return (
    <div className="rounded-xl border border-border/50 bg-muted/5 px-3 py-3 sm:px-4 sm:py-3.5 space-y-3 shrink-0">
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${WEIGHT_COLOR}26` }}
        >
          <Weight className="h-3.5 w-3.5" style={{ color: WEIGHT_COLOR }} />
        </div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground/90">
          Weekly weight vs baseline
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/75 mb-0.5">
            Avg of weekly avgs
          </p>
          <p className="text-base font-bold tabular-nums" style={{ color: WEIGHT_COLOR }}>
            {insight.grandMeanOfWeeklyAverages}
            <span className="text-[10px] font-medium text-muted-foreground ml-1">lbs</span>
          </p>
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">
            {insight.weekCount} ISO week{insight.weekCount === 1 ? "" : "s"} with a log
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/75 mb-0.5">
            Last week (avg)
          </p>
          <p className="text-base font-bold tabular-nums text-foreground">
            {insight.lastWeekAverage}
            <span className="text-[10px] font-medium text-muted-foreground ml-1">lbs</span>
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 flex flex-col justify-center rounded-lg border border-border/40 bg-background/25 px-2.5 py-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/75 mb-1">Vs baseline</p>
          <div className="flex items-center gap-2">
            <TrendIcon className={cn("h-4 w-4 shrink-0", trendClass)} aria-hidden />
            <div>
              <p className={cn("text-sm font-bold tabular-nums", trendClass)}>{trendLabel}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">
                {signedBaseline} lb this week vs typical
              </p>
            </div>
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1 flex flex-col justify-center rounded-lg border border-border/40 bg-background/25 px-2.5 py-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/75 mb-1">
            Pace (lb / week)
          </p>
          {wow != null ? (
            <p className="text-sm font-bold tabular-nums text-foreground">
              {signedWow}
              <span className="text-[10px] font-medium text-muted-foreground ml-1">lb</span>
              <span className="text-[10px] font-normal text-muted-foreground/80 block mt-0.5">
                Week-over-week change
              </span>
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground leading-snug">
              Log weight in a second calendar week to see week-over-week lb/week.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function GlanceTile({
  label,
  value,
  unit,
  color,
  delta,
  deltaTone,
}: {
  label: string
  value: string
  unit?: string
  color: string
  delta?: string
  deltaTone?: "positive" | "negative" | "neutral"
}) {
  return (
    <div className="glass-subtle relative min-w-0 overflow-hidden rounded-xl px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}88` }}
        />
        <span className="truncate text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground/65">
          {label}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-lg font-bold leading-none tabular-nums tracking-tight">{value}</span>
        {unit && (
          <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
            {unit}
          </span>
        )}
        {delta && (
          <span
            className={cn(
              "text-[10px] font-semibold tabular-nums",
              deltaTone === "positive" && "text-positive",
              deltaTone === "negative" && "text-negative",
              (!deltaTone || deltaTone === "neutral") && "text-muted-foreground/70"
            )}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-40 w-full" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="skeleton h-64 w-full" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  )
}

export default function StatsPage() {
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"))
  const [data, setData] = useState<MonthlyData | null>(null)
  const [loading, setLoading] = useState(true)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const fetchMonth = useCallback(async (m: string) => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/stats/monthly?month=${m}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMonth(month) }, [month, fetchMonth])

  const prevMonth = () => setMonth(format(subMonths(new Date(month + "-01"), 1), "yyyy-MM"))
  const nextMonth = () => setMonth(format(addMonths(new Date(month + "-01"), 1), "yyyy-MM"))
  const isCurrentMonth = month === format(new Date(), "yyyy-MM")

  /** Horizontal swipe on the navigator flips months (mostly-horizontal gestures only). */
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 64 || Math.abs(dy) > Math.abs(dx) * 0.6) return
    if (dx < 0 && !isCurrentMonth) nextMonth()
    if (dx > 0) prevMonth()
  }

  const chartAxisStyle = useMemo(() => ({
    fontSize: 9,
    fill: "oklch(0.55 0.01 250)",
    fontFamily:
      "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  }), [])

  const gridStroke = "oklch(1 0 0 / 5%)"

  const s = data?.summary
  /** Days that have actually happened — averages, "best day", and charts use this. */
  const daysElapsed = data?.daysElapsed ?? data?.daysInMonth ?? data?.daily.length ?? 0
  const d = useMemo(() => {
    const all = data?.daily ?? []
    return isCurrentMonth ? all.slice(0, daysElapsed) : all
  }, [data, isCurrentMonth, daysElapsed])

  /** Highest logged value across elapsed days, or null if nothing logged. */
  const maxLogged = useCallback(
    (pick: (row: DayData) => number) => {
      const vals = d.map(pick).filter((v) => v > 0)
      return vals.length > 0 ? Math.max(...vals) : null
    },
    [d]
  )

  const daysLabel = isCurrentMonth ? `/ ${daysElapsed} so far` : `/ ${data?.daysInMonth ?? "--"}`

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PageHeader title="Statistics" />
        <p className="type-hud-caption normal-case text-muted-foreground/75">
          Monthly analytics overview
        </p>
      </div>

      {/* Month navigator — swipe horizontally to flip months */}
      <div
        className="glass-panel animate-fade-up flex touch-pan-y items-center justify-between gap-2 px-2 py-2.5"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          onClick={prevMonth}
          aria-label="Previous month"
          className="press-scale glass-subtle flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-glass-highlight/30 touch-manipulation"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 text-center">
          <div className="truncate font-heading text-sm font-bold uppercase tracking-[0.15em]">
            {data?.monthLabel ?? month}
          </div>
          {isCurrentMonth && data && (
            <div className="type-hud-caption mt-0.5 text-primary/70 tabular-nums">
              Day {daysElapsed} of {data.daysInMonth} · In progress
            </div>
          )}
        </div>
        <button
          onClick={nextMonth}
          disabled={isCurrentMonth}
          aria-label="Next month"
          className="press-scale glass-subtle flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-glass-highlight/30 disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <StatsSkeleton />
      ) : data && s ? (
        <div className="space-y-4">
          {/* ── MONTH AT A GLANCE ── */}
          <div className="glass-panel animate-fade-up space-y-3 p-4 lg:p-5">
            <div className="flex items-center gap-2">
              <div className="hud-divider flex-1" />
              <span className="type-hud-rail shrink-0">MONTH AT A GLANCE</span>
              <div className="hud-divider flex-1" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <GlanceTile
                label="Weight"
                value={s.weight.end != null ? `${s.weight.end}` : "--"}
                unit="lbs"
                color={CATEGORY_THEME.weight.color}
                delta={
                  s.weight.change != null
                    ? `${s.weight.change > 0 ? "+" : ""}${s.weight.change}`
                    : undefined
                }
                deltaTone={
                  s.weight.change == null || Math.abs(s.weight.change) < 0.05
                    ? "neutral"
                    : s.weight.change < 0
                      ? "positive"
                      : "negative"
                }
              />
              <GlanceTile
                label="Avg Cal / Day"
                value={s.calories.avg != null ? s.calories.avg.toLocaleString() : "--"}
                unit="cal"
                color={CATEGORY_THEME.calories.color}
              />
              <GlanceTile
                label="Steps"
                value={s.steps.total > 0 ? s.steps.total.toLocaleString() : "--"}
                color={CATEGORY_THEME.steps.color}
              />
              <GlanceTile
                label="Distance Run"
                value={s.running.totalMiles > 0 ? `${s.running.totalMiles}` : "--"}
                unit="mi"
                color={CATEGORY_THEME.running.color}
              />
              <GlanceTile
                label="Workouts"
                value={s.workouts.total > 0 ? `${s.workouts.total}` : "--"}
                unit={s.workouts.total > 0 ? "sessions" : undefined}
                color={CATEGORY_THEME.workouts.color}
              />
              <GlanceTile
                label="Avg Sleep"
                value={s.sleep.avg != null ? `${s.sleep.avg}` : "--"}
                unit="hrs"
                color={CATEGORY_THEME.sleep.color}
              />
            </div>
          </div>

          {/* ── WEIGHT CORRELATION ── */}
          <CorrelationPanel daily={d} />

          {/* ── CALORIES ── */}
          <SectionChart
            title="Calories" icon={Flame} color={CATEGORY_THEME.calories.color} href="/calories" stagger={1}
            summaryCards={<>
              <StatCard label="Avg / Day" value={s.calories.avg != null ? s.calories.avg.toLocaleString() : "--"} sub="cal · logged days" color={CATEGORY_THEME.calories.color} />
              <StatCard label="Total" value={s.calories.total.toLocaleString()} sub="cal" />
              <StatCard label="Days Logged" value={`${s.calories.daysLogged}`} sub={daysLabel} />
              <StatCard label="Highest Day" value={maxLogged(x => x.calories)?.toLocaleString() ?? "--"} sub="cal" />
            </>}
          >
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={d} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={32} />
                <Tooltip content={<ChartTooltipContent unit="cal" />} />
                <Bar dataKey="calories" fill={CATEGORY_THEME.calories.color} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionChart>

          {/* ── WEIGHT ── */}
          {(s.weight.daysLogged > 0) && (
            <SectionChart
              title="Weight" icon={Weight} color={CATEGORY_THEME.weight.color} href="/weight" stagger={2}
              summaryCards={<>
                <StatCard label="First Log" value={s.weight.start != null ? `${s.weight.start}` : "--"} sub="lbs" color={CATEGORY_THEME.weight.color} />
                <StatCard label="Last Log" value={s.weight.end != null ? `${s.weight.end}` : "--"} sub="lbs" />
                <StatCard
                  label="Change"
                  value={s.weight.change != null ? `${s.weight.change > 0 ? "+" : ""}${s.weight.change}` : "--"}
                  sub="lbs · first → last log"
                />
                <StatCard label="Days Logged" value={`${s.weight.daysLogged}`} sub={daysLabel} />
              </>}
            >
              <ResponsiveContainer width="100%" height={130}>
                <LineChart data={d.filter(x => x.weight != null)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={chartAxisStyle} tickLine={false} axisLine={false} width={36}
                    domain={["dataMin - 2", "dataMax + 2"]}
                  />
                  <Tooltip content={<ChartTooltipContent unit="lbs" />} />
                  <Line
                    type="monotone" dataKey="weight" stroke={CATEGORY_THEME.weight.color}
                    strokeWidth={2} dot={{ r: 2.5 }} connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </SectionChart>
          )}

          {/* ── STEPS ── */}
          <SectionChart
            title="Steps" icon={Footprints} color={CATEGORY_THEME.steps.color} href="/steps" stagger={3}
            summaryCards={<>
              <StatCard label="Avg / Day" value={s.steps.avg != null ? s.steps.avg.toLocaleString() : "--"} sub="steps · logged days" color={CATEGORY_THEME.steps.color} />
              <StatCard label="Total" value={s.steps.total.toLocaleString()} sub="steps · incl. runs" />
              <StatCard label="Days Logged" value={`${s.steps.daysLogged}`} sub={daysLabel} />
              <StatCard label="Best Day" value={maxLogged(x => x.steps)?.toLocaleString() ?? "--"} sub="steps" />
            </>}
          >
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={d} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={32} />
                <Tooltip content={<ChartTooltipContent unit="steps" />} />
                <Bar dataKey="steps" fill={CATEGORY_THEME.steps.color} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionChart>

          {/* ── RUNNING ── */}
          <SectionChart
            title="Running" icon={PersonStanding} color={CATEGORY_THEME.running.color} href="/running" stagger={4}
            summaryCards={<>
              <StatCard label="Total Distance" value={`${s.running.totalMiles}`} sub="mi" color={CATEGORY_THEME.running.color} />
              <StatCard
                label="Total Runs"
                value={`${s.running.runs}`}
                sub={s.running.daysActive != null ? `${s.running.daysActive} day${s.running.daysActive === 1 ? "" : "s"} active` : undefined}
              />
              <StatCard label="Avg Pace" value={formatPace(s.running.avgPace)} sub="/mi · all miles" />
              <StatCard label="Best Pace" value={formatPace(s.running.bestPace)} sub="/mi" />
            </>}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground/50 mb-1">Distance</div>
                <ResponsiveContainer width="100%" height={110}>
                  <AreaChart data={d.filter(x => x.runMiles > 0)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} />
                    <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={26} />
                    <Tooltip content={<ChartTooltipContent unit="mi" />} />
                    <Area
                      type="monotone" dataKey="runMiles" stroke={CATEGORY_THEME.running.color}
                      fill={CATEGORY_THEME.running.color} fillOpacity={0.15} strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground/50 mb-1">Pace</div>
                <ResponsiveContainer width="100%" height={110}>
                  <LineChart data={d.filter(x => x.pace != null)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={chartAxisStyle} tickLine={false} axisLine={false} width={30}
                      reversed domain={["dataMin - 0.5", "dataMax + 0.5"]}
                      tickFormatter={(v: number) => formatPace(v)}
                    />
                    <Tooltip content={<ChartTooltipContent formatter={(v: number) => formatPace(v)} unit="/mi" />} />
                    <Line
                      type="monotone" dataKey="pace" stroke="oklch(0.82 0.18 110)"
                      strokeWidth={2} dot={{ r: 2.5 }} connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </SectionChart>

          {/* ── WORKOUTS ── */}
          <SectionChart
            title="Workouts" icon={Dumbbell} color={CATEGORY_THEME.workouts.color} href="/workouts" stagger={5}
            summaryCards={<>
              <StatCard label="Total Sessions" value={`${s.workouts.total}`} color={CATEGORY_THEME.workouts.color} />
              <StatCard label="Days Active" value={`${s.workouts.daysActive}`} sub={daysLabel} />
              <StatCard label="Avg / Week" value={s.workouts.total > 0 ? (s.workouts.total / (daysElapsed / 7)).toFixed(1) : "--"} sub="sessions" />
              <StatCard label="Consistency" value={s.workouts.daysActive > 0 ? `${Math.round((s.workouts.daysActive / daysElapsed) * 100)}%` : "--"} sub={isCurrentMonth ? "of days so far" : "of the month"} />
            </>}
          >
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={d} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={20} allowDecimals={false} />
                <Tooltip content={<ChartTooltipContent unit="sessions" />} />
                <Bar dataKey="workouts" fill={CATEGORY_THEME.workouts.color} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionChart>

          {/* ── SLEEP ── */}
          <SectionChart
            title="Sleep" icon={Moon} color={CATEGORY_THEME.sleep.color} href="/sleep" stagger={6}
            summaryCards={<>
              <StatCard label="Avg / Night" value={s.sleep.avg != null ? `${s.sleep.avg}` : "--"} sub="hrs" color={CATEGORY_THEME.sleep.color} />
              <StatCard label="Days Logged" value={`${s.sleep.daysLogged}`} sub={daysLabel} />
              <StatCard label="Longest Night" value={d.some(x => x.sleepHrs != null) ? `${Math.max(...d.filter(x => x.sleepHrs != null).map(x => x.sleepHrs!))}` : "--"} sub="hrs" />
              <StatCard label="Shortest Night" value={d.some(x => x.sleepHrs != null) ? `${Math.min(...d.filter(x => x.sleepHrs != null).map(x => x.sleepHrs!))}` : "--"} sub="hrs" />
            </>}
          >
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={d}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={26} domain={[0, "dataMax + 1"]} />
                <Tooltip content={<ChartTooltipContent unit="hrs" />} />
                <Area
                  type="monotone" dataKey="sleepHrs" stroke={CATEGORY_THEME.sleep.color}
                  fill={CATEGORY_THEME.sleep.color} fillOpacity={0.15} strokeWidth={2}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </SectionChart>

          {/* ── ALCOHOL ── */}
          <SectionChart
            title="Alcohol" icon={Beer} color={CATEGORY_THEME.alcohol.color} href="/alcohol" stagger={7}
            summaryCards={<>
              <StatCard label="Total Units" value={`${s.alcohol.total}`} color={CATEGORY_THEME.alcohol.color} />
              <StatCard label="Avg / Drinking Day" value={s.alcohol.avg != null ? `${s.alcohol.avg}` : "--"} sub="units" />
              <StatCard label="Days Drinking" value={`${s.alcohol.daysLogged}`} sub={daysLabel} />
              <StatCard label="Dry Days" value={`${Math.max(0, daysElapsed - s.alcohol.daysLogged)}`} sub={isCurrentMonth ? "so far" : undefined} />
            </>}
          >
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={d} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={20} allowDecimals={false} />
                <Tooltip content={<ChartTooltipContent unit="units" />} />
                <Bar dataKey="alcohol" fill={CATEGORY_THEME.alcohol.color} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionChart>

          {/* ── BOWEL ── */}
          <SectionChart
            title="Bowel" icon={CircleDot} color={CATEGORY_THEME.bowel.color} href="/bowel" stagger={7}
            summaryCards={<>
              <StatCard label="Total" value={`${s.bowel.total}`} color={CATEGORY_THEME.bowel.color} />
              <StatCard label="Avg / Logged Day" value={s.bowel.avg != null ? `${s.bowel.avg}` : "--"} />
              <StatCard label="Days Logged" value={`${s.bowel.daysLogged}`} sub={daysLabel} />
              <StatCard label="Regularity" value={s.bowel.daysLogged > 0 ? `${Math.round((s.bowel.daysLogged / daysElapsed) * 100)}%` : "--"} sub={isCurrentMonth ? "of days so far" : "of the month"} />
            </>}
          >
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={d} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={20} allowDecimals={false} />
                <Tooltip content={<ChartTooltipContent unit="entries" />} />
                <Bar dataKey="bowel" fill={CATEGORY_THEME.bowel.color} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionChart>
        </div>
      ) : (
        <div className="text-center py-16 text-sm text-muted-foreground/60">
          No data available for this month
        </div>
      )}
    </div>
  )
}
