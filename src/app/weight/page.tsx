"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import {
  Weight,
  Trash2,
  TrendingDown,
  TrendingUp,
  ArrowDown,
  ArrowUp,
  Minus,
  Calendar,
  Plus,
  ChevronDown,
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
import { PageHeroStrip } from "@/components/PageHeroStrip"
import { apiFetch } from "@/lib/api-fetch"
import { Button, buttonVariants } from "@/components/ui/button"
import { LogWeightDialog } from "@/components/quick-log/LogWeightDialog"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import {
  cn,
  formatDisplayDate,
  glassPanelAccentClass,
  glassPanelAccentStyle,
  glassPanelClass,
  parseLocalDate,
} from "@/lib/utils"
import { isVacationBlockingCalendarDay } from "@/lib/vacation-mode"
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"
import { HistoryArchivedNote, HistoryEarlierSection } from "@/components/HistoryEarlierSection"
import { partitionHistoryDayGroups } from "@/lib/history-display"

const WEIGHT_COLOR = "#22c55e"

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

function WeightHistoryDayGroup({
  dateKey,
  dayEntries,
  unit,
  allEntries,
  today,
  showCalendarHeader,
  onDelete,
}: {
  dateKey: string
  dayEntries: WeightEntry[]
  unit: string
  allEntries: WeightEntry[]
  today: string
  showCalendarHeader: boolean
  onDelete: (id: string) => void
}) {
  const d = new Date(dateKey + "T12:00:00")
  const isTodayRow = dateKey === today
  const label = isTodayRow
    ? "Today"
    : d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })

  return (
    <div>
      {showCalendarHeader && (
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <Calendar className="h-3 w-3 text-muted-foreground/40" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            {label}
          </span>
        </div>
      )}
      {dayEntries.map((entry) => {
        const prevEntry = allEntries[allEntries.indexOf(entry) + 1] ?? null
        const delta = prevEntry ? Math.round((entry.value - prevEntry.value) * 10) / 10 : null

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
                  <span className="font-bold text-base tabular-nums">{entry.value}</span>
                  <span className="text-xs text-muted-foreground">{unit}</span>
                  {delta != null && delta !== 0 && (
                    <span
                      className={`text-[11px] font-medium flex items-center gap-0.5 ${
                        delta < 0 ? "text-[#22c55e]" : "text-red-400"
                      }`}
                    >
                      {delta < 0 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
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
                  <p className="text-xs text-muted-foreground/60 mt-0.5">{entry.notes}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => onDelete(entry.id)}
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
}

export default function WeightPage() {
  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const [data, setData] = useState<WeightData | null>(null)
  const [loading, setLoading] = useState(true)
  const [logOpen, setLogOpen] = useState(false)
  const [chartRange, setChartRange] = useState<"7d" | "30d" | "all">("30d")

  const today = activeDate

  const vacationBlocksLog = useMemo(
    () => isVacationBlockingCalendarDay(user?.vacationResumeDate, today),
    [user?.vacationResumeDate, today]
  )

  const vacationResumeLabel =
    user?.vacationResumeDate != null && user.vacationResumeDate !== ""
      ? format(parseLocalDate(user.vacationResumeDate), "MMM d, yyyy")
      : null

  const refreshData = useCallback(() => {
    return apiFetch("/api/weight")
      .then(async (r) => {
        if (r.ok) setData(await r.json())
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshData().finally(() => setLoading(false))
  }, [refreshData])

  const entries = useMemo(() => data?.entries ?? [], [data?.entries])

  const entryForActiveDay = useMemo(
    () => entries.find((e) => e.date.split("T")[0] === today) ?? null,
    [entries, today]
  )

  const weightHistoryByDate = useMemo(() => {
    const map = new Map<string, WeightEntry[]>()
    for (const entry of entries) {
      const key = entry.date.split("T")[0]
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry)
    }
    const keys = [...map.keys()].sort((a, b) => b.localeCompare(a))
    return keys.map((dateKey) => ({ dateKey, dayEntries: map.get(dateKey)! }))
  }, [entries])

  const historyDisplay = useMemo(
    () => partitionHistoryDayGroups(weightHistoryByDate, (g) => g.dateKey, today),
    [weightHistoryByDate, today]
  )

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/weight?id=${id}`, { method: "DELETE" })
    if (res.ok) {
      await refreshData()
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <PageHeader title="Weight" />
        <div className="h-32 glass-panel" />
        <div className="h-48 glass-panel" />
      </div>
    )
  }

  if (vacationBlocksLog && vacationResumeLabel) {
    return (
      <div className="space-y-6">
        <PageHeader title="Weight" />
        <div className="glass-panel border border-amber-500/20 bg-amber-500/5 p-8 text-center space-y-4 max-w-lg mx-auto">
          <p className="text-sm text-amber-100/95 leading-relaxed">
            Vacation mode is on for this day. Weight and the scale log are hidden until{" "}
            <span className="font-semibold tabular-nums">{vacationResumeLabel}</span>.
          </p>
          <p className="text-xs text-muted-foreground/80">
            Adjust your return date or turn vacation off in Settings.
          </p>
          <Link
            href="/more"
            className={cn(buttonVariants({ variant: "glass", size: "sm" }), "mt-2 inline-flex")}
          >
            Open Settings
          </Link>
        </div>
      </div>
    )
  }

  const unit = data?.unit ?? "lbs"
  const stats = data?.stats

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

  const todayValue = entryForActiveDay?.value ?? null

  return (
    <div className="space-y-6">
      <PageHeader title="Weight" />

      <PageHeroStrip
        color={WEIGHT_COLOR}
        icon={Weight}
        eyebrow={`Current · ${formatDisplayDate(parseLocalDate(activeDate))}`}
        value={stats?.current != null ? `${stats.current}` : "—"}
        unit={unit}
        valueAdornment={
          stats?.weekChange != null && stats.weekChange !== 0 ? (
            <span
              className={cn(
                "inline-flex items-center",
                stats.weekChange < 0 ? "text-[#22c55e]" : "text-red-400"
              )}
            >
              {stats.weekChange < 0 ? (
                <ArrowDown className="h-4 w-4" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </span>
          ) : undefined
        }
        metrics={[
          { label: "7-day avg", value: stats?.avg7 != null ? `${stats.avg7}` : "—", sub: unit },
          {
            label: "Week change",
            value:
              stats?.weekChange != null
                ? `${stats.weekChange > 0 ? "+" : ""}${stats.weekChange}`
                : "—",
            sub: unit,
          },
          {
            label: "All-time low",
            value: stats?.allTimeLow != null ? `${stats.allTimeLow}` : "—",
            sub: unit,
          },
        ]}
      />

      <CategoryGoal
        category="weight"
        values={{ target: stats?.current ?? 0 }}
        presets={weightGoalPresets}
        color="#14b8a6"
      />

      <div
        className={cn(glassPanelClass, glassPanelAccentClass, "animate-fade-up stagger-1 p-4 lg:p-5")}
        style={glassPanelAccentStyle(WEIGHT_COLOR)}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-[0.07]"
          style={{ backgroundColor: WEIGHT_COLOR }}
          aria-hidden
        />
        <div className="relative space-y-4">
          <div className="min-w-0">
            <p className="type-hud-label-soft mb-1">Today</p>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="type-hud-value-xl tabular-nums">
                {todayValue != null ? todayValue : "—"}
              </span>
              <span className="type-hud-unit">{unit}</span>
            </div>
            {stats && stats.totalEntries > 0 && (
              <p className="type-hud-caption mt-1.5 normal-case tabular-nums">
                {stats.avg30 != null ? `30-day avg ${stats.avg30} ${unit}` : null}
                {stats.avg30 != null && stats.totalEntries > 0 ? " · " : null}
                {stats.totalEntries} entries
              </p>
            )}
          </div>

          <Button
            type="button"
            variant="glass"
            size="lg"
            className="h-12 w-full gap-2 touch-manipulation"
            onClick={() => setLogOpen(true)}
            disabled={vacationBlocksLog}
          >
            <Plus className="h-4 w-4 shrink-0" />
            {entryForActiveDay ? "Edit weight" : "Log weight"}
          </Button>
        </div>
      </div>

      <details
        className={cn(
          glassPanelClass,
          glassPanelAccentClass,
          "animate-fade-up stagger-2 overflow-hidden [&[open]_summary_.weight-trend-chevron]:rotate-180",
        )}
        style={glassPanelAccentStyle(WEIGHT_COLOR)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-glass-highlight/10 lg:px-5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex items-center gap-1.5">
            {data?.direction === "down" ? (
              <TrendingDown className="h-4 w-4 text-[#22c55e] shrink-0" />
            ) : (
              <TrendingUp className="h-4 w-4 text-[#22c55e] shrink-0" />
            )}
            <div className="min-w-0">
              <p className="type-hud-label-soft">Trend</p>
              <p className="type-hud-caption mt-0.5 normal-case tabular-nums">
                {chartData.length >= 2
                  ? `${chartData.length} points · ${chartRange === "all" ? "all time" : chartRange}`
                  : "Expand to view trend"}
              </p>
            </div>
          </div>
          <ChevronDown className="weight-trend-chevron h-4 w-4 shrink-0 text-muted-foreground/45 transition-transform duration-200" />
        </summary>
        <div className="border-t border-border/20 px-4 pb-4 pt-3 lg:px-5 lg:pb-5">
          <div className="flex justify-end mb-3">
            <div className="flex gap-1">
              {(["7d", "30d", "all"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    setChartRange(r)
                  }}
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
                      <stop offset="0%" stopColor={WEIGHT_COLOR} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={WEIGHT_COLOR} stopOpacity={0} />
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
                      stroke={WEIGHT_COLOR}
                      strokeDasharray="6 4"
                      strokeOpacity={0.4}
                      label={{
                        value: `Goal: ${data.target}`,
                        position: "insideTopRight",
                        fill: WEIGHT_COLOR,
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
                    stroke={WEIGHT_COLOR}
                    strokeWidth={2}
                    fill="url(#weightGrad)"
                    dot={{ r: 3, fill: WEIGHT_COLOR, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: WEIGHT_COLOR, strokeWidth: 2, stroke: "#fff" }}
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
            <Weight className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="type-hud-caption normal-case text-muted-foreground">
              Tap Log weight to add your first weigh-in.
            </p>
          </div>
        )}
        {historyDisplay.todayGroups.length > 0 && (
          <div className="space-y-2">
            {historyDisplay.todayGroups.map(({ dateKey, dayEntries }) => (
              <WeightHistoryDayGroup
                key={dateKey}
                dateKey={dateKey}
                dayEntries={dayEntries}
                unit={unit}
                allEntries={entries}
                today={today}
                showCalendarHeader={false}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
        {historyDisplay.earlierGroups.length > 0 && (
          <HistoryEarlierSection dayCount={historyDisplay.earlierGroups.length}>
            {historyDisplay.earlierGroups.map(({ dateKey, dayEntries }) => (
              <WeightHistoryDayGroup
                key={dateKey}
                dateKey={dateKey}
                dayEntries={dayEntries}
                unit={unit}
                allEntries={entries}
                today={today}
                showCalendarHeader
                onDelete={handleDelete}
              />
            ))}
          </HistoryEarlierSection>
        )}
        <HistoryArchivedNote archivedDayCount={historyDisplay.archivedDayCount} />
      </div>

      <LogWeightDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        onSaved={() => {
          void refreshData()
        }}
        initialValue={entryForActiveDay ? String(entryForActiveDay.value) : ""}
        initialNotes={entryForActiveDay?.notes ?? ""}
        unit={unit}
        editing={!!entryForActiveDay}
        disabled={vacationBlocksLog}
      />
    </div>
  )
}
