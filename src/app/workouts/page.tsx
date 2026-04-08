"use client"

import { useEffect, useMemo, useState } from "react"
import { Calendar, Dumbbell, Trash2 } from "lucide-react"
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { format, startOfDay, subDays } from "date-fns"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActiveDate } from "@/context/DateContext"
import { formatDate, parseLocalDate } from "@/lib/utils"
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"

const workoutGoalPresets: GoalPreset[] = [
  { type: "weekly", label: "Weekly Sessions", unit: "sessions", placeholder: "5" },
  { type: "per_session", label: "Per-Session Duration", unit: "min", placeholder: "45" },
]

interface WorkoutEntry {
  id: string
  date: string
  type: string
  name: string
  duration: number | null
  notes: string | null
}

const workoutTypes = ["strength", "cardio", "flexibility", "other"]

const TYPE_BADGE: Record<string, string> = {
  strength: "bg-[#a855f7]/15 text-[#d8b4fe] border-[#a855f7]/35",
  cardio: "bg-red-500/15 text-red-300 border-red-500/35",
  flexibility: "bg-sky-500/15 text-sky-300 border-sky-500/35",
  other: "bg-muted/60 text-muted-foreground border-border/60",
}

function normalizeDateKey(d: string): string {
  return d.split("T")[0]
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
        {label}
      </p>
      <span className="text-lg lg:text-xl font-bold tabular-nums">{value}</span>
      {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

export default function WorkoutsPage() {
  const [entries, setEntries] = useState<WorkoutEntry[]>([])
  const [type, setType] = useState("strength")
  const [name, setName] = useState("")
  const [duration, setDuration] = useState("")
  const [notes, setNotes] = useState("")

  const { activeDate } = useActiveDate()
  const today = activeDate
  const yesterday = formatDate(subDays(parseLocalDate(activeDate), 1))

  useEffect(() => {
    fetch("/api/workouts")
      .then(async (r) => {
        const data = await r.json()
        setEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setEntries([]))
  }, [])

  const weekStart = formatDate(subDays(parseLocalDate(activeDate), 6))

  const { thisWeekCount, avgDurationMin, mostCommonType, chartData, daysWithData, historyByDate } =
    useMemo(() => {
      const thisWeekCount = entries.filter((e) => {
        const k = normalizeDateKey(e.date)
        return k >= weekStart && k <= today
      }).length

      const withDuration = entries.filter((e) => e.duration != null)
      const avgDurationMin =
        withDuration.length > 0
          ? Math.round(
              withDuration.reduce((s, e) => s + (e.duration as number), 0) / withDuration.length,
            )
          : null

      const typeCounts = new Map<string, number>()
      for (const e of entries) {
        typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1)
      }
      let mostCommonType: string | null = null
      let maxC = 0
      for (const [t, c] of typeCounts) {
        if (c > maxC) {
          maxC = c
          mostCommonType = t
        }
      }

      const byDay = new Map<string, number>()
      for (const e of entries) {
        const k = normalizeDateKey(e.date)
        byDay.set(k, (byDay.get(k) ?? 0) + 1)
      }

      const chartRows: { key: string; label: string; count: number }[] = []
      for (let i = 13; i >= 0; i--) {
        const d = subDays(parseLocalDate(activeDate), i)
        const key = formatDate(d)
        chartRows.push({
          key,
          label: format(d, "EEE"),
          count: byDay.get(key) ?? 0,
        })
      }
      const daysWithData = chartRows.filter((r) => r.count > 0).length

      const grouped = new Map<string, WorkoutEntry[]>()
      for (const e of entries) {
        const k = normalizeDateKey(e.date)
        if (!grouped.has(k)) grouped.set(k, [])
        grouped.get(k)!.push(e)
      }
      const sortedKeys = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a))
      const historyByDate = sortedKeys.map((k) => [k, grouped.get(k)!] as const)

      return {
        thisWeekCount,
        avgDurationMin,
        mostCommonType,
        chartData: chartRows,
        daysWithData,
        historyByDate,
      }
    }, [entries, today, weekStart])

  const todaySessions = useMemo(() => {
    return entries.filter((e) => normalizeDateKey(e.date) === today).length
  }, [entries, today])

  function sectionDateLabel(dateKey: string): string {
    if (dateKey === today) return "Today"
    if (dateKey === yesterday) return "Yesterday"
    const d = new Date(dateKey + "T12:00:00")
    return format(d, "EEEE, MMM d")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name) return

    const res = await fetch("/api/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: today,
        type,
        name,
        duration: duration || null,
        notes: notes || null,
      }),
    })

    if (res.ok) {
      const entry = await res.json()
      setEntries([entry, ...entries])
      setName("")
      setDuration("")
      setNotes("")
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/workouts?id=${id}`, { method: "DELETE" })
    if (res.ok) setEntries(entries.filter((e) => e.id !== id))
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Workouts" icon={Dumbbell} iconColor="#a855f7" />

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none animate-fade-up">
        <StatCard label="This Week" value={String(thisWeekCount)} />
        <StatCard label="Total Workouts" value={String(entries.length)} />
        <StatCard
          label="Avg Duration"
          value={avgDurationMin != null ? String(avgDurationMin) : "—"}
          sub={avgDurationMin != null ? "min" : undefined}
        />
        <StatCard
          label="Most Common"
          value={
            mostCommonType
              ? mostCommonType.charAt(0).toUpperCase() + mostCommonType.slice(1)
              : "—"
          }
        />
      </div>

      <CategoryGoal
        category="workouts"
        values={{ weekly: thisWeekCount, per_session: avgDurationMin ?? 0 }}
        presets={workoutGoalPresets}
        color="#a855f7"
      />

      <div className="glass rounded-2xl p-5 animate-fade-up stagger-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {workoutTypes.map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={type === t ? "default" : "outline"}
                  size="sm"
                  onClick={() => setType(t)}
                  className="capitalize"
                >
                  {t}
                </Button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs uppercase tracking-wider text-muted-foreground">
                Workout Name *
              </Label>
              <Input
                id="name"
                placeholder="e.g. Upper body push"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="duration" className="text-xs uppercase tracking-wider text-muted-foreground">
                Duration (min)
              </Label>
              <Input
                id="duration"
                type="number"
                placeholder="45"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs uppercase tracking-wider text-muted-foreground">
                Notes
              </Label>
              <Input
                id="notes"
                placeholder="Any details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full press-scale" size="lg">
              Log Workout
            </Button>
          </form>
      </div>

      <div className="glass animate-fade-up stagger-2 rounded-2xl p-4 lg:p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Last 14 days
        </h2>
        {daysWithData >= 2 ? (
          <div className="h-40 w-full lg:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "oklch(0.7 0.02 280)" }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis hide domain={[0, "auto"]} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null
                    const row = payload[0].payload as { key: string; count: number }
                    const n = row.count
                    const dateLine = format(parseLocalDate(row.key), "EEE, MMM d")
                    return (
                      <div
                        className="rounded-[10px] border px-2.5 py-1.5 text-xs shadow-lg"
                        style={{
                          background: "oklch(0.19 0.012 250 / 98%)",
                          borderColor: "oklch(1 0 0 / 8%)",
                        }}
                      >
                        <p className="mb-0.5 text-[11px] text-muted-foreground">{dateLine}</p>
                        <p className="font-semibold tabular-nums">
                          {n} workout{n === 1 ? "" : "s"}
                        </p>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="count" fill="#a855f7" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/20 bg-muted/5 px-4 text-center lg:h-48">
            <p className="text-sm text-muted-foreground">Not enough data for a trend yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Log workouts on at least two different days to see your chart.
            </p>
          </div>
        )}
      </div>

      <div className="animate-fade-up stagger-2 space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground px-1">History</h2>
          {entries.length === 0 && (
            <div className="glass-subtle rounded-2xl p-6 text-center">
              <p className="text-sm text-muted-foreground">No workouts yet</p>
            </div>
          )}
          {historyByDate.map(([dateKey, dayEntries]) => (
            <div key={dateKey}>
              <div className="flex items-center gap-2 mb-1.5 px-1">
                <Calendar className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {sectionDateLabel(dateKey)}
                </span>
              </div>
              {dayEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="glass-subtle rounded-xl p-3.5 flex items-center justify-between group mb-1.5"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#a855f7]/10 shrink-0 mt-0.5">
                      <Dumbbell className="h-4 w-4 text-[#a855f7]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 gap-y-1">
                        <span className="font-semibold text-sm sm:text-base">{entry.name}</span>
                        <span
                          className={`text-[10px] sm:text-xs font-semibold capitalize px-2 py-0.5 rounded-md border ${TYPE_BADGE[entry.type] ?? TYPE_BADGE.other}`}
                        >
                          {entry.type}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mt-1.5">
                        {entry.duration != null ? (
                          <span className="text-base font-bold tabular-nums text-foreground">
                            {entry.duration}
                            <span className="text-xs font-semibold text-muted-foreground ml-1">min</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/70">No duration</span>
                        )}
                        {entry.notes && (
                          <span className="text-xs text-muted-foreground/70 truncate max-w-full">{entry.notes}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.id)}
                    className="history-row-delete"
                    aria-label="Delete workout"
                  >
                    <Trash2 />
                  </button>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  )
}
