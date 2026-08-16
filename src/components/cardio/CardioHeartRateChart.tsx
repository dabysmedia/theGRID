"use client"

import { useCallback, useId, useMemo, useState } from "react"
import { format } from "date-fns"
import { useAxisLockedScrub } from "@/components/charts/useAxisLockedScrub"
import {
  cardioZoneForBpm,
  interpolateCardioSeries,
  plottableCardioZoneBands,
  ratioToTime,
  type CardioHeartRateThreshold,
  type CardioHrSample,
} from "@/lib/cardio-heart-rate"

const HR_COLOR = "#fb7185"
const PLOT_LEFT = 8
const PLOT_RIGHT = 992
const PLOT_TOP = 14
const PLOT_BOTTOM = 168
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

export function CardioHeartRateChart({
  samples,
  thresholds,
  restingHeartRate,
  maxHr,
  ageYears,
  weightLb,
  sessionLabel,
  status,
}: {
  samples: CardioHrSample[]
  thresholds: CardioHeartRateThreshold[]
  restingHeartRate: number | null
  maxHr: number | null
  ageYears: number | null
  weightLb: number | null
  sessionLabel: string
  status: "loading" | "ready" | "error"
}) {
  const gradientId = useId().replace(/:/g, "")
  const [scrubRatio, setScrubRatio] = useState<number | null>(null)
  const clearScrub = useCallback(() => setScrubRatio(null), [])
  const scrubHandlers = useAxisLockedScrub({
    onScrub: setScrubRatio,
    onClear: clearScrub,
  })

  const points = useMemo(
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
  const min = values.length ? Math.min(...values) : 50
  const max = values.length ? Math.max(...values) : 120
  const yMin = Math.max(30, Math.floor((min - 8) / 5) * 5)
  const yMax = Math.ceil((max + 8) / 5) * 5
  const average =
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  const latest = points[points.length - 1] ?? null
  const peak = useMemo(
    () => points.reduce<typeof latest>((best, point) => {
      if (!best || point.v > best.v) return point
      return best
    }, null),
    [points],
  )
  const bands = useMemo(
    () => plottableCardioZoneBands(thresholds, yMin, yMax),
    [thresholds, yMin, yMax],
  )

  const active = useMemo(() => {
    if (points.length === 0) return null
    if (scrubRatio == null) return peak ?? latest
    return interpolateCardioSeries(points, ratioToTime(start, end, scrubRatio))
  }, [latest, peak, points, scrubRatio, start, end])

  const zone = active ? cardioZoneForBpm(active.v, thresholds) : null
  const vsRest =
    active && restingHeartRate != null ? active.v - restingHeartRate : null
  const vsAvg = active && average != null ? active.v - average : null
  const pctMax =
    active && maxHr != null && maxHr > 0 ? Math.round((active.v / maxHr) * 100) : null
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
    return [0, 0.5, 1].map((ratio) => {
      const t = ratioToTime(start, end, ratio)
      return { t, label: format(new Date(t), "h:mm a").toLowerCase() }
    })
  }, [end, points.length, start])

  const profileBits = [
    ageYears != null ? `age ${ageYears}` : null,
    weightLb != null ? `${Math.round(weightLb)} lb` : null,
    maxHr != null ? `max ${maxHr}` : null,
  ].filter(Boolean)

  return (
    <section
      aria-labelledby="cardio-hr-heading"
      className="space-y-2.5 rounded-2xl border border-amber-200/[0.12] bg-amber-950/20 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id="cardio-hr-heading" className="text-sm font-semibold text-amber-50/95">
            Session heart rate
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/60">
            {sessionLabel}
            {profileBits.length > 0 ? ` · ${profileBits.join(" · ")}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-200/15 bg-amber-400/[0.08] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-100/70">
          {points.length > 0 ? `${points.length} samples` : "Zones"}
        </span>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5" aria-live="polite">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
              {isScrubbing && active ? format(new Date(active.t), "h:mm a") : "Peak / latest"}
            </p>
            <p className="mt-1 font-heading text-3xl leading-none tabular-nums tracking-tight text-rose-100">
              {active ? Math.round(active.v) : "—"}
              <span className="ml-1 text-[11px] font-medium text-muted-foreground/55">bpm</span>
            </p>
          </div>
          <div className="text-right">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: zone?.color ?? "rgba(255,255,255,0.45)" }}
            >
              {zone?.label ?? "—"}
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-muted-foreground/65">
              {pctMax != null
                ? `${pctMax}% max`
                : vsRest != null
                  ? `${signed(vsRest)} vs rest`
                  : `${Math.round(min)}–${Math.round(max)}`}
            </p>
            {vsAvg != null ? (
              <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground/50">
                {signed(vsAvg)} vs session avg
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {status === "loading" ? (
        <div className="grid h-44 place-items-center rounded-xl border border-dashed border-white/[0.08] bg-black/10 text-[12px] text-muted-foreground/55">
          Loading session heart rate…
        </div>
      ) : status === "error" ? (
        <p className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-4 text-center text-[12px] text-muted-foreground/65">
          Couldn&apos;t load heart rate for this session.
        </p>
      ) : points.length < 2 ? (
        <p className="rounded-xl border border-dashed border-amber-200/10 bg-black/10 px-3 py-5 text-center text-[12px] leading-relaxed text-muted-foreground/65">
          Heart-rate samples for this session will show here after Google Health syncs the workout.
        </p>
      ) : (
        <div className="chart-touch-safe select-none [-webkit-touch-callout:none]">
          <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#07090d]">
            <svg
              viewBox="0 0 1000 186"
              className="h-44 w-full cursor-crosshair overflow-visible"
              role="img"
              aria-label="Heart rate during this cardio session. Drag horizontally to inspect time, bpm, and zone."
              preserveAspectRatio="none"
              {...scrubHandlers}
              onContextMenu={(event) => event.preventDefault()}
            >
              <defs>
                <linearGradient id={`${gradientId}-hr`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={HR_COLOR} stopOpacity="0.28" />
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
                  opacity="0.09"
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
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
            {active && isScrubbing ? (
              <div className="pointer-events-none absolute inset-0" aria-hidden>
                <div
                  className="absolute top-[8%] bottom-[10%] w-px bg-white/65"
                  style={{ left: `${(xFor(active.t, start, end) / 1000) * 100}%` }}
                />
                <div
                  className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#14080c]"
                  style={{
                    left: `${(xFor(active.t, start, end) / 1000) * 100}%`,
                    top: `${(yFor(active.v, yMin, yMax) / 186) * 100}%`,
                    background: zone?.color ?? HR_COLOR,
                  }}
                />
              </div>
            ) : latest ? (
              <div
                className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${(xFor(latest.t, start, end) / 1000) * 100}%`,
                  top: `${(yFor(latest.v, yMin, yMax) / 186) * 100}%`,
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
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground/60">
            {bands.map((band) => (
              <span key={band.key} className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: band.color }} />
                {band.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
