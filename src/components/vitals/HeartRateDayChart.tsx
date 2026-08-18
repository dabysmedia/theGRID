"use client"

import { useCallback, useId, useMemo, useState } from "react"
import { format } from "date-fns"
import { useAxisLockedScrub } from "@/components/charts/useAxisLockedScrub"
import {
  nearestSeriesPoint,
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
  const bands = useMemo(
    () => plottableZoneBands(thresholds, restingHeartRate, yMin, yMax),
    [thresholds, restingHeartRate, yMin, yMax],
  )

  const fingerT =
    scrubRatio == null ? (latest?.t ?? start) : ratioToTime(start, end, scrubRatio)
  const sample = nearestSeriesPoint(points, fingerT) ?? latest
  const zone = sample ? zoneForBpm(sample.v, thresholds, restingHeartRate) : null
  const vsRest =
    sample && restingHeartRate != null ? sample.v - restingHeartRate : null
  const vsAvg = sample && average != null ? sample.v - average : null
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
    <section aria-labelledby="heart-rate-today-heading" className="space-y-3">
      <div>
        <p id="heart-rate-today-heading" className="type-hud-subsection">
          Heart rate
        </p>
        <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/70">
          Tracking day · zones from your profile
        </p>
      </div>

      <div className="flex items-end justify-between gap-4" aria-live="polite">
        <div className="min-w-0">
          <p className="type-hud-micro text-muted-foreground/55">
            {isScrubbing && sample ? format(new Date(sample.t), "h:mm a") : "Latest"}
          </p>
          <p className="mt-1 font-heading text-3xl leading-none tabular-nums tracking-tight text-foreground">
            {sample ? Math.round(sample.v) : "—"}
            <span className="ml-1 text-[11px] font-medium text-muted-foreground/50">bpm</span>
          </p>
        </div>
        <div className="text-right type-hud-caption normal-case tracking-normal text-muted-foreground/65">
          {zone ? (
            <p className="font-semibold tracking-[0.12em]" style={{ color: zone.color }}>
              {zone.label}
            </p>
          ) : null}
          {vsRest != null ? (
            <p className="mt-0.5 tabular-nums">{signed(vsRest)} vs rest</p>
          ) : min != null && max != null ? (
            <p className="mt-0.5 tabular-nums">
              {Math.round(min)}–{Math.round(max)}
            </p>
          ) : null}
          {vsAvg != null ? (
            <p className="mt-0.5 tabular-nums text-muted-foreground/50">
              {signed(vsAvg)} vs avg
            </p>
          ) : null}
        </div>
      </div>

      {status === "loading" ? (
        <p className="type-hud-caption text-muted-foreground/55">Loading heart-rate samples…</p>
      ) : status === "error" ? (
        <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/65">
          Couldn&apos;t load today&apos;s heart rate.
        </p>
      ) : points.length < 2 ? (
        <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/65">
          Heart-rate samples will appear here after Google Health imports the day.
        </p>
      ) : (
        <div className="chart-touch-safe select-none [-webkit-touch-callout:none]">
          <div className="relative">
            <svg
              viewBox="0 0 1000 200"
              className="h-56 w-full cursor-crosshair overflow-visible sm:h-60"
              role="img"
              aria-label="Heart rate across the tracking day. Drag horizontally to inspect time, bpm, and zone."
              preserveAspectRatio="none"
              {...scrubHandlers}
              onContextMenu={(event) => event.preventDefault()}
            >
              <defs>
                <linearGradient id={`${gradientId}-hr`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={HR_COLOR} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={HR_COLOR} stopOpacity="0" />
                </linearGradient>
              </defs>

              {bands.map((band) => (
                <rect
                  key={band.key}
                  x={PLOT_LEFT}
                  y={yFor(band.to, yMin, yMax)}
                  width={PLOT_WIDTH}
                  height={Math.max(1, yFor(band.from, yMin, yMax) - yFor(band.to, yMin, yMax))}
                  fill={band.color}
                  opacity="0.08"
                />
              ))}

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
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
            {isScrubbing && sample ? (
              <div className="pointer-events-none absolute inset-0" aria-hidden>
                <div
                  className="absolute top-[8%] bottom-[12%] w-px bg-white/50"
                  style={{ left: `${(xFor(fingerT, start, end) / 1000) * 100}%` }}
                />
                <div
                  className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#14080c]"
                  style={{
                    left: `${(xFor(sample.t, start, end) / 1000) * 100}%`,
                    top: `${(yFor(sample.v, yMin, yMax) / 200) * 100}%`,
                    background: zone?.color ?? HR_COLOR,
                  }}
                />
              </div>
            ) : latest ? (
              <div
                className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${(xFor(latest.t, start, end) / 1000) * 100}%`,
                  top: `${(yFor(latest.v, yMin, yMax) / 200) * 100}%`,
                  background: HR_COLOR,
                }}
                aria-hidden
              />
            ) : null}
          </div>
          <div className="mt-1.5 flex items-center justify-between type-hud-micro text-muted-foreground/45">
            {ticks.map((tick) => (
              <span key={tick.t}>{tick.label}</span>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 type-hud-micro text-muted-foreground/55">
            {bands.map((band) => (
              <span key={band.key} className="inline-flex items-center gap-1.5 normal-case tracking-normal">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: band.color }} />
                {band.label}
              </span>
            ))}
            {restingHeartRate != null ? (
              <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
                <span className="h-0 w-3.5 border-t border-dashed border-white/40" />
                Rest {Math.round(restingHeartRate)}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
