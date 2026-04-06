"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { format, isToday, isYesterday } from "date-fns"
import { Calendar, PersonStanding, Trash2, TreePine, Zap } from "lucide-react"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts"
import { PageHeader } from "@/components/PageHeader"
import { useActiveDate } from "@/context/DateContext"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { parseLocalDate, cn } from "@/lib/utils"
import { kmToMiles, milesToKm } from "@/lib/units"
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"

const runGoalPresets: GoalPreset[] = [
  { type: "weekly", label: "Weekly Distance", unit: "mi", placeholder: "15" },
  { type: "per_session", label: "Per-Run Distance", unit: "mi", placeholder: "3" },
  { type: "pace", label: "Target Pace", unit: "min/mi", placeholder: "8:30", direction: "down" },
]

interface RunEntry {
  id: string
  date: string
  distance: number
  duration: number
  environment: string
  notes: string | null
}

function formatGroupHeader(dateKey: string): string {
  const d = parseLocalDate(dateKey)
  if (isToday(d)) return "Today"
  if (isYesterday(d)) return "Yesterday"
  return format(d, "EEE, MMM d")
}

export default function RunningPage() {
  const { activeDate } = useActiveDate()
  const [entries, setEntries] = useState<RunEntry[]>([])
  const [distance, setDistance] = useState("")
  const [duration, setDuration] = useState("")
  const [environment, setEnvironment] = useState<"outdoor" | "treadmill">("outdoor")
  const [notes, setNotes] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const submitLockRef = useRef(false)

  const today = activeDate

  const todayMiles = useMemo(() => {
    return entries
      .filter((e) => e.date.split("T")[0] === today)
      .reduce((s, e) => s + kmToMiles(e.distance), 0)
  }, [entries, today])

  const goalValues = useMemo(() => {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - mondayOffset)
    const weekKey = format(weekStart, "yyyy-MM-dd")
    const weekMiles = entries
      .filter((e) => e.date.split("T")[0] >= weekKey)
      .reduce((s, e) => s + kmToMiles(e.distance), 0)

    const todayRuns = entries.filter((e) => e.date.split("T")[0] === today)
    const bestTodayRun = todayRuns.length > 0
      ? Math.max(...todayRuns.map((e) => kmToMiles(e.distance)))
      : 0

    const paces = todayRuns
      .filter((e) => e.distance > 0 && e.duration > 0)
      .map((e) => e.duration / kmToMiles(e.distance))
    const bestPace = paces.length > 0 ? Math.min(...paces) : 0

    return {
      weekly: Math.round(weekMiles * 10) / 10,
      per_session: Math.round(bestTodayRun * 10) / 10,
      pace: Math.round(bestPace * 100) / 100,
    }
  }, [entries, today])

  const nativeInputClass =
    "h-10 w-full min-w-0 rounded-[3px] border border-glass-border bg-glass-highlight/30 px-3 py-2 text-base font-mono tracking-wide backdrop-blur-sm transition-all outline-none placeholder:text-muted-foreground/60 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-glass-highlight/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"

  const stats = useMemo(() => {
    const totalKm = entries.reduce((s, e) => s + e.distance, 0)
    const totalDuration = entries.reduce((s, e) => s + e.duration, 0)
    const count = entries.length
    const longestKm =
      count === 0 ? 0 : Math.max(...entries.map((e) => e.distance))
    return {
      totalKm,
      totalMi: kmToMiles(totalKm),
      totalDuration,
      count,
      longestMi: kmToMiles(longestKm),
    }
  }, [entries])

  const chartData = useMemo(() => {
    const chronological = [...entries].reverse()
    return chronological.map((e) => {
      const dateKey = e.date.split("T")[0]
      return {
        id: e.id,
        label: format(parseLocalDate(dateKey), "MMM d"),
        distance: kmToMiles(e.distance),
      }
    })
  }, [entries])

  /** Pace in minutes per mile (one point per run, chronological oldest→newest). */
  const paceChartData = useMemo(() => {
    const chronological = [...entries].reverse()
    return chronological.map((e) => {
      const dateKey = e.date.split("T")[0]
      const mi = kmToMiles(e.distance)
      const paceMinPerMi =
        mi > 0 && e.duration > 0 ? e.duration / mi : null
      return {
        id: e.id,
        label: format(parseLocalDate(dateKey), "MMM d"),
        paceMin: paceMinPerMi,
      }
    })
  }, [entries])

  const groupedByDate = useMemo(() => {
    const map = new Map<string, RunEntry[]>()
    for (const e of entries) {
      const key = e.date.split("T")[0]
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return Array.from(map.entries()).sort((a, b) =>
      b[0].localeCompare(a[0])
    )
  }, [entries])

  useEffect(() => {
    fetch("/api/running")
      .then(async (r) => {
        const data = await r.json()
        setEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setEntries([]))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitLockRef.current) return
    submitLockRef.current = true
    setSubmitError(null)

    if (!distance.trim() || !duration.trim()) {
      setSubmitError("Enter distance and duration.")
      submitLockRef.current = false
      return
    }

    const mi = parseFloat(distance)
    if (!Number.isFinite(mi) || mi <= 0) {
      setSubmitError("Enter a valid distance in miles.")
      submitLockRef.current = false
      return
    }

    const durationMin = Number.parseInt(String(duration).trim(), 10)
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      setSubmitError("Enter duration in whole minutes.")
      submitLockRef.current = false
      return
    }

    try {
      const payload = {
        date: today,
        distance: milesToKm(mi),
        duration: durationMin,
        environment,
        notes: notes.trim() ? notes.trim() : null,
      }
      const res = await fetch("/api/running", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const entry = await res.json()
        setEntries([entry, ...entries])
        setDistance("")
        setDuration("")
        setNotes("")
        submitLockRef.current = false
        return
      }

      let message = "Could not save run."
      try {
        const data = await res.json()
        if (data && typeof data.error === "string") message = data.error
      } catch {
        /* ignore */
      }
      setSubmitError(message)
    } catch {
      setSubmitError("Network error. Try again.")
    } finally {
      submitLockRef.current = false
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/running?id=${id}`, { method: "DELETE" })
    if (res.ok) setEntries(entries.filter((e) => e.id !== id))
  }

  function formatPaceMiles(distanceKm: number, durationMin: number): string {
    const mi = kmToMiles(distanceKm)
    if (mi === 0) return "-"
    const paceMin = durationMin / mi
    return formatPaceMinutes(paceMin) + " /mi"
  }

  function formatPaceMinutes(paceMin: number): string {
    const mins = Math.floor(paceMin)
    const secs = Math.round((paceMin - mins) * 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const livePace = useMemo(() => {
    const mi = parseFloat(distance)
    const t = parseFloat(duration)
    if (!mi || !t || mi <= 0 || t <= 0) return null
    return formatPaceMiles(milesToKm(mi), t)
  }, [distance, duration])

  const avgPaceDisplay =
    stats.count > 0 && stats.totalKm > 0 && stats.totalDuration > 0
      ? formatPaceMiles(stats.totalKm, stats.totalDuration)
      : "—"

  return (
    <div className="space-y-6">
      <PageHeader title="Running" icon={PersonStanding} iconColor="#3b82f6" />

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none animate-fade-up">
        <div className="glass-subtle rounded-xl p-3 lg:p-4 min-w-[9rem] shrink-0 sm:flex-1 sm:min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Total Distance
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {stats.count === 0 ? "0" : stats.totalMi.toFixed(1)} mi
          </span>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 min-w-[9rem] shrink-0 sm:flex-1 sm:min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Avg Pace
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {avgPaceDisplay}
          </span>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 min-w-[9rem] shrink-0 sm:flex-1 sm:min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Total Runs
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {stats.count}
          </span>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 min-w-[9rem] shrink-0 sm:flex-1 sm:min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Longest Run
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">
            {stats.count === 0 ? "—" : `${stats.longestMi.toFixed(1)} mi`}
          </span>
        </div>
      </div>

      <CategoryGoal
        category="running"
        values={goalValues}
        presets={runGoalPresets}
        color="#3b82f6"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-up stagger-1">
        <div className="glass rounded-2xl p-4 lg:p-5 min-h-[12rem] min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3">
            Distance trend
          </h2>
          {chartData.length >= 2 ? (
            <div className="h-40 lg:h-48 w-full min-h-[10rem] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="runningDistGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
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
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={["dataMin - 0.5", "dataMax + 0.5"]}
                    tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.19 0.012 250 / 92%)",
                      border: "1px solid oklch(1 0 0 / 8%)",
                      borderRadius: "3px",
                      fontSize: "12px",
                      backdropFilter: "blur(8px)",
                    }}
                    labelStyle={{ color: "oklch(0.60 0.01 250)" }}
                    formatter={(val) => [`${Number(val).toFixed(1)} mi`, "Distance"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="distance"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#runningDistGrad)"
                    dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-40 lg:h-48 min-h-[10rem] flex items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Log at least 2 runs to see distance over time
              </p>
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-4 lg:p-5 min-h-[12rem] min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3">
            Pace trend
          </h2>
          {paceChartData.filter((d) => d.paceMin != null).length >= 2 ? (
            <div className="h-40 lg:h-48 w-full min-h-[10rem] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={paceChartData}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                >
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
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${Number(v).toFixed(1)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.19 0.012 250 / 92%)",
                      border: "1px solid oklch(1 0 0 / 8%)",
                      borderRadius: "3px",
                      fontSize: "12px",
                      backdropFilter: "blur(8px)",
                    }}
                    labelStyle={{ color: "oklch(0.60 0.01 250)" }}
                    formatter={(val) => {
                      if (val == null || Number.isNaN(Number(val))) return ["—", "Pace"]
                      return [
                        `${formatPaceMinutes(Number(val))} /mi`,
                        "Pace",
                      ]
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="paceMin"
                    stroke="oklch(0.82 0.18 110)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "oklch(0.82 0.18 110)", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-40 lg:h-48 min-h-[10rem] flex items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Log at least 2 runs with distance and duration to see pace over time
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up stagger-2">
        <div className="glass rounded-2xl p-5">
          <form noValidate onSubmit={handleSubmit} className="space-y-4">
            {/* Environment toggle */}
            <div className="flex rounded-[3px] border border-glass-border overflow-hidden">
              <button
                type="button"
                onClick={() => setEnvironment("outdoor")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors ${
                  environment === "outdoor"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-glass-highlight/20"
                }`}
              >
                <TreePine className="h-3.5 w-3.5" />
                Outdoor
              </button>
              <button
                type="button"
                onClick={() => setEnvironment("treadmill")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium uppercase tracking-[0.12em] border-l border-glass-border transition-colors ${
                  environment === "treadmill"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-glass-highlight/20"
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                Treadmill
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="distance" className="text-xs uppercase tracking-wider text-muted-foreground">Distance (mi) *</Label>
                <input
                  id="distance"
                  name="distance"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  placeholder="3.1"
                  autoComplete="off"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  className={nativeInputClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="duration" className="text-xs uppercase tracking-wider text-muted-foreground">Duration (min) *</Label>
                <input
                  id="duration"
                  name="duration"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  placeholder="30"
                  autoComplete="off"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className={nativeInputClass}
                />
              </div>
            </div>

            {livePace && (
              <div className="glass-subtle rounded-[3px] px-4 py-3 flex items-center justify-between animate-in fade-in duration-200">
                <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                  Pace
                </span>
                <span className="text-lg font-bold tabular-nums tracking-tight text-primary">
                  {livePace}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
              <input
                id="notes"
                name="notes"
                type="text"
                placeholder="How did it feel?"
                autoComplete="off"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={nativeInputClass}
              />
            </div>

            {submitError && (
              <p className="text-xs text-destructive" role="alert">
                {submitError}
              </p>
            )}

            <button
              type="submit"
              className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full press-scale")}
            >
              Log Run
            </button>
          </form>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground px-1">History</h2>
          {entries.length === 0 && (
            <div className="glass-subtle rounded-2xl p-6 text-center">
              <p className="text-sm text-muted-foreground">No runs yet</p>
            </div>
          )}
          {groupedByDate.map(([dateKey, dayEntries]) => (
            <div key={dateKey} className="space-y-2">
              <div className="flex items-center gap-2 px-1 pt-1">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {formatGroupHeader(dateKey)}
                </span>
              </div>
              <div className="space-y-1.5">
                {dayEntries.map((entry) => (
                  <div key={entry.id} className="glass-subtle rounded-xl p-3.5 flex items-center justify-between group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#3b82f6]/10 shrink-0">
                        <PersonStanding className="h-3.5 w-3.5 text-[#3b82f6]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold">
                            {kmToMiles(entry.distance).toFixed(1)} mi
                          </span>
                          <span className="text-muted-foreground">{entry.duration} min</span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-5 px-1.5 font-medium tabular-nums bg-[#3b82f6]/12 text-[#3b82f6] border-0"
                          >
                            {formatPaceMiles(entry.distance, entry.duration)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-[9px] h-5 px-1.5 font-medium capitalize border-0 ${
                              entry.environment === "treadmill"
                                ? "bg-amber-500/10 text-amber-400/80"
                                : "bg-emerald-500/10 text-emerald-400/80"
                            }`}
                          >
                            {entry.environment === "treadmill" ? "Treadmill" : "Outdoor"}
                          </Badge>
                        </div>
                        {entry.notes && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{entry.notes}</p>
                        )}
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
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
