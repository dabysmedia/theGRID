"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import Link from "next/link"
import { DatePicker } from "@/components/DatePicker"
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
  workouts: "#a855f7",
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
    <div className="glass rounded-lg border border-border px-2.5 py-1.5 font-mono text-[10px]">
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

export default function StatsPage() {
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"))
  const [data, setData] = useState<MonthlyData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMonth = useCallback(async (m: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/stats/monthly?month=${m}`)
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
    fontFamily: "var(--font-mono)",
  }), [])

  const gridStroke = "oklch(1 0 0 / 5%)"

  const s = data?.summary
  const d = data?.daily ?? []

  return (
    <div className="space-y-6">
      <header className="space-y-2 animate-fade-up">
        <div className="flex items-center gap-3">
          <div className="status-dot" />
          <div>
            <h1 className="text-lg font-bold tracking-[0.15em] uppercase">Statistics</h1>
            <p className="text-[10px] text-muted-foreground/65 tracking-[0.08em] uppercase mt-0.5">
              Monthly analytics overview
            </p>
          </div>
        </div>
        <div className="pl-5 lg:pl-0">
          <DatePicker />
        </div>
      </header>

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
