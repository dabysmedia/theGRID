"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Activity, Bed, Gauge, Moon, Plus, Sparkles, TimerReset } from "lucide-react"
import {
  SleepHeartRateChart,
  StageMinuteBars,
  StageTimeline,
  formatSleepMinutes,
  parseStages,
  type SleepHeartRateSample,
  type SleepStageKey,
  type SleepTypicalRanges,
} from "@/components/sleep/SleepStageViews"
import { useActiveDate } from "@/context/DateContext"
import { useQuickLog } from "@/context/QuickLogContext"
import { apiFetch } from "@/lib/api-fetch"
import { displaySleepScore, qualityToScore } from "@/lib/sleep-score"
import { sleepDurationHours } from "@/lib/sleepDuration"
import { cn, formatDate } from "@/lib/utils"

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
  minutesAsleep: number | null
  minutesInSleepPeriod: number | null
  minutesToFallAsleep: number | null
  minutesAfterWakeUp: number | null
  restlessMinutes: number | null
  interruptionCount: number | null
  efficiency: number | null
  stagesJson: string | null
  source: string | null
}

type VitalsResponse = {
  restingHeartRate: number | null
  samples: SleepHeartRateSample[]
}

function percentile(values: number[], ratio: number): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const index = (sorted.length - 1) * ratio
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

function personalRange(values: number[]): [number, number] | null {
  if (values.length < 2) return null
  const low = percentile(values, 0.25)
  const high = percentile(values, 0.75)
  return low == null || high == null ? null : [low, high]
}

function stageShares(entry: SleepEntryRow): Record<SleepStageKey, number> | null {
  const values: Record<SleepStageKey, number> = {
    AWAKE: entry.awakeMinutes ?? 0,
    REM: entry.remMinutes ?? 0,
    LIGHT: entry.lightMinutes ?? 0,
    DEEP: entry.deepMinutes ?? 0,
  }
  const total = Object.values(values).reduce((sum, value) => sum + value, 0)
  if (total <= 0) return null
  return {
    AWAKE: (values.AWAKE / total) * 100,
    REM: (values.REM / total) * 100,
    LIGHT: (values.LIGHT / total) * 100,
    DEEP: (values.DEEP / total) * 100,
  }
}

function sleepEntryCompleteness(entry: SleepEntryRow): number {
  const stageMinutes =
    (entry.awakeMinutes ?? 0) +
    (entry.remMinutes ?? 0) +
    (entry.lightMinutes ?? 0) +
    (entry.deepMinutes ?? 0)
  return (
    (parseStages(entry.stagesJson).length > 0 ? 1000 : 0) +
    (stageMinutes > 0 ? 500 : 0) +
    (entry.minutesAsleep != null || entry.minutesToFallAsleep != null ? 300 : 0) +
    (entry.efficiency != null ? 100 : 0) +
    (entry.source === "google-health" ? 50 : 0)
  )
}

function resolvedMinutesAsleep(entry: SleepEntryRow): number | null {
  if (entry.minutesAsleep != null) return entry.minutesAsleep
  const stageTotal =
    (entry.remMinutes ?? 0) + (entry.lightMinutes ?? 0) + (entry.deepMinutes ?? 0)
  return stageTotal > 0 ? stageTotal : null
}

function formatRange(range: [number, number] | null, suffix = ""): string {
  return range ? `${Math.round(range[0])}–${Math.round(range[1])}${suffix}` : "Building range"
}

function formatMinuteRange(range: [number, number] | null): string {
  return range
    ? `${formatSleepMinutes(range[0])}–${formatSleepMinutes(range[1])}`
    : "Personal range forming"
}

function MetricCard({
  label,
  value,
  unit,
  detail,
  icon,
  delay,
  accent = "#a5b4fc",
}: {
  label: string
  value: string
  unit?: string
  detail: string
  icon: React.ReactNode
  delay: number
  accent?: string
}) {
  return (
    <div
      className="sleep-focus-reveal min-w-0 rounded-xl border border-white/[0.065] bg-white/[0.025] p-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2 text-muted-foreground/55">
        <span style={{ color: accent }}>{icon}</span>
        <p className="type-hud-micro truncate">{label}</p>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[1.65rem] font-semibold tabular-nums tracking-tight text-foreground/90">{value}</span>
        {unit ? <span className="type-hud-caption-tight text-muted-foreground/50">{unit}</span> : null}
      </div>
      <p className="mt-1 min-h-7 text-[11px] leading-relaxed text-muted-foreground/52">{detail}</p>
    </div>
  )
}

export function HubSleepFocus({
  hours,
  goal,
  last7,
  dayLabels,
}: {
  hours: number
  goal: number
  last7: number[]
  dayLabels: string[]
}) {
  const { activeDate } = useActiveDate()
  const { openQuickLog } = useQuickLog()
  const [entry, setEntry] = useState<SleepEntryRow | null>(null)
  const [history, setHistory] = useState<SleepEntryRow[]>([])
  const [heartSamples, setHeartSamples] = useState<SleepHeartRateSample[]>([])
  const [restingHeartRate, setRestingHeartRate] = useState<number | null>(null)
  const [status, setStatus] = useState<"loading" | "ready">("loading")

  useEffect(() => {
    let cancelled = false
    setStatus("loading")

    void (async () => {
      try {
        const sleepResponse = await apiFetch(`/api/sleep?date=${activeDate}&days=30`)
        if (!sleepResponse.ok || cancelled) return
        const rows = (await sleepResponse.json()) as SleepEntryRow[]
        if (cancelled) return

        const allRows = Array.isArray(rows) ? rows : []
        const sameDay = allRows.filter((row) => row.date.slice(0, 10) === activeDate)
        const current =
          sameDay.sort((a, b) => sleepEntryCompleteness(b) - sleepEntryCompleteness(a))[0] ??
          allRows[0] ??
          null
        setEntry(current)
        const historyByDay = new Map<string, SleepEntryRow>()
        for (const row of allRows) {
          const day = row.date.slice(0, 10)
          if (day === activeDate) continue
          const existing = historyByDay.get(day)
          if (!existing || sleepEntryCompleteness(row) > sleepEntryCompleteness(existing)) {
            historyByDay.set(day, row)
          }
        }
        setHistory(Array.from(historyByDay.values()))

        if (current) {
          const bedtimeDay = formatDate(new Date(current.bedtime))
          const vitalDays = Array.from(new Set([bedtimeDay, activeDate]))
          const responses = await Promise.all(
            vitalDays.map((date) => apiFetch(`/api/vitals?date=${date}`)),
          )
          if (cancelled) return
          const payloads = await Promise.all(
            responses.map(async (response) =>
              response.ok
                ? ((await response.json()) as VitalsResponse)
                : ({ restingHeartRate: null, samples: [] } as VitalsResponse),
            ),
          )
          const samples = payloads
            .flatMap((payload) => payload.samples ?? [])
            .filter((sample, index, list) => list.findIndex((item) => item.time === sample.time) === index)
          setHeartSamples(samples)
          setRestingHeartRate(payloads.find((payload) => payload.restingHeartRate != null)?.restingHeartRate ?? null)
        } else {
          setHeartSamples([])
          setRestingHeartRate(null)
        }
      } catch {
        if (!cancelled) {
          setEntry(null)
          setHistory([])
          setHeartSamples([])
          setRestingHeartRate(null)
        }
      } finally {
        if (!cancelled) setStatus("ready")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeDate])

  const stages = useMemo(() => (entry ? parseStages(entry.stagesJson) : []), [entry])
  const stageRange = useMemo<SleepTypicalRanges>(() => {
    const shares = history.map(stageShares).filter((value): value is Record<SleepStageKey, number> => value != null)
    const ranges: SleepTypicalRanges = {}
    ;(["AWAKE", "REM", "LIGHT", "DEEP"] as SleepStageKey[]).forEach((key) => {
      const range = personalRange(shares.map((share) => share[key]))
      if (range) ranges[key] = range
    })
    return ranges
  }, [history])

  const durationRange = useMemo(
    () => personalRange(history.map((row) => sleepDurationHours(row.bedtime, row.wakeTime))),
    [history],
  )
  const efficiencyRange = useMemo(
    () => personalRange(history.map((row) => row.efficiency ?? 0).filter((value) => value > 0)),
    [history],
  )
  const soundSleepRange = useMemo(
    () => personalRange(history.map(resolvedMinutesAsleep).filter((value): value is number => value != null)),
    [history],
  )
  const latencyRange = useMemo(
    () => personalRange(history.map((row) => row.minutesToFallAsleep).filter((value): value is number => value != null)),
    [history],
  )
  const restlessnessRange = useMemo(
    () => personalRange(history.map((row) => row.restlessMinutes).filter((value): value is number => value != null)),
    [history],
  )
  const interruptionRange = useMemo(
    () => personalRange(history.map((row) => row.interruptionCount).filter((value): value is number => value != null)),
    [history],
  )

  const duration = entry ? sleepDurationHours(entry.bedtime, entry.wakeTime) : hours
  const score = entry ? entry.score ?? qualityToScore(entry.quality) : null
  const efficiency = entry?.efficiency ?? null
  const hasStageMinutes =
    entry != null &&
    (entry.remMinutes ?? 0) + (entry.lightMinutes ?? 0) + (entry.deepMinutes ?? 0) + (entry.awakeMinutes ?? 0) > 0
  const wakeEvents = stages.filter((stage, index) => {
    if (stage.type.toUpperCase() !== "AWAKE") return false
    return index === 0 || stages[index - 1]?.type.toUpperCase() !== "AWAKE"
  }).length
  const wakeEventsPerHour = duration > 0 ? wakeEvents / duration : 0
  const firstSoundSleep = stages.find((stage) => {
    const type = stage.type.toUpperCase()
    return type !== "AWAKE" && type !== "RESTLESS" && type !== "OUT_OF_BED"
  })
  const derivedLatency =
    entry && firstSoundSleep
      ? Math.max(0, Math.round((new Date(firstSoundSleep.startTime).getTime() - new Date(entry.bedtime).getTime()) / 60000))
      : null
  const timeToSoundSleep = entry?.minutesToFallAsleep ?? derivedLatency
  const soundSleepMinutes = entry ? resolvedMinutesAsleep(entry) : null
  const restlessnessMinutes = entry?.restlessMinutes ?? null
  const interruptions = entry?.interruptionCount ?? (stages.length > 0 ? wakeEvents : null)

  const sleepHeartSamples = useMemo(() => {
    if (!entry) return []
    const start = new Date(entry.bedtime).getTime()
    const end = new Date(entry.wakeTime).getTime()
    return heartSamples.filter((sample) => {
      const time = new Date(sample.time).getTime()
      return time >= start && time <= end
    })
  }, [entry, heartSamples])
  const averageSleepHeartRate = sleepHeartSamples.length
    ? Math.round(sleepHeartSamples.reduce((sum, sample) => sum + sample.bpm, 0) / sleepHeartSamples.length)
    : null

  if (status === "loading") {
    return (
      <div className="space-y-3 px-0.5">
        <div className="h-24 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]" />
        <div className="h-52 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]" />
        <div className="h-44 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]" />
      </div>
    )
  }

  return (
    <div className="space-y-4 px-0.5">
      <section className="sleep-focus-reveal rounded-2xl border border-indigo-300/[0.09] bg-gradient-to-br from-indigo-400/[0.055] via-white/[0.02] to-cyan-300/[0.025] p-3 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Moon className="h-4 w-4 text-indigo-300" aria-hidden />
              <p className="type-hud-subsection">Last sleep</p>
            </div>
            <p className="mt-2 text-xl font-semibold tracking-tight text-foreground/90 sm:text-2xl">
              {entry ? `${format(new Date(entry.bedtime), "h:mm a")} – ${format(new Date(entry.wakeTime), "h:mm a")}` : "No sleep logged"}
            </p>
            <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/55">
              {duration > 0 ? `${duration.toFixed(1)} hours · ${goal}h goal` : `${goal}h goal`}
            </p>
          </div>
          <div className="flex items-end gap-5 text-right">
            <div>
              <p className="type-hud-micro">Duration</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-indigo-100/90">{duration > 0 ? `${duration.toFixed(1)}h` : "—"}</p>
              <p className="mt-0.5 text-[9px] text-muted-foreground/40">{durationRange ? `Typical ${formatRange(durationRange, "h")}` : "Personal range forming"}</p>
            </div>
            <div>
              <p className="type-hud-micro">Score</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-indigo-100/90">{score != null ? displaySleepScore(score) : "—"}</p>
              <p className="mt-0.5 text-[9px] text-muted-foreground/40">{entry?.source === "google-health" ? "Google-derived" : "Logged score"}</p>
            </div>
          </div>
        </div>
      </section>

      {entry && sleepHeartSamples.length > 1 ? (
        <SleepHeartRateChart samples={sleepHeartSamples} bedtime={entry.bedtime} wakeTime={entry.wakeTime} />
      ) : (
        <div className="sleep-focus-reveal rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-5" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center gap-2 text-muted-foreground/70">
            <Activity className="h-4 w-4 text-sky-300/70" aria-hidden />
            <p className="type-hud-subsection">Heart rate during sleep</p>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground/50">No Google heart-rate samples landed inside this sleep window.</p>
        </div>
      )}

      {stages.length > 0 ? (
        <div className="sleep-focus-reveal" style={{ animationDelay: "200ms" }}>
          <StageTimeline stages={stages} />
        </div>
      ) : null}

      {entry && hasStageMinutes ? (
        <section className="space-y-2.5">
          <div className="sleep-focus-reveal flex items-center justify-between gap-3" style={{ animationDelay: "240ms" }}>
            <div>
              <p className="type-hud-subsection">Stage balance</p>
              <p className="mt-0.5 type-hud-caption normal-case tracking-normal text-muted-foreground/50">Dashed bands show your personal middle 50% across the last 30 nights</p>
            </div>
            <span className="type-hud-micro text-indigo-200/60">Your typical range</span>
          </div>
          <StageMinuteBars entry={entry} typicalRanges={stageRange} />
        </section>
      ) : stages.length === 0 ? (
        <div className="sleep-focus-reveal rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-4" style={{ animationDelay: "220ms" }}>
          <div className="flex items-center gap-2 text-muted-foreground/80">
            <Moon className="h-4 w-4 text-[#6366f1]" aria-hidden />
            <p className="type-hud-caption normal-case tracking-normal">No stage breakdown for this night yet.</p>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground/55">Sync Fitbit / Google Health for deep, light, REM, and awake timelines.</p>
        </div>
      ) : null}

      <section className="space-y-2.5">
        <div className="sleep-focus-reveal flex items-center justify-between gap-3" style={{ animationDelay: "500ms" }}>
          <div>
            <p className="type-hud-subsection">Sleep quality</p>
            <p className="mt-0.5 type-hud-caption normal-case tracking-normal text-muted-foreground/50">
              Google summary values when available
            </p>
          </div>
          <p className="type-hud-micro text-muted-foreground/45">Your 30-night range</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Time to sound sleep"
            value={timeToSoundSleep?.toString() ?? "—"}
            unit={timeToSoundSleep != null ? "min" : undefined}
            detail={timeToSoundSleep != null ? `${entry?.minutesToFallAsleep != null ? "Google" : "From first sleep stage"} · ${formatMinuteRange(latencyRange)}` : "Not reported for this night"}
            icon={<TimerReset className="h-4 w-4" />}
            delay={560}
            accent="#a5b4fc"
          />
          <MetricCard
            label="Sound sleep"
            value={soundSleepMinutes != null ? formatSleepMinutes(soundSleepMinutes) : "—"}
            detail={soundSleepMinutes != null ? `${entry?.minutesAsleep != null ? "Google minutes asleep" : "Light + REM + deep"} · ${formatMinuteRange(soundSleepRange)}` : "Not reported for this night"}
            icon={<Bed className="h-4 w-4" />}
            delay={640}
            accent="#818cf8"
          />
          <MetricCard
            label="Restlessness"
            value={restlessnessMinutes?.toString() ?? "—"}
            unit={restlessnessMinutes != null ? "min" : undefined}
            detail={restlessnessMinutes != null ? `Google classic sleep · ${formatMinuteRange(restlessnessRange)}` : "Google reports this for classic sleep"}
            icon={<Sparkles className="h-4 w-4" />}
            delay={720}
            accent="#67e8f9"
          />
          <MetricCard
            label="Interruptions"
            value={interruptions?.toString() ?? "—"}
            detail={interruptions != null ? `${entry?.interruptionCount != null ? "Google awake segments" : "From awake transitions"}${interruptionRange ? ` · typical ${formatRange(interruptionRange)}` : ""}` : "No stage summary"}
            icon={<Activity className="h-4 w-4" />}
            delay={800}
            accent="#e2e8f0"
          />
        </div>
      </section>

      <section className="space-y-2.5">
        <div className="sleep-focus-reveal flex items-center justify-between" style={{ animationDelay: "860ms" }}>
          <p className="type-hud-subsection">Sleep metrics</p>
          <p className="type-hud-micro text-muted-foreground/45">vs. personal range</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Efficiency" value={efficiency != null ? Math.round(efficiency).toString() : "—"} unit={efficiency != null ? "%" : undefined} detail={efficiencyRange ? `Your typical ${formatRange(efficiencyRange, "%")}` : "Time asleep ÷ time in bed"} icon={<Gauge className="h-4 w-4" />} delay={920} accent="#a5b4fc" />
          <MetricCard label="Wake events" value={stages.length > 0 ? wakeEventsPerHour.toFixed(1) : "—"} unit={stages.length > 0 ? "/ hr" : undefined} detail={stages.length > 0 ? `${wakeEvents} transitions awake` : "Needs stage timeline"} icon={<Sparkles className="h-4 w-4" />} delay={1000} accent="#e2e8f0" />
          <MetricCard label="Sleep HR" value={averageSleepHeartRate?.toString() ?? "—"} unit={averageSleepHeartRate != null ? "bpm" : undefined} detail={sleepHeartSamples.length > 0 ? `${Math.min(...sleepHeartSamples.map((sample) => sample.bpm))}–${Math.max(...sleepHeartSamples.map((sample) => sample.bpm))} bpm overnight` : "No samples in window"} icon={<Activity className="h-4 w-4" />} delay={1080} accent="#7dd3fc" />
          <MetricCard label="Resting HR" value={restingHeartRate?.toString() ?? "—"} unit={restingHeartRate != null ? "bpm" : undefined} detail="Google daily resting value" icon={<Activity className="h-4 w-4" />} delay={1160} accent="#67e8f9" />
        </div>
      </section>

      <section className="sleep-focus-reveal rounded-2xl border border-white/[0.06] bg-white/[0.018] p-3 sm:p-4" style={{ animationDelay: "700ms" }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="type-hud-subsection">Last 7 nights</p>
            <p className="mt-0.5 type-hud-caption normal-case tracking-normal text-muted-foreground/45">Duration against your {goal}h goal</p>
          </div>
          <button type="button" onClick={() => openQuickLog("sleep")} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 type-hud-micro text-muted-foreground/90 transition-colors hover:border-indigo-400/30 hover:bg-indigo-400/[0.06] hover:text-indigo-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/30">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Log sleep
          </button>
        </div>
        <div className="relative flex h-24 items-end justify-between gap-2 border-b border-white/[0.07] px-1 pb-5">
          <span className="pointer-events-none absolute inset-x-0 border-t border-dashed border-indigo-300/20" style={{ bottom: `${20 + (goal / Math.max(...last7, goal, 1)) * 76}px` }} />
          {last7.map((value, index) => {
            const max = Math.max(...last7, goal, 1)
            const height = Math.max(5, Math.round((value / max) * 70))
            const isToday = index === last7.length - 1
            return (
              <div key={index} className="relative flex h-full min-w-0 flex-1 items-end justify-center">
                <div className="sleep-night-bar w-[62%] max-w-8 rounded-t-sm" style={{ height, background: isToday ? "linear-gradient(180deg,#818cf8,#4338ca)" : "linear-gradient(180deg,#6366f199,#312e8166)", animationDelay: `${760 + index * 70}ms` }} />
                <span className={cn("absolute -bottom-4 text-[9px] tracking-wider", isToday ? "font-semibold text-indigo-300" : "text-muted-foreground/40")}>{dayLabels[index] ?? ""}</span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
