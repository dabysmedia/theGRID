"use client"

import { useCallback, useId, useState } from "react"
import { format } from "date-fns"
import { useAxisLockedScrub } from "@/components/charts/useAxisLockedScrub"
import { cn } from "@/lib/utils"

export type SleepStageSegment = { type: string; startTime: string; endTime: string }

export type SleepStageMinutes = {
  remMinutes?: number | null
  lightMinutes?: number | null
  deepMinutes?: number | null
  awakeMinutes?: number | null
}

export type SleepStageKey = "AWAKE" | "REM" | "LIGHT" | "DEEP"
export type SleepTypicalRanges = Partial<Record<SleepStageKey, [number, number]>>
export type SleepHeartRateSample = { time: string; bpm: number }

export const STAGE_STYLE: Record<SleepStageKey, { label: string; color: string }> = {
  AWAKE: { label: "Awake", color: "#e2e8f0" },
  REM: { label: "REM", color: "#67e8f9" },
  LIGHT: { label: "Light", color: "#60a5fa" },
  DEEP: { label: "Deep", color: "#4f46e5" },
}

const STAGE_ORDER: SleepStageKey[] = ["AWAKE", "REM", "LIGHT", "DEEP"]
const STAGE_Y: Record<SleepStageKey, number> = {
  AWAKE: 17,
  REM: 46,
  LIGHT: 75,
  DEEP: 104,
}

function asStageKey(value: string): SleepStageKey | null {
  const key = value.toUpperCase()
  return STAGE_ORDER.includes(key as SleepStageKey) ? (key as SleepStageKey) : null
}

export function parseStages(json: string | null | undefined): SleepStageSegment[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function formatSleepMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safe / 60)
  const mins = safe % 60
  return hours > 0 ? `${hours}:${String(mins).padStart(2, "0")}` : `${mins}m`
}

/** Layered, stepped sleep-stage timeline using the exact Google stage segments. */
export function StageTimeline({
  stages,
  className,
}: {
  stages: SleepStageSegment[]
  className?: string
}) {
  const gradientId = useId().replace(/:/g, "")
  const [activeStageIndex, setActiveStageIndex] = useState<number | null>(null)
  const [scrubRatio, setScrubRatio] = useState<number | null>(null)
  const normalized = stages
    .map((stage) => ({
      ...stage,
      key: asStageKey(stage.type),
      start: new Date(stage.startTime).getTime(),
      end: new Date(stage.endTime).getTime(),
    }))
    .filter(
      (stage): stage is typeof stage & { key: SleepStageKey } =>
        stage.key != null && Number.isFinite(stage.start) && Number.isFinite(stage.end) && stage.end > stage.start,
    )
    .sort((a, b) => a.start - b.start)

  const start = normalized[0]?.start ?? 0
  const end = normalized[normalized.length - 1]?.end ?? 0
  const total = end - start

  const clearScrub = useCallback(() => {
    setActiveStageIndex(null)
    setScrubRatio(null)
  }, [])

  const applyScrub = useCallback(
    (ratio: number) => {
      if (!Number.isFinite(total) || total <= 0 || normalized.length === 0) return
      const time = start + ratio * total
      setScrubRatio(ratio)
      const index = normalized.findIndex((stage) => time >= stage.start && time <= stage.end)
      if (index >= 0) setActiveStageIndex(index)
    },
    [normalized, start, total],
  )

  const scrubHandlers = useAxisLockedScrub({
    onScrub: applyScrub,
    onClear: clearScrub,
  })

  if (normalized.length === 0) return null
  if (!Number.isFinite(total) || total <= 0) return null

  const xFor = (time: number) => ((time - start) / total) * 1000
  let trace = `M ${xFor(normalized[0].start)} ${STAGE_Y[normalized[0].key]}`
  normalized.forEach((stage, index) => {
    const x1 = xFor(stage.start)
    const x2 = xFor(stage.end)
    if (index > 0) trace += ` H ${x1} V ${STAGE_Y[stage.key]}`
    trace += ` H ${x2}`
  })
  const area = `${trace} V 121 H 0 Z`
  const activeStage = activeStageIndex != null ? normalized[activeStageIndex] : null
  const activeStageX =
    scrubRatio ??
    (activeStage ? ((activeStage.start + activeStage.end) / 2 - start) / total : 0)

  return (
    <div className={cn("chart-touch-safe select-none rounded-2xl border border-white/[0.07] bg-black/10 px-4 py-4 [-webkit-touch-callout:none] sm:px-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="type-hud-subsection">Sleep architecture</p>
          <p className="mt-0.5 type-hud-caption normal-case tracking-normal text-muted-foreground/55">
            Stage depth across the night
          </p>
        </div>
        <span className="type-hud-micro text-indigo-200/65">Layered timeline</span>
      </div>

      <div className="grid grid-cols-[3.25rem_1fr] gap-2.5">
        <div className="relative h-[190px] sm:h-[210px]">
          {STAGE_ORDER.map((key) => (
            <span
              key={key}
              className="absolute right-0 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55"
              style={{ top: `${(STAGE_Y[key] / 121) * 100}%` }}
            >
              {STAGE_STYLE[key].label}
            </span>
          ))}
        </div>

        <div className="relative min-w-0">
          {activeStage ? (
            <div
              className="pointer-events-none absolute top-1 z-30 min-w-[7.5rem] -translate-x-1/2 rounded-lg border border-white/10 bg-[#10151d]/95 px-2.5 py-2 text-center shadow-xl backdrop-blur-md"
              style={{ left: `${Math.max(13, Math.min(87, activeStageX * 100))}%` }}
            >
              <p className="type-hud-micro" style={{ color: STAGE_STYLE[activeStage.key].color }}>{STAGE_STYLE[activeStage.key].label}</p>
              <p className="mt-1 text-[11px] font-semibold tabular-nums text-foreground/90">
                {format(new Date(activeStage.start), "h:mm a")} – {format(new Date(activeStage.end), "h:mm a")}
              </p>
              <p className="mt-0.5 text-[9px] text-muted-foreground/50">
                {formatSleepMinutes((activeStage.end - activeStage.start) / 60000)}
              </p>
            </div>
          ) : null}
          <svg
            viewBox="0 0 1000 121"
            className="h-[190px] w-full cursor-crosshair overflow-visible sm:h-[210px]"
            role="img"
            aria-label="Layered sleep stages from bedtime to wake time"
            preserveAspectRatio="none"
            {...scrubHandlers}
            onContextMenu={(event) => event.preventDefault()}
          >
            <defs>
              <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#67e8f9" stopOpacity="0.24" />
                <stop offset="0.55" stopColor="#60a5fa" stopOpacity="0.14" />
                <stop offset="1" stopColor="#4f46e5" stopOpacity="0.04" />
              </linearGradient>
              <filter id={`${gradientId}-glow`} x="-20%" y="-80%" width="140%" height="260%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {STAGE_ORDER.map((key) => (
              <line
                key={key}
                x1="0"
                x2="1000"
                y1={STAGE_Y[key]}
                y2={STAGE_Y[key]}
                stroke="rgba(255,255,255,0.055)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <g className="sleep-timeline-draw">
              <path d={area} fill={`url(#${gradientId}-area)`} />
              <path
                d={trace}
                fill="none"
                stroke="#7dd3fc"
                strokeWidth="2"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                filter={`url(#${gradientId}-glow)`}
              />
              {normalized.map((stage, index) => {
                const x = xFor(stage.start)
                const width = Math.max(2, xFor(stage.end) - x)
                return (
                  <rect
                    key={`${stage.startTime}-${index}`}
                    x={x}
                    y={STAGE_Y[stage.key] - 6}
                    width={width}
                    height="12"
                    rx="3"
                    fill={STAGE_STYLE[stage.key].color}
                    opacity="0.86"
                  />
                )
              })}
            </g>
            {activeStage ? (
              <line
                x1={activeStageX * 1000}
                x2={activeStageX * 1000}
                y1="0"
                y2="121"
                stroke="rgba(255,255,255,0.55)"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/55">
            <span>{format(new Date(start), "h:mm a")}</span>
            <span>{format(new Date(start + total / 2), "h:mm a")}</span>
            <span>{format(new Date(end), "h:mm a")}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Personal-stage comparison cards with an interquartile typical-range marker. */
export function StageMinuteBars({
  entry,
  typicalRanges,
  className,
}: {
  entry: SleepStageMinutes
  typicalRanges?: SleepTypicalRanges
  className?: string
}) {
  const rows: Array<{ key: SleepStageKey; minutes: number }> = [
    { key: "AWAKE", minutes: entry.awakeMinutes ?? 0 },
    { key: "LIGHT", minutes: entry.lightMinutes ?? 0 },
    { key: "DEEP", minutes: entry.deepMinutes ?? 0 },
    { key: "REM", minutes: entry.remMinutes ?? 0 },
  ]
  const total = rows.reduce((sum, row) => sum + row.minutes, 0)
  if (total <= 0) return null

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {rows.map((row, index) => {
        const style = STAGE_STYLE[row.key]
        const pct = (row.minutes / total) * 100
        const typical = typicalRanges?.[row.key]
        return (
          <div
            key={row.key}
            className="sleep-focus-reveal rounded-2xl border border-white/[0.075] bg-white/[0.03] p-4"
            style={{ animationDelay: `${260 + index * 90}ms` }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex min-w-0 items-baseline gap-2">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-foreground/85">{style.label}</p>
                <span className="text-sm font-semibold tabular-nums" style={{ color: style.color }}>
                  {Math.round(pct)}%
                </span>
              </div>
              <span className="text-lg font-semibold tabular-nums text-foreground/90">
                {formatSleepMinutes(row.minutes)}
              </span>
            </div>
            <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-white/[0.065] ring-1 ring-inset ring-white/[0.035]">
              {typical ? (
                <span
                  className="absolute inset-y-0 z-20 border-x-2 border-dashed border-white/70 bg-white/[0.13] shadow-[0_0_12px_rgba(255,255,255,0.08)]"
                  style={{ left: `${typical[0]}%`, width: `${Math.max(2, typical[1] - typical[0])}%` }}
                  title={`Typical ${Math.round(typical[0])}–${Math.round(typical[1])}%`}
                />
              ) : null}
              <span
                className="sleep-stage-bar-fill absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${Math.max(2, pct)}%`, backgroundColor: style.color, animationDelay: `${380 + index * 90}ms` }}
              />
            </div>
            <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/55">
              {typical ? `Your typical range ${Math.round(typical[0])}–${Math.round(typical[1])}%` : "Building your personal range"}
            </p>
          </div>
        )
      })}
    </div>
  )
}

/** Heart-rate trace clipped to the sleep interval. */
export function SleepHeartRateChart({
  samples,
  bedtime,
  wakeTime,
  className,
}: {
  samples: SleepHeartRateSample[]
  bedtime: string
  wakeTime: string
  className?: string
}) {
  const gradientId = useId().replace(/:/g, "")
  const [scrubRatio, setScrubRatio] = useState<number | null>(null)
  const start = new Date(bedtime).getTime()
  const end = new Date(wakeTime).getTime()
  const points = samples
    .map((sample) => ({ time: new Date(sample.time).getTime(), bpm: Number(sample.bpm) }))
    .filter((sample) => Number.isFinite(sample.time) && Number.isFinite(sample.bpm) && sample.time >= start && sample.time <= end)
    .sort((a, b) => a.time - b.time)

  const clearScrub = useCallback(() => setScrubRatio(null), [])
  const scrubHandlers = useAxisLockedScrub({
    onScrub: setScrubRatio,
    onClear: clearScrub,
  })

  if (points.length < 2 || end <= start) return null
  const bpms = points.map((point) => point.bpm)
  const low = Math.max(30, Math.floor(Math.min(...bpms) / 5) * 5 - 5)
  const high = Math.ceil(Math.max(...bpms) / 5) * 5 + 5
  const span = Math.max(10, high - low)
  const xFor = (time: number) => ((time - start) / (end - start)) * 1000
  const yFor = (bpm: number) => 188 - ((bpm - low) / span) * 158
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(point.time)} ${yFor(point.bpm)}`).join(" ")
  const area = `${line} L ${xFor(points[points.length - 1].time)} 188 L ${xFor(points[0].time)} 188 Z`
  const avg = Math.round(bpms.reduce((sum, value) => sum + value, 0) / bpms.length)
  const activePoint = (() => {
    if (scrubRatio == null) return null
    const targetTime = start + scrubRatio * (end - start)
    if (targetTime <= points[0].time) {
      return { time: targetTime, bpm: points[0].bpm }
    }
    if (targetTime >= points[points.length - 1].time) {
      return { time: targetTime, bpm: points[points.length - 1].bpm }
    }

    const rightIndex = points.findIndex((point) => point.time >= targetTime)
    const left = points[Math.max(0, rightIndex - 1)]
    const right = points[Math.max(0, rightIndex)]
    const ratio = (targetTime - left.time) / Math.max(1, right.time - left.time)
    return {
      time: targetTime,
      bpm: left.bpm + (right.bpm - left.bpm) * ratio,
    }
  })()

  return (
    <div className={cn("chart-touch-safe sleep-focus-reveal rounded-2xl border border-white/[0.07] bg-black/10 p-4 sm:p-5", className)} style={{ animationDelay: "120ms" }}>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <p className="type-hud-subsection">Heart rate during sleep</p>
          <p className="mt-0.5 type-hud-caption normal-case tracking-normal text-muted-foreground/55">
            Google Health · {points.length} samples
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums text-sky-100/90">{avg}</p>
          <p className="type-hud-micro text-muted-foreground/45">avg bpm</p>
        </div>
      </div>
      <div className="grid grid-cols-[2.5rem_1fr] gap-2.5">
        <div className="relative h-[230px] sm:h-[260px]">
          {[high, low + span / 2, low].map((value) => (
            <span
              key={value}
              className="absolute right-0 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55"
              style={{ top: `${(yFor(value) / 210) * 100}%` }}
            >
              {Math.round(value)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 select-none [-webkit-touch-callout:none]">
          {activePoint ? (
            <div
              className="pointer-events-none absolute top-1 z-30 min-w-[6.5rem] -translate-x-1/2 rounded-lg border border-sky-200/15 bg-[#10151d]/95 px-2.5 py-2 text-center shadow-xl backdrop-blur-md"
              style={{ left: `${Math.max(12, Math.min(88, (scrubRatio ?? 0) * 100))}%` }}
            >
              <p className="text-lg font-semibold tabular-nums text-sky-100">{Math.round(activePoint.bpm)}</p>
              <p className="type-hud-micro text-sky-200/60">bpm</p>
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/55">
                {format(new Date(activePoint.time), "h:mm a")}
              </p>
            </div>
          ) : null}
          <svg
            viewBox="0 0 1000 210"
            className="h-[230px] w-full cursor-crosshair overflow-visible sm:h-[260px]"
            role="img"
            aria-label={`Sleep heart rate averaged ${avg} beats per minute`}
            preserveAspectRatio="none"
            {...scrubHandlers}
            onContextMenu={(event) => event.preventDefault()}
          >
            <defs>
              <linearGradient id={`${gradientId}-hr`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#7dd3fc" stopOpacity="0.28" />
                <stop offset="1" stopColor="#7dd3fc" stopOpacity="0" />
              </linearGradient>
              <filter id={`${gradientId}-hr-glow`} x="-10%" y="-30%" width="120%" height="160%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {[low, low + span / 2, high].map((value) => (
              <line key={value} x1="0" x2="1000" y1={yFor(value)} y2={yFor(value)} stroke="rgba(255,255,255,0.055)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            <path className="sleep-chart-area" d={area} fill={`url(#${gradientId}-hr)`} />
            <path className="sleep-trace-draw" d={line} pathLength="1" fill="none" stroke="#93c5fd" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" filter={`url(#${gradientId}-hr-glow)`} />
            <line x1="0" x2="0" y1="20" y2="194" stroke="rgba(255,255,255,0.28)" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
            <line x1="1000" x2="1000" y1="20" y2="194" stroke="rgba(255,255,255,0.28)" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
            {activePoint ? (
              <g>
                <line x1={(scrubRatio ?? 0) * 1000} x2={(scrubRatio ?? 0) * 1000} y1="18" y2="194" stroke="rgba(255,255,255,0.55)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                <circle cx={xFor(activePoint.time)} cy={yFor(activePoint.bpm)} r="5" fill="#bae6fd" stroke="#0f172a" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </g>
            ) : null}
          </svg>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/55">
        <span>{format(new Date(start), "h:mm a")}</span>
        <span>{Math.min(...bpms)}–{Math.max(...bpms)} bpm range</span>
        <span>{format(new Date(end), "h:mm a")}</span>
      </div>
    </div>
  )
}
