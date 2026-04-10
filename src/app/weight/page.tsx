"use client"

import { useEffect, useState } from "react"
import {
  Weight,
  Trash2,
  TrendingDown,
  TrendingUp,
  ArrowDown,
  ArrowUp,
  Minus,
  Calendar,
} from "lucide-react"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import { PageHeader } from "@/components/PageHeader"
import { apiFetch } from "@/lib/api-fetch"
import { PageStatTile } from "@/components/PageStatTile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActiveDate } from "@/context/DateContext"
import { parseLocalDate } from "@/lib/utils"
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"

const weightGoalPresets: GoalPreset[] = [
  { type: "target", label: "Target Weight", unit: "lbs", placeholder: "180", direction: "down" },
]

interface WeightEntry {
  id: string
  goalId: string
  date: string
  value: number
  notes: string | null
  createdAt: string
}

interface WeightStats {
  current: number | null
  avg7: number | null
  avg30: number | null
  allTimeHigh: number | null
  allTimeLow: number | null
  weekChange: number | null
  totalEntries: number
}

interface WeightData {
  goalId: string
  unit: string
  target: number
  direction: string
  startValue: number | null
  entries: WeightEntry[]
  stats: WeightStats
}

function StatCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string
  value: string
  sub?: string
  trend?: "up" | "down" | "neutral"
}) {
  return (
    <PageStatTile className="flex-1 min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
        {label}
      </p>
      <div className="flex items-baseline gap-1">
        <span className="text-lg lg:text-xl font-bold tabular-nums">{value}</span>
        {trend && trend !== "neutral" && (
          <span className={trend === "down" ? "text-[#22c55e]" : "text-red-400"}>
            {trend === "down" ? (
              <ArrowDown className="h-3.5 w-3.5" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" />
            )}
          </span>
        )}
      </div>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </PageStatTile>
  )
}

export default function WeightPage() {
  const { activeDate } = useActiveDate()
  const [data, setData] = useState<WeightData | null>(null)
  const [loading, setLoading] = useState(true)
  const [weight, setWeight] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [chartRange, setChartRange] = useState<"7d" | "30d" | "all">("30d")

  const today = activeDate

  useEffect(() => {
    apiFetch("/api/weight")
      .then(async (r) => {
        if (r.ok) setData(await r.json())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!weight || submitting) return
    setSubmitting(true)

    try {
      const res = await apiFetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, value: weight, notes: notes || null }),
      })

      if (res.ok && data) {
        const entry = await res.json()
        const updatedEntries = data.entries.some(
          (e) => e.date.split("T")[0] === today
        )
          ? data.entries.map((e) =>
              e.date.split("T")[0] === today ? entry : e
            )
          : [entry, ...data.entries]
        setData({ ...data, entries: updatedEntries })
        setWeight("")
        setNotes("")
        // Refetch stats
        const refreshed = await apiFetch("/api/weight").then((r) => r.json())
        setData(refreshed)
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/weight?id=${id}`, { method: "DELETE" })
    if (res.ok && data) {
      setData({
        ...data,
        entries: data.entries.filter((e) => e.id !== id),
      })
      const refreshed = await apiFetch("/api/weight").then((r) => r.json())
      setData(refreshed)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <PageHeader title="Weight" />
        <div className="h-32 glass rounded-2xl" />
        <div className="h-48 glass rounded-2xl" />
      </div>
    )
  }

  const unit = data?.unit ?? "lbs"
  const stats = data?.stats
  const entries = data?.entries ?? []

  const refDate = parseLocalDate(activeDate)
  const cutoff =
    chartRange === "7d"
      ? new Date(refDate.getTime() - 7 * 86400000)
      : chartRange === "30d"
        ? new Date(refDate.getTime() - 30 * 86400000)
        : null

  const chartEntries = [...entries]
    .reverse()
    .filter((e) => !cutoff || new Date(e.date) >= cutoff)

  const chartData = chartEntries.map((e) => ({
    date: e.date.split("T")[0],
    value: e.value,
    label: new Date(e.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }))

  const dateGrouped = new Map<string, WeightEntry[]>()
  for (const entry of entries) {
    const key = entry.date.split("T")[0]
    if (!dateGrouped.has(key)) dateGrouped.set(key, [])
    dateGrouped.get(key)!.push(entry)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Weight" />

      {/* Stats row */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none animate-fade-up">
        <StatCard
          label="Current"
          value={stats?.current != null ? `${stats.current}` : "—"}
          sub={unit}
        />
        <StatCard
          label="7-Day Avg"
          value={stats?.avg7 != null ? `${stats.avg7}` : "—"}
          sub={unit}
        />
        <StatCard
          label="Week Change"
          value={
            stats?.weekChange != null
              ? `${stats.weekChange > 0 ? "+" : ""}${stats.weekChange}`
              : "—"
          }
          sub={unit}
          trend={
            stats?.weekChange != null
              ? stats.weekChange < 0
                ? "down"
                : stats.weekChange > 0
                  ? "up"
                  : "neutral"
              : undefined
          }
        />
        <StatCard
          label="All-Time Low"
          value={stats?.allTimeLow != null ? `${stats.allTimeLow}` : "—"}
          sub={unit}
        />
      </div>

      <CategoryGoal
        category="weight"
        values={{ target: stats?.current ?? 0 }}
        presets={weightGoalPresets}
        color="#14b8a6"
      />

      {/* Trend chart */}
      <div className="glass rounded-2xl p-4 lg:p-5 animate-fade-up stagger-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-1.5">
            {data?.direction === "down" ? (
              <TrendingDown className="h-4 w-4 text-[#22c55e]" />
            ) : (
              <TrendingUp className="h-4 w-4 text-[#22c55e]" />
            )}
            Trend
          </h2>
          <div className="flex gap-1">
            {(["7d", "30d", "all"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium uppercase tracking-wider transition-colors ${
                  chartRange === r
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r === "all" ? "All" : r}
              </button>
            ))}
          </div>
        </div>

        {chartData.length >= 2 ? (
          <div className="h-48 lg:h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
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
                  domain={["dataMin - 2", "dataMax + 2"]}
                  tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }}
                  axisLine={false}
                  tickLine={false}
                />
                {data?.target != null && data.target > 0 && (
                  <ReferenceLine
                    y={data.target}
                    stroke="#22c55e"
                    strokeDasharray="6 4"
                    strokeOpacity={0.4}
                    label={{
                      value: `Goal: ${data.target}`,
                      position: "insideTopRight",
                      fill: "#22c55e",
                      fontSize: 10,
                      opacity: 0.6,
                    }}
                  />
                )}
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.19 0.012 250 / 98%)",
                    border: "1px solid oklch(1 0 0 / 8%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    backdropFilter: "blur(8px)",
                  }}
                  labelStyle={{ color: "oklch(0.60 0.01 250)" }}
                  formatter={(val) => [`${val} ${unit}`, "Weight"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#weightGrad)"
                  dot={{ r: 3, fill: "#22c55e", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#22c55e", strokeWidth: 2, stroke: "#fff" }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Log at least 2 entries to see trends
            </p>
          </div>
        )}
      </div>

      {/* Form + History grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up stagger-2">
        {/* Log form */}
        <div className="glass rounded-2xl p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4">
            Log Weight
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Weight ({unit}) *
              </Label>
              <Input
                type="number"
                step="0.1"
                placeholder={`e.g. 175.0`}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Notes
              </Label>
              <Input
                placeholder="Morning, post-workout..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant="glass"
              className="w-full press-scale"
              size="lg"
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Log Weight"}
            </Button>
          </form>

          {/* Quick summary under form */}
          {stats && stats.totalEntries > 0 && (
            <div className="mt-5 pt-4 border-t border-glass-border">
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    30-Day Avg
                  </p>
                  <p className="text-base font-bold tabular-nums">
                    {stats.avg30 ?? "—"}{" "}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {unit}
                    </span>
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Entries
                  </p>
                  <p className="text-base font-bold tabular-nums">
                    {stats.totalEntries}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* History */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground px-1">
            History
          </h2>
          {entries.length === 0 && (
            <div className="glass-subtle rounded-2xl p-8 text-center">
              <Weight className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No entries yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Log your first weigh-in above
              </p>
            </div>
          )}
          {Array.from(dateGrouped.entries()).map(([dateKey, dayEntries]) => {
            const d = new Date(dateKey + "T12:00:00")
            const isToday = dateKey === today
            const label = isToday
              ? "Today"
              : d.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })

            return (
              <div key={dateKey}>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <Calendar className="h-3 w-3 text-muted-foreground/40" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    {label}
                  </span>
                </div>
                {dayEntries.map((entry, i) => {
                  const prevEntry =
                    entries[entries.indexOf(entry) + 1] ?? null
                  const delta = prevEntry
                    ? Math.round((entry.value - prevEntry.value) * 10) / 10
                    : null

                  return (
                    <div
                      key={entry.id}
                      className="glass-subtle rounded-xl p-3.5 flex items-center justify-between group mb-1.5"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#22c55e]/10">
                          <Weight className="h-4 w-4 text-[#22c55e]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base tabular-nums">
                              {entry.value}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {unit}
                            </span>
                            {delta != null && delta !== 0 && (
                              <span
                                className={`text-[11px] font-medium flex items-center gap-0.5 ${
                                  delta < 0
                                    ? "text-[#22c55e]"
                                    : "text-red-400"
                                }`}
                              >
                                {delta < 0 ? (
                                  <ArrowDown className="h-3 w-3" />
                                ) : (
                                  <ArrowUp className="h-3 w-3" />
                                )}
                                {Math.abs(delta)}
                              </span>
                            )}
                            {delta === 0 && (
                              <span className="text-[11px] text-muted-foreground/50 flex items-center gap-0.5">
                                <Minus className="h-3 w-3" /> 0
                              </span>
                            )}
                          </div>
                          {entry.notes && (
                            <p className="text-xs text-muted-foreground/60 mt-0.5">
                              {entry.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="history-row-delete"
                        aria-label="Delete weight entry"
                      >
                        <Trash2 />
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
