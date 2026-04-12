"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { format, subMonths, addMonths } from "date-fns"
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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"

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

interface Summary {
  calories: { avg: number | null; total: number; daysLogged: number }
  steps: { avg: number | null; total: number; daysLogged: number }
  running: { totalMiles: number; runs: number; avgPace: number | null; bestPace: number | null }
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
  daily: DayData[]
  summary: Summary
}

const CATEGORY_COLORS: Record<string, string> = {
  calories: "#ef4444",
  steps: "#22c55e",
  running: "#3b82f6",
  workouts: "#c4d632",
  sleep: "#6366f1",
  alcohol: "#f59e0b",
  bowel: "#78716c",
  weight: "#14b8a6",
}

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
    <div className="glass rounded-lg border border-border px-2.5 py-1.5 font-sans text-[10px] tabular-nums">
      <div className="text-muted-foreground/70">{label}</div>
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
    <div className="glass space-y-0.5 rounded-xl p-3">
      <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60">{label}</div>
      <div className="text-base font-bold tracking-wide" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground/50">{sub}</div>}
    </div>
  )
}

function SectionChart({
  title, icon: Icon, color, href, children, summaryCards,
}: {
  title: string
  icon: React.ElementType
  color: string
  href: string
  children: React.ReactNode
  summaryCards: React.ReactNode
}) {
  return (
    <div className="glass animate-fade-up space-y-3 rounded-2xl p-4 lg:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}15` }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color }} />
          </div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em]">{title}</h2>
        </div>
        <Link
          href={href}
          className="text-[9px] uppercase tracking-[0.1em] text-primary/70 hover:text-primary transition-colors"
        >
          View all &rarr;
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{summaryCards}</div>
      <div className="min-h-[8rem] min-w-0">{children}</div>
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
  steps: { label: "Steps", unit: "steps", color: "#22c55e", icon: Footprints, compareNoun: "steps", correlationMode: "lagged1to2" },
  calories: { label: "Calories", unit: "cal", color: "#ef4444", icon: Flame, compareNoun: "calories", correlationMode: "lagged1to2" },
  sleepHrs: { label: "Sleep", unit: "hrs", color: "#6366f1", icon: Moon, compareNoun: "sleep", correlationMode: "sameDay" },
  bowel: { label: "Bowel", unit: "entries", color: "#78716c", icon: CircleDot, compareNoun: "bowel entries", correlationMode: "lagged1to2" },
}

const METRIC_KEYS: MetricKey[] = ["steps", "calories", "sleepHrs", "bowel"]

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

function lastWeightAtOrBefore(daily: DayData[], index: number): number | null {
  for (let i = index; i >= 0; i--) {
    const w = daily[i]!.weight
    if (w != null) return w
  }
  return null
}

/** Forward weigh-in vs last known weight at/before that day (lagged metrics). */
function forwardDeltaLb(daily: DayData[], i: number): number | null {
  const wf = daily[i]!.weightForward
  if (wf == null) return null
  const prev = lastWeightAtOrBefore(daily, i)
  if (prev == null) return null
  return Math.round((wf - prev) * 10) / 10
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** Metric-aware scale cues merged into the correlation summary (heuristic, not medical). */
function buildScaleCues(daily: DayData[], key: MetricKey): string[] {
  const lines: string[] = []

  if (key === "calories") {
    const rows: { val: number; delta: number; label: string }[] = []
    for (let i = 0; i < daily.length; i++) {
      const d = daily[i]!
      const delta = forwardDeltaLb(daily, i)
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
      const delta = forwardDeltaLb(daily, i)
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
    const paired = daily.filter((d) => d.weight != null && d.sleepHrs != null)
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
    const delta = forwardDeltaLb(daily, i)
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
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#14b8a6" }} />
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
    () => daily.filter((d) => d.weightForward != null).length,
    [daily]
  )

  const sameDaySleepPairCount = useMemo(
    () => daily.filter((d) => d.weight != null && d.sleepHrs != null).length,
    [daily]
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
        const paired = daily.filter((d) => d.weight != null && d.sleepHrs != null)
        const xs = paired.map((d) => d.sleepHrs!)
        const ys = paired.map((d) => d.weight!)
        out[k] = pearson(xs, ys)
      } else {
        const paired = daily.filter((d) => d.weightForward != null)
        const xs = paired.map((d) => {
          const v = d[k]
          return typeof v === "number" ? v : 0
        })
        const ys = paired.map((d) => d.weightForward!)
        out[k] = pearson(xs, ys)
      }
    }
    return out
  }, [daily])

  const meta = METRIC_META[active]
  const hasWeight = daily.some((d) => d.weight != null || d.weightForward != null)

  const pairCountForActive =
    meta.correlationMode === "sameDay" ? sameDaySleepPairCount : laggedPairCount
  const rActive = correlations[active]
  const activeCopy = useMemo(
    () => correlationCardCopy(active, rActive, pairCountForActive, meta.correlationMode),
    [active, rActive, pairCountForActive, meta.correlationMode]
  )
  const scaleCues = useMemo(() => buildScaleCues(daily, active), [daily, active])

  if (!hasWeight) return null

  return (
    <div className="glass animate-fade-up space-y-3 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#14b8a6]/15">
            <Activity className="h-4 w-4 text-[#14b8a6]" />
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
                fill: "#14b8a6",
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
              stroke="#14b8a6"
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: "#14b8a6", strokeWidth: 0 }}
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
    </div>
  )
}

export default function StatsPage() {
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"))
  const [data, setData] = useState<MonthlyData | null>(null)
  const [loading, setLoading] = useState(true)

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

  const chartAxisStyle = useMemo(() => ({
    fontSize: 9,
    fill: "oklch(0.55 0.01 250)",
    fontFamily:
      "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  }), [])

  const gridStroke = "oklch(1 0 0 / 5%)"

  const s = data?.summary
  const d = data?.daily ?? []

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PageHeader title="Statistics" />
        <p className="text-[11px] leading-snug text-muted-foreground/75 sm:text-xs">
          Monthly analytics overview
        </p>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-center gap-4 animate-fade-up">
        <button
          onClick={prevMonth}
          className="glass rounded-xl p-2 transition-all hover:bg-glass-highlight/30 active:scale-95"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-bold tracking-[0.15em] uppercase min-w-[10rem] text-center">
          {data?.monthLabel ?? month}
        </div>
        <button
          onClick={nextMonth}
          disabled={isCurrentMonth}
          className="glass rounded-xl p-2 transition-all hover:bg-glass-highlight/30 active:scale-95 disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : data && s ? (
        <div className="space-y-4">
          {/* ── WEIGHT CORRELATION ── */}
          <CorrelationPanel daily={d} />

          {/* ── CALORIES ── */}
          <SectionChart
            title="Calories" icon={Flame} color={CATEGORY_COLORS.calories} href="/calories"
            summaryCards={<>
              <StatCard label="Avg / Day" value={s.calories.avg != null ? s.calories.avg.toLocaleString() : "--"} sub="cal" color={CATEGORY_COLORS.calories} />
              <StatCard label="Total" value={s.calories.total.toLocaleString()} sub="cal" />
              <StatCard label="Days Logged" value={`${s.calories.daysLogged}`} sub={`/ ${data.daysInMonth}`} />
              <StatCard label="Highest Day" value={d.length > 0 ? Math.max(...d.map(x => x.calories)).toLocaleString() : "--"} sub="cal" />
            </>}
          >
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={d} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={32} />
                <Tooltip content={<ChartTooltipContent unit="cal" />} />
                <Bar dataKey="calories" fill={CATEGORY_COLORS.calories} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionChart>

          {/* ── WEIGHT ── */}
          {(s.weight.daysLogged > 0) && (
            <SectionChart
              title="Weight" icon={Weight} color={CATEGORY_COLORS.weight} href="/weight"
              summaryCards={<>
                <StatCard label="Start" value={s.weight.start != null ? `${s.weight.start}` : "--"} sub="lbs" color={CATEGORY_COLORS.weight} />
                <StatCard label="Current" value={s.weight.end != null ? `${s.weight.end}` : "--"} sub="lbs" />
                <StatCard
                  label="Change"
                  value={s.weight.change != null ? `${s.weight.change > 0 ? "+" : ""}${s.weight.change}` : "--"}
                  sub="lbs"
                />
                <StatCard label="Days Logged" value={`${s.weight.daysLogged}`} sub={`/ ${data.daysInMonth}`} />
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
                    type="monotone" dataKey="weight" stroke={CATEGORY_COLORS.weight}
                    strokeWidth={2} dot={{ r: 2.5 }} connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </SectionChart>
          )}

          {/* ── STEPS ── */}
          <SectionChart
            title="Steps" icon={Footprints} color={CATEGORY_COLORS.steps} href="/steps"
            summaryCards={<>
              <StatCard label="Avg / Day" value={s.steps.avg != null ? s.steps.avg.toLocaleString() : "--"} sub="steps" color={CATEGORY_COLORS.steps} />
              <StatCard label="Total" value={s.steps.total.toLocaleString()} sub="steps" />
              <StatCard label="Days Logged" value={`${s.steps.daysLogged}`} sub={`/ ${data.daysInMonth}`} />
              <StatCard label="Best Day" value={d.length > 0 ? Math.max(...d.map(x => x.steps)).toLocaleString() : "--"} sub="steps" />
            </>}
          >
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={d} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={32} />
                <Tooltip content={<ChartTooltipContent unit="steps" />} />
                <Bar dataKey="steps" fill={CATEGORY_COLORS.steps} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionChart>

          {/* ── RUNNING ── */}
          <SectionChart
            title="Running" icon={PersonStanding} color={CATEGORY_COLORS.running} href="/running"
            summaryCards={<>
              <StatCard label="Total Distance" value={`${s.running.totalMiles}`} sub="mi" color={CATEGORY_COLORS.running} />
              <StatCard label="Total Runs" value={`${s.running.runs}`} />
              <StatCard label="Avg Pace" value={formatPace(s.running.avgPace)} sub="/mi" />
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
                      type="monotone" dataKey="runMiles" stroke={CATEGORY_COLORS.running}
                      fill={CATEGORY_COLORS.running} fillOpacity={0.15} strokeWidth={2}
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
            title="Workouts" icon={Dumbbell} color={CATEGORY_COLORS.workouts} href="/workouts"
            summaryCards={<>
              <StatCard label="Total Sessions" value={`${s.workouts.total}`} color={CATEGORY_COLORS.workouts} />
              <StatCard label="Days Active" value={`${s.workouts.daysActive}`} sub={`/ ${data.daysInMonth}`} />
              <StatCard label="Avg / Week" value={s.workouts.total > 0 ? (s.workouts.total / (data.daysInMonth / 7)).toFixed(1) : "--"} sub="sessions" />
              <StatCard label="Consistency" value={s.workouts.daysActive > 0 ? `${Math.round((s.workouts.daysActive / data.daysInMonth) * 100)}%` : "--"} />
            </>}
          >
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={d} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={20} allowDecimals={false} />
                <Tooltip content={<ChartTooltipContent unit="sessions" />} />
                <Bar dataKey="workouts" fill={CATEGORY_COLORS.workouts} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionChart>

          {/* ── SLEEP ── */}
          <SectionChart
            title="Sleep" icon={Moon} color={CATEGORY_COLORS.sleep} href="/sleep"
            summaryCards={<>
              <StatCard label="Avg / Night" value={s.sleep.avg != null ? `${s.sleep.avg}` : "--"} sub="hrs" color={CATEGORY_COLORS.sleep} />
              <StatCard label="Days Logged" value={`${s.sleep.daysLogged}`} sub={`/ ${data.daysInMonth}`} />
              <StatCard label="Best Night" value={d.some(x => x.sleepHrs != null) ? `${Math.max(...d.filter(x => x.sleepHrs != null).map(x => x.sleepHrs!))}` : "--"} sub="hrs" />
              <StatCard label="Worst Night" value={d.some(x => x.sleepHrs != null) ? `${Math.min(...d.filter(x => x.sleepHrs != null).map(x => x.sleepHrs!))}` : "--"} sub="hrs" />
            </>}
          >
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={d}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={26} domain={[0, "dataMax + 1"]} />
                <Tooltip content={<ChartTooltipContent unit="hrs" />} />
                <Area
                  type="monotone" dataKey="sleepHrs" stroke={CATEGORY_COLORS.sleep}
                  fill={CATEGORY_COLORS.sleep} fillOpacity={0.15} strokeWidth={2}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </SectionChart>

          {/* ── ALCOHOL ── */}
          <SectionChart
            title="Alcohol" icon={Beer} color={CATEGORY_COLORS.alcohol} href="/alcohol"
            summaryCards={<>
              <StatCard label="Total Units" value={`${s.alcohol.total}`} color={CATEGORY_COLORS.alcohol} />
              <StatCard label="Avg / Day" value={s.alcohol.avg != null ? `${s.alcohol.avg}` : "--"} sub="units" />
              <StatCard label="Days Drinking" value={`${s.alcohol.daysLogged}`} sub={`/ ${data.daysInMonth}`} />
              <StatCard label="Dry Days" value={`${data.daysInMonth - s.alcohol.daysLogged}`} />
            </>}
          >
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={d} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={20} allowDecimals={false} />
                <Tooltip content={<ChartTooltipContent unit="units" />} />
                <Bar dataKey="alcohol" fill={CATEGORY_COLORS.alcohol} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionChart>

          {/* ── BOWEL ── */}
          <SectionChart
            title="Bowel" icon={CircleDot} color={CATEGORY_COLORS.bowel} href="/bowel"
            summaryCards={<>
              <StatCard label="Total" value={`${s.bowel.total}`} color={CATEGORY_COLORS.bowel} />
              <StatCard label="Avg / Day" value={s.bowel.avg != null ? `${s.bowel.avg}` : "--"} />
              <StatCard label="Days Logged" value={`${s.bowel.daysLogged}`} sub={`/ ${data.daysInMonth}`} />
              <StatCard label="Regularity" value={s.bowel.daysLogged > 0 ? `${Math.round((s.bowel.daysLogged / data.daysInMonth) * 100)}%` : "--"} />
            </>}
          >
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={d} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={chartAxisStyle} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={20} allowDecimals={false} />
                <Tooltip content={<ChartTooltipContent unit="entries" />} />
                <Bar dataKey="bowel" fill={CATEGORY_COLORS.bowel} radius={[2, 2, 0, 0]} />
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
