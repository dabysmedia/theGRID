"use client"

import { useEffect, useMemo, useState } from "react"
import { Calendar, Footprints, Trash2 } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { format, isToday, isYesterday, startOfDay, subDays } from "date-fns"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActiveDate } from "@/context/DateContext"
import { formatDate, formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { kmToMiles, runKmToStepsFromRun, STEPS_PER_MILE_FROM_RUN } from "@/lib/units"
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"

const stepsGoalPresets: GoalPreset[] = [
  { type: "daily", label: "Daily Total", unit: "steps", placeholder: "10000" },
  { type: "weekly", label: "Weekly Total", unit: "steps", placeholder: "70000" },
]

interface StepEntry {
  id: string
  date: string
  count: number
  createdAt?: string
}

interface RunEntry {
  id: string
  date: string
  distance: number
  createdAt?: string
}

function dayKeyFromEntry(dateIso: string): string {
  return formatDate(startOfDay(new Date(dateIso)))
}

function groupHeaderLabel(dayKey: string): string {
  const d = parseLocalDate(dayKey)
  if (isToday(d)) return "Today"
  if (isYesterday(d)) return "Yesterday"
  return formatDisplayDate(d)
}

/** Common rule-of-thumb: ~2,000 steps ≈ 1 mile walked */
const STEPS_PER_MILE = 2000

function milesToSteps(miles: number): number {
  return Math.round(miles * STEPS_PER_MILE)
}

type HistoryRow =
  | { kind: "logged"; entry: StepEntry }
  | { kind: "run"; run: RunEntry }

export default function StepsPage() {
  const { activeDate } = useActiveDate()
  const [entries, setEntries] = useState<StepEntry[]>([])
  const [runEntries, setRunEntries] = useState<RunEntry[]>([])
  const [count, setCount] = useState("")
  const [inputMode, setInputMode] = useState<"steps" | "miles">("steps")

  const today = activeDate

  useEffect(() => {
    Promise.all([
      fetch("/api/steps").then(async (r) => {
        const data = await r.json()
        return Array.isArray(data) ? data : []
      }),
      fetch("/api/running").then(async (r) => {
        const data = await r.json()
        return Array.isArray(data) ? data : []
      }),
    ])
      .then(([stepsData, runsData]) => {
        setEntries(stepsData)
        setRunEntries(runsData)
      })
      .catch(() => {
        setEntries([])
        setRunEntries([])
      })
  }, [])

  const byDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries) {
      const k = dayKeyFromEntry(e.date)
      m.set(k, (m.get(k) ?? 0) + e.count)
    }
    for (const r of runEntries) {
      const k = dayKeyFromEntry(r.date)
      m.set(k, (m.get(k) ?? 0) + runKmToStepsFromRun(r.distance))
    }
    return m
  }, [entries, runEntries])

  const stepsFromRunsToday = useMemo(() => {
    let s = 0
    for (const r of runEntries) {
      if (dayKeyFromEntry(r.date) === today) s += runKmToStepsFromRun(r.distance)
    }
    return s
  }, [runEntries, today])

  const weekDayKeys = useMemo(
    () => Array.from({ length: 7 }, (_, i) => formatDate(subDays(parseLocalDate(activeDate), 6 - i))),
    [activeDate]
  )

  const stats = useMemo(() => {
    const todayTotal = byDay.get(today) ?? 0
    const dailyTotals = weekDayKeys.map((k) => byDay.get(k) ?? 0)
    const weekTotal = dailyTotals.reduce((a, b) => a + b, 0)
    const avg7 = weekTotal / 7

    let best = 0
    let bestKey: string | null = null
    for (const [k, v] of byDay) {
      if (v > best) {
        best = v
        bestKey = k
      }
    }

    return {
      todayTotal,
      avg7,
      weekTotal,
      bestDay: best,
      bestDayLabel:
        bestKey != null && best > 0
          ? format(parseLocalDate(bestKey), "MMM d, yyyy")
          : null,
    }
  }, [byDay, today, weekDayKeys])

  const chartData = useMemo(
    () =>
      weekDayKeys.map((k) => {
        const d = parseLocalDate(k)
        return {
          key: k,
          label: format(d, "EEE"),
          steps: byDay.get(k) ?? 0,
        }
      }),
    [byDay, weekDayKeys]
  )

  const historyGroups = useMemo(() => {
    const buckets = new Map<string, HistoryRow[]>()
    for (const e of entries) {
      const k = dayKeyFromEntry(e.date)
      if (!buckets.has(k)) buckets.set(k, [])
      buckets.get(k)!.push({ kind: "logged", entry: e })
    }
    for (const r of runEntries) {
      const k = dayKeyFromEntry(r.date)
      if (!buckets.has(k)) buckets.set(k, [])
      buckets.get(k)!.push({ kind: "run", run: r })
    }
    const keys = [...buckets.keys()].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))
    return keys.map((dayKey) => ({
      dayKey,
      header: groupHeaderLabel(dayKey),
      rows: buckets.get(dayKey)!.sort((a, b) => {
        const timeOf = (row: HistoryRow) =>
          new Date(
            row.kind === "logged"
              ? row.entry.createdAt ?? row.entry.date
              : row.run.createdAt ?? row.run.date
          ).getTime()
        return timeOf(b) - timeOf(a)
      }),
    }))
  }, [entries, runEntries])

  function switchInputMode(next: "steps" | "miles") {
    if (next === inputMode) return
    const trimmed = count.trim()
    if (trimmed !== "") {
      const n = parseFloat(trimmed)
      if (!Number.isNaN(n) && n > 0) {
        if (next === "miles" && inputMode === "steps") {
          setCount(String(Math.round((n / STEPS_PER_MILE) * 100) / 100))
        } else if (next === "steps" && inputMode === "miles") {
          setCount(String(milesToSteps(n)))
        }
      }
    }
    setInputMode(next)
  }

  function addQuickSteps() {
    if (inputMode === "steps") {
      const n = parseInt(count, 10)
      const base = Number.isNaN(n) ? 0 : n
      setCount(String(base + 2000))
    } else {
      const n = parseFloat(count)
      const base = Number.isNaN(n) ? 0 : n
      setCount(String(Math.round((base + 1) * 100) / 100))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!count) return

    const raw = parseFloat(count)
    if (Number.isNaN(raw) || raw <= 0) return

    const stepsToLog =
      inputMode === "miles" ? milesToSteps(raw) : Math.round(raw)

    const res = await fetch("/api/steps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today, count: stepsToLog }),
    })

    if (res.ok) {
      const entry = await res.json()
      setEntries([entry, ...entries])
      setCount("")
    }
  }

  const milesPreview =
    inputMode === "miles" && count.trim() !== ""
      ? milesToSteps(parseFloat(count) || 0)
      : null

  async function handleDelete(id: string) {
    const res = await fetch(`/api/steps?id=${id}`, { method: "DELETE" })
    if (res.ok) setEntries(entries.filter((e) => e.id !== id))
  }

  const todayTotal = stats.todayTotal

  return (
    <div className="space-y-6">
      <PageHeader title="Steps" icon={Footprints} iconColor="#22c55e" />

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none animate-fade-up">
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Today
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {stats.todayTotal.toLocaleString()}
          </span>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">steps total</p>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            7-Day Avg
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {Math.round(stats.avg7).toLocaleString()}
          </span>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">daily average</p>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Week Total
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {stats.weekTotal.toLocaleString()}
          </span>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">last 7 days</p>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Best Day
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {stats.bestDay > 0 ? stats.bestDay.toLocaleString() : "—"}
          </span>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
            {stats.bestDayLabel ?? "no data yet"}
          </p>
        </div>
      </div>

      <CategoryGoal
        category="steps"
        values={{ daily: stats.todayTotal, weekly: stats.weekTotal }}
        presets={stepsGoalPresets}
        color="#22c55e"
      />

      <div className="glass rounded-2xl p-5 animate-fade-up stagger-2">
          <div className="text-center lg:text-left mb-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Today&apos;s Total</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight">{todayTotal.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">steps</p>
            {stepsFromRunsToday > 0 && (
              <p className="text-[11px] text-muted-foreground/80 mt-1.5">
                Includes {stepsFromRunsToday.toLocaleString()} steps from runs (
                {STEPS_PER_MILE_FROM_RUN.toLocaleString()} / mi)
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Entry type
              </Label>
              <div className="flex rounded-xl border border-glass-border bg-glass-highlight/20 p-0.5">
                <button
                  type="button"
                  onClick={() => switchInputMode("steps")}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                    inputMode === "steps"
                      ? "bg-background/80 text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Steps
                </button>
                <button
                  type="button"
                  onClick={() => switchInputMode("miles")}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                    inputMode === "miles"
                      ? "bg-background/80 text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Miles
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="count" className="text-xs uppercase tracking-wider text-muted-foreground">
                {inputMode === "steps" ? "Step count *" : "Distance (miles) *"}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="count"
                  type="number"
                  step={inputMode === "miles" ? "0.01" : "1"}
                  min="0"
                  placeholder={inputMode === "steps" ? "5000" : "2.5"}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="flex-1"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 px-3"
                  onClick={addQuickSteps}
                  title={
                    inputMode === "steps"
                      ? "Add 2,000 steps"
                      : "Add 1 mile (~2,000 steps)"
                  }
                >
                  {inputMode === "steps" ? "+2k" : "+1 mi"}
                </Button>
              </div>
              {inputMode === "miles" && milesPreview != null && milesPreview > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  ≈ {milesPreview.toLocaleString()} steps ({STEPS_PER_MILE.toLocaleString()} steps/mi)
                </p>
              )}
            </div>
            <Button type="submit" className="w-full press-scale" size="lg">
              Log Steps
            </Button>
          </form>
        </div>

      <div className="glass rounded-2xl p-4 lg:p-5 animate-fade-up stagger-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          7-Day Trend
        </h2>
        <div className="h-40 lg:h-48 w-full">
          {chartData.some((d) => d.steps > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="stepsBarGrad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(1 0 0 / 5%)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.19 0.012 250 / 98%)",
                    border: "1px solid oklch(1 0 0 / 8%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    backdropFilter: "blur(8px)",
                  }}
                  labelStyle={{ color: "oklch(0.60 0.01 250)" }}
                  formatter={(val) => [
                    `${Number(val ?? 0).toLocaleString()} steps`,
                    "Total",
                  ]}
                />
                <Bar dataKey="steps" fill="url(#stepsBarGrad)" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Log steps to see your week
            </div>
          )}
        </div>
      </div>

        <div className="space-y-3 animate-fade-up stagger-2">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground px-1">History</h2>
          {entries.length === 0 && runEntries.length === 0 && (
            <div className="glass-subtle rounded-2xl p-6 text-center">
              <p className="text-sm text-muted-foreground">No entries yet</p>
            </div>
          )}
          {historyGroups.map((group) => (
            <div key={group.dayKey}>
              <div className="flex items-center gap-1.5 px-1 mb-2 mt-1 first:mt-0">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.header}
                </span>
              </div>
              <div className="space-y-1.5">
                {group.rows.map((row) => {
                  if (row.kind === "logged") {
                    const entry = row.entry
                    const dayKey = dayKeyFromEntry(entry.date)
                    const dateLine = format(parseLocalDate(dayKey), "EEE, MMM d, yyyy")
                    const timeLine =
                      entry.createdAt != null
                        ? format(new Date(entry.createdAt), "h:mm a")
                        : null
                    return (
                      <div
                        key={`step-${entry.id}`}
                        className="glass-subtle rounded-xl p-3.5 flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#22c55e]/10 shrink-0">
                            <Footprints className="h-3.5 w-3.5 text-[#22c55e]" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-sm">{entry.count.toLocaleString()} steps</span>
                            <p className="text-xs text-muted-foreground/80 truncate">
                              {dateLine}
                              {timeLine != null ? ` · ${timeLine}` : ""}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDelete(entry.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-destructive/10 shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    )
                  }
                  const run = row.run
                  const steps = runKmToStepsFromRun(run.distance)
                  const timeLine =
                    run.createdAt != null
                      ? format(new Date(run.createdAt), "h:mm a")
                      : null
                  const mi = kmToMiles(run.distance)
                  return (
                    <div
                      key={`run-${run.id}`}
                      className="glass-subtle rounded-xl p-3.5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#22c55e]/10 shrink-0">
                          <Footprints className="h-3.5 w-3.5 text-[#22c55e]" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-sm">{steps.toLocaleString()} steps</span>
                          <p className="text-xs text-muted-foreground/80 truncate">
                            <span className="text-muted-foreground/90">from run</span>
                            {" · "}
                            {mi.toFixed(1)} mi
                            {timeLine != null ? ` · ${timeLine}` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
    </div>
  )
}
