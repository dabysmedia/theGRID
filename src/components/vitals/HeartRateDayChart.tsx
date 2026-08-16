"use client"

import { useCallback, useId, useMemo, useState } from "react"
import { format } from "date-fns"
import { useAxisLockedScrub } from "@/components/charts/useAxisLockedScrub"
import {
  hourlyValueRanges,
  interpolateSeries,
  ratioToTime,
  type ScrubPoint,
} from "@/lib/chart-scrub"
import {
  plottableZoneBands,
  zoneForBpm,
  type HeartRateZoneThreshold,
} from "@/lib/heart-rate-zones"

const HR_COLOR = "#fb7185"
const PLOT_LEFT = 6
const PLOT_RIGHT = 994
const PLOT_TOP = 16
const PLOT_BOTTOM = 176
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP

function yFor(value: number, min: number, max: number): number {
  const span = Math.max(1, max - min)
  return PLOT_BOTTOM - ((value - min) / span) * PLOT_HEIGHT
}

function xFor(t: number, start: number, end: number): number {
  const span = Math.max(1, end - start)
  return PLOT_LEFT + ((t - start) / span) * PLOT_WIDTH
}

function signed(value: number): string {
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`
}

export function HeartRateDayChart({
  samples,
  restingHeartRate,
  hrAvg,
  hrMin,
  hrMax,
  thresholds,
  status,
}: {
  samples: Array<{ time: string; bpm: number }>
  restingHeartRate: number | null
  hrAvg: number | null
  hrMin: number | null
  hrMax: number | null
  thresholds?: HeartRateZoneThreshold[] | null
  status: "loading" | "ready" | "error"
}) {
  const gradientId = useId().replace(/:/g, "")
  const [scrubRatio, setScrubRatio] = useState<number | null>(null)
  const clearScrub = useCallback(() => setScrubRatio(null), [])
  const scrubHandlers = useAxisLockedScrub({
    onScrub: setScrubRatio,
    onClear: clearScrub,
  })

  const points = useMemo<ScrubPoint[]>(
    () =>
      samples
        .map((sample) => ({ t: new Date(sample.time).getTime(), v: sample.bpm }))
        .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
        .sort((a, b) => a.t - b.t),
    [samples],
  )

  const start = points[0]?.t ?? 0
  const end = points[points.length - 1]?.t ?? 0
  const values = points.map((point) => point.v)
  const min = hrMin ?? (values.length ? Math.min(...values) : 50)
  const max = hrMax ?? (values.length ? Math.max(...values) : 120)
  const yMin = Math.max(30, Math.floor((min - 8) / 5) * 5)
  const yMax = Math.ceil((max + 8) / 5) * 5
  const average =
    hrAvg ??
    (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null)
  const latest = points[points.length - 1] ?? null
  const hourly = useMemo(() => hourlyValueRanges(points), [points])
  const bands = useMemo(
    () => plottableZoneBands(thresholds, restingHeartRate, yMin, yMax),
    [thresholds, restingHeartRate, yMin, yMax],
  )

  const active = useMemo(() => {
    if (points.length === 0) return null
    if (scrubRatio == null) {
      return latest
        ? { t: latest.t, v: latest.v }
        : null
    }
    return interpolateSeries(points, ratioToTime(start, end, scrubRatio))
  }, [latest, points, scrubRatio, start, end])

  const zone = active ? zoneForBpm(active.v, thresholds, restingHeartRate) : null
  const vsRest =
    active && restingHeartRate != null ? active.v - restingHeartRate : null
  const vsAvg = active && average != null ? active.v - average : null
  const isScrubbing = scrubRatio != null
  const line = points
    .map((point, index) => {
      const cmd = index === 0 ? "M" : "L"
      return `${cmd}${xFor(point.t, start, end).toFixed(1)},${yFor(point.v, yMin, yMax).toFixed(1)}`
    })
    .join(" ")
  const area = line
    ? `${line} L ${xFor(end, start, end).toFixed(1)},${PLOT_BOTTOM} L ${xFor(start, start, end).toFixed(1)},${PLOT_BOTTOM} Z`
    : ""
  const ticks = useMemo(() => {
    if (points.length < 2) return []
    return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const t = ratioToTime(start, end, ratio)
      return { t, label: format(new Date(t), "h a").toLowerCase() }
    })
  }, [end, points.length, start])

  return (
    <section
      aria-labelledby="heart-rate-today-heading"
      className="space-y-3 rounded-2xl border border-[#f43f5e]/15 bg-gradient-to-br from-[#f43f5e]/[0.07] via-white/[0.02] to-transparent p-3.5 sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id="heart-rate-today-heading" className="text-sm font-semibold text-foreground/95">
            Heart rate
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/65">
            Day strip with hourly range and live zone as you scrub
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[#f43f5e]/20 bg-[#f43f5e]/[0.08] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#fda4af]/80">
          {points.length > 0 ? `${points.length} samples` : "Day"}
        </span>
      </div>

      <div
        className="rounded-2xl border border-white/[0.08] bg-black/25 px-3.5 py-3"
        aria-live="polite"
      >
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
              {isScrubbing && active
                ? format(new Date(active.t), "h:mm a")
                : "Latest"}
            </p>
            <p className="mt-1 font-heading text-4xl leading-none tabular-nums tracking-tight text-rose-100">
              {active ? Math.round(active.v) : "—"}
              <span className="ml-1 text-[11px] font-medium text-muted-foreground/55">bpm</span>
            </p>
          </div>
          <div className="text-right">
            {zone ? (
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: zone.color }}
              >
                {zone.label}
              </p>
            ) : (
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
                —
              </p>
            )}
            <p className="mt-1 text-[11px] tabular-nums text-muted-foreground/65">
              {vsRest != null
                ? `${signed(vsRest)} vs rest`
                : min != null && max != null
                  ? `${Math.round(min)}–${Math.round(max)} range`
                  : "No samples"}
            </p>
            {vsAvg != null ? (
              <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground/50">
                {signed(vsAvg)} vs day avg
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {status === "loading" ? (
        <div className="grid h-64 place-items-center rounded-xl border border-dashed border-white/[0.08] bg-black/10 text-[12px] text-muted-foreground/55">
          Loading heart-rate samples…
        </div>
      ) : status === "error" ? (
        <p className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-4 text-center text-[12px] text-muted-foreground/65">
          Couldn&apos;t load today&apos;s heart rate.
        </p>
      ) : points.length < 2 ? (
        <p className="rounded-xl border border-dashed border-white/[0.08] bg-black/10 px-3 py-5 text-center text-[12px] leading-relaxed text-muted-foreground/65">
          Heart-rate samples will appear here after Google Health imports the day.
        </p>
      ) : (
        <div className="chart-touch-safe select-none [-webkit-touch-callout:none]">
          <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#07090d]">
            <svg
              viewBox="0 0 1000 200"
              className="h-64 w-full cursor-crosshair overflow-visible"
              role="img"
              aria-label="Heart rate across the tracking day. Drag horizontally to inspect time, bpm, and zone."
              preserveAspectRatio="none"
              {...scrubHandlers}
              onContextMenu={(event) => event.preventDefault()}
            >
              <defs>
                <linearGradient id={`${gradientId}-hr`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={HR_COLOR} stopOpacity="0.28" />
                  <stop offset="70%" stopColor={HR_COLOR} stopOpacity="0.06" />
                  <stop offset="100%" stopColor={HR_COLOR} stopOpacity="0" />
                </linearGradient>
                <filter id={`${gradientId}-glow`} x="-6%" y="-30%" width="112%" height="160%">
                  <feGaussianBlur stdDeviation="2.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {bands.map((band) => (
                <rect
                  key={band.key}
                  x={PLOT_LEFT}
                  y={yFor(band.to, yMin, yMax)}
                  width={PLOT_WIDTH}
                  height={Math.max(1, yFor(band.from, yMin, yMax) - yFor(band.to, yMin, yMax))}
                  fill={band.color}
                  opacity="0.07"
                />
              ))}

              {hourly.map((hour) => {
                const x = xFor(hour.start + 30 * 60 * 1000, start, end)
                const width = Math.max(6, PLOT_WIDTH / Math.max(8, hourly.length) * 0.42)
                const top = yFor(hour.max, yMin, yMax)
                const bottom = yFor(hour.min, yMin, yMax)
                return (
                  <rect
                    key={hour.start}
                    x={x - width / 2}
                    y={top}
                    width={width}
                    height={Math.max(3, bottom - top)}
                    rx="2"
                    fill="rgba(255,255,255,0.08)"
                  />
                )
              })}

              {restingHeartRate != null ? (
                <line
                  x1={PLOT_LEFT}
                  x2={PLOT_RIGHT}
                  y1={yFor(restingHeartRate, yMin, yMax)}
                  y2={yFor(restingHeartRate, yMin, yMax)}
                  stroke="rgba(255,255,255,0.28)"
                  strokeDasharray="4 5"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}

              {area ? <path d={area} fill={`url(#${gradientId}-hr)`} /> : null}
              {line ? (
                <path
                  d={line}
                  fill="none"
                  stroke={HR_COLOR}
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  filter={`url(#${gradientId}-glow)`}
                />
              ) : null}

            </svg>
            {active && isScrubbing ? (
              <div
                className="pointer-events-none absolute inset-0"
                aria-hidden
              >
                <div
                  className="absolute top-[8%] bottom-[12%] w-px bg-white/65"
                  style={{ left: `${(xFor(active.t, start, end) / 1000) * 100}%` }}
                />
                <div
                  className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#14080c] shadow-[0_0_10px_rgba(251,113,133,0.45)]"
                  style={{
                    left: `${(xFor(active.t, start, end) / 1000) * 100}%`,
                    top: `${(yFor(active.v, yMin, yMax) / 200) * 100}%`,
                    background: zone?.color ?? HR_COLOR,
                  }}
                />
              </div>
            ) : latest ? (
              <div
                className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${(xFor(latest.t, start, end) / 1000) * 100}%`,
                  top: `${(yFor(latest.v, yMin, yMax) / 200) * 100}%`,
                  background: HR_COLOR,
                }}
                aria-hidden
              />
            ) : null}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
            {ticks.map((tick) => (
              <span key={tick.t}>{tick.label}</span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground/60">
            {bands.map((band) => (
              <span key={band.key} className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: band.color }} />
                {band.label}
              </span>
            ))}
            {restingHeartRate != null ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0 w-4 border-t border-dashed border-white/40" />
                Rest {Math.round(restingHeartRate)}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
