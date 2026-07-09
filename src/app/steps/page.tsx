"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Calendar, Footprints, Plus, Trash2, ChevronDown } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { format, isToday, isYesterday, subDays } from "date-fns"
import { PageHeader } from "@/components/PageHeader"
import { PageHeroStrip } from "@/components/PageHeroStrip"
import { apiFetch } from "@/lib/api-fetch"
import { Button } from "@/components/ui/button"
import { LogStepsDialog } from "@/components/quick-log/LogStepsDialog"
import { useActiveDate } from "@/context/DateContext"
import {
  averageOnLoggedDays,
  cn,
  formatDate,
  formatDisplayDate,
  glassPanelAccentClass,
  glassPanelAccentStyle,
  glassPanelClass,
  parseLocalDate,
} from "@/lib/utils"
import { utcCalendarDayKeyFromIso } from "@/lib/dateStorage"
import { kmToMiles, runKmToStepsFromRun, STEPS_PER_MILE_FROM_RUN } from "@/lib/units"
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"
import { HistoryArchivedNote, HistoryEarlierSection } from "@/components/HistoryEarlierSection"
import { partitionHistoryDayGroups } from "@/lib/history-display"

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
  return utcCalendarDayKeyFromIso(dateIso)
}

function groupHeaderLabel(dayKey: string): string {
  const d = parseLocalDate(dayKey)
  if (isToday(d)) return "Today"
  if (isYesterday(d)) return "Yesterday"
  return formatDisplayDate(d)
}

/** Common rule-of-thumb: ~2,000 steps ≈ 1 mile walked */
const STEPS_PER_MILE = 2000
const STEPS_COLOR = "#22c55e"

type HistoryRow =
  | { kind: "logged"; entry: StepEntry }
  | { kind: "run"; run: RunEntry }

type StepHistoryGroup = {
  dayKey: string
  header: string
  rows: HistoryRow[]
}

function StepHistoryDayBlock({
  group,
  showDayHeader,
  onDeleteStep,
  onDeleteRun,
}: {
  group: StepHistoryGroup
  showDayHeader: boolean
  onDeleteStep: (id: string) => void
  onDeleteRun: (id: string) => void
}) {
  return (
    <div>
      {showDayHeader && (
        <div className="flex items-center gap-1.5 px-1 mb-2 mt-1 first:mt-0">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.header}
          </span>
        </div>
      )}
      <div className="space-y-1.5">
        {group.rows.map((row) => {
          if (row.kind === "logged") {
            const entry = row.entry
            const dayKey = dayKeyFromEntry(entry.date)
            const dateLine = format(parseLocalDate(dayKey), "EEE, MMM d, yyyy")
            const timeLine =
              entry.createdAt != null ? format(new Date(entry.createdAt), "h:mm a") : null
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
                  onClick={() => onDeleteStep(entry.id)}
                  className="history-row-delete"
                  aria-label="Delete step entry"
                >
                  <Trash2 />
                </button>
              </div>
            )
          }
          const run = row.run
          const steps = runKmToStepsFromRun(run.distance)
          const timeLine =
            run.createdAt != null ? format(new Date(run.createdAt), "h:mm a") : null
          const mi = kmToMiles(run.distance)
          return (
            <div
              key={`run-${run.id}`}
              className="glass-subtle rounded-xl p-3.5 flex items-center justify-between group"
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
              <button
                type="button"
                onClick={() => onDeleteRun(run.id)}
                className="history-row-delete"
                aria-label="Delete run from history"
              >
                <Trash2 />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function StepsPage() {
  const { activeDate } = useActiveDate()
  const [entries, setEntries] = useState<StepEntry[]>([])
  const [runEntries, setRunEntries] = useState<RunEntry[]>([])
  const [logOpen, setLogOpen] = useState(false)
  const [dailyStepTarget, setDailyStepTarget] = useState<number | null>(null)

  const today = activeDate

  const fetchDailyStepGoal = useCallback(async () => {
    try {
      const r = await apiFetch("/api/goals?category=steps")
      const data = await r.json()
      if (!data?.id || data.goalType !== "daily" || data.direction === "down") {
        setDailyStepTarget(null)
        return
      }
      const t = Number(data.target)
      setDailyStepTarget(Number.isFinite(t) && t > 0 ? Math.round(t) : null)
    } catch {
      setDailyStepTarget(null)
    }
  }, [])

  const refreshEntries = useCallback(() => {
    Promise.all([
      apiFetch("/api/steps").then(async (r) => {
        const data = await r.json()
        return Array.isArray(data) ? data : []
      }),
      apiFetch("/api/running").then(async (r) => {
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

  useEffect(() => {
    refreshEntries()
  }, [refreshEntries])

  useEffect(() => {
    void fetchDailyStepGoal()
  }, [fetchDailyStepGoal])

  useEffect(() => {
    function onGoalsUpdated(e: Event) {
      const d = (e as CustomEvent<{ category?: string }>).detail
      if (d?.category === "steps") void fetchDailyStepGoal()
    }
    window.addEventListener("grid:goals-updated", onGoalsUpdated)
    return () => window.removeEventListener("grid:goals-updated", onGoalsUpdated)
  }, [fetchDailyStepGoal])

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
    [activeDate],
  )

  const stats = useMemo(() => {
    const todayTotal = byDay.get(today) ?? 0
    const dailyTotals = weekDayKeys.map((k) => byDay.get(k) ?? 0)
    const weekTotal = dailyTotals.reduce((a, b) => a + b, 0)
    const avg7 = averageOnLoggedDays(dailyTotals)

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
    [byDay, weekDayKeys],
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
              : row.run.createdAt ?? row.run.date,
          ).getTime()
        return timeOf(b) - timeOf(a)
      }),
    }))
  }, [entries, runEntries])

  const historyDisplay = useMemo(
    () => partitionHistoryDayGroups(historyGroups, (g) => g.dayKey, today),
    [historyGroups, today],
  )

  const milesRemainingToDailyGoal = useMemo(() => {
    if (dailyStepTarget == null) return null
    const todaySteps = byDay.get(today) ?? 0
    const remainingSteps = Math.max(0, dailyStepTarget - todaySteps)
    const miles = remainingSteps / STEPS_PER_MILE
    return { remainingSteps, miles }
  }, [dailyStepTarget, byDay, today])

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/steps?id=${id}`, { method: "DELETE" })
    if (res.ok) setEntries(entries.filter((e) => e.id !== id))
  }

  async function handleDeleteRun(id: string) {
    const res = await apiFetch(`/api/running?id=${id}`, { method: "DELETE" })
    if (res.ok) setRunEntries(runEntries.filter((r) => r.id !== id))
  }

  const todayTotal = stats.todayTotal
  const hasChartData = chartData.some((d) => d.steps > 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Steps" />

      <PageHeroStrip
        color={STEPS_COLOR}
        icon={Footprints}
        eyebrow={`Today · ${formatDisplayDate(parseLocalDate(activeDate))}`}
        value={stats.todayTotal.toLocaleString()}
        unit="steps"
        metrics={[
          { label: "7-day avg", value: Math.round(stats.avg7).toLocaleString(), sub: "logged days" },
          { label: "Week total", value: stats.weekTotal.toLocaleString(), sub: "last 7 days" },
          {
            label: "Best day",
            value: stats.bestDay > 0 ? stats.bestDay.toLocaleString() : "—",
            sub: stats.bestDayLabel ?? "no data yet",
          },
        ]}
      />

      <CategoryGoal
        category="steps"
        values={{ daily: stats.todayTotal, weekly: stats.weekTotal }}
        presets={stepsGoalPresets}
        color={STEPS_COLOR}
      />

      <div
        className={cn(glassPanelClass, glassPanelAccentClass, "animate-fade-up stagger-1 p-4 lg:p-5")}
        style={glassPanelAccentStyle(STEPS_COLOR)}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-[0.07]"
          style={{ backgroundColor: STEPS_COLOR }}
          aria-hidden
        />
        <div className="relative space-y-4">
          <div className="min-w-0">
            <p className="type-hud-label-soft mb-1">Today</p>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="type-hud-value-xl tabular-nums">{todayTotal.toLocaleString()}</span>
              <span className="type-hud-unit">steps</span>
            </div>
            {milesRemainingToDailyGoal != null && (
              <p className="type-hud-caption mt-1.5 normal-case">
                {milesRemainingToDailyGoal.remainingSteps === 0 ? (
                  <span className="font-medium text-emerald-500/90">Daily goal reached</span>
                ) : (
                  <>
                    <span className="font-semibold tabular-nums text-foreground/90">
                      {(Math.round(milesRemainingToDailyGoal.miles * 100) / 100).toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </span>{" "}
                    mi remaining to hit your daily goal
                  </>
                )}
              </p>
            )}
            {stepsFromRunsToday > 0 && (
              <p className="type-hud-caption mt-1 normal-case text-muted-foreground/75">
                Includes {stepsFromRunsToday.toLocaleString()} steps from runs
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
            Log steps
          </Button>
        </div>
      </div>

      <details
        className={cn(
          glassPanelClass,
          glassPanelAccentClass,
          "animate-fade-up stagger-2 overflow-hidden [&[open]_summary_.steps-trend-chevron]:rotate-180",
        )}
        style={glassPanelAccentStyle(STEPS_COLOR)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-glass-highlight/10 lg:px-5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <p className="type-hud-label-soft">7-day trend</p>
            <p className="type-hud-caption mt-0.5 normal-case tabular-nums">
              {hasChartData
                ? `${Math.round(stats.avg7).toLocaleString()} avg · ${stats.weekTotal.toLocaleString()} total`
                : "Expand to view your week"}
            </p>
          </div>
          <ChevronDown className="steps-trend-chevron h-4 w-4 shrink-0 text-muted-foreground/45 transition-transform duration-200" />
        </summary>
        <div className="border-t border-border/20 px-4 pb-4 pt-3 lg:px-5 lg:pb-5">
          <div className="h-44 w-full">
            {hasChartData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="stepsBarGrad" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor={STEPS_COLOR} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={STEPS_COLOR} stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
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
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Log steps to see your week
              </div>
            )}
          </div>
        </div>
      </details>

      <div className="animate-fade-up stagger-3 space-y-3">
        <div className="px-0.5">
          <h2 className="type-hud-title">History</h2>
          <p className="type-hud-caption mt-1 normal-case">
            {entries.length === 0 && runEntries.length === 0
              ? "Nothing logged yet"
              : `${entries.length + runEntries.length} entries`}
          </p>
        </div>
        {entries.length === 0 && runEntries.length === 0 && (
          <div className={cn(glassPanelClass, "p-8 text-center")}>
            <p className="type-hud-caption normal-case text-muted-foreground">
              Tap Log steps to add your first entry.
            </p>
          </div>
        )}
        {historyDisplay.todayGroups.length > 0 && (
          <div className="space-y-2">
            {historyDisplay.todayGroups.map((group) => (
              <StepHistoryDayBlock
                key={group.dayKey}
                group={group}
                showDayHeader={false}
                onDeleteStep={handleDelete}
                onDeleteRun={handleDeleteRun}
              />
            ))}
          </div>
        )}
        {historyDisplay.earlierGroups.length > 0 && (
          <HistoryEarlierSection dayCount={historyDisplay.earlierGroups.length}>
            {historyDisplay.earlierGroups.map((group) => (
              <StepHistoryDayBlock
                key={group.dayKey}
                group={group}
                showDayHeader
                onDeleteStep={handleDelete}
                onDeleteRun={handleDeleteRun}
              />
            ))}
          </HistoryEarlierSection>
        )}
        <HistoryArchivedNote archivedDayCount={historyDisplay.archivedDayCount} />
      </div>

      <LogStepsDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        onSaved={(entry) => {
          if (entry && typeof entry === "object" && "id" in entry) {
            setEntries((prev) => [entry as StepEntry, ...prev])
          } else {
            refreshEntries()
          }
        }}
      />
    </div>
  )
}
