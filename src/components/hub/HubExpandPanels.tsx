"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ChevronRight, Dumbbell, Moon, Play, Plus, Syringe, Waves, X } from "lucide-react"
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
  ReferenceLine,
} from "recharts"
import { CaloriePipTracker } from "@/components/calories/CaloriePipTracker"
import { PeptideVialGraphic } from "@/components/PeptideVialGraphic"
import { WeekWorkoutGoalRing, WEEKLY_WORKOUT_GOAL } from "@/components/WeekWorkoutGoalRing"
import {
  StageMinuteBars,
  StageTimeline,
  parseStages,
} from "@/components/sleep/SleepStageViews"
import {
  WeightCorrelationPanel,
  type WeightCorrelationDayData,
} from "@/components/stats/WeightCorrelationPanel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ProgressionSummaryHero } from "@/components/workouts/ProgressionSummaryHero"
import { useActiveDate } from "@/context/DateContext"
import { useQuickLog } from "@/context/QuickLogContext"
import { apiFetch } from "@/lib/api-fetch"
import type { NextInjectionInfo } from "@/lib/hub-tile-prefs"
import {
  READINESS_BAND_LABEL,
  readinessBand,
} from "@/lib/readiness-score"
import { displaySleepScore, qualityToScore } from "@/lib/sleep-score"
import { sleepDurationHours } from "@/lib/sleepDuration"
import { cn, parseLocalDate } from "@/lib/utils"

export type HubExpandedPanel =
  | "calories"
  | "steps"
  | "sleep"
  | "weight"
  | "vitals"
  | "peptides"
  | "workouts"

export function HubExpandDismiss({
  onDismiss,
  label = "Close",
}: {
  onDismiss: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label={label}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 type-hud-micro text-muted-foreground/80 transition-colors hover:bg-muted/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
    >
      <X className="h-3.5 w-3.5" aria-hidden />
      Close
    </button>
  )
}

/* ─── Calories ───────────────────────────────────────────── */

export function HubCaloriesExpand({
  consumed,
  target,
  vacationBlocked,
  onDismiss,
}: {
  consumed: number
  target: number
  vacationBlocked?: boolean
  onDismiss: () => void
}) {
  const { openQuickLog } = useQuickLog()
  const remaining = Math.max(0, target - consumed)
  const pct = target > 0 ? Math.round((consumed / target) * 100) : 0

  return (
    <div className="motion-safe:animate-fade-up motion-reduce:animate-none space-y-4 px-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-hud-subsection">Calories</p>
          <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/70">
            {vacationBlocked
              ? "Vacation mode — intake tracking paused."
              : `${consumed.toLocaleString()} of ${target.toLocaleString()} · ${remaining.toLocaleString()} left · ${pct}%`}
          </p>
        </div>
        <HubExpandDismiss onDismiss={onDismiss} />
      </div>

      {vacationBlocked ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-[12px] leading-relaxed text-amber-100/90">
          Food logging is paused until vacation ends.
        </p>
      ) : (
        <>
          <div className="relative w-full">
            <CaloriePipTracker
              consumed={consumed}
              target={target}
              size="default"
            />
          </div>
          <button
            type="button"
            onClick={() => openQuickLog("calories")}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] type-hud-micro text-muted-foreground/90 transition-colors hover:border-red-400/30 hover:bg-red-400/[0.06] hover:text-red-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30 sm:w-auto sm:px-4"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add food
          </button>
        </>
      )}
    </div>
  )
}

/* ─── Sleep ──────────────────────────────────────────────── */

type SleepEntryRow = {
  id: string
  date: string
  bedtime: string
  wakeTime: string
  quality: number
  score: number | null
  remMinutes: number | null
  lightMinutes: number | null
  deepMinutes: number | null
  awakeMinutes: number | null
  stagesJson: string | null
}

export function HubSleepExpand({
  hours,
  goal,
  last7,
  dayLabels,
  onDismiss,
}: {
  hours: number
  goal: number
  last7: number[]
  dayLabels: string[]
  onDismiss: () => void
}) {
  const { activeDate } = useActiveDate()
  const { openQuickLog } = useQuickLog()
  const [entry, setEntry] = useState<SleepEntryRow | null>(null)
  const [status, setStatus] = useState<"loading" | "ready">("loading")

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    void (async () => {
      try {
        const res = await apiFetch(`/api/sleep?date=${activeDate}`)
        if (!res.ok || cancelled) return
        const rows = (await res.json()) as SleepEntryRow[]
        if (cancelled) return
        setEntry(Array.isArray(rows) && rows.length > 0 ? rows[0]! : null)
      } catch {
        if (!cancelled) setEntry(null)
      } finally {
        if (!cancelled) setStatus("ready")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeDate])

  const stages = entry ? parseStages(entry.stagesJson) : []
  const hasStageMinutes =
    entry != null &&
    ((entry.remMinutes ?? 0) +
      (entry.lightMinutes ?? 0) +
      (entry.deepMinutes ?? 0) +
      (entry.awakeMinutes ?? 0) >
      0)
  const score =
    entry != null
      ? entry.score ?? (entry.quality != null ? qualityToScore(entry.quality) : null)
      : null
  const durationLabel =
    entry != null
      ? `${sleepDurationHours(entry.bedtime, entry.wakeTime)}h`
      : hours > 0
        ? `${hours}h`
        : null

  return (
    <div className="motion-safe:animate-fade-up motion-reduce:animate-none space-y-4 px-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-hud-subsection">Sleep stages</p>
          <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/70">
            {durationLabel != null
              ? `${durationLabel} · goal ${goal}h`
              : `Goal ${goal}h`}
            {score != null ? ` · score ${displaySleepScore(score)}` : ""}
          </p>
        </div>
        <HubExpandDismiss onDismiss={onDismiss} />
      </div>

      {status === "loading" ? (
        <p className="type-hud-caption text-muted-foreground/55">Loading night…</p>
      ) : stages.length > 0 || hasStageMinutes ? (
        <div className="space-y-3">
          {entry != null ? (
            <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/65">
              {format(new Date(entry.bedtime), "h:mm a")} →{" "}
              {format(new Date(entry.wakeTime), "h:mm a")}
            </p>
          ) : null}
          {stages.length > 0 ? <StageTimeline stages={stages} /> : null}
          {entry != null && hasStageMinutes ? <StageMinuteBars entry={entry} /> : null}
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-4">
          <div className="flex items-center gap-2 text-muted-foreground/80">
            <Moon className="h-4 w-4 text-[#6366f1]" aria-hidden />
            <p className="type-hud-caption normal-case tracking-normal">
              No stage breakdown for this night yet.
            </p>
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground/60">
            Sync Fitbit / Google Health for deep, light, REM, and awake timelines — or log sleep
            manually below.
          </p>
          <button
            type="button"
            onClick={() => openQuickLog("sleep")}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 type-hud-micro text-muted-foreground/90 transition-colors hover:border-indigo-400/30 hover:bg-indigo-400/[0.06] hover:text-indigo-100/90"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Log sleep
          </button>
        </div>
      )}

      <div className="space-y-2">
        <p className="type-hud-caption">Last 7 nights</p>
        <div className="flex items-end justify-between gap-1" style={{ height: 44 }}>
          {last7.map((v, i) => {
            const max = Math.max(...last7, goal, 1)
            const h = Math.max(4, Math.round((v / max) * 40))
            const isToday = i === last7.length - 1
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className="w-[70%] max-w-[18px] rounded-sm"
                  style={{
                    height: h,
                    background: isToday
                      ? "linear-gradient(180deg, #818cf8, #4338ca)"
                      : "linear-gradient(180deg, #6366f188, #312e8188)",
                  }}
                />
                <span
                  className={cn(
                    "text-[9px] tracking-wider",
                    isToday ? "font-semibold text-indigo-300" : "text-muted-foreground/45",
                  )}
                >
                  {dayLabels[i] ?? ""}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ─── Weight ─────────────────────────────────────────────── */

export function HubWeightExpand({ onDismiss }: { onDismiss: () => void }) {
  const { activeDate } = useActiveDate()
  const [daily, setDaily] = useState<WeightCorrelationDayData[] | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const month = useMemo(() => activeDate.slice(0, 7), [activeDate])

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    void (async () => {
      try {
        const res = await apiFetch(`/api/stats/monthly?month=${month}`)
        if (!res.ok || cancelled) {
          if (!cancelled) setStatus("error")
          return
        }
        const data = await res.json()
        if (cancelled) return
        const rows = Array.isArray(data?.daily) ? (data.daily as WeightCorrelationDayData[]) : []
        setDaily(rows)
        setStatus("ready")
      } catch {
        if (!cancelled) {
          setDaily(null)
          setStatus("error")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [month])

  const hasWeight = daily?.some((d) => d.weight != null || d.weightForward != null) ?? false

  return (
    <div className="motion-safe:animate-fade-up motion-reduce:animate-none space-y-3 px-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-hud-subsection">Weight correlation</p>
          <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/70">
            {month} · vs steps, calories, sleep
          </p>
        </div>
        <HubExpandDismiss onDismiss={onDismiss} />
      </div>

      {status === "loading" ? (
        <p className="type-hud-caption text-muted-foreground/55">Loading month…</p>
      ) : status === "error" ? (
        <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-[12px] text-muted-foreground/70">
          Couldn’t load correlation data. Try again from Stats.
        </p>
      ) : !hasWeight ? (
        <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-[12px] leading-relaxed text-muted-foreground/70">
          Log a few weigh-ins this month to unlock weight vs activity correlations.
        </p>
      ) : (
        <WeightCorrelationPanel daily={daily!} embedded className="min-w-0" />
      )}
    </div>
  )
}

/* ─── Vitals ─────────────────────────────────────────────── */

const VITALS_COLOR = "#f43f5e"

type ZoneMinutes = { zone: string; minutes: number }
type HrSample = { time: string; bpm: number }
type TrendDay = {
  date: string
  restingHeartRate: number | null
  hrvMs: number | null
}

type VitalsPayload = {
  restingHeartRate: number | null
  hrvMs: number | null
  hrAvg: number | null
  hrMin: number | null
  hrMax: number | null
  zones: ZoneMinutes[]
  samples: HrSample[]
  trend14: TrendDay[]
  lastSyncAt: string | null
  hasConnection: boolean
}

const ZONE_STYLE: Record<string, { label: string; color: string }> = {
  OUT_OF_RANGE: { label: "Out of range", color: "#64748b" },
  FAT_BURN: { label: "Fat burn", color: "#22c55e" },
  CARDIO: { label: "Cardio", color: "#f59e0b" },
  PEAK: { label: "Peak", color: "#ef4444" },
}

function zoneStyle(zone: string): { label: string; color: string } {
  const key = zone.toUpperCase().replace(/[^A-Z]/g, "_")
  return (
    ZONE_STYLE[key] ?? {
      label: zone
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/^\w/, (c) => c.toUpperCase()),
      color: VITALS_COLOR,
    }
  )
}

function dash(value: number | null | undefined, unit = ""): string {
  return value != null && Number.isFinite(value) ? `${value}${unit}` : "—"
}

export function HubVitalsExpand({
  readiness,
  fallbackHrvMs,
  fallbackRhr,
  onDismiss,
}: {
  readiness?: number | null
  fallbackHrvMs?: number | null
  fallbackRhr?: number | null
  onDismiss: () => void
}) {
  const { activeDate } = useActiveDate()
  const [data, setData] = useState<VitalsPayload | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    void (async () => {
      try {
        const res = await apiFetch(`/api/vitals?date=${activeDate}`, { cache: "no-store" })
        if (!res.ok || cancelled) {
          if (!cancelled) setStatus("error")
          return
        }
        const json = (await res.json()) as VitalsPayload
        if (cancelled) return
        setData(json)
        setStatus("ready")
      } catch {
        if (!cancelled) {
          setData(null)
          setStatus("error")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeDate])

  const hrvMs = data?.hrvMs ?? fallbackHrvMs ?? null
  const rhr = data?.restingHeartRate ?? fallbackRhr ?? null
  const band = readinessBand(readiness ?? null)
  const accent = band
    ? band === "peak"
      ? "#34d399"
      : band === "high"
        ? "#22d3ee"
        : band === "balanced"
          ? VITALS_COLOR
          : band === "low"
            ? "#f59e0b"
            : "#fb7185"
    : VITALS_COLOR

  const hrChartData = useMemo(
    () =>
      (data?.samples ?? []).map((s) => ({
        label: format(new Date(s.time), "h:mm a"),
        bpm: s.bpm,
      })),
    [data?.samples],
  )

  const trendChartData = useMemo(
    () =>
      (data?.trend14 ?? []).map((d) => ({
        label: format(parseLocalDate(d.date), "MMM d"),
        rhr: d.restingHeartRate,
        hrv: d.hrvMs,
      })),
    [data?.trend14],
  )

  const hasHrChart = hrChartData.length >= 2
  const hasTrend = (data?.trend14 ?? []).some(
    (d) => d.restingHeartRate != null || d.hrvMs != null,
  )
  const zones = data?.zones ?? []
  const totalZoneMinutes = zones.reduce((s, z) => s + z.minutes, 0)

  return (
    <div className="motion-safe:animate-fade-up motion-reduce:animate-none space-y-4 px-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-hud-subsection">Vitals</p>
          <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/70">
            {band ? `${READINESS_BAND_LABEL[band]} · ` : ""}
            HRV {dash(hrvMs != null ? Math.round(hrvMs) : null, " ms")}
            {" · "}
            RHR {dash(rhr, " bpm")}
            {readiness != null ? ` · readiness ${Math.round(readiness)}` : ""}
          </p>
        </div>
        <HubExpandDismiss onDismiss={onDismiss} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          {
            label: "HRV",
            value: hrvMs != null ? String(Math.round(hrvMs)) : "—",
            unit: "ms",
            tone: accent,
          },
          {
            label: "RHR",
            value: rhr != null ? String(Math.round(rhr)) : "—",
            unit: "bpm",
            tone: VITALS_COLOR,
          },
          {
            label: "Avg HR",
            value: data?.hrAvg != null ? String(Math.round(data.hrAvg)) : "—",
            unit: "bpm",
            tone: "#94a3b8",
          },
        ].map((cell) => (
          <div
            key={cell.label}
            className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2.5"
          >
            <p className="type-hud-micro text-muted-foreground/55">{cell.label}</p>
            <p
              className="mt-0.5 type-hud-stat-sm tabular-nums"
              style={{ color: cell.tone, textShadow: `0 0 12px ${cell.tone}33` }}
            >
              {cell.value}
              <span className="ml-0.5 text-[10px] font-medium text-muted-foreground/50">
                {cell.unit}
              </span>
            </p>
          </div>
        ))}
      </div>

      {status === "loading" ? (
        <p className="type-hud-caption text-muted-foreground/55">Loading vitals…</p>
      ) : status === "error" ? (
        <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-[12px] text-muted-foreground/70">
          Couldn’t load vitals. Open the Vitals page to sync Google Health.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="type-hud-caption flex items-center gap-1.5">
                <Waves className="h-3 w-3" style={{ color: VITALS_COLOR }} aria-hidden />
                All-day heart rate
              </p>
              <span className="type-hud-micro tabular-nums text-muted-foreground/50">
                {hrChartData.length > 0 ? `${hrChartData.length} samples` : "No samples"}
              </span>
            </div>
            {!hasHrChart ? (
              <p className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-4 text-center text-[12px] text-muted-foreground/60">
                Sync Google Health for 5-minute HR samples
              </p>
            ) : (
              <div className="h-40 min-w-0 sm:h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hrChartData} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hubHrAreaFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={VITALS_COLOR} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={VITALS_COLOR} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="oklch(1 0 0 / 5%)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={36}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                      domain={["dataMin - 5", "dataMax + 5"]}
                    />
                    {rhr != null ? (
                      <ReferenceLine y={rhr} stroke="oklch(1 0 0 / 20%)" strokeDasharray="4 4" />
                    ) : null}
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.19 0.012 250 / 98%)",
                        border: "1px solid oklch(1 0 0 / 8%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        backdropFilter: "blur(8px)",
                      }}
                      formatter={(value) => [`${value} bpm`, "Heart rate"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="bpm"
                      stroke={VITALS_COLOR}
                      strokeWidth={2}
                      fill="url(#hubHrAreaFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="type-hud-caption">Heart-rate zones</p>
            {zones.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-3 text-center text-[12px] text-muted-foreground/60">
                No zone data for this day yet
              </p>
            ) : (
              <div className="space-y-2">
                {zones.map((z) => {
                  const style = zoneStyle(z.zone)
                  const pct = totalZoneMinutes > 0 ? (z.minutes / totalZoneMinutes) * 100 : 0
                  return (
                    <div key={z.zone} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-foreground/85">
                          {style.label}
                        </span>
                        <span className="type-hud-micro tabular-nums text-muted-foreground/55">
                          {z.minutes} min
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.max(pct, 2)}%`,
                            backgroundColor: style.color,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="type-hud-caption">14-day RHR &amp; HRV</p>
            {!hasTrend ? (
              <p className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-3 text-center text-[12px] text-muted-foreground/60">
                Sync a couple of days to unlock trends
              </p>
            ) : (
              <div className="h-36 min-w-0 sm:h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendChartData} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="oklch(1 0 0 / 5%)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="rhr"
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <YAxis
                      yAxisId="hrv"
                      orientation="right"
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.19 0.012 250 / 98%)",
                        border: "1px solid oklch(1 0 0 / 8%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        backdropFilter: "blur(8px)",
                      }}
                    />
                    <Line
                      yAxisId="rhr"
                      type="monotone"
                      dataKey="rhr"
                      name="RHR"
                      stroke={VITALS_COLOR}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                    <Line
                      yAxisId="hrv"
                      type="monotone"
                      dataKey="hrv"
                      name="HRV"
                      stroke="oklch(0.72 0.04 250)"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {data?.lastSyncAt ? (
            <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/45">
              Last sync {format(new Date(data.lastSyncAt), "MMM d, h:mm a")}
            </p>
          ) : data && !data.hasConnection ? (
            <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/45">
              Connect Google Health in Settings to import vitals
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

/* ─── Peptides ───────────────────────────────────────────── */

export function HubPeptidesExpand({
  lastDoseMg,
  lastInjectedAt,
  nextInjection,
  todayMg,
  last7,
  dayLabels,
  onDismiss,
}: {
  lastDoseMg: number | null
  lastInjectedAt: string | null
  nextInjection: NextInjectionInfo | null
  todayMg: number
  last7: number[]
  dayLabels: string[]
  onDismiss: () => void
}) {
  let untilLabel = "Log first shot"
  if (nextInjection) {
    if (nextInjection.overdue) untilLabel = `${Math.abs(nextInjection.daysUntil)}d overdue`
    else if (nextInjection.dueToday) untilLabel = "Due today"
    else if (nextInjection.daysUntil === 1) untilLabel = "Next · tomorrow"
    else untilLabel = `${nextInjection.daysUntil}d until next · ${nextInjection.nextLabel}`
  }

  const lastLabel =
    lastInjectedAt != null
      ? format(new Date(lastInjectedAt), "MMM d · h:mm a")
      : null

  return (
    <div className="motion-safe:animate-fade-up motion-reduce:animate-none space-y-4 px-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-hud-subsection">Peptides</p>
          <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/70">
            {untilLabel}
            {lastDoseMg != null ? ` · last ${lastDoseMg} mg` : ""}
          </p>
        </div>
        <HubExpandDismiss onDismiss={onDismiss} />
      </div>

      <div className="flex items-center gap-4">
        <PeptideVialGraphic color="#a855f7" doseMg={lastDoseMg} size="md" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
              <p className="type-hud-micro text-muted-foreground/55">Today</p>
              <p className="type-hud-stat-sm tabular-nums text-violet-200/90">
                {todayMg > 0 ? `${todayMg} mg` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
              <p className="type-hud-micro text-muted-foreground/55">Last shot</p>
              <p className="truncate text-[12px] font-medium tabular-nums text-foreground/85">
                {lastLabel ?? "—"}
              </p>
            </div>
          </div>
          <p
            className={cn(
              "text-[12px] font-semibold tracking-wide",
              nextInjection?.overdue && "text-negative",
              nextInjection?.dueToday && "text-primary",
              !nextInjection?.overdue && !nextInjection?.dueToday && "text-violet-200/80",
            )}
          >
            {untilLabel}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="type-hud-caption">Last 7 days</p>
        <div className="flex items-end justify-between gap-1" style={{ height: 44 }}>
          {last7.map((v, i) => {
            const max = Math.max(...last7, 1)
            const h = Math.max(4, Math.round((v / max) * 40))
            const isToday = i === last7.length - 1
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className="w-[70%] max-w-[18px] rounded-sm"
                  style={{
                    height: h,
                    background: isToday
                      ? "linear-gradient(180deg, #c084fc, #7e22ce)"
                      : "linear-gradient(180deg, #a855f788, #581c8788)",
                  }}
                />
                <span
                  className={cn(
                    "text-[9px] tracking-wider",
                    isToday ? "font-semibold text-violet-300" : "text-muted-foreground/45",
                  )}
                >
                  {dayLabels[i] ?? ""}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <Link
        href="/peptides"
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] type-hud-micro text-muted-foreground/90 transition-colors hover:border-violet-400/30 hover:bg-violet-400/[0.06] hover:text-violet-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/30 sm:w-auto sm:px-4"
      >
        <Syringe className="h-3.5 w-3.5" aria-hidden />
        Open peptides
      </Link>
    </div>
  )
}

/* ─── Workouts ───────────────────────────────────────────── */

interface HubRoutineTemplate {
  id: string
  name: string
  exercises: string | HubRoutineExercise[]
  tags?: string | null
  coverImageUrl?: string | null
  sortOrder?: number
}

interface HubRoutineExercise {
  id?: string
  name: string
  notes?: string
  setRows?: Array<{ id?: string; weight?: string; reps?: string }>
  targetSets?: number
  targetReps?: string
  primaryMuscles?: Array<{ name: string; color?: string; code?: string }>
}

function parseHubRoutineExercises(raw: string | HubRoutineExercise[]): HubRoutineExercise[] {
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as HubRoutineExercise[]) : []
  } catch {
    return []
  }
}

function parseHubRoutineTags(raw: string | string[] | null | undefined): string[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))].slice(0, 12)
  }
  if (raw == null || raw === "") return []
  try {
    const a = JSON.parse(raw) as unknown
    if (Array.isArray(a)) return parseHubRoutineTags(a as string[])
  } catch {
    /* fall through */
  }
  if (raw.includes(",")) {
    return [
      ...new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ].slice(0, 12)
  }
  return []
}

function hubRoutinePreview(exs: HubRoutineExercise[]): string {
  if (exs.length === 0) return "No exercises"
  if (exs.length <= 2) return exs.map((e) => e.name).join(" · ")
  return `${exs[0].name} · ${exs[1].name} +${exs.length - 2}`
}

function hubRoutineSetCount(ex: HubRoutineExercise): number {
  if (Array.isArray(ex.setRows) && ex.setRows.length > 0) return ex.setRows.length
  if (typeof ex.targetSets === "number" && Number.isFinite(ex.targetSets)) {
    return Math.max(1, ex.targetSets)
  }
  return 3
}

export function HubWorkoutsExpand({
  weekCount,
  todayCount,
  last7,
  dayLabels,
  recoveryScore,
  onDismiss,
}: {
  weekCount: number
  todayCount: number
  last7: number[]
  dayLabels: string[]
  recoveryScore: number | null
  onDismiss: () => void
}) {
  const router = useRouter()
  const [templates, setTemplates] = useState<HubRoutineTemplate[]>([])
  const [templatesStatus, setTemplatesStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  )
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setTemplatesStatus("loading")
    void apiFetch(`/api/workout-templates?_=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((rows: unknown) => {
        if (cancelled) return
        const list = Array.isArray(rows) ? (rows as HubRoutineTemplate[]) : []
        setTemplates(list)
        setTemplatesStatus("ready")
      })
      .catch(() => {
        if (cancelled) return
        setTemplates([])
        setTemplatesStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const met = weekCount >= WEEKLY_WORKOUT_GOAL
  const remaining = Math.max(0, WEEKLY_WORKOUT_GOAL - weekCount)
  const lastSessionIdx = [...last7].reverse().findIndex((v) => v > 0)
  const daysSinceLast =
    lastSessionIdx < 0 ? null : lastSessionIdx === 0 ? 0 : lastSessionIdx

  let lastCue = "No sessions this week"
  if (daysSinceLast === 0) lastCue = "Trained today"
  else if (daysSinceLast === 1) lastCue = "Last session yesterday"
  else if (daysSinceLast != null) lastCue = `Last session ${daysSinceLast}d ago`

  let recoveryCue = "Log recovery when you can"
  if (recoveryScore != null && recoveryScore >= 7) recoveryCue = "Recovery looking solid"
  else if (recoveryScore != null && recoveryScore >= 5) recoveryCue = "Moderate recovery — ease in"
  else if (recoveryScore != null) recoveryCue = "Prioritize recovery today"

  const previewTmpl = previewId
    ? templates.find((t) => t.id === previewId) ?? null
    : null
  const previewExs = previewTmpl
    ? parseHubRoutineExercises(previewTmpl.exercises)
    : []
  const previewTags = previewTmpl ? parseHubRoutineTags(previewTmpl.tags) : []

  function goStartRoutine(id: string) {
    setStartingId(id)
    try {
      sessionStorage.setItem("theGRID_hubStartWorkout", id)
    } catch {
      /* private mode */
    }
    router.push(`/workouts?start=${encodeURIComponent(id)}`)
  }

  function goStartFreeForm() {
    setStartingId("free")
    try {
      sessionStorage.setItem("theGRID_hubStartWorkout", "free")
    } catch {
      /* private mode */
    }
    router.push("/workouts?start=free")
  }

  return (
    <div className="motion-safe:animate-fade-up motion-reduce:animate-none space-y-5 px-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-hud-subsection">Workouts</p>
          <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/70">
            {met
              ? `Goal met · ${weekCount} this week`
              : `${weekCount}/${WEEKLY_WORKOUT_GOAL} this week`}
            {todayCount > 0 ? ` · ${todayCount} today` : ""}
          </p>
        </div>
        <HubExpandDismiss onDismiss={onDismiss} />
      </div>

      <div className="flex items-center gap-4">
        <WeekWorkoutGoalRing count={weekCount} size="lg" color="#c4d632" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <p
              className="type-hud-stat-sm tabular-nums"
              style={met ? { color: "#c4d632" } : undefined}
            >
              {weekCount}/{WEEKLY_WORKOUT_GOAL}
              <span className="ml-1.5 type-hud-micro font-normal text-muted-foreground/55">
                week
              </span>
            </p>
            <p className="type-hud-stat-sm tabular-nums text-teal-200/85">
              {recoveryScore != null ? `${recoveryScore}/10` : "—"}
              <span className="ml-1.5 type-hud-micro font-normal text-muted-foreground/55">
                recovery
              </span>
            </p>
          </div>
          <p className="text-[12px] font-medium text-foreground/80">{lastCue}</p>
          <p className="text-[11px] text-muted-foreground/60">{recoveryCue}</p>
          {!met && remaining > 0 ? (
            <p className="text-[11px] text-[#c4d632]/80">
              {remaining} more to hit weekly goal
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <p className="type-hud-caption">Sessions · last 7</p>
        <div className="flex items-end justify-between gap-1" style={{ height: 44 }}>
          {last7.map((v, i) => {
            const max = Math.max(...last7, 1)
            const h = Math.max(4, Math.round((v / max) * 40))
            const isToday = i === last7.length - 1
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className="w-[70%] max-w-[18px] rounded-sm"
                  style={{
                    height: h,
                    background: isToday
                      ? "linear-gradient(180deg, #e8f07a, #a3b01a)"
                      : "linear-gradient(180deg, #c4d63288, #6b751888)",
                  }}
                />
                <span
                  className={cn(
                    "text-[9px] tracking-wider",
                    isToday ? "font-semibold text-[#c4d632]" : "text-muted-foreground/45",
                  )}
                >
                  {dayLabels[i] ?? ""}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <ProgressionSummaryHero className="!rounded-none border-0 border-y border-white/[0.06] bg-transparent px-0 shadow-none dark:bg-transparent" />

      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="type-hud-caption">Routines</p>
          {templatesStatus === "ready" && templates.length > 0 ? (
            <span className="type-hud-micro tabular-nums text-muted-foreground/50">
              {templates.length}
            </span>
          ) : null}
        </div>

        {templatesStatus === "loading" ? (
          <p className="text-[12px] text-muted-foreground/55">Loading routines…</p>
        ) : null}
        {templatesStatus === "error" ? (
          <p className="text-[12px] text-muted-foreground/55">
            Couldn’t load routines.{" "}
            <Link href="/workouts" className="underline-offset-2 hover:underline">
              Open workouts
            </Link>
          </p>
        ) : null}
        {templatesStatus === "ready" && templates.length === 0 ? (
          <p className="text-[12px] text-muted-foreground/55">
            No routines yet — create one on the workouts page, or start free-form below.
          </p>
        ) : null}

        {templates.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {templates.map((tmpl) => {
              const exs = parseHubRoutineExercises(tmpl.exercises)
              const tags = parseHubRoutineTags(tmpl.tags)
              const cover = tmpl.coverImageUrl?.trim()
              const preview = hubRoutinePreview(exs)
              const busy = startingId === tmpl.id
              return (
                <div
                  key={tmpl.id}
                  className="flex min-w-0 items-stretch gap-2.5 border-b border-white/[0.05] py-2 last:border-b-0 sm:border-b-0 sm:rounded-xl sm:border sm:border-white/[0.06] sm:bg-white/[0.02] sm:px-2.5 sm:py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => setPreviewId(tmpl.id)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4d632]/30"
                    aria-label={`Preview ${tmpl.name}`}
                  >
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted/25 sm:size-14">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover}
                          alt=""
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-gradient-to-br from-white/[0.06] to-transparent">
                          <Dumbbell className="size-5 text-muted-foreground/25" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="truncate text-[13px] font-semibold text-foreground/90">
                          {tmpl.name}
                        </p>
                        <ChevronRight
                          className="size-3.5 shrink-0 text-muted-foreground/40"
                          aria-hidden
                        />
                      </div>
                      <p
                        className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground/55"
                        title={exs.map((e) => e.name).join(", ")}
                      >
                        {preview}
                      </p>
                      {tags.length > 0 ? (
                        <p className="mt-1 truncate text-[9px] text-muted-foreground/45">
                          {tags.slice(0, 3).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={startingId != null}
                    onClick={() => goStartRoutine(tmpl.id)}
                    className="inline-flex h-9 shrink-0 items-center gap-1 self-center rounded-lg border border-[#c4d632]/25 bg-[#c4d632]/[0.08] px-2.5 text-[11px] font-semibold text-[#e8f07a] transition-colors hover:border-[#c4d632]/45 hover:bg-[#c4d632]/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4d632]/30 disabled:opacity-50 touch-manipulation"
                  >
                    <Play className="size-3 shrink-0" aria-hidden />
                    {busy ? "…" : "Start"}
                  </button>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="type-hud-caption">Free-form</p>
        <button
          type="button"
          disabled={startingId != null}
          onClick={goStartFreeForm}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] type-hud-micro text-muted-foreground/90 transition-colors hover:border-[#c4d632]/35 hover:bg-[#c4d632]/[0.06] hover:text-[#e8f07a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4d632]/30 disabled:opacity-50 touch-manipulation"
        >
          <Play className="h-3.5 w-3.5" aria-hidden />
          {startingId === "free" ? "Starting…" : "Start empty workout"}
        </button>
        <p className="text-[10px] leading-relaxed text-muted-foreground/50">
          Opens the active workout flow — pick upper/lower for a recommended session, or add
          exercises manually.
        </p>
      </div>

      <Link
        href="/workouts"
        className="inline-flex h-9 w-full items-center justify-center gap-2 type-hud-micro text-muted-foreground/70 transition-colors hover:text-[#e8f07a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4d632]/30 sm:w-auto"
      >
        <Dumbbell className="h-3.5 w-3.5" aria-hidden />
        Open full workouts
      </Link>

      <Dialog open={previewTmpl != null} onOpenChange={(open) => !open && setPreviewId(null)}>
        <DialogContent
          showCloseButton
          className={cn(
            "glass-frost max-w-md gap-0 p-0",
            "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3",
          )}
        >
          {previewTmpl ? (
            <div className="max-h-[82dvh] overflow-y-auto overscroll-contain">
              {previewTmpl.coverImageUrl?.trim() ? (
                <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-white/[0.06] bg-muted/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewTmpl.coverImageUrl.trim()}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                </div>
              ) : null}
              <div className="space-y-1 px-4 pb-2 pt-4 pr-12">
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle>{previewTmpl.name}</DialogTitle>
                  <DialogDescription>
                    {previewExs.length} exercise{previewExs.length === 1 ? "" : "s"}
                    {previewTags.length > 0 ? ` · ${previewTags.join(" · ")}` : ""}
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="space-y-2 px-4 pb-4">
                {previewExs.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground/60">No exercises in this routine.</p>
                ) : (
                  previewExs.map((ex, i) => {
                    const sets = hubRoutineSetCount(ex)
                    const reps =
                      Array.isArray(ex.setRows) && ex.setRows[0]?.reps
                        ? String(ex.setRows[0].reps)
                        : ex.targetReps
                          ? String(ex.targetReps)
                          : null
                    const muscles = (ex.primaryMuscles ?? [])
                      .map((m) => m.name)
                      .filter(Boolean)
                      .slice(0, 3)
                    return (
                      <div
                        key={ex.id ?? `${ex.name}-${i}`}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                      >
                        <p className="text-sm font-semibold text-foreground/90">{ex.name}</p>
                        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground/60">
                          {sets} set{sets === 1 ? "" : "s"}
                          {reps ? ` · ${reps} reps` : ""}
                          {muscles.length > 0 ? ` · ${muscles.join(", ")}` : ""}
                        </p>
                        {ex.notes?.trim() ? (
                          <p className="mt-1 text-[11px] text-muted-foreground/55">{ex.notes}</p>
                        ) : null}
                      </div>
                    )
                  })
                )}
                <button
                  type="button"
                  disabled={startingId != null}
                  onClick={() => {
                    setPreviewId(null)
                    goStartRoutine(previewTmpl.id)
                  }}
                  className="mt-1 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#c4d632]/30 bg-[#c4d632]/[0.1] text-[12px] font-semibold text-[#e8f07a] transition-colors hover:bg-[#c4d632]/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4d632]/30 disabled:opacity-50 touch-manipulation"
                >
                  <Play className="size-3.5" aria-hidden />
                  Start this routine
                </button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
