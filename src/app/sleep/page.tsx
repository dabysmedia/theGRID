"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { format, subDays } from "date-fns"
import { ChevronDown, Moon, Star, Trash2, TrendingUp } from "lucide-react"
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
import { SleepLogFields } from "@/components/sleep/SleepLogFields"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import {
  cn,
  formatDate,
  formatDisplayDate,
  glassPanelAccentClass,
  glassPanelAccentStyle,
  glassPanelClass,
  parseLocalDate,
} from "@/lib/utils"
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

const SLEEP_COLOR = "#6366f1"

function calcDuration(bed: string, wake: string): string {
  return `${sleepDurationHours(bed, wake)}h`
}

function formatTimeRange(bed: string, wake: string): string {
  return `${format(new Date(bed), "h:mm a")} → ${format(new Date(wake), "h:mm a")}`
}

function entryDateKey(entry: SleepEntry): string {
  return utcCalendarDayKeyFromIso(entry.date)
}

function dateGroupLabel(dateKey: string, todayStr: string, yesterdayStr: string) {
  if (dateKey === todayStr) return "Today"
  if (dateKey === yesterdayStr) return "Yesterday"
  return format(parseLocalDate(dateKey), "EEE, MMM d")
}

function QualityStars({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Quality ${value} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            size === "md" ? "h-3.5 w-3.5" : "h-3 w-3",
            i < value ? "fill-amber-400 text-amber-400" : "fill-transparent text-muted-foreground/30"
          )}
        />
      ))}
    </span>
  )
}

function SleepHistoryEntryRow({
  entry,
  onDelete,
}: {
  entry: SleepEntry
  onDelete: (id: string) => void
}) {
  const hours = sleepDurationHours(entry.bedtime, entry.wakeTime)

  return (
    <li className="group/row flex items-stretch gap-3 px-3 py-2.5 transition-colors hover:bg-glass-highlight/15">
      <div className="min-w-0 flex-1">
        <p className="type-hud-stat-sm tabular-nums">{formatTimeRange(entry.bedtime, entry.wakeTime)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="type-hud-stat tabular-nums" style={{ color: SLEEP_COLOR }}>
            {hours}h
          </span>
          <QualityStars value={entry.quality} />
        </div>
        {entry.notes && (
          <p className="type-hud-caption mt-1.5 normal-case line-clamp-2 text-muted-foreground/75">
            {entry.notes}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDelete(entry.id)}
        className="history-row-delete-row !m-0 !min-h-9 !min-w-9 self-center"
        aria-label="Delete sleep entry"
      >
        <Trash2 />
      </button>
    </li>
  )
}

function summarizeNight(items: SleepEntry[]) {
  const hours = items.reduce((s, e) => s + sleepDurationHours(e.bedtime, e.wakeTime), 0)
  const quality =
    items.length > 0 ? items.reduce((s, e) => s + e.quality, 0) / items.length : 0
  return {
    hours: Math.round(hours * 10) / 10,
    quality: Math.round(quality * 10) / 10,
    count: items.length,
  }
}

function SleepTodayLog({
  dateKey,
  items,
  today,
  yesterday,
  onDelete,
}: {
  dateKey: string
  items: SleepEntry[]
  today: string
  yesterday: string
  onDelete: (id: string) => void
}) {
  const summary = summarizeNight(items)
  const label = dateGroupLabel(dateKey, today, yesterday)
  const subDate =
    dateKey === today || dateKey === yesterday ? format(parseLocalDate(dateKey), "EEE, MMM d") : null

  return (
    <div
      className={cn(glassPanelClass, glassPanelAccentClass, "overflow-hidden p-4 lg:p-5")}
      style={glassPanelAccentStyle(SLEEP_COLOR)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3 className="type-hud-title normal-case">{label}</h3>
            {subDate && <span className="type-hud-caption tabular-nums">{subDate}</span>}
          </div>
          <p className="type-hud-caption mt-1 normal-case">
            {summary.count} {summary.count === 1 ? "entry" : "entries"}
          </p>
        </div>
        <div className="text-right">
          <p className="type-hud-value-lg tabular-nums leading-none" style={{ color: SLEEP_COLOR }}>
            {summary.hours}h
          </p>
          <div className="mt-1 flex justify-end">
            <QualityStars value={Math.round(summary.quality)} size="md" />
          </div>
        </div>
      </div>

      <div className="glass-subtle mt-4 overflow-hidden rounded-xl">
        <ul className="divide-y divide-border/15">
          {items.map((entry) => (
            <SleepHistoryEntryRow key={entry.id} entry={entry} onDelete={onDelete} />
          ))}
        </ul>
      </div>
    </div>
  )
}

function SleepHistoryDayAccordion({
  dateKey,
  items,
  today,
  yesterday,
  expandedDays,
  onToggleDay,
  onDelete,
}: {
  dateKey: string
  items: SleepEntry[]
  today: string
  yesterday: string
  expandedDays: ReadonlySet<string>
  onToggleDay: (dateKey: string) => void
  onDelete: (id: string) => void
}) {
  const open = expandedDays.has(dateKey)
  const summary = summarizeNight(items)
  const label = dateGroupLabel(dateKey, today, yesterday)
  const subDate =
    dateKey === today || dateKey === yesterday ? format(parseLocalDate(dateKey), "EEE, MMM d") : null

  return (
    <div className="overflow-hidden rounded-2xl border border-border/20 bg-background/25">
      <button
        type="button"
        onClick={() => onToggleDay(dateKey)}
        aria-expanded={open}
        className="w-full px-4 py-3.5 text-left transition-colors hover:bg-glass-highlight/15"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="type-hud-stat-sm">{label}</span>
              {subDate && <span className="type-hud-caption tabular-nums">{subDate}</span>}
            </div>
            <p className="type-hud-caption mt-1 normal-case">
              {summary.count} {summary.count === 1 ? "entry" : "entries"}
            </p>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <div className="text-right">
              <p className="type-hud-value-lg tabular-nums leading-none" style={{ color: SLEEP_COLOR }}>
                {summary.hours}h
              </p>
              <div className="mt-1 flex justify-end">
                <QualityStars value={Math.round(summary.quality)} />
              </div>
            </div>
            <span
              className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/25 bg-background/35",
                open && "border-primary/25 bg-primary/10"
              )}
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground/50 transition-transform duration-200",
                  open && "rotate-180 text-primary/80"
                )}
              />
            </span>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-border/20 px-3 pb-3 pt-2">
          <ul className="glass-subtle divide-y divide-border/15 overflow-hidden rounded-xl">
            {items.map((entry) => (
              <SleepHistoryEntryRow key={entry.id} entry={entry} onDelete={onDelete} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

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
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set())
  const [submitting, setSubmitting] = useState(false)

  const today = activeDate
  const yesterday = formatDate(subDays(parseLocalDate(activeDate), 1))

  const toggleHistoryDay = useCallback((dateKey: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(dateKey)) next.delete(dateKey)
      else next.add(dateKey)
      return next
    })
  }, [])

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

  const previewDuration = useMemo(() => {
    const bedDatetime = new Date(`${today}T${bedtime}:00`)
    const wakeDatetime = new Date(`${today}T${wakeTime}:00`)
    return sleepDurationHours(bedDatetime, wakeDatetime)
  }, [today, bedtime, wakeTime])

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
        ? (nightHrAvgs.reduce((s, v) => s + v, 0) / nightHrAvgs.length).toFixed(1)
        : null
    const avgQ =
      nightQAvgs.length > 0
        ? (nightQAvgs.reduce((s, v) => s + v, 0) / nightQAvgs.length).toFixed(1)
        : null
    let best = "—"
    if (entries.length > 0) {
      const bestEntry = entries.reduce((a, e) =>
        sleepDurationHours(e.bedtime, e.wakeTime) > sleepDurationHours(a.bedtime, a.wakeTime) ? e : a
      )
      best = calcDuration(bestEntry.bedtime, bestEntry.wakeTime)
    }
    const consistency = Math.round((byNight.size / 7) * 100)
    return { lastNight, avg7h, avgQ, best, consistency }
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
    if (submitting) return

    const bedDatetime = new Date(`${today}T${bedtime}:00`)
    const wakeDatetime = new Date(`${today}T${wakeTime}:00`)

    setSubmitting(true)
    try {
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
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/sleep?id=${id}`, { method: "DELETE" })
    if (res.ok) setEntries(entries.filter((e) => e.id !== id))
  }

  const targetBedtime = computeTargetBedtime(desiredWakeTime, sleepGoalHours)
  const hasChartData = chartData.length >= 2

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
        color={SLEEP_COLOR}
      />

      <div className="glass-panel animate-fade-up stagger-2 p-5">
        <div className="mb-5 text-center lg:text-left">
          <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Duration preview</p>
          <p
            className="text-4xl font-bold tabular-nums tracking-tight"
            style={{ color: SLEEP_COLOR }}
          >
            {previewDuration}h
          </p>
          <p className="text-sm text-muted-foreground">
            {formatDisplayDate(parseLocalDate(activeDate))}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground/90">
            Hub target bedtime{" "}
            <span className="font-semibold tabular-nums text-foreground/90">{targetBedtime}</span>
            {" · "}
            {sleepGoalHours}h goal
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <SleepLogFields
            bedtime={bedtime}
            wakeTime={wakeTime}
            quality={quality}
            notes={notes}
            onBedtimeChange={setBedtime}
            onWakeTimeChange={setWakeTime}
            onQualityChange={setQuality}
            onNotesChange={setNotes}
            idPrefix="sleep-page"
          />

          <div className="space-y-1.5">
            <Label htmlFor="desiredWake" className="text-xs uppercase tracking-wider text-muted-foreground">
              Desired wake (hub)
            </Label>
            <Input
              id="desiredWake"
              type="time"
              value={desiredWakeTime}
              onChange={(e) => {
                setDesiredWakeTime(e.target.value)
                if (user?.id) writeDesiredWakeTime(user.id, e.target.value)
              }}
              className="tabular-nums"
            />
          </div>

          <Button type="submit" variant="glass" className="w-full press-scale" size="lg" disabled={submitting}>
            {submitting ? "Saving…" : "Log sleep"}
          </Button>
        </form>
      </div>

      <section className="animate-fade-up stagger-2 space-y-4">
        <div className="px-0.5">
          <h2 className="type-hud-title">Sleep log</h2>
          <p className="type-hud-caption mt-1 normal-case">
            {entries.length === 0
              ? "Nothing logged yet"
              : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} across ${historyByDate.length} ${historyByDate.length === 1 ? "night" : "nights"}`}
          </p>
        </div>

        {entries.length === 0 ? (
          <div
            className={cn(glassPanelClass, glassPanelAccentClass, "p-8 text-center lg:p-10")}
            style={glassPanelAccentStyle(SLEEP_COLOR)}
          >
            <p className="type-hud-stat-sm text-muted-foreground/80">No sleep logged yet</p>
            <p className="type-hud-caption mx-auto mt-2 max-w-sm normal-case">
              Log bedtime, wake time, and quality above to start tracking your nights.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {historyDisplay.todayGroups.map(({ dateKey, items }) => (
              <SleepTodayLog
                key={dateKey}
                dateKey={dateKey}
                items={items}
                today={today}
                yesterday={yesterday}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>

      <details
        className={cn(
          glassPanelClass,
          glassPanelAccentClass,
          "animate-fade-up stagger-3 overflow-hidden [&[open]_summary_.sleep-trend-chevron]:rotate-180"
        )}
        style={glassPanelAccentStyle(SLEEP_COLOR)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-glass-highlight/10 lg:px-5 lg:py-4 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <p className="type-hud-label-soft flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" style={{ color: SLEEP_COLOR }} aria-hidden />
              Trends
            </p>
            <p className="type-hud-caption mt-0.5 normal-case tabular-nums">
              {hasChartData
                ? `${chartData.length} nights · ${chartRange === "all" ? "all time" : chartRange}`
                : "Expand to view duration and quality charts"}
            </p>
          </div>
          <ChevronDown className="sleep-trend-chevron h-4 w-4 shrink-0 text-muted-foreground/45 transition-transform duration-200" />
        </summary>
        <div className="space-y-3 border-t border-border/20 px-4 pb-4 pt-3 lg:px-5 lg:pb-5">
          <div className="flex flex-wrap gap-1">
            {(["7d", "30d", "all"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setChartRange(r)}
                className={cn(
                  "rounded-lg px-2.5 py-1 type-hud-micro normal-case transition-colors",
                  chartRange === r
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-glass-highlight/20 hover:text-foreground"
                )}
              >
                {r === "all" ? "All" : r}
              </button>
            ))}
          </div>
          {!hasChartData ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border/40 bg-background/20">
              <p className="type-hud-caption normal-case text-center">Log at least two nights to see trends</p>
            </div>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="glass-subtle min-w-0 rounded-xl p-3">
                <h3 className="type-hud-label-soft mb-2">Duration</h3>
                <div className="h-40 min-w-0 lg:h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="sleepAreaFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={SLEEP_COLOR} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={SLEEP_COLOR} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                        domain={[0, "dataMax + 1"]}
                      />
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
                      <Area
                        type="monotone"
                        dataKey="hours"
                        stroke={SLEEP_COLOR}
                        strokeWidth={2}
                        fill="url(#sleepAreaFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-subtle min-w-0 rounded-xl p-3">
                <h3 className="type-hud-label-soft mb-2">Quality</h3>
                <div className="h-40 min-w-0 lg:h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                        width={26}
                        domain={[1, 5]}
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
                        formatter={(value) => [`${value}/5`, "Quality"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="quality"
                        stroke="oklch(0.82 0.18 110)"
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      </details>

      {entries.length > 0 && (historyDisplay.earlierGroups.length > 0 || historyDisplay.archivedDayCount > 0) && (
        <section className="animate-fade-up stagger-4 space-y-3">
          {historyDisplay.earlierGroups.length > 0 && (
            <HistoryEarlierSection dayCount={historyDisplay.earlierGroups.length}>
              {historyDisplay.earlierGroups.map(({ dateKey, items }) => (
                <SleepHistoryDayAccordion
                  key={dateKey}
                  dateKey={dateKey}
                  items={items}
                  today={today}
                  yesterday={yesterday}
                  expandedDays={expandedDays}
                  onToggleDay={toggleHistoryDay}
                  onDelete={handleDelete}
                />
              ))}
            </HistoryEarlierSection>
          )}
          <HistoryArchivedNote archivedDayCount={historyDisplay.archivedDayCount} />
        </section>
      )}
    </div>
  )
}
