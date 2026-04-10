"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, subDays } from "date-fns"
import { Calendar, ChevronDown, ClipboardList, Trash2, TrendingUp } from "lucide-react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"
import { apiFetch } from "@/lib/api-fetch"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { useActiveDate } from "@/context/DateContext"
import { formatDate, formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { utcCalendarDayKeyFromIso } from "@/lib/dateStorage"
import { cn } from "@/lib/utils"
import { AnatomyCanvas, RecoveryQuestionnaire, type RecoveryQuestionnaireValues } from "@/components/anatomy-health"
import {
  buildInjurySegmentSeverityMap,
  deriveAnatomyHealthState,
  parseDomsSegments,
} from "@/lib/anatomy-health/derive-from-recovery"
import { bodyRegionForNewInjurySite } from "@/lib/anatomy-health/filter-injuries-by-segments"

import "@/components/anatomy-health/anatomy-health.css"

interface DailyEntry {
  id: string
  date: string
  pain: number
  energy: number
  mood: number
  soreness: number
  stress: number
  mobility: number
  sleepFeel: number
  domsJson?: string | null
  notes: string | null
}

interface TreatmentRow {
  id: string
  injuryId: string
  date: string
  treatmentKey: string
  notes: string | null
  completed: boolean
}

interface InjuryRow {
  id: string
  conditionKey: string
  customLabel: string | null
  kind: string
  bodyRegion: string | null
  bodySegmentKeysJson?: string | null
  onsetDate: string
  resolvedAt: string | null
  severity: string
  status: string
  notes: string | null
  treatments: TreatmentRow[]
}

function entryDayKey(entry: DailyEntry): string {
  return utcCalendarDayKeyFromIso(entry.date)
}

/** DB rows use UTC-noon storage; activeDate follows the in-app calendar (often local). Match both. */
function dailyEntryMatchesActiveDate(entry: DailyEntry, activeDate: string): boolean {
  if (!activeDate) return false
  if (utcCalendarDayKeyFromIso(entry.date) === activeDate) return true
  return formatDate(new Date(entry.date)) === activeDate
}

async function readApiError(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const j = JSON.parse(text) as { error?: string; details?: string }
    const parts = [j?.error, j?.details].filter((x): x is string => typeof x === "string" && x.length > 0)
    if (parts.length > 0) return parts.join(" — ")
  } catch {
    const t = text.trim()
    if (t) return t.slice(0, 240)
  }
  return `Request failed (${res.status})`
}

function normalizeInjuryRow(raw: unknown): InjuryRow | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== "string") return null
  const seg = o.bodySegmentKeysJson ?? o.body_segment_keys_json
  let bodySegmentKeysJson: string | undefined
  if (typeof seg === "string") bodySegmentKeysJson = seg
  else if (Array.isArray(seg)) {
    bodySegmentKeysJson = JSON.stringify(seg.filter((x): x is string => typeof x === "string"))
  }
  return {
    id: o.id,
    conditionKey: typeof o.conditionKey === "string" ? o.conditionKey : "custom",
    customLabel: typeof o.customLabel === "string" ? o.customLabel : null,
    kind: typeof o.kind === "string" ? o.kind : "injury",
    bodyRegion: typeof o.bodyRegion === "string" ? o.bodyRegion : null,
    bodySegmentKeysJson,
    onsetDate: typeof o.onsetDate === "string" ? o.onsetDate : String(o.onsetDate ?? ""),
    resolvedAt: o.resolvedAt == null || o.resolvedAt === "" ? null : String(o.resolvedAt),
    severity: typeof o.severity === "string" ? o.severity : "mild",
    status: typeof o.status === "string" ? o.status : "active",
    notes: typeof o.notes === "string" ? o.notes : null,
    treatments: Array.isArray(o.treatments) ? (o.treatments as TreatmentRow[]) : [],
  }
}

function recoveryComposite(e: DailyEntry): number {
  const inv = (x: number) => 11 - x
  return (
    (e.energy + e.mood + e.mobility + e.sleepFeel + inv(e.pain) + inv(e.soreness) + inv(e.stress)) /
    7
  )
}

export default function RecoveryPage() {
  const { activeDate } = useActiveDate()
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([])
  const [injuries, setInjuries] = useState<InjuryRow[]>([])
  const [chartRange, setChartRange] = useState<"7d" | "30d" | "all">("30d")
  const [trendsOpen, setTrendsOpen] = useState(false)
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false)

  const refDate = parseLocalDate(activeDate)

  const loadDaily = useCallback(async () => {
    try {
      const r = await apiFetch("/api/recovery/daily")
      const data = await r.json()
      if (!r.ok) return
      setDailyEntries(Array.isArray(data) ? data : [])
    } catch {
      /* keep existing entries on failure */
    }
  }, [])

  const loadInjuries = useCallback(async () => {
    try {
      const r = await apiFetch("/api/recovery/injuries")
      const data = await r.json()
      if (!r.ok) return
      const list = Array.isArray(data) ? data : []
      setInjuries(list.map(normalizeInjuryRow).filter((x): x is InjuryRow => x != null))
    } catch {
      /* keep existing injuries on failure */
    }
  }, [])

  useEffect(() => {
    loadDaily()
    loadInjuries()
  }, [loadDaily, loadInjuries])

  const todayEntry = useMemo(
    () => dailyEntries.find((e) => dailyEntryMatchesActiveDate(e, activeDate)),
    [dailyEntries, activeDate]
  )

  const domsSegmentsToday = useMemo(
    () => parseDomsSegments(todayEntry?.domsJson ?? null),
    [todayEntry?.domsJson]
  )

  const anatomyState = useMemo(
    () =>
      deriveAnatomyHealthState(
        injuries,
        todayEntry
          ? {
              pain: todayEntry.pain,
              energy: todayEntry.energy,
              mood: todayEntry.mood,
              soreness: todayEntry.soreness,
              stress: todayEntry.stress,
              mobility: todayEntry.mobility,
              sleepFeel: todayEntry.sleepFeel,
            }
          : null,
        domsSegmentsToday
      ),
    [injuries, todayEntry, domsSegmentsToday]
  )

  const domsScoresMap = useMemo(() => {
    if (domsSegmentsToday.length === 0) return null
    return Object.fromEntries(domsSegmentsToday.map((s) => [s.key, s.score]))
  }, [domsSegmentsToday])

  const injurySegmentSeverityMap = useMemo(() => buildInjurySegmentSeverityMap(injuries), [injuries])

  const questionnaireInitial = useMemo(() => {
    if (!todayEntry) return undefined
    return {
      pain: todayEntry.pain,
      energy: todayEntry.energy,
      mood: todayEntry.mood,
      stress: todayEntry.stress,
      mobility: todayEntry.mobility,
      sleepFeel: todayEntry.sleepFeel,
      notes: todayEntry.notes ?? "",
      domsJson: todayEntry.domsJson ?? null,
    }
  }, [todayEntry])

  const activeInjuriesForQuestionnaire = useMemo(
    () =>
      injuries.map((i) => ({
        id: i.id,
        conditionKey: i.conditionKey,
        customLabel: i.customLabel,
        kind: i.kind,
        severity: i.severity,
        status: i.status,
      })),
    [injuries]
  )

  const cutoff =
    chartRange === "7d"
      ? subDays(refDate, 6)
      : chartRange === "30d"
        ? subDays(refDate, 29)
        : null

  const chartEntries = useMemo(() => {
    const chronological = [...dailyEntries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
    if (!cutoff) return chronological
    const cutoffKey = formatDate(cutoff)
    return chronological.filter((e) => entryDayKey(e) >= cutoffKey)
  }, [dailyEntries, cutoff])

  const chartData = useMemo(() => {
    return chartEntries.map((e) => ({
      label: format(new Date(e.date), "MMM d"),
      composite: Math.round(recoveryComposite(e) * 10) / 10,
      energy: e.energy,
      pain: e.pain,
    }))
  }, [chartEntries])

  async function commitQuestionnaire(values: RecoveryQuestionnaireValues) {
    for (const f of values.injuryFollowUps) {
      const body =
        f.outcome === "recovered"
          ? { status: "recovered", resolvedAt: activeDate }
          : { severity: f.outcome, status: "improving" as const }
      const patch = await apiFetch(`/api/recovery/injuries/${f.injuryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!patch.ok) {
        throw new Error(await readApiError(patch))
      }
      const row = normalizeInjuryRow(await patch.json())
      if (row) setInjuries((prev) => prev.map((i) => (i.id === row.id ? row : i)))
    }

    for (const site of values.newInjurySites) {
      const created = await apiFetch("/api/recovery/injuries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conditionKey: site.conditionKey,
          customLabel: site.customLabel,
          kind: site.conditionKey === "custom" ? "injury" : undefined,
          onsetDate: activeDate,
          severity: site.severity,
          bodyRegion: bodyRegionForNewInjurySite(site.segmentKey),
          bodySegmentKeys: [site.segmentKey],
          seedTreatments: site.seedSuggested ? undefined : [],
        }),
      })
      if (!created.ok) {
        throw new Error(await readApiError(created))
      }
      const row = normalizeInjuryRow(await created.json())
      if (row) setInjuries((prev) => [row, ...prev])
    }

    if (values.newIllness) {
      const payload = values.newIllness
      const created = await apiFetch("/api/recovery/injuries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conditionKey: payload.conditionKey,
          customLabel: payload.customLabel,
          kind: payload.kind,
          onsetDate: activeDate,
          severity: payload.severity,
          bodyRegion: payload.bodyRegion,
          seedTreatments: payload.seedSuggested ? undefined : [],
        }),
      })
      if (!created.ok) {
        throw new Error(await readApiError(created))
      }
      const row = normalizeInjuryRow(await created.json())
      if (row) setInjuries((prev) => [row, ...prev])
    }

    const res = await apiFetch("/api/recovery/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: activeDate,
        pain: values.pain,
        energy: values.energy,
        mood: values.mood,
        soreness: values.soreness,
        stress: values.stress,
        mobility: values.mobility,
        sleepFeel: values.sleepFeel,
        domsJson: values.domsSegments,
        notes: values.notes || null,
      }),
    })
    if (!res.ok) {
      await loadInjuries()
      throw new Error(await readApiError(res))
    }

    await loadInjuries()
    await loadDaily()
  }

  async function deleteDaily(id: string) {
    const res = await apiFetch(`/api/recovery/daily?id=${id}`, { method: "DELETE" })
    if (res.ok) setDailyEntries((prev) => prev.filter((x) => x.id !== id))
  }

  const historyByDate = useMemo(() => {
    const map = new Map<string, DailyEntry>()
    for (const e of dailyEntries) {
      const key = entryDayKey(e)
      if (!map.has(key)) map.set(key, e)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dateKey, entry]) => ({
        dateKey,
        headerLabel: formatDisplayDate(parseLocalDate(dateKey)),
        entry,
      }))
  }, [dailyEntries])

  return (
    <div className="anatomy-health-root space-y-4 pb-6">
      <PageHeader title="Recovery" />

      <AnatomyCanvas
        state={anatomyState}
        domsScores={domsScoresMap}
        injurySegmentSeverity={injurySegmentSeverityMap}
        showVitalsReadouts={false}
        headerActions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-mono text-[10px] uppercase tracking-wider border-border/50 bg-background/30 text-foreground"
            onClick={() => setQuestionnaireOpen(true)}
          >
            <ClipboardList className="h-3.5 w-3.5 mr-1.5 opacity-80" />
            Start Evaluation
          </Button>
        }
      />

      <RecoveryQuestionnaire
        open={questionnaireOpen}
        onOpenChange={setQuestionnaireOpen}
        dateLabel={formatDisplayDate(refDate)}
        activeInjuries={activeInjuriesForQuestionnaire}
        initialDaily={questionnaireInitial}
        onSubmit={commitQuestionnaire}
      />

      <div className="glass hud-corners rounded-2xl overflow-hidden border border-border/30">
        <button
          type="button"
          onClick={() => setTrendsOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-glass-highlight/15 transition-colors"
          aria-expanded={trendsOpen}
        >
          <span className="flex items-center gap-2 text-xs font-medium text-foreground">
            <TrendingUp className="h-4 w-4 text-[#2dd4bf] shrink-0" />
            Trends &amp; history
          </span>
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", trendsOpen && "rotate-180")}
          />
        </button>
        {trendsOpen && (
          <div className="px-3 pb-3 space-y-3 border-t border-border/45 pt-3">
            <div className="flex justify-end gap-1">
              {(["7d", "30d", "all"] as const).map((r) => (
                <Button
                  key={r}
                  type="button"
                  size="sm"
                  variant={chartRange === r ? "glass" : "outline"}
                  className={cn(
                    "h-8 font-mono text-[10px] uppercase tracking-wider",
                    chartRange !== r && "border-border/50 bg-background/30 text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setChartRange(r)}
                >
                  {r === "all" ? "All" : r}
                </Button>
              ))}
            </div>
            {chartData.length < 2 ? (
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border/45 bg-black/20">
                <p className="text-sm text-muted-foreground px-4 text-center">
                  Insufficient timeline — log additional days
                </p>
              </div>
            ) : (
              <div className="h-48 min-h-[192px] min-w-0 w-full">
                <ResponsiveContainer width="100%" height="100%" minHeight={192}>
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "oklch(0.55 0.02 250)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.02 250)" }} axisLine={false} tickLine={false} width={28} domain={[1, 10]} />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.16 0.02 250 / 96%)",
                        border: "1px solid oklch(1 0 0 / 10%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Line type="monotone" dataKey="composite" name="Composite" stroke="#2dd4bf" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="energy" name="Energy" stroke="oklch(0.72 0.14 145)" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="pain" name="Pain" stroke="oklch(0.62 0.18 25)" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground px-0.5">
                Log history
              </p>
              {historyByDate.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No logs</p>
              ) : (
                historyByDate.map(({ dateKey, headerLabel, entry }) => (
                  <div
                    key={dateKey}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border/45 bg-black/20 px-3 py-2.5"
                  >
                    <div className="flex gap-2 min-w-0">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0 text-sm">
                        <p className="font-mono text-[11px] text-muted-foreground">{headerLabel}</p>
                        <p className="text-foreground tabular-nums mt-0.5">
                          CMP {recoveryComposite(entry).toFixed(1)} · NRG {entry.energy} · PAIN {entry.pain}
                        </p>
                        {entry.notes && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.notes}</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteDaily(entry.id)}
                      className="history-row-delete shrink-0"
                      aria-label="Delete log"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
