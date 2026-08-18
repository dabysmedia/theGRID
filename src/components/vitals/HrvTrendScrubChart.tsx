"use client"

import { useCallback, useId, useMemo, useState } from "react"
import { format } from "date-fns"
import { ChartScrubHit, useAxisLockedScrub } from "@/components/charts/useAxisLockedScrub"
import { nearestDefinedIndex, plotRatioFromView } from "@/lib/chart-scrub"
import { parseLocalDate } from "@/lib/utils"

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

function xAtIndex(index: number, count: number): number {
  if (count <= 1) return PLOT_LEFT
  return PLOT_LEFT + (index / (count - 1)) * PLOT_WIDTH
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
    return Math.max(0, days.length - 1)
  }, [days])

  const fingerIndex =
    scrubRatio == null
      ? latestIndex
      : plotRatioFromView(scrubRatio, PLOT_LEFT, PLOT_RIGHT, 1000) * Math.max(0, days.length - 1)
  const sampleIndex = nearestDefinedIndex(hrvValues, fingerIndex) ?? latestIndex
  const rhrIndex = nearestDefinedIndex(rhrValues, sampleIndex)
  const activeDay = days[sampleIndex] ?? days[latestIndex]
  const actualHrv = activeDay?.hrvMs ?? null
  const actualRhr =
    activeDay?.restingHeartRate ?? (rhrIndex != null ? rhrValues[rhrIndex] : null)
  const vsAvg =
    actualHrv != null && hrvAvg != null ? Math.round(actualHrv - hrvAvg) : null
  const hairlineX = xAtIndex(fingerIndex, days.length)
  const sampleX = xAtIndex(sampleIndex, days.length)
  const hrvPath = pathThrough(days, (day) => day.hrvMs, hrvMin, hrvMax)
  const rhrPath = pathThrough(days, (day) => day.restingHeartRate, rhrMin, rhrMax)
  const isScrubbing = scrubRatio != null

  return (
    <section aria-labelledby="hrv-trend-heading" className="space-y-3">
      <div>
        <p id="hrv-trend-heading" className="type-hud-subsection">
          HRV
        </p>
        <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/70">
          Nightly variability · last 14 days
        </p>
      </div>

      <div className="flex items-end justify-between gap-4" aria-live="polite">
        <div className="min-w-0">
          <p className="type-hud-micro text-muted-foreground/55">
            {isScrubbing && activeDay?.date
              ? format(parseLocalDate(activeDay.date), "EEE, MMM d")
              : "Latest"}
          </p>
          <p className="mt-1 font-heading text-3xl leading-none tabular-nums tracking-tight text-foreground">
            {actualHrv != null ? Math.round(actualHrv) : "—"}
            <span className="ml-1 text-[11px] font-medium text-muted-foreground/50">ms</span>
          </p>
        </div>
        <div className="text-right type-hud-caption normal-case tracking-normal text-muted-foreground/65">
          {hrvAvg != null ? <p>14d avg {Math.round(hrvAvg)} ms</p> : null}
          {vsAvg != null ? <p className="mt-0.5 tabular-nums">{signed(vsAvg)} vs avg</p> : null}
          {actualRhr != null ? (
            <p className="mt-0.5 tabular-nums">RHR {Math.round(actualRhr)} bpm</p>
          ) : null}
        </div>
      </div>

      {status === "loading" ? (
        <p className="type-hud-caption text-muted-foreground/55">Loading recovery trend…</p>
      ) : status === "error" ? (
        <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/65">
          Couldn&apos;t load HRV history.
        </p>
      ) : !hasTrend ? (
        <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/65">
          A few nights of Google Health data will fill in this recovery trend.
        </p>
      ) : (
        <div className="chart-touch-safe select-none [-webkit-touch-callout:none]">
          <ChartScrubHit handlers={scrubHandlers} className="cursor-crosshair">
            <svg
              viewBox="0 0 1000 200"
              className="pointer-events-none h-52 w-full overflow-visible sm:h-56"
              role="img"
              aria-label="HRV recovery trend for the last 14 days. Drag horizontally to inspect a day."
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id={`${gradientId}-hrv`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={HRV_COLOR} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={HRV_COLOR} stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.2, 0.5, 0.8].map((stop) => (
                <line
                  key={stop}
                  x1={PLOT_LEFT}
                  x2={PLOT_RIGHT}
                  y1={PLOT_TOP + PLOT_HEIGHT * stop}
                  y2={PLOT_TOP + PLOT_HEIGHT * stop}
                  stroke="rgba(255,255,255,0.05)"
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
                  stroke="oklch(0.84 0.14 112 / 28%)"
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
                  strokeOpacity="0.65"
                  strokeWidth="1.6"
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
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {days.map((day, index) => {
                if (day.hrvMs == null) return null
                return (
                  <circle
                    key={day.date}
                    cx={xAtIndex(index, days.length)}
                    cy={yFor(day.hrvMs, hrvMin, hrvMax)}
                    r="2.2"
                    fill={HRV_COLOR}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}
            </svg>
            {isScrubbing ? (
              <div className="pointer-events-none absolute inset-0" aria-hidden>
                <div
                  className="absolute top-[8%] bottom-[10%] w-px bg-white/50"
                  style={{ left: `${(hairlineX / 1000) * 100}%` }}
                />
                {actualHrv != null ? (
                  <div
                    className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#11150a]"
                    style={{
                      left: `${(sampleX / 1000) * 100}%`,
                      top: `${(yFor(actualHrv, hrvMin, hrvMax) / 200) * 100}%`,
                      background: HRV_COLOR,
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </ChartScrubHit>
          <div className="mt-1.5 flex justify-between type-hud-micro text-muted-foreground/45">
            <span>{days[0] ? format(parseLocalDate(days[0].date), "MMM d") : ""}</span>
            <span className="inline-flex items-center gap-3 normal-case tracking-normal">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3.5 rounded-full bg-[#d8e84c]" />
                HRV
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0 w-3.5 border-t border-dashed border-[#fb7185]/70" />
                RHR
              </span>
            </span>
            <span>
              {days[days.length - 1]
                ? format(parseLocalDate(days[days.length - 1]!.date), "MMM d")
                : ""}
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
