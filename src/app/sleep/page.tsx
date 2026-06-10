"use client"

import { useEffect, useMemo, useState } from "react"
import { format, subDays } from "date-fns"
import { Moon, Trash2, Calendar, Star, TrendingUp } from "lucide-react"
import { apiFetch } from "@/lib/api-fetch"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"
import { PageHeader } from "@/components/PageHeader"
import { PageHeroStrip } from "@/components/PageHeroStrip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import { formatDate, formatDisplayDate, parseLocalDate } from "@/lib/utils"
import {
  computeTargetBedtime,
  readDesiredWakeTime,
  writeDesiredWakeTime,
} from "@/lib/hub-tile-prefs"
import { utcCalendarDayKeyFromIso } from "@/lib/dateStorage"
import { sleepDurationHours } from "@/lib/sleepDuration"
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"
import { HistoryArchivedNote, HistoryEarlierSection } from "@/components/HistoryEarlierSection"
import { partitionHistoryDayGroups } from "@/lib/history-display"

const sleepGoalPresets: GoalPreset[] = [
  { type: "daily", label: "Nightly Hours", unit: "hrs", placeholder: "8" },
  { type: "weekly_avg", label: "Weekly Average", unit: "hrs", placeholder: "7.5" },
]

interface SleepEntry {
  id: string
  date: string
  bedtime: string
  wakeTime: string
  quality: number
  notes: string | null
}

function calcDuration(bed: string, wake: string): string {
  return `${sleepDurationHours(bed, wake)}h`
}

function formatTimeRange(bed: string, wake: string): string {
  return `${format(new Date(bed), "h:mm a")} → ${format(new Date(wake), "h:mm a")}`
}

function entryDateKey(entry: SleepEntry): string {
  return utcCalendarDayKeyFromIso(entry.date)
}

function SleepHistoryDayBlock({
  headerLabel,
  items,
  showDayHeader,
  onDelete,
}: {
  headerLabel: string
  items: SleepEntry[]
  showDayHeader: boolean
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      {showDayHeader && (
        <div className="flex items-center gap-2 px-1 pt-1">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {headerLabel}
          </span>
        </div>
      )}
      {items.map((entry) => (
        <div
          key={entry.id}
          className="glass-subtle group flex min-w-0 items-center justify-between gap-3 rounded-xl p-3.5"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6366f1]/10">
              <Moon className="h-3.5 w-3.5 text-[#6366f1]" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium leading-tight">{formatTimeRange(entry.bedtime, entry.wakeTime)}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">
                  {calcDuration(entry.bedtime, entry.wakeTime)}
                </span>
                <span className="hidden sm:inline text-muted-foreground/50">·</span>
                <span className="flex items-center gap-0.5" aria-label={`Quality ${entry.quality} of 5`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={`h-3 w-3 shrink-0 ${
                        i < entry.quality
                          ? "fill-amber-400 text-amber-400"
                          : "fill-transparent text-muted-foreground/35"
                      }`}
                    />
                  ))}
                </span>
              </div>
              {entry.notes && <p className="text-xs text-muted-foreground/70 line-clamp-2">{entry.notes}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDelete(entry.id)}
            className="history-row-delete"
            aria-label="Delete sleep entry"
          >
            <Trash2 />
          </button>
        </div>
      ))}
    </div>
  )
}

const SLEEP_COLOR = "#6366f1"

export default function SleepPage() {
  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const [entries, setEntries] = useState<SleepEntry[]>([])
  const [bedtime, setBedtime] = useState("22:30")
  const [wakeTime, setWakeTime] = useState("06:30")
  const [desiredWakeTime, setDesiredWakeTime] = useState("06:30")
  const [sleepGoalHours, setSleepGoalHours] = useState(8)
  const [quality, setQuality] = useState(3)
  const [notes, setNotes] = useState("")
  const [chartRange, setChartRange] = useState<"7d" | "30d" | "all">("30d")

  const today = activeDate

  useEffect(() => {
    apiFetch("/api/sleep")
      .then(async (r) => {
        const data = await r.json()
        setEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setEntries([]))
  }, [])

  useEffect(() => {
    if (user?.id) setDesiredWakeTime(readDesiredWakeTime(user.id))
  }, [user?.id])

  useEffect(() => {
    apiFetch("/api/goals?category=sleep")
      .then(async (r) => {
        if (!r.ok) return
        const goals = await r.json()
        const g = Array.isArray(goals) ? goals[0] : null
        if (g?.target && g.goalType === "daily") setSleepGoalHours(Number(g.target))
      })
      .catch(() => {})
  }, [])

  const refDate = parseLocalDate(activeDate)

  const last7DaysEntries = useMemo(() => {
    const refKey = activeDate
    const fromKey = formatDate(subDays(parseLocalDate(activeDate), 6))
    return entries.filter((e) => {
      const k = entryDateKey(e)
      return k >= fromKey && k <= refKey
    })
  }, [entries, activeDate])

  const stats = useMemo(() => {
    const last = entries[0]
    const lastNight = last ? calcDuration(last.bedtime, last.wakeTime) : "—"

    const byNight = new Map<string, { hrs: number[]; qual: number[] }>()
    for (const e of last7DaysEntries) {
      const k = entryDateKey(e)
      if (!byNight.has(k)) byNight.set(k, { hrs: [], qual: [] })
      const g = byNight.get(k)!
      g.hrs.push(sleepDurationHours(e.bedtime, e.wakeTime))
      g.qual.push(e.quality)
    }
    const nightHrAvgs = [...byNight.values()].map(
      ({ hrs }) => hrs.reduce((s, v) => s + v, 0) / hrs.length
    )
    const nightQAvgs = [...byNight.values()].map(
      ({ qual }) => qual.reduce((s, v) => s + v, 0) / qual.length
    )

    const avg7h =
      nightHrAvgs.length > 0
        ? (
            nightHrAvgs.reduce((s, v) => s + v, 0) / nightHrAvgs.length
          ).toFixed(1)
        : null
    const avgQ =
      nightQAvgs.length > 0
        ? (
            nightQAvgs.reduce((s, v) => s + v, 0) / nightQAvgs.length
          ).toFixed(1)
        : null
    let best = "—"
    if (entries.length > 0) {
      const bestEntry = entries.reduce((a, e) =>
        sleepDurationHours(e.bedtime, e.wakeTime) > sleepDurationHours(a.bedtime, a.wakeTime)
          ? e
          : a
      )
      best = calcDuration(bestEntry.bedtime, bestEntry.wakeTime)
    }
    const consistency = Math.round((byNight.size / 7) * 100)
    const bestQuality =
      entries.length > 0 ? Math.max(...entries.map((e) => e.quality)) : null
    return { lastNight, avg7h, avgQ, best, consistency, bestQuality }
  }, [entries, last7DaysEntries])

  const todayHours = useMemo(() => {
    const todayEntry = entries.find((e) => entryDateKey(e) === today)
    if (!todayEntry) return 0
    return sleepDurationHours(todayEntry.bedtime, todayEntry.wakeTime)
  }, [entries, today])

  const cutoff =
    chartRange === "7d"
      ? subDays(refDate, 6)
      : chartRange === "30d"
        ? subDays(refDate, 29)
        : null

  const chartEntries = useMemo(() => {
    const chronological = [...entries].reverse()
    if (!cutoff) return chronological
    const cutoffKey = formatDate(cutoff)
    return chronological.filter((e) => entryDateKey(e) >= cutoffKey)
  }, [entries, cutoff])

  const chartData = useMemo(() => {
    return chartEntries.map((e) => ({
      label: format(new Date(e.date), "MMM d"),
      hours: sleepDurationHours(e.bedtime, e.wakeTime),
      quality: e.quality,
    }))
  }, [chartEntries])

  const historyByDate = useMemo(() => {
    const map = new Map<string, SleepEntry[]>()
    for (const e of entries) {
      const key = entryDateKey(e)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dateKey, items]) => ({
        dateKey,
        headerLabel: formatDisplayDate(parseLocalDate(dateKey)),
        items: [...items].sort(
          (a, b) => new Date(b.bedtime).getTime() - new Date(a.bedtime).getTime()
        ),
      }))
  }, [entries])

  const historyDisplay = useMemo(
    () => partitionHistoryDayGroups(historyByDate, (d) => d.dateKey, today),
    [historyByDate, today]
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const bedDatetime = new Date(`${today}T${bedtime}:00`)
    const wakeDatetime = new Date(`${today}T${wakeTime}:00`)

    const res = await apiFetch("/api/sleep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: today,
        bedtime: bedDatetime.toISOString(),
        wakeTime: wakeDatetime.toISOString(),
        quality,
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
    const res = await apiFetch(`/api/sleep?id=${id}`, { method: "DELETE" })
    if (res.ok) setEntries(entries.filter((e) => e.id !== id))
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Sleep" />

      <PageHeroStrip
        color={SLEEP_COLOR}
        icon={Moon}
        eyebrow={`Last night · ${formatDisplayDate(parseLocalDate(activeDate))}`}
        value={stats.lastNight}
        metrics={[
          { label: "7-day avg", value: stats.avg7h !== null ? `${stats.avg7h}h` : "—" },
          { label: "Avg quality", value: stats.avgQ !== null ? `${stats.avgQ}/5` : "—" },
          { label: "Best night", value: stats.best },
          { label: "Consistency", value: `${stats.consistency}%`, sub: "last 7 days" },
        ]}
      />

      <CategoryGoal
        category="sleep"
        values={{ daily: todayHours, weekly_avg: stats.avg7h ? parseFloat(stats.avg7h) : 0 }}
        presets={sleepGoalPresets}
        color="#6366f1"
      />

      <div className="glass-panel animate-fade-up stagger-2 space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="type-hud-label">Hub target bedtime</p>
            <p className="type-hud-caption mt-0.5 normal-case">
              Shown on home · wake minus your sleep goal ({sleepGoalHours}h)
            </p>
          </div>
          <p className="text-lg font-bold tabular-nums" style={{ color: SLEEP_COLOR }}>
            {computeTargetBedtime(desiredWakeTime, sleepGoalHours)}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="desiredWake" className="type-hud-label">
            Desired wake time
          </Label>
          <Input
            id="desiredWake"
            type="time"
            value={desiredWakeTime}
            onChange={(e) => {
              setDesiredWakeTime(e.target.value)
              if (user?.id) writeDesiredWakeTime(user.id, e.target.value)
            }}
            className="tabular-nums bg-background/40"
          />
        </div>
      </div>

      <div className="glass-panel min-w-0 animate-fade-up stagger-2 p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bedtime" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span className="status-dot" style={{ width: 4, height: 4 }} />
                  Bedtime
                </Label>
                <Input
                  id="bedtime"
                  type="time"
                  value={bedtime}
                  onChange={(e) => setBedtime(e.target.value)}
                  className="tabular-nums text-lg tracking-widest bg-background/40 border-primary/15 focus-visible:border-primary/40 focus-visible:ring-primary/15"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wakeTime" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span className="status-dot" style={{ width: 4, height: 4 }} />
                  Wake Time
                </Label>
                <Input
                  id="wakeTime"
                  type="time"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                  className="tabular-nums text-lg tracking-widest bg-background/40 border-primary/15 focus-visible:border-primary/40 focus-visible:ring-primary/15"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Quality ({quality}/5)
              </Label>
              <div className="flex gap-2 mt-1">
                {[1, 2, 3, 4, 5].map((q) => (
                  <Button
                    key={q}
                    type="button"
                    variant={quality === q ? "default" : "outline"}
                    size="sm"
                    onClick={() => setQuality(q)}
                    className="w-10"
                  >
                    {q}
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
                placeholder="How did you sleep?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <Button type="submit" variant="glass" className="w-full press-scale" size="lg">
              Log Sleep
            </Button>
          </form>
      </div>

      <div className="glass-panel min-w-0 animate-fade-up stagger-2 p-4 lg:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-[#6366f1]" />
            Trends
          </h2>
          <div className="flex shrink-0 gap-1">
            {(["7d", "30d", "all"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setChartRange(r)}
                className={`rounded-lg px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors ${
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
        {chartData.length < 2 ? (
          <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/20 lg:h-52">
            <p className="px-4 text-center text-sm text-muted-foreground">
              Log at least two nights to see trends
            </p>
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="glass-subtle min-w-0 rounded-xl p-3">
              <h3 className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Duration (hours)</h3>
              <div className="h-40 min-w-0 lg:h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sleepAreaFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }} axisLine={false} tickLine={false} width={30} domain={[0, "dataMax + 1"]} />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.19 0.012 250 / 98%)",
                        border: "1px solid oklch(1 0 0 / 8%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        backdropFilter: "blur(8px)",
                      }}
                      formatter={(value) => [`${value}h`, "Duration"]}
                    />
                    <Area type="monotone" dataKey="hours" stroke="#6366f1" strokeWidth={2} fill="url(#sleepAreaFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-subtle min-w-0 rounded-xl p-3">
              <h3 className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Sleep quality</h3>
              <div className="h-40 min-w-0 lg:h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }} axisLine={false} tickLine={false} width={26} domain={[1, 5]} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.19 0.012 250 / 98%)",
                        border: "1px solid oklch(1 0 0 / 8%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        backdropFilter: "blur(8px)",
                      }}
                      formatter={(value) => [`${value}/5`, "Quality"]}
                    />
                    <Line type="monotone" dataKey="quality" stroke="oklch(0.82 0.18 110)" strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-3 animate-fade-up stagger-2">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground px-1">
            History
          </h2>
          {entries.length === 0 && (
            <div className="glass-subtle rounded-xl p-6 text-center">
              <p className="text-sm text-muted-foreground">No sleep entries yet</p>
            </div>
          )}
          {historyDisplay.todayGroups.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Today
              </p>
              {historyDisplay.todayGroups.map(({ dateKey, headerLabel, items }) => (
                <SleepHistoryDayBlock
                  key={dateKey}
                  headerLabel={headerLabel}
                  items={items}
                  showDayHeader={false}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
          {historyDisplay.earlierGroups.length > 0 && (
            <HistoryEarlierSection dayCount={historyDisplay.earlierGroups.length}>
              {historyDisplay.earlierGroups.map(({ dateKey, headerLabel, items }) => (
                <SleepHistoryDayBlock
                  key={dateKey}
                  headerLabel={headerLabel}
                  items={items}
                  showDayHeader
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
