"use client"

import { useEffect, useMemo, useState } from "react"
import { format, subDays } from "date-fns"
import { Calendar, CircleDot, Trash2 } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useActiveDate } from "@/context/DateContext"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDate, last7Days, parseLocalDate } from "@/lib/utils"
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"

const bowelGoalPresets: GoalPreset[] = [
  { type: "daily", label: "Daily Regularity", unit: "entries", placeholder: "2" },
]

interface BowelEntry {
  id: string
  date: string
  time: string
  bristolScale: number
  notes: string | null
}

const bristolLabels: Record<number, string> = {
  1: "Hard lumps",
  2: "Lumpy sausage",
  3: "Cracked sausage",
  4: "Smooth snake",
  5: "Soft blobs",
  6: "Mushy",
  7: "Liquid",
}

function entryDateKey(entry: BowelEntry): string {
  return entry.date.split("T")[0]
}

function dateGroupLabel(dateKey: string, todayStr: string, yesterdayStr: string) {
  if (dateKey === todayStr) return "Today"
  if (dateKey === yesterdayStr) return "Yesterday"
  return format(parseLocalDate(dateKey), "EEEE, MMMM d")
}

export default function BowelPage() {
  const [entries, setEntries] = useState<BowelEntry[]>([])
  const [bristolScale, setBristolScale] = useState(4)
  const [notes, setNotes] = useState("")

  const { activeDate } = useActiveDate()
  const today = activeDate
  const yesterday = formatDate(subDays(parseLocalDate(activeDate), 1))

  useEffect(() => {
    fetch("/api/bowel")
      .then(async (r) => {
        const data = await r.json()
        setEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setEntries([]))
  }, [])

  const { chartData, weekCount, avgTypeStr, mostCommonStr } = useMemo(() => {
    const weekKeys = new Set(last7Days().map((d) => formatDate(d)))
    const days = last7Days()
    const chartData = days.map((d) => {
      const key = formatDate(d)
      const count = entries.filter((e) => entryDateKey(e) === key).length
      return { label: format(d, "EEE"), count }
    })

    const weekCount = entries.filter((e) => weekKeys.has(entryDateKey(e))).length

    let avgTypeStr = "—"
    if (entries.length > 0) {
      const sum = entries.reduce((acc, e) => acc + e.bristolScale, 0)
      avgTypeStr = (sum / entries.length).toFixed(1)
    }

    let mostCommonStr = "—"
    if (entries.length > 0) {
      const freq = new Map<number, number>()
      for (const e of entries) {
        freq.set(e.bristolScale, (freq.get(e.bristolScale) ?? 0) + 1)
      }
      let bestType = 1
      let bestCount = 0
      for (let t = 1; t <= 7; t++) {
        const c = freq.get(t) ?? 0
        if (c > bestCount) {
          bestCount = c
          bestType = t
        }
      }
      if (bestCount > 0) {
        mostCommonStr = `${bestType} · ${bristolLabels[bestType]}`
      }
    }

    return { chartData, weekCount, avgTypeStr, mostCommonStr }
  }, [entries])

  const hasChartData = chartData.some((d) => d.count > 0)

  const historyGroups = useMemo(() => {
    const map = new Map<string, BowelEntry[]>()
    for (const e of entries) {
      const d = entryDateKey(e)
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(e)
    }
    const keys = [...map.keys()].sort((a, b) => b.localeCompare(a))
    return keys.map((dateKey) => ({ dateKey, items: map.get(dateKey)! }))
  }, [entries])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const res = await fetch("/api/bowel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: today,
        time: new Date().toISOString(),
        bristolScale,
        notes: notes || null,
      }),
    })

    if (res.ok) {
      const entry = await res.json()
      setEntries([entry, ...entries])
      setNotes("")
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/bowel?id=${id}`, { method: "DELETE" })
    if (res.ok) setEntries(entries.filter((e) => e.id !== id))
  }

  const todayCount = entries.filter((e) => entryDateKey(e) === today).length

  return (
    <div className="space-y-6">
      <PageHeader title="Bowel" icon={CircleDot} iconColor="#78716c" />

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none animate-fade-up">
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Today
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">{todayCount}</span>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">entries</p>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            This Week
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">{weekCount}</span>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">last 7 days</p>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Avg Type
          </p>
          <span className="text-lg lg:text-xl font-bold tabular-nums">{avgTypeStr}</span>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">Bristol</p>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-[10rem]">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Most Common
          </p>
          <span className="text-sm lg:text-base font-bold leading-tight line-clamp-2">{mostCommonStr}</span>
        </div>
      </div>

      <CategoryGoal
        category="bowel"
        values={{ daily: todayCount }}
        presets={bowelGoalPresets}
        color="#78716c"
      />

      <div className="glass rounded-2xl p-5 animate-fade-up stagger-2">
          <div className="text-center lg:text-left mb-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Today</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight">{todayCount}</p>
            <p className="text-sm text-muted-foreground">entries</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Bristol Scale ({bristolScale}/7 &mdash; {bristolLabels[bristolScale]})
              </Label>
              <div className="flex gap-1.5 mt-1">
                {[1, 2, 3, 4, 5, 6, 7].map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant={bristolScale === s ? "default" : "outline"}
                    size="sm"
                    onClick={() => setBristolScale(s)}
                    className="w-9"
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs uppercase tracking-wider text-muted-foreground">
                Notes
              </Label>
              <Input
                id="notes"
                placeholder="Optional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full press-scale" size="lg">
              Log Entry
            </Button>
          </form>
      </div>

      <div className="glass animate-fade-up stagger-2 rounded-2xl p-4 lg:p-5">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          7-day entries
        </p>
        {hasChartData ? (
          <div className="h-40 w-full lg:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/25" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  width={32}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.19 0.012 250 / 98%)",
                    border: "1px solid oklch(1 0 0 / 8%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    backdropFilter: "blur(8px)",
                  }}
                  formatter={(value) => [`${Number(value ?? 0)}`, "Entries"]}
                />
                <Bar dataKey="count" fill="#78716c" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center lg:h-48">
            <p className="px-4 text-center text-sm text-muted-foreground">Log entries to see trends</p>
          </div>
        )}
      </div>

      <div className="animate-fade-up stagger-2 space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground px-1">History</h2>
          {entries.length === 0 && (
            <div className="glass-subtle rounded-2xl p-6 text-center">
              <p className="text-sm text-muted-foreground">No entries yet</p>
            </div>
          )}
          {historyGroups.map(({ dateKey, items }) => (
            <div key={dateKey} className="space-y-2">
              <div className="flex items-center gap-2 mb-1.5 px-1">
                <Calendar className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {dateGroupLabel(dateKey, today, yesterday)}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((entry) => (
                  <div
                    key={entry.id}
                    className="glass-subtle rounded-xl p-3.5 flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-[#78716c]/15 shrink-0">
                        <span className="text-xl font-bold tabular-nums text-[#78716c]">
                          {entry.bristolScale}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-lg font-semibold leading-snug">
                              {bristolLabels[entry.bristolScale]}
                            </p>
                            <p className="text-xs font-medium text-muted-foreground mt-0.5">
                              Type {entry.bristolScale}
                            </p>
                          </div>
                          <time
                            dateTime={entry.time}
                            className="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5"
                          >
                            {format(new Date(entry.time), "p")}
                          </time>
                        </div>
                        {entry.notes && (
                          <p className="text-xs text-muted-foreground/70 mt-1">{entry.notes}</p>
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
  )
}
