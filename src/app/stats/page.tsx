"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
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
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
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
} from "lucide-react"
import { cn, formatDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { CATEGORY_THEME } from "@/lib/category-theme"
import {
  WeightCorrelationPanel,
  type WeightCorrelationDayData,
} from "@/components/stats/WeightCorrelationPanel"

type DayData = WeightCorrelationDayData


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
  href?: string
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
        {href ? (
          <Link
            href={href}
            className="press-scale type-hud-chip rounded-lg px-2 py-1.5 text-primary/70 transition-colors hover:text-primary"
          >
            View all &rarr;
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{summaryCards}</div>
      <div className="animate-chart-wipe min-h-[8rem] min-w-0">{children}</div>
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
  /** Days that have actually happened â€” averages, "best day", and charts use this. */
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

      {/* Month navigator â€” swipe horizontally to flip months */}
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
              Day {daysElapsed} of {data.daysInMonth} Â· In progress
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
          {/* â”€â”€ MONTH AT A GLANCE â”€â”€ */}
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

          {/* â”€â”€ WEIGHT CORRELATION â”€â”€ */}
          <WeightCorrelationPanel daily={d} />

          {/* â”€â”€ CALORIES â”€â”€ */}
          <SectionChart
            title="Calories" icon={Flame} color={CATEGORY_THEME.calories.color} href={CATEGORY_THEME.calories.href} stagger={1}
            summaryCards={<>
              <StatCard label="Avg / Day" value={s.calories.avg != null ? s.calories.avg.toLocaleString() : "--"} sub="cal Â· logged days" color={CATEGORY_THEME.calories.color} />
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

          {/* â”€â”€ WEIGHT â”€â”€ */}
          {(s.weight.daysLogged > 0) && (
            <SectionChart
              title="Weight" icon={Weight} color={CATEGORY_THEME.weight.color} stagger={2}
              summaryCards={<>
                <StatCard label="First Log" value={s.weight.start != null ? `${s.weight.start}` : "--"} sub="lbs" color={CATEGORY_THEME.weight.color} />
                <StatCard label="Last Log" value={s.weight.end != null ? `${s.weight.end}` : "--"} sub="lbs" />
                <StatCard
                  label="Change"
                  value={s.weight.change != null ? `${s.weight.change > 0 ? "+" : ""}${s.weight.change}` : "--"}
                  sub="lbs Â· first â†’ last log"
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

          {/* â”€â”€ STEPS â”€â”€ */}
          <SectionChart
            title="Steps" icon={Footprints} color={CATEGORY_THEME.steps.color} href={CATEGORY_THEME.steps.href} stagger={3}
            summaryCards={<>
              <StatCard label="Avg / Day" value={s.steps.avg != null ? s.steps.avg.toLocaleString() : "--"} sub="steps Â· logged days" color={CATEGORY_THEME.steps.color} />
              <StatCard label="Total" value={s.steps.total.toLocaleString()} sub="steps Â· incl. runs" />
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

          {/* â”€â”€ RUNNING â”€â”€ */}
          <SectionChart
            title="Running" icon={PersonStanding} color={CATEGORY_THEME.running.color} href="/running" stagger={4}
            summaryCards={<>
              <StatCard label="Total Distance" value={`${s.running.totalMiles}`} sub="mi" color={CATEGORY_THEME.running.color} />
              <StatCard
                label="Total Runs"
                value={`${s.running.runs}`}
                sub={s.running.daysActive != null ? `${s.running.daysActive} day${s.running.daysActive === 1 ? "" : "s"} active` : undefined}
              />
              <StatCard label="Avg Pace" value={formatPace(s.running.avgPace)} sub="/mi Â· all miles" />
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

          {/* â”€â”€ WORKOUTS â”€â”€ */}
          <SectionChart
            title="Workouts" icon={Dumbbell} color={CATEGORY_THEME.workouts.color} stagger={5}
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

          {/* â”€â”€ SLEEP â”€â”€ */}
          <SectionChart
            title="Sleep" icon={Moon} color={CATEGORY_THEME.sleep.color} href={CATEGORY_THEME.sleep.href} stagger={6}
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

          {/* â”€â”€ ALCOHOL â”€â”€ */}
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

          {/* â”€â”€ BOWEL â”€â”€ */}
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
