"use client"

import { useMemo } from "react"
import {
  PEPTIDE_COLOR,
  RETA_HALF_LIFE_DAYS,
  circulatingCurvePoints,
  daysElapsedSince,
  estimateCirculatingMg,
  formatEstimateMg,
} from "@/lib/peptides"
import { cn } from "@/lib/utils"

type DoseEntry = { injectedAt: string; doseMg: number }

/**
 * Steel HUD meter: stacked half-life estimate of circulating Reta (mg).
 * Formula: Σ doseᵢ × 0.5^(daysᵢ / 6)
 */
export function PeptideHalfLifeMeter({
  entries,
  lastDoseMg = null,
  lastInjectedAt = null,
  className,
  compact = false,
}: {
  entries: DoseEntry[]
  lastDoseMg?: number | null
  lastInjectedAt?: string | null
  className?: string
  compact?: boolean
}) {
  const model = useMemo(() => {
    if (entries.length === 0 && (lastDoseMg == null || !lastInjectedAt)) {
      return null
    }
    const shots =
      entries.length > 0
        ? entries
        : lastDoseMg != null && lastInjectedAt
          ? [{ injectedAt: lastInjectedAt, doseMg: lastDoseMg }]
          : []
    if (shots.length === 0) return null

    const nowMs = Date.now()
    const circulating = estimateCirculatingMg(shots, nowMs)
    const daysSince =
      lastInjectedAt != null
        ? daysElapsedSince(lastInjectedAt, nowMs)
        : daysElapsedSince(
            shots.reduce((a, b) =>
              new Date(a.injectedAt) > new Date(b.injectedAt) ? a : b,
            ).injectedAt,
            nowMs,
          )
    const lastMg = lastDoseMg ?? shots[0]?.doseMg ?? 0
    const pctOfLast = lastMg > 0 ? (circulating / lastMg) * 100 : 0
    const scaleMg = Math.max(lastMg, circulating, 0.01)
    const fillPct = Math.min(100, (circulating / scaleMg) * 100)

    const lookback = Math.min(RETA_HALF_LIFE_DAYS, Math.max(0, daysSince))
    const curve = circulatingCurvePoints(shots, {
      nowMs,
      fromDaysAgo: lookback,
      toDaysAhead: RETA_HALF_LIFE_DAYS * 2,
      steps: 28,
    })
    const maxCurve = Math.max(...curve.map((p) => p.mg), scaleMg, 0.01)
    const x0 = curve[0]?.dayOffset ?? 0
    const x1 = curve[curve.length - 1]?.dayOffset ?? 1
    const span = Math.max(0.001, x1 - x0)
    const w = 120
    const h = 36
    const padY = 3
    const path = curve
      .map((p, i) => {
        const x = ((p.dayOffset - x0) / span) * w
        const y = h - padY - (p.mg / maxCurve) * (h - padY * 2)
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(" ")
    const nowX = ((0 - x0) / span) * w
    const nowY = h - padY - (circulating / maxCurve) * (h - padY * 2)

    return {
      circulating,
      daysSince,
      pctOfLast,
      fillPct,
      path,
      nowX,
      nowY,
      w,
      h,
      shotCount: shots.length,
    }
  }, [entries, lastDoseMg, lastInjectedAt])

  if (!model) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <p className="type-hud-caption">Circulating estimate</p>
        <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/55">
          Log a shot to estimate remaining Reta (6-day half-life).
        </p>
      </div>
    )
  }

  const daysLabel =
    model.daysSince < 1
      ? `${Math.round(model.daysSince * 24)}h since last`
      : model.daysSince < 1.5
        ? "1d since last"
        : `${model.daysSince.toFixed(1).replace(/\.0$/, "")}d since last`

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="type-hud-caption">Circulating estimate</p>
        <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/50">
          τ½ {RETA_HALF_LIFE_DAYS}d · stacked
        </p>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "font-semibold tabular-nums tracking-tight text-slate-100/95",
              compact ? "text-2xl" : "text-[1.75rem] leading-none",
            )}
            style={{ color: PEPTIDE_COLOR }}
          >
            {formatEstimateMg(model.circulating)}
            <span className="ml-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/65">
              mg
            </span>
          </p>
          <p className="mt-1 type-hud-micro normal-case tracking-normal text-muted-foreground/55">
            {daysLabel}
            {lastDoseMg != null && lastDoseMg > 0
              ? ` · ${Math.round(model.pctOfLast)}% of last ${lastDoseMg} mg`
              : ""}
          </p>
        </div>
        <svg
          viewBox={`0 0 ${model.w} ${model.h}`}
          className="h-9 w-[7.5rem] shrink-0 overflow-visible"
          aria-hidden
        >
          <path
            d={model.path}
            fill="none"
            stroke={PEPTIDE_COLOR}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
          />
          <line
            x1={model.nowX}
            y1={2}
            x2={model.nowX}
            y2={model.h - 2}
            stroke="oklch(1 0 0 / 18%)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <circle
            cx={model.nowX}
            cy={model.nowY}
            r="2.75"
            fill={PEPTIDE_COLOR}
            stroke="oklch(0.18 0.01 250)"
            strokeWidth="1"
          />
        </svg>
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-slate-400/75 transition-[width] duration-500"
          style={{ width: `${Math.round(model.fillPct)}%` }}
        />
      </div>
      <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/45">
        Estimate only · Σ dose × 0.5^(days / {RETA_HALF_LIFE_DAYS})
        {model.shotCount > 1 ? ` · ${model.shotCount} shots` : ""}
      </p>
    </div>
  )
}
