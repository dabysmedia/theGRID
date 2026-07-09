"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, isToday, isYesterday } from "date-fns"
import { Calendar, ChevronDown, PersonStanding, Plus, Trash2 } from "lucide-react"
import { apiFetch } from "@/lib/api-fetch"
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
import { PageHeroStrip } from "@/components/PageHeroStrip"
import { useActiveDate } from "@/context/DateContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LogRunningDialog } from "@/components/quick-log/LogRunningDialog"
import {
  cn,
  formatDisplayDate,
  glassPanelAccentClass,
  glassPanelAccentStyle,
  glassPanelClass,
  parseLocalDate,
} from "@/lib/utils"
import { kmToMiles } from "@/lib/units"
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"
import { HistoryArchivedNote, HistoryEarlierSection } from "@/components/HistoryEarlierSection"
import { partitionHistoryDayGroups } from "@/lib/history-display"

const RUN_COLOR = "#3b82f6"

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

function formatPaceMinutes(paceMin: number): string {
  const mins = Math.floor(paceMin)
  const secs = Math.round((paceMin - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function formatPaceMiles(distanceKm: number, durationMin: number): string {
  const mi = kmToMiles(distanceKm)
  if (mi === 0) return "-"
  const paceMin = durationMin / mi
  return `${formatPaceMinutes(paceMin)} /mi`
}

function formatGroupHeader(dateKey: string): string {
  const d = parseLocalDate(dateKey)
  if (isToday(d)) return "Today"
  if (isYesterday(d)) return "Yesterday"
  return format(d, "EEE, MMM d")
}

function RunningHistoryDayGroup({
  dateKey,
  dayEntries,
  showDayHeader,
  formatHeader,
  onDelete,
}: {
  dateKey: string
  dayEntries: RunEntry[]
  showDayHeader: boolean
  formatHeader: (dateKey: string) => string
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      {showDayHeader && (
        <div className="flex items-center gap-2 px-1 pt-1">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {formatHeader(dateKey)}
          </span>
        </div>
      )}
      <div className="space-y-1.5">
        {dayEntries.map((entry) => (
          <div key={entry.id} className="glass-subtle rounded-xl p-3.5 flex items-center justify-between group">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#3b82f6]/10 shrink-0">
                <PersonStanding className="h-3.5 w-3.5 text-[#3b82f6]" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{kmToMiles(entry.distance).toFixed(1)} mi</span>
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
              onClick={() => onDelete(entry.id)}
              className="history-row-delete"
              aria-label="Delete run"
            >
              <Trash2 />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function RunningPage() {
  const { activeDate } = useActiveDate()
  const [entries, setEntries] = useState<RunEntry[]>([])
  const [logOpen, setLogOpen] = useState(false)

  const today = activeDate

  const todayMiles = useMemo(() => {
    return entries
      .filter((e) => e.date.split("T")[0] === today)
      .reduce((s, e) => s + kmToMiles(e.distance), 0)
  }, [entries, today])

  const todayRuns = useMemo(
    () => entries.filter((e) => e.date.split("T")[0] === today),
    [entries, today],
  )

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
  }, [entries, todayRuns])

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

  const historyDisplay = useMemo(
    () => partitionHistoryDayGroups(groupedByDate, (g) => g[0], today),
    [groupedByDate, today]
  )

  const refreshEntries = useCallback(() => {
    apiFetch("/api/running")
      .then(async (r) => {
        const data = await r.json()
        setEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setEntries([]))
  }, [])

  useEffect(() => {
    refreshEntries()
  }, [refreshEntries])

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/running?id=${id}`, { method: "DELETE" })
    if (res.ok) setEntries(entries.filter((e) => e.id !== id))
  }

  const avgPaceDisplay =
    stats.count > 0 && stats.totalKm > 0 && stats.totalDuration > 0
      ? formatPaceMiles(stats.totalKm, stats.totalDuration)
      : "—"

  const hasDistanceChart = chartData.length >= 2
  const hasPaceChart = paceChartData.filter((d) => d.paceMin != null).length >= 2

  return (
    <div className="space-y-6">
      <PageHeader title="Running" />

      <PageHeroStrip
        color={RUN_COLOR}
        icon={PersonStanding}
        eyebrow={`Today · ${formatDisplayDate(parseLocalDate(activeDate))}`}
        value={todayMiles > 0 ? todayMiles.toFixed(1) : "—"}
        unit="mi"
        metrics={[
          {
            label: "Total distance",
            value: stats.count === 0 ? "0" : stats.totalMi.toFixed(1),
            sub: "mi all time",
          },
          { label: "Avg pace", value: avgPaceDisplay },
          { label: "Total runs", value: String(stats.count) },
          {
            label: "Longest",
            value: stats.count === 0 ? "—" : stats.longestMi.toFixed(1),
            sub: "mi",
          },
        ]}
      />

      <CategoryGoal
        category="running"
        values={goalValues}
        presets={runGoalPresets}
        color={RUN_COLOR}
      />

      <div
        className={cn(glassPanelClass, glassPanelAccentClass, "animate-fade-up stagger-1 p-4 lg:p-5")}
        style={glassPanelAccentStyle(RUN_COLOR)}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-[0.07]"
          style={{ backgroundColor: RUN_COLOR }}
          aria-hidden
        />
        <div className="relative space-y-4">
          <div className="min-w-0">
            <p className="type-hud-label-soft mb-1">Today</p>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="type-hud-value-xl tabular-nums">
                {todayMiles > 0 ? todayMiles.toFixed(1) : "—"}
              </span>
              <span className="type-hud-unit">mi</span>
            </div>
            {todayRuns.length > 0 && (
              <p className="type-hud-caption mt-1.5 normal-case">
                {todayRuns.length} run{todayRuns.length === 1 ? "" : "s"} logged
              </p>
            )}
          </div>

          <Button
            type="button"
            variant="glass"
            size="lg"
            className="h-12 w-full gap-2 touch-manipulation"
            onClick={() => setLogOpen(true)}
          >
            <Plus className="h-4 w-4 shrink-0" />
            Log run
          </Button>
        </div>
      </div>

      <details
        className={cn(
          glassPanelClass,
          glassPanelAccentClass,
          "animate-fade-up stagger-2 overflow-hidden [&[open]_summary_.run-trend-chevron]:rotate-180",
        )}
        style={glassPanelAccentStyle(RUN_COLOR)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-glass-highlight/10 lg:px-5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <p className="type-hud-label-soft">Distance & pace trends</p>
            <p className="type-hud-caption mt-0.5 normal-case tabular-nums">
              {hasDistanceChart || hasPaceChart
                ? `${stats.count} run${stats.count === 1 ? "" : "s"} · ${stats.totalMi.toFixed(1)} mi total`
                : "Expand to view trends"}
            </p>
          </div>
          <ChevronDown className="run-trend-chevron h-4 w-4 shrink-0 text-muted-foreground/45 transition-transform duration-200" />
        </summary>
        <div className="border-t border-border/20 px-4 pb-4 pt-3 lg:px-5 lg:pb-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="min-h-[12rem] min-w-0">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider">
                Distance trend
              </h2>
              {hasDistanceChart ? (
                <div className="h-40 min-h-[10rem] w-full min-w-0 lg:h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="runningDistGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={RUN_COLOR} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={RUN_COLOR} stopOpacity={0} />
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
                          background: "oklch(0.19 0.012 250 / 98%)",
                          border: "1px solid oklch(1 0 0 / 8%)",
                          borderRadius: "8px",
                          fontSize: "12px",
                          backdropFilter: "blur(8px)",
                        }}
                        labelStyle={{ color: "oklch(0.60 0.01 250)" }}
                        formatter={(val) => [`${Number(val).toFixed(1)} mi`, "Distance"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="distance"
                        stroke={RUN_COLOR}
                        strokeWidth={2}
                        fill="url(#runningDistGrad)"
                        dot={{ r: 3, fill: RUN_COLOR, strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: RUN_COLOR, strokeWidth: 2, stroke: "#fff" }}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-40 min-h-[10rem] items-center justify-center lg:h-48">
                  <p className="text-sm text-muted-foreground">
                    Log at least 2 runs to see distance over time
                  </p>
                </div>
              )}
            </div>

            <div className="min-h-[12rem] min-w-0">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider">
                Pace trend
              </h2>
              {hasPaceChart ? (
                <div className="h-40 min-h-[10rem] w-full min-w-0 lg:h-48">
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
                          background: "oklch(0.19 0.012 250 / 98%)",
                          border: "1px solid oklch(1 0 0 / 8%)",
                          borderRadius: "8px",
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
                <div className="flex h-40 min-h-[10rem] items-center justify-center lg:h-48">
                  <p className="text-sm text-muted-foreground">
                    Log at least 2 runs with distance and duration to see pace over time
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </details>

      <div className="animate-fade-up stagger-3 space-y-3">
        <div className="px-0.5">
          <h2 className="type-hud-title">History</h2>
          <p className="type-hud-caption mt-1 normal-case">
            {entries.length === 0 ? "Nothing logged yet" : `${entries.length} entries`}
          </p>
        </div>
        {entries.length === 0 && (
          <div className={cn(glassPanelClass, "p-8 text-center")}>
            <p className="type-hud-caption normal-case text-muted-foreground">
              Tap Log run to add your first entry.
            </p>
          </div>
        )}
        {historyDisplay.todayGroups.length > 0 && (
          <div className="space-y-2">
            {historyDisplay.todayGroups.map(([dateKey, dayEntries]) => (
              <RunningHistoryDayGroup
                key={dateKey}
                dateKey={dateKey}
                dayEntries={dayEntries}
                showDayHeader={false}
                formatHeader={formatGroupHeader}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
        {historyDisplay.earlierGroups.length > 0 && (
          <HistoryEarlierSection dayCount={historyDisplay.earlierGroups.length}>
            {historyDisplay.earlierGroups.map(([dateKey, dayEntries]) => (
              <RunningHistoryDayGroup
                key={dateKey}
                dateKey={dateKey}
                dayEntries={dayEntries}
                showDayHeader
                formatHeader={formatGroupHeader}
                onDelete={handleDelete}
              />
            ))}
          </HistoryEarlierSection>
        )}
        <HistoryArchivedNote archivedDayCount={historyDisplay.archivedDayCount} />
      </div>

      <LogRunningDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        onSaved={(entry) => {
          if (entry && typeof entry === "object" && "id" in entry) {
            setEntries((prev) => [entry as RunEntry, ...prev])
          } else {
            refreshEntries()
          }
        }}
      />
    </div>
  )
}
