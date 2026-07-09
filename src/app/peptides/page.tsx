"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, subDays } from "date-fns"
import { Calendar, Plus, Syringe, Trash2, TrendingUp } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import { apiFetch } from "@/lib/api-fetch"
import { PageHeader } from "@/components/PageHeader"
import { PageHeroStrip } from "@/components/PageHeroStrip"
import { PeptideVialGraphic } from "@/components/PeptideVialGraphic"
import { Button } from "@/components/ui/button"
import { LogPeptideInjectionDialog } from "@/components/quick-log/LogPeptideInjectionDialog"
import { LogPeptideDailyDialog } from "@/components/quick-log/LogPeptideDailyDialog"
import {
  formatDate,
  formatDisplayDate,
  last7Days,
  parseLocalDate,
  cn,
  glassPanelAccentClass,
  glassPanelAccentStyle,
  glassPanelClass,
} from "@/lib/utils"
import { GlassChip } from "@/components/GlassChip"
import { SectionRail } from "@/components/SectionRail"
import { utcCalendarDayKeyFromIso } from "@/lib/dateStorage"
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"
import { HistoryArchivedNote, HistoryEarlierSection } from "@/components/HistoryEarlierSection"
import { partitionHistoryDayGroups } from "@/lib/history-display"
import {
  PEPTIDE_COLOR,
  compoundLabel,
  daysSinceLastInjection,
  injectionSiteLabel,
  parseSideEffectsJson,
  sideEffectLabel,
} from "@/lib/peptides"
import {
  computeNextInjection,
  readInjectionIntervalDays,
  writeInjectionIntervalDays,
} from "@/lib/hub-tile-prefs"

const peptideGoalPresets: GoalPreset[] = [
  { type: "weekly", label: "Weekly Injections", unit: "doses", placeholder: "1" },
]

const INJECTION_INTERVAL_PRESETS = [5, 7, 14] as const

const PURPLE = PEPTIDE_COLOR

const tooltipStyle = {
  background: "oklch(0.19 0.012 250 / 98%)",
  border: "1px solid oklch(1 0 0 / 8%)",
  borderRadius: "8px",
  fontSize: "12px",
  backdropFilter: "blur(8px)",
} as const

interface PeptideEntry {
  id: string
  date: string
  injectedAt: string
  compound: string
  doseMg: number
  injectionSite: string
  sideEffectsJson: string
  notes: string | null
}

interface PeptideDailyEntry {
  id: string
  date: string
  hungerLevel: number
  sideEffectsJson: string
  notes: string | null
}

function entryDateKey(entry: { date: string }): string {
  return utcCalendarDayKeyFromIso(entry.date)
}

function PeptideHistoryDayGroup({
  dateKey,
  items,
  showDayHeader,
  onDelete,
}: {
  dateKey: string
  items: PeptideEntry[]
  showDayHeader: boolean
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      {showDayHeader && (
        <div className="flex items-center gap-2 px-1 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span className="type-hud-label">
            {format(parseLocalDate(dateKey), "EEEE, MMM d, yyyy")}
          </span>
        </div>
      )}
      <div className="space-y-2">
        {items.map((entry) => {
          const effects = parseSideEffectsJson(entry.sideEffectsJson)
          return (
            <div
              key={entry.id}
              className="glass-subtle rounded-xl p-3.5 flex items-center justify-between gap-3 group"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <PeptideVialGraphic
                  color={PURPLE}
                  doseMg={entry.doseMg}
                  size="sm"
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug">
                        {entry.doseMg} mg · {compoundLabel(entry.compound)}
                      </p>
                      <p className="type-hud-caption mt-0.5 normal-case">
                        {injectionSiteLabel(entry.injectionSite)}
                      </p>
                    </div>
                    <time
                      dateTime={entry.injectedAt}
                      className="type-hud-readout text-muted-foreground shrink-0 pt-0.5"
                    >
                      {format(new Date(entry.injectedAt), "p")}
                    </time>
                  </div>
                  {effects.length > 0 && (
                    <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
                      {effects.map(sideEffectLabel).join(" · ")}
                    </p>
                  )}
                  {entry.notes && (
                    <p className="text-xs text-muted-foreground/70 mt-1">{entry.notes}</p>
                  )}
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
          )
        })}
      </div>
    </div>
  )
}

export default function PeptidesPage() {
  const [entries, setEntries] = useState<PeptideEntry[]>([])
  const [dailyEntries, setDailyEntries] = useState<PeptideDailyEntry[]>([])
  const [injectionIntervalDays, setInjectionIntervalDays] = useState(7)
  const [injectionOpen, setInjectionOpen] = useState(false)
  const [dailyOpen, setDailyOpen] = useState(false)

  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const today = activeDate

  useEffect(() => {
    if (user?.id) setInjectionIntervalDays(readInjectionIntervalDays(user.id))
  }, [user?.id])

  const chartFrom = formatDate(subDays(parseLocalDate(activeDate), 29))

  const refreshEntries = useCallback(() => {
    apiFetch("/api/peptides")
      .then(async (r) => {
        const data = await r.json()
        setEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setEntries([]))
  }, [])

  const refreshDaily = useCallback(() => {
    apiFetch(`/api/peptides/daily?from=${chartFrom}&to=${activeDate}`)
      .then(async (r) => {
        const data = await r.json()
        setDailyEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setDailyEntries([]))
  }, [chartFrom, activeDate])

  useEffect(() => {
    refreshEntries()
  }, [refreshEntries])

  useEffect(() => {
    refreshDaily()
  }, [refreshDaily])

  const dailyByDate = useMemo(() => {
    const map = new Map<string, PeptideDailyEntry>()
    for (const d of dailyEntries) {
      map.set(entryDateKey(d), d)
    }
    return map
  }, [dailyEntries])

  const lastInjection = entries[0] ?? null
  const nextInjection = useMemo(
    () =>
      computeNextInjection(
        lastInjection?.injectedAt,
        injectionIntervalDays,
        activeDate
      ),
    [lastInjection?.injectedAt, injectionIntervalDays, activeDate]
  )
  const lastSiteUsed = lastInjection?.injectionSite ?? null
  const activeDayDaily = dailyByDate.get(activeDate) ?? null
  const activeDayHunger = activeDayDaily?.hungerLevel ?? null
  const activeDayEffects = activeDayDaily
    ? parseSideEffectsJson(activeDayDaily.sideEffectsJson)
    : []

  const { weekDoses, avgHungerStr, daysSinceStr, lastDoseMg, doseChartData, hungerChartData } =
    useMemo(() => {
      const weekKeys = new Set(last7Days().map((d) => formatDate(d)))
      const weekInjections = entries.filter((e) => weekKeys.has(entryDateKey(e)))
      const weekDoses = weekInjections.length

      const weekDaily = dailyEntries.filter((e) => weekKeys.has(entryDateKey(e)))
      let avgHungerStr = "—"
      if (weekDaily.length > 0) {
        const avg = weekDaily.reduce((acc, e) => acc + e.hungerLevel, 0) / weekDaily.length
        avgHungerStr = avg.toFixed(1)
      }

      const daysSince = daysSinceLastInjection(entries)
      const daysSinceStr = daysSince == null ? "—" : String(daysSince)
      const lastDoseMg = lastInjection ? String(lastInjection.doseMg) : "—"

      const days = last7Days()
      const doseChartData = days.map((d) => {
        const key = formatDate(d)
        const dose = entries
          .filter((e) => entryDateKey(e) === key)
          .reduce((s, e) => s + e.doseMg, 0)
        return { label: format(d, "EEE"), dateKey: key, dose }
      })

      const hungerChartData = days.map((d) => {
        const key = formatDate(d)
        const row = dailyByDate.get(key)
        return {
          label: format(d, "EEE"),
          dateKey: key,
          hunger: row?.hungerLevel ?? null,
        }
      })

      return {
        weekDoses,
        avgHungerStr,
        daysSinceStr,
        lastDoseMg,
        doseChartData,
        hungerChartData,
      }
    }, [entries, dailyEntries, dailyByDate, lastInjection])

  const hasDoseChart = doseChartData.some((d) => d.dose > 0)
  const hasHungerChart = hungerChartData.some((d) => d.hunger != null)

  const historyGroups = useMemo(() => {
    const map = new Map<string, PeptideEntry[]>()
    for (const e of entries) {
      const d = entryDateKey(e)
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(e)
    }
    const keys = [...map.keys()].sort((a, b) => b.localeCompare(a))
    return keys.map((dateKey) => ({
      dateKey,
      items: map.get(dateKey)!.sort(
        (a, b) => new Date(b.injectedAt).getTime() - new Date(a.injectedAt).getTime()
      ),
    }))
  }, [entries])

  const historyDisplay = useMemo(
    () => partitionHistoryDayGroups(historyGroups, (g) => g.dateKey, today),
    [historyGroups, today]
  )

  const activeDateSaved = dailyByDate.has(activeDate)

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/peptides?id=${id}`, { method: "DELETE" })
    if (res.ok) setEntries(entries.filter((e) => e.id !== id))
  }

  return (
    <div className="space-y-5 pb-2">
      <PageHeader title="Peptides" />

      <PageHeroStrip
        color={PURPLE}
        iconSlot={
          <PeptideVialGraphic
            color={PURPLE}
            doseMg={lastInjection?.doseMg ?? null}
            size="md"
          />
        }
        eyebrow={`Appetite · ${formatDisplayDate(parseLocalDate(activeDate))}`}
        value={activeDayHunger != null ? String(activeDayHunger) : "—"}
        unit="/10"
        hint="· 10 = very hungry"
        footnotes={[
          ...(activeDayEffects.length > 0
            ? [activeDayEffects.map(sideEffectLabel).join(" · ")]
            : []),
          ...(lastSiteUsed
            ? [`Last shot: ${lastDoseMg} mg · ${injectionSiteLabel(lastSiteUsed)}`]
            : []),
        ]}
        metrics={[
          { label: "Days since shot", value: daysSinceStr },
          { label: "Avg hunger", value: avgHungerStr, sub: "7-day" },
          { label: "Last dose", value: lastDoseMg, sub: "mg" },
        ]}
      />

      <div className="glass-panel animate-fade-up stagger-1 flex flex-col items-center gap-2 p-4 sm:p-5">
        <PeptideVialGraphic
          color={PURPLE}
          doseMg={lastInjection?.doseMg ?? null}
          size="lg"
        />
        {lastInjection ? (
          <p className="type-hud-caption max-w-[16rem] text-center normal-case">
            Last shot ·{" "}
            <span className="font-semibold text-foreground/90">
              {lastInjection.doseMg} mg {compoundLabel(lastInjection.compound)}
            </span>
            {" · "}
            {format(new Date(lastInjection.injectedAt), "MMM d")}
          </p>
        ) : (
          <p className="type-hud-caption text-center normal-case">No injections logged yet</p>
        )}
      </div>

      <div className="glass-panel animate-fade-up stagger-1 space-y-3 p-4">
        <SectionRail label="Injection schedule" />
        <p className="type-hud-caption -mt-1 normal-case">
          Drives the home tile countdown · days until your next shot
        </p>
        <div className="flex flex-wrap gap-2">
          {INJECTION_INTERVAL_PRESETS.map((days) => (
            <GlassChip
              key={days}
              selected={injectionIntervalDays === days}
              onClick={() => {
                setInjectionIntervalDays(days)
                if (user?.id) writeInjectionIntervalDays(user.id, days)
              }}
            >
              Every {days} days
            </GlassChip>
          ))}
        </div>
        {nextInjection && (
          <p className="type-hud-caption normal-case">
            Next due{" "}
            <span className="font-semibold text-foreground/90">{nextInjection.nextLabel}</span>
            {nextInjection.overdue
              ? ` · ${Math.abs(nextInjection.daysUntil)}d overdue`
              : nextInjection.dueToday
                ? " · due today"
                : ` · in ${nextInjection.daysUntil}d`}
          </p>
        )}
      </div>

      <Button
        type="button"
        variant="glass"
        size="lg"
        className="h-12 w-full press-scale animate-fade-up stagger-1 gap-2 touch-manipulation"
        onClick={() => setInjectionOpen(true)}
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden />
        Log injection
      </Button>

      <div
        className={cn(glassPanelClass, glassPanelAccentClass, "animate-fade-up stagger-1 p-4 lg:p-5")}
        style={glassPanelAccentStyle(PURPLE)}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-[0.07]"
          style={{ backgroundColor: PURPLE }}
          aria-hidden
        />
        <div className="relative space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="type-hud-label-soft mb-1">Today · appetite</p>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="type-hud-value-xl tabular-nums">
                  {activeDayHunger != null ? activeDayHunger : "—"}
                </span>
                <span className="type-hud-unit">/10</span>
              </div>
              {activeDayEffects.length > 0 && (
                <p className="type-hud-caption mt-1.5 normal-case">
                  {activeDayEffects.map(sideEffectLabel).join(" · ")}
                </p>
              )}
            </div>
            {activeDateSaved && (
              <span className="type-hud-chip rounded-lg border border-primary/25 bg-primary/10 px-2 py-1 text-primary">
                Saved
              </span>
            )}
          </div>

          <Button
            type="button"
            variant="glass"
            size="lg"
            className="h-12 w-full gap-2 touch-manipulation"
            onClick={() => setDailyOpen(true)}
          >
            <Plus className="h-4 w-4 shrink-0" />
            {activeDateSaved ? "Edit daily appetite" : "Log daily appetite"}
          </Button>
        </div>
      </div>

      <CategoryGoal
        category="peptides"
        values={{ weekly: weekDoses }}
        presets={peptideGoalPresets}
        color={PURPLE}
      />

      <div className={cn("glass-panel min-w-0 animate-fade-up stagger-1 p-4 lg:p-5")}>
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 shrink-0" style={{ color: PURPLE }} />
          <span className="type-hud-title">Trends</span>
          <div className="hud-divider flex-1" />
          <span className="type-hud-caption">Last 7 days</span>
        </div>
        {hasDoseChart || hasHungerChart ? (
          <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="glass-subtle min-w-0 rounded-xl p-3">
              <h3 className="type-hud-subsection mb-2">Dose (mg)</h3>
              <div className="h-36 min-w-0 lg:h-40">
                {hasDoseChart ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={doseChartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/25" vertical={false} />
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
                        allowDecimals
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value) => [`${Number(value ?? 0)} mg`, "Dose"]}
                        labelFormatter={(_, payload) => {
                          const p = payload?.[0]?.payload as { dateKey?: string } | undefined
                          return p?.dateKey ? format(parseLocalDate(p.dateKey), "EEE, MMM d") : ""
                        }}
                      />
                      <Bar dataKey="dose" fill={PURPLE} radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="type-hud-caption">No doses logged</p>
                  </div>
                )}
              </div>
            </div>

            <div className="glass-subtle min-w-0 rounded-xl p-3">
              <h3 className="type-hud-subsection mb-2">Hunger / appetite</h3>
              <div className="h-36 min-w-0 lg:h-40">
                {hasHungerChart ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hungerChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        width={26}
                        domain={[1, 10]}
                        tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value) => [
                          value != null ? `${Number(value).toFixed(1)}/10` : "—",
                          "Hunger",
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="hunger"
                        stroke={PURPLE}
                        strokeWidth={2}
                        dot={{ r: 2.5, fill: PURPLE }}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="type-hud-caption">Log hunger to see trends</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/15 lg:h-40">
            <p className="type-hud-caption px-4 text-center normal-case">
              Save daily appetite and log injections to see trends
            </p>
          </div>
        )}
      </div>

      <div className="glass-panel animate-fade-up stagger-2 p-4 lg:p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="type-hud-title">Injection history</span>
            <div className="hud-divider flex-1" />
            {entries.length > 0 && (
              <span className="type-hud-caption">{entries.length} total</span>
            )}
          </div>

          {entries.length === 0 && (
            <div className="glass-subtle rounded-xl p-8 text-center">
              <Syringe className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="type-hud-caption normal-case">No injections logged yet</p>
            </div>
          )}
          {historyDisplay.todayGroups.length > 0 && (
            <div className="space-y-2">
              <p className="type-hud-micro px-0.5">Today</p>
              {historyDisplay.todayGroups.map(({ dateKey, items }) => (
                <PeptideHistoryDayGroup
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
                <PeptideHistoryDayGroup
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

      <LogPeptideInjectionDialog
        open={injectionOpen}
        onOpenChange={setInjectionOpen}
        lastSiteUsed={lastSiteUsed}
        onSaved={(entry) => {
          if (entry && typeof entry === "object" && "id" in entry) {
            setEntries((prev) =>
              [entry as PeptideEntry, ...prev].sort(
                (a, b) => new Date(b.injectedAt).getTime() - new Date(a.injectedAt).getTime()
              )
            )
          } else {
            refreshEntries()
          }
        }}
      />

      <LogPeptideDailyDialog
        open={dailyOpen}
        onOpenChange={setDailyOpen}
        editing={activeDateSaved}
        initialHunger={activeDayDaily?.hungerLevel ?? 5}
        initialNotes={activeDayDaily?.notes ?? ""}
        initialSideEffects={activeDayEffects}
        onSaved={(entry) => {
          if (entry && typeof entry === "object" && "id" in entry) {
            const saved = entry as PeptideDailyEntry
            setDailyEntries((prev) => {
              const key = entryDateKey(saved)
              const rest = prev.filter((d) => entryDateKey(d) !== key)
              return [saved, ...rest].sort((a, b) => entryDateKey(b).localeCompare(entryDateKey(a)))
            })
          } else {
            refreshDaily()
          }
        }}
      />
    </div>
  )
}
