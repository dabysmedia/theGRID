"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Beer, Calendar, ChevronDown, Plus, Trash2 } from "lucide-react"
import { format, subDays } from "date-fns"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"
import { PageHeader } from "@/components/PageHeader"
import { PageHeroStrip } from "@/components/PageHeroStrip"
import { useActiveDate } from "@/context/DateContext"
import { apiFetch } from "@/lib/api-fetch"
import { Button } from "@/components/ui/button"
import { LogAlcoholDialog } from "@/components/quick-log/LogAlcoholDialog"
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
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"
import { HistoryArchivedNote, HistoryEarlierSection } from "@/components/HistoryEarlierSection"
import { partitionHistoryDayGroups } from "@/lib/history-display"

const alcoholGoalPresets: GoalPreset[] = [
  { type: "daily", label: "Daily Max", unit: "units", placeholder: "2", direction: "down" },
  { type: "weekly", label: "Weekly Max", unit: "units", placeholder: "10", direction: "down" },
]

interface AlcoholEntry {
  id: string
  date: string
  drinkType: string
  quantity: number
  units: number
}

const AMBER = "#f59e0b"

function entryDateKey(dateStr: string): string {
  return dateStr.slice(0, 10)
}

function AlcoholHistoryDayGroup({
  dateKey,
  items,
  showDayHeader,
  onDelete,
}: {
  dateKey: string
  items: AlcoholEntry[]
  showDayHeader: boolean
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      {showDayHeader && (
        <div className="flex items-center gap-2 px-1 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-medium uppercase tracking-wider">
            {format(parseLocalDate(dateKey), "EEEE, MMM d, yyyy")}
          </span>
        </div>
      )}
      <div className="space-y-2">
        {items.map((entry) => (
          <div key={entry.id} className="glass-subtle rounded-xl p-3.5 flex items-center justify-between group">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f59e0b]/10">
                <Beer className="h-3.5 w-3.5 text-[#f59e0b]" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold capitalize">{entry.drinkType}</span>
                  <span className="text-muted-foreground">{entry.quantity}x</span>
                  <span className="text-xs text-muted-foreground">{entry.units} units</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDelete(entry.id)}
              className="history-row-delete"
              aria-label="Delete drink entry"
            >
              <Trash2 />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AlcoholPage() {
  const { activeDate } = useActiveDate()
  const [entries, setEntries] = useState<AlcoholEntry[]>([])
  const [logOpen, setLogOpen] = useState(false)

  const today = activeDate
  const weekDateKeys = useMemo(
    () => Array.from({ length: 7 }, (_, i) => formatDate(subDays(parseLocalDate(activeDate), 6 - i))),
    [activeDate]
  )

  const refreshEntries = useCallback(() => {
    apiFetch("/api/alcohol")
      .then(async (r) => {
        const data = await r.json()
        setEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setEntries([]))
  }, [])

  useEffect(() => {
    refreshEntries()
  }, [refreshEntries])

  const unitsByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const key of weekDateKeys) map.set(key, 0)
    for (const e of entries) {
      const k = entryDateKey(e.date)
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + e.units)
    }
    return map
  }, [entries, weekDateKeys])

  const weekTotal = useMemo(() => {
    let s = 0
    for (const k of weekDateKeys) s += unitsByDay.get(k) ?? 0
    return s
  }, [unitsByDay, weekDateKeys])

  const todayUnits = unitsByDay.get(today) ?? 0
  const avgPerDay = useMemo(() => {
    const daily = weekDateKeys.map((k) => unitsByDay.get(k) ?? 0)
    return averageOnLoggedDays(daily)
  }, [unitsByDay, weekDateKeys])
  const dryDays = useMemo(() => {
    let n = 0
    for (const k of weekDateKeys) {
      if ((unitsByDay.get(k) ?? 0) === 0) n += 1
    }
    return n
  }, [unitsByDay, weekDateKeys])

  const chartData = useMemo(
    () =>
      weekDateKeys.map((key) => {
        const d = parseLocalDate(key)
        return {
          label: format(d, "EEE"),
          dateKey: key,
          units: unitsByDay.get(key) ?? 0,
        }
      }),
    [weekDateKeys, unitsByDay]
  )

  const hasChartData = chartData.some((d) => d.units > 0)

  const entriesByDate = useMemo(() => {
    const groups = new Map<string, AlcoholEntry[]>()
    for (const e of entries) {
      const k = entryDateKey(e.date)
      const list = groups.get(k)
      if (list) list.push(e)
      else groups.set(k, [e])
    }
    const sortedKeys = [...groups.keys()].sort((a, b) => b.localeCompare(a))
    return sortedKeys.map((dateKey) => ({
      dateKey,
      items: groups.get(dateKey)!,
    }))
  }, [entries])

  const historyDisplay = useMemo(
    () => partitionHistoryDayGroups(entriesByDate, (g) => g.dateKey, today),
    [entriesByDate, today]
  )

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/alcohol?id=${id}`, { method: "DELETE" })
    if (res.ok) setEntries(entries.filter((e) => e.id !== id))
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Alcohol" />

      <PageHeroStrip
        color={AMBER}
        icon={Beer}
        eyebrow={`Today · ${formatDisplayDate(parseLocalDate(activeDate))}`}
        value={String(todayUnits)}
        unit="units"
        metrics={[
          { label: "Week total", value: String(weekTotal), sub: "last 7 days" },
          { label: "Avg / day", value: avgPerDay.toFixed(1), sub: "days w/ drinks" },
          { label: "Dry days", value: String(dryDays), sub: "this week" },
        ]}
      />

      <CategoryGoal
        category="alcohol"
        values={{ daily: todayUnits, weekly: weekTotal }}
        presets={alcoholGoalPresets}
        color={AMBER}
      />

      <div
        className={cn(glassPanelClass, glassPanelAccentClass, "animate-fade-up stagger-1 p-4 lg:p-5")}
        style={glassPanelAccentStyle(AMBER)}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-[0.07]"
          style={{ backgroundColor: AMBER }}
          aria-hidden
        />
        <div className="relative space-y-4">
          <div className="min-w-0">
            <p className="type-hud-label-soft mb-1">Today</p>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="type-hud-value-xl tabular-nums">{todayUnits}</span>
              <span className="type-hud-unit">units</span>
            </div>
          </div>

          <Button
            type="button"
            variant="glass"
            size="lg"
            className="h-12 w-full gap-2 touch-manipulation"
            onClick={() => setLogOpen(true)}
          >
            <Plus className="h-4 w-4 shrink-0" />
            Log drink
          </Button>
        </div>
      </div>

      <details
        className={cn(
          glassPanelClass,
          glassPanelAccentClass,
          "animate-fade-up stagger-2 overflow-hidden [&[open]_summary_.alcohol-trend-chevron]:rotate-180",
        )}
        style={glassPanelAccentStyle(AMBER)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-glass-highlight/10 lg:px-5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <p className="type-hud-label-soft">Last 7 days</p>
            <p className="type-hud-caption mt-0.5 normal-case tabular-nums">
              {hasChartData
                ? `${weekTotal} units · ${dryDays} dry days`
                : "Expand to view your week"}
            </p>
          </div>
          <ChevronDown className="alcohol-trend-chevron h-4 w-4 shrink-0 text-muted-foreground/45 transition-transform duration-200" />
        </summary>
        <div className="border-t border-border/20 px-4 pb-4 pt-3 lg:px-5 lg:pb-5">
          <div className="h-40 lg:h-48 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/25" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  width={32}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.19 0.012 250 / 98%)",
                    border: "1px solid oklch(1 0 0 / 8%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    backdropFilter: "blur(8px)",
                  }}
                  formatter={(value) => [`${Number(value ?? 0)} units`, "Units"]}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as { dateKey?: string } | undefined
                    return p?.dateKey ? format(parseLocalDate(p.dateKey), "EEE, MMM d") : ""
                  }}
                />
                <Bar dataKey="units" fill={AMBER} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
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
              Tap Log drink to add your first entry.
            </p>
          </div>
        )}
        {historyDisplay.todayGroups.length > 0 && (
          <div className="space-y-2">
            {historyDisplay.todayGroups.map(({ dateKey, items }) => (
              <AlcoholHistoryDayGroup
                key={dateKey}
                dateKey={dateKey}
                items={items}
                showDayHeader={false}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
        {historyDisplay.earlierGroups.length > 0 && (
          <HistoryEarlierSection dayCount={historyDisplay.earlierGroups.length}>
            {historyDisplay.earlierGroups.map(({ dateKey, items }) => (
              <AlcoholHistoryDayGroup
                key={dateKey}
                dateKey={dateKey}
                items={items}
                showDayHeader
                onDelete={handleDelete}
              />
            ))}
          </HistoryEarlierSection>
        )}
        <HistoryArchivedNote archivedDayCount={historyDisplay.archivedDayCount} />
      </div>

      <LogAlcoholDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        onSaved={(entry) => {
          if (entry && typeof entry === "object" && "id" in entry) {
            setEntries((prev) => [entry as AlcoholEntry, ...prev])
          } else {
            refreshEntries()
          }
        }}
      />
    </div>
  )
}
