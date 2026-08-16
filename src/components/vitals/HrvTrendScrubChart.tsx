"use client"

import { useCallback, useId, useMemo, useState } from "react"
import { format } from "date-fns"
import { useAxisLockedScrub } from "@/components/charts/useAxisLockedScrub"
import { clamp01, interpolateSparseByIndex } from "@/lib/chart-scrub"
import { cn, parseLocalDate } from "@/lib/utils"

const HRV_COLOR = "#d8e84c"
const RHR_COLOR = "#fb7185"
const PLOT_LEFT = 8
const PLOT_RIGHT = 992
const PLOT_TOP = 18
const PLOT_BOTTOM = 178
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP

export type HrvTrendDay = {
  date: string
  restingHeartRate: number | null
  hrvMs: number | null
}

function yFor(value: number, min: number, max: number): number {
  const span = Math.max(1, max - min)
  return PLOT_BOTTOM - ((value - min) / span) * PLOT_HEIGHT
}

function domain(values: number[], pad: number): [number, number] {
  if (values.length === 0) return [0, 1]
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return [min - pad, max + pad]
  return [min - pad, max + pad]
}

function pathThrough(
  days: HrvTrendDay[],
  pick: (day: HrvTrendDay) => number | null,
  yMin: number,
  yMax: number,
): string {
  const parts: string[] = []
  days.forEach((day, index) => {
    const value = pick(day)
    if (value == null || !Number.isFinite(value)) return
    const x = PLOT_LEFT + (index / Math.max(1, days.length - 1)) * PLOT_WIDTH
    const y = yFor(value, yMin, yMax)
    parts.push(`${parts.length === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
  })
  return parts.join(" ")
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`
}

export function HrvTrendScrubChart({
  days,
  status,
}: {
  days: HrvTrendDay[]
  status: "loading" | "ready" | "error"
}) {
  const gradientId = useId().replace(/:/g, "")
  const [scrubRatio, setScrubRatio] = useState<number | null>(null)
  const clearScrub = useCallback(() => setScrubRatio(null), [])
  const scrubHandlers = useAxisLockedScrub({
    onScrub: setScrubRatio,
    onClear: clearScrub,
  })

  const hrvValues = days.map((day) => day.hrvMs)
  const rhrValues = days.map((day) => day.restingHeartRate)
  const hrvKnown = hrvValues.filter((v): v is number => v != null && Number.isFinite(v))
  const rhrKnown = rhrValues.filter((v): v is number => v != null && Number.isFinite(v))
  const hasTrend = hrvKnown.length + rhrKnown.length > 0
  const [hrvMin, hrvMax] = domain(hrvKnown, 4)
  const [rhrMin, rhrMax] = domain(rhrKnown, 3)
  const hrvAvg =
    hrvKnown.length > 0
      ? hrvKnown.reduce((sum, value) => sum + value, 0) / hrvKnown.length
      : null

  const latestIndex = useMemo(() => {
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i]?.hrvMs != null || days[i]?.restingHeartRate != null) return i
    }
    return days.length - 1
  }, [days])

  const activeIndex =
    scrubRatio == null
      ? latestIndex
      : clamp01(scrubRatio) * Math.max(0, days.length - 1)
  const activeDay = days[Math.round(activeIndex)] ?? days[latestIndex]
  const scrubHrv = interpolateSparseByIndex(hrvValues, activeIndex)
  const scrubRhr = interpolateSparseByIndex(rhrValues, activeIndex)
  const vsAvg =
    scrubHrv != null && hrvAvg != null ? Math.round(scrubHrv - hrvAvg) : null
  const x =
    PLOT_LEFT +
    (Math.max(0, days.length - 1) === 0
      ? 0
      : (activeIndex / Math.max(1, days.length - 1)) * PLOT_WIDTH)
  const hrvPath = pathThrough(days, (day) => day.hrvMs, hrvMin, hrvMax)
  const rhrPath = pathThrough(days, (day) => day.restingHeartRate, rhrMin, rhrMax)
  const lastHrv = hrvKnown[hrvKnown.length - 1] ?? null
  const isScrubbing = scrubRatio != null

  return (
    <section
      aria-labelledby="hrv-trend-heading"
      className="space-y-3.5 rounded-2xl border border-[#d8e84c]/15 bg-gradient-to-br from-[#d8e84c]/[0.065] via-white/[0.02] to-transparent p-3.5 sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id="hrv-trend-heading" className="text-sm font-semibold text-foreground/95">
            HRV recovery trend
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/65">
            Nightly variability with resting heart rate · last 14 days
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[#d8e84c]/20 bg-[#d8e84c]/[0.08] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#e7f474]/80">
          Recovery
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2" aria-live="polite">
        {[
          {
            label: isScrubbing && activeDay?.date
              ? format(parseLocalDate(activeDay.date), "MMM d")
              : "Latest",
            value: scrubHrv != null ? Math.round(scrubHrv) : lastHrv != null ? Math.round(lastHrv) : null,
            suffix: "ms",
          },
          {
            label: "14d avg",
            value: hrvAvg != null ? Math.round(hrvAvg) : null,
            suffix: "ms",
          },
          {
            label: "vs avg",
            value: vsAvg,
            suffix: "ms",
            signed: true,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 px-2.5 py-2.5"
          >
            <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/55">
              {item.label}
            </p>
            <p className="mt-1 truncate font-heading text-base leading-none tabular-nums text-foreground/90 sm:text-lg">
              {item.value != null
                ? `${item.signed && item.value > 0 ? "+" : ""}${item.value}`
                : "—"}
              {item.value != null ? (
                <span className="ml-0.5 text-[9px] font-medium text-muted-foreground/55">
                  {item.suffix}
                </span>
              ) : null}
            </p>
          </div>
        ))}
      </div>

      {isScrubbing && scrubRhr != null ? (
        <p className="text-[11px] tabular-nums text-muted-foreground/65">
          Resting HR {Math.round(scrubRhr)} bpm
          {vsAvg != null ? ` · HRV ${signed(vsAvg)} ms vs 14-day average` : ""}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground/70">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded-full bg-[#d8e84c] shadow-[0_0_8px_rgba(216,232,76,0.35)]" />
            HRV
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0 w-5 border-t border-dashed border-[#fb7185]/75" />
            Resting HR
          </span>
        </div>
      )}

      {status === "loading" ? (
        <div className="grid h-56 place-items-center rounded-xl border border-dashed border-white/[0.08] bg-black/10 text-[12px] text-muted-foreground/55 sm:h-60">
          Loading recovery trend…
        </div>
      ) : status === "error" ? (
        <p className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-4 text-center text-[12px] text-muted-foreground/65">
          Couldn&apos;t load HRV history.
        </p>
      ) : !hasTrend ? (
        <p className="rounded-xl border border-dashed border-white/[0.08] bg-black/10 px-3 py-5 text-center text-[12px] leading-relaxed text-muted-foreground/65">
          A few nights of Google Health data will fill in this recovery trend.
        </p>
      ) : (
        <div className="chart-touch-safe select-none [-webkit-touch-callout:none]">
          <svg
            viewBox="0 0 1000 200"
            className="h-56 w-full cursor-crosshair overflow-visible sm:h-60"
            role="img"
            aria-label="HRV recovery trend for the last 14 days. Drag horizontally to inspect a day."
            preserveAspectRatio="none"
            {...scrubHandlers}
            onContextMenu={(event) => event.preventDefault()}
          >
            <defs>
              <linearGradient id={`${gradientId}-hrv`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={HRV_COLOR} stopOpacity="0.22" />
                <stop offset="100%" stopColor={HRV_COLOR} stopOpacity="0" />
              </linearGradient>
              <filter id={`${gradientId}-glow`} x="-8%" y="-40%" width="116%" height="180%">
                <feGaussianBlur stdDeviation="2.4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {[0.15, 0.5, 0.85].map((stop) => (
              <line
                key={stop}
                x1={PLOT_LEFT}
                x2={PLOT_RIGHT}
                y1={PLOT_TOP + PLOT_HEIGHT * stop}
                y2={PLOT_TOP + PLOT_HEIGHT * stop}
                stroke="rgba(255,255,255,0.055)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hrvAvg != null ? (
              <line
                x1={PLOT_LEFT}
                x2={PLOT_RIGHT}
                y1={yFor(hrvAvg, hrvMin, hrvMax)}
                y2={yFor(hrvAvg, hrvMin, hrvMax)}
                stroke="oklch(0.84 0.14 112 / 32%)"
                strokeDasharray="3 5"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {hrvPath ? (
              <path
                d={`${hrvPath} L ${PLOT_RIGHT},${PLOT_BOTTOM} L ${PLOT_LEFT},${PLOT_BOTTOM} Z`}
                fill={`url(#${gradientId}-hrv)`}
              />
            ) : null}
            {rhrPath ? (
              <path
                d={rhrPath}
                fill="none"
                stroke={RHR_COLOR}
                strokeOpacity="0.72"
                strokeWidth="1.75"
                strokeDasharray="5 4"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {hrvPath ? (
              <path
                d={hrvPath}
                fill="none"
                stroke={HRV_COLOR}
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                filter={`url(#${gradientId}-glow)`}
              />
            ) : null}
            {days.map((day, index) => {
              if (day.hrvMs == null) return null
              const cx = PLOT_LEFT + (index / Math.max(1, days.length - 1)) * PLOT_WIDTH
              return (
                <circle
                  key={day.date}
                  cx={cx}
                  cy={yFor(day.hrvMs, hrvMin, hrvMax)}
                  r="2.4"
                  fill={HRV_COLOR}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
            {isScrubbing ? (
              <g>
                <line
                  x1={x}
                  x2={x}
                  y1={PLOT_TOP}
                  y2={PLOT_BOTTOM}
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth="1.25"
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
                {scrubHrv != null ? (
                  <circle
                    cx={x}
                    cy={yFor(scrubHrv, hrvMin, hrvMax)}
                    r="5.5"
                    fill={HRV_COLOR}
                    stroke="#11150a"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {scrubRhr != null ? (
                  <circle
                    cx={x}
                    cy={yFor(scrubRhr, rhrMin, rhrMax)}
                    r="4"
                    fill={RHR_COLOR}
                    stroke="#16090d"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </g>
            ) : null}
          </svg>
          <div className="mt-1 flex justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
            <span>{days[0] ? format(parseLocalDate(days[0].date), "MMM d") : ""}</span>
            <span className={cn(isScrubbing && "text-[#e7f474]/80")}>
              {isScrubbing ? "Release to return" : "Drag to inspect"}
            </span>
            <span>{days[days.length - 1] ? format(parseLocalDate(days[days.length - 1]!.date), "MMM d") : ""}</span>
          </div>
        </div>
      )}
    </section>
  )
}
