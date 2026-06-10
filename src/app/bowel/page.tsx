"use client"

import { useEffect, useMemo, useState } from "react"
import { format, subDays } from "date-fns"
import { Calendar, Trash2 } from "lucide-react"
import { BowelToiletIcon } from "@/components/BowelToiletIcon"
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
import { apiFetch } from "@/lib/api-fetch"
import { PageHeader } from "@/components/PageHeader"
import { PageHeroStrip } from "@/components/PageHeroStrip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDate, formatDisplayDate, last7Days, parseLocalDate } from "@/lib/utils"
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"
import { HistoryArchivedNote, HistoryEarlierSection } from "@/components/HistoryEarlierSection"
import { partitionHistoryDayGroups } from "@/lib/history-display"

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
  0: "No poop",
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

function BowelHistoryDayGroup({
  dateKey,
  items,
  today,
  yesterday,
  showCalendarHeader,
  onDelete,
}: {
  dateKey: string
  items: BowelEntry[]
  today: string
  yesterday: string
  showCalendarHeader: boolean
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      {showCalendarHeader && (
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <Calendar className="h-3 w-3 text-muted-foreground/40 shrink-0" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
            {dateGroupLabel(dateKey, today, yesterday)}
          </span>
        </div>
      )}
      <div className="space-y-2">
        {items.map((entry) => (
          <div
            key={entry.id}
            className="glass-subtle rounded-xl p-3.5 flex items-center justify-between gap-3 group"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <BowelToiletIcon
                value={entry.bristolScale === 0 ? "—" : entry.bristolScale}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold leading-snug">{bristolLabels[entry.bristolScale]}</p>
                    <p className="text-xs font-medium text-muted-foreground mt-0.5">
                      {entry.bristolScale === 0 ? "Logged" : `Type ${entry.bristolScale}`}
                    </p>
                  </div>
                  <time
                    dateTime={entry.time}
                    className="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5"
                  >
                    {format(new Date(entry.time), "p")}
                  </time>
                </div>
                {entry.notes && <p className="text-xs text-muted-foreground/70 mt-1">{entry.notes}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDelete(entry.id)}
              className="history-row-delete"
              aria-label="Delete entry"
            >
              <Trash2 />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BowelPage() {
  const [entries, setEntries] = useState<BowelEntry[]>([])
  const [bristolScale, setBristolScale] = useState(4)
  const [notes, setNotes] = useState("")

  const { activeDate } = useActiveDate()
  const today = activeDate
  const yesterday = formatDate(subDays(parseLocalDate(activeDate), 1))

  useEffect(() => {
    apiFetch("/api/bowel")
      .then(async (r) => {
        const data = await r.json()
        setEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setEntries([]))
  }, [])

  const { chartData, weekCount, avgTypeStr, mostCommonStr } = useMemo(() => {
    const weekKeys = new Set(last7Days().map((d) => formatDate(d)))
    const weekEntries = entries.filter((e) => weekKeys.has(entryDateKey(e)))
    const days = last7Days()
    const chartData = days.map((d) => {
      const key = formatDate(d)
      const count = entries.filter((e) => entryDateKey(e) === key).length
      return { label: format(d, "EEE"), count }
    })

    const weekCount = weekEntries.length

    let avgTypeStr = "—"
    const stoolOnly = weekEntries.filter((e) => e.bristolScale >= 1)
    if (stoolOnly.length > 0) {
      const sum = stoolOnly.reduce((acc, e) => acc + e.bristolScale, 0)
      avgTypeStr = (sum / stoolOnly.length).toFixed(1)
    }

    let mostCommonStr = "—"
    if (weekEntries.length > 0) {
      const freq = new Map<number, number>()
      for (const e of weekEntries) {
        freq.set(e.bristolScale, (freq.get(e.bristolScale) ?? 0) + 1)
      }
      let bestType = 0
      let bestCount = 0
      for (let t = 0; t <= 7; t++) {
        const c = freq.get(t) ?? 0
        if (c > bestCount) {
          bestCount = c
          bestType = t
        }
      }
      if (bestCount > 0) {
        mostCommonStr =
          bestType === 0
            ? "No poop"
            : `${bestType} · ${bristolLabels[bestType]}`
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

  const historyDisplay = useMemo(
    () => partitionHistoryDayGroups(historyGroups, (g) => g.dateKey, today),
    [historyGroups, today]
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const res = await apiFetch("/api/bowel", {
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
    const res = await apiFetch(`/api/bowel?id=${id}`, { method: "DELETE" })
    if (res.ok) setEntries(entries.filter((e) => e.id !== id))
  }

  const todayCount = entries.filter((e) => entryDateKey(e) === today).length

  return (
    <div className="space-y-6">
      <PageHeader title="Bowel" />

      <PageHeroStrip
        color="#92400e"
        iconSlot={<BowelToiletIcon value={todayCount} size="sm" />}
        eyebrow={`Today · ${formatDisplayDate(parseLocalDate(activeDate))}`}
        value={String(todayCount)}
        unit="entries"
        metrics={[
          { label: "This week", value: String(weekCount), sub: "last 7 days" },
          { label: "Avg type", value: avgTypeStr, sub: "Bristol 1–7" },
          { label: "Most common", value: mostCommonStr },
        ]}
      />

      <CategoryGoal
        category="bowel"
        values={{ daily: todayCount }}
        presets={bowelGoalPresets}
        color="#92400e"
      />

      <div className="glass-panel p-5 animate-fade-up stagger-2">
          <div className="flex flex-col items-center text-center lg:flex-row lg:items-center lg:gap-5 lg:text-left mb-5">
            <BowelToiletIcon value={todayCount} size="md" className="mb-2 lg:mb-0" />
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Today</p>
              <p className="text-4xl font-bold tabular-nums tracking-tight">{todayCount}</p>
              <p className="text-sm text-muted-foreground">entries</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                {bristolScale === 0
                  ? "No bowel movement"
                  : `Bristol scale (${bristolScale}/7 — ${bristolLabels[bristolScale]})`}
              </Label>
              <Button
                type="button"
                variant={bristolScale === 0 ? "default" : "outline"}
                size="sm"
                className="h-10 w-full touch-manipulation"
                onClick={() => setBristolScale(0)}
              >
                No poop
              </Button>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                Log when you had no movement this day (still counts as a check-in).
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
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

            <Button type="submit" variant="glass" className="w-full press-scale" size="lg">
              Log Entry
            </Button>
          </form>
      </div>

      <div className="glass-panel animate-fade-up stagger-2 p-4 lg:p-5">
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
                <Bar dataKey="count" fill="#92400e" radius={[4, 4, 0, 0]} maxBarSize={40} />
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
          {historyDisplay.todayGroups.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Today
              </p>
              {historyDisplay.todayGroups.map(({ dateKey, items }) => (
                <BowelHistoryDayGroup
                  key={dateKey}
                  dateKey={dateKey}
                  items={items}
                  today={today}
                  yesterday={yesterday}
                  showCalendarHeader={false}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
          {historyDisplay.earlierGroups.length > 0 && (
            <HistoryEarlierSection dayCount={historyDisplay.earlierGroups.length}>
              {historyDisplay.earlierGroups.map(({ dateKey, items }) => (
                <BowelHistoryDayGroup
                  key={dateKey}
                  dateKey={dateKey}
                  items={items}
                  today={today}
                  yesterday={yesterday}
                  showCalendarHeader
                  onDelete={handleDelete}
                />
              ))}
            </HistoryEarlierSection>
          )}
          <HistoryArchivedNote archivedDayCount={historyDisplay.archivedDayCount} />
      </div>
    </div>
  )
}
