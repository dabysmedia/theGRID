"use client"

import { useId, useMemo } from "react"
import {
  PEPTIDE_COLOR,
  RETA_HALF_LIFE_DAYS,
  daysElapsedSince,
  estimateCirculatingMg,
  formatEstimateMg,
  fullCycleCirculatingCurve,
} from "@/lib/peptides"
import { cn } from "@/lib/utils"

type DoseEntry = { injectedAt: string; doseMg: number }

/**
 * Steel HUD meter: stacked half-life estimate of circulating Reta (mg),
 * plus a full-cycle decay curve from first shot → now (+ short lookahead).
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
  const fillId = useId().replace(/:/g, "")
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

    const cycle = fullCycleCirculatingCurve(shots, {
      nowMs,
      toDaysAhead: RETA_HALF_LIFE_DAYS,
      steps: compact ? 48 : 72,
    })
    if (!cycle) return null

    const maxCurve = Math.max(...cycle.points.map((p) => p.mg), scaleMg, 0.01)
    const w = compact ? 280 : 320
    const h = compact ? 52 : 64
    const padX = 4
    const padY = 6
    const span = Math.max(0.001, cycle.spanDays)
    const xOf = (dayOffset: number) => padX + (dayOffset / span) * (w - padX * 2)
    const yOf = (mg: number) => h - padY - (mg / maxCurve) * (h - padY * 2)

    const path = cycle.points
      .map((p, i) => {
        const x = xOf(p.dayOffset)
        const y = yOf(p.mg)
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(" ")

    // Soft fill under the path (close to baseline).
    const area =
      path +
      ` L${xOf(cycle.points[cycle.points.length - 1]!.dayOffset).toFixed(1)},${(h - padY).toFixed(1)}` +
      ` L${xOf(cycle.points[0]!.dayOffset).toFixed(1)},${(h - padY).toFixed(1)} Z`

    const nowX = xOf(cycle.nowDayOffset)
    const nowY = yOf(circulating)
    const injectionMarks = cycle.injections.map((inj) => ({
      x: xOf(inj.dayOffset),
      y: yOf(estimateCirculatingMg(shots, inj.atMs)),
      doseMg: inj.doseMg,
    }))

    const startLabel = formatCycleDayLabel(cycle.points[0]!.atMs)
    const endLabel = formatCycleDayLabel(
      cycle.points[cycle.points.length - 1]!.atMs,
    )

    return {
      circulating,
      daysSince,
      pctOfLast,
      fillPct,
      path,
      area,
      nowX,
      nowY,
      w,
      h,
      shotCount: shots.length,
      injectionMarks,
      startLabel,
      endLabel,
      spanDays: cycle.spanDays,
    }
  }, [entries, lastDoseMg, lastInjectedAt, compact])

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
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-slate-400/75 transition-[width] duration-500"
          style={{ width: `${Math.round(model.fillPct)}%` }}
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="type-hud-micro text-muted-foreground/55">Full cycle</p>
          <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/45">
            {model.shotCount} shot{model.shotCount === 1 ? "" : "s"} ·{" "}
            {model.spanDays < 1.5
              ? "<2d"
              : `${Math.round(model.spanDays)}d`}
          </p>
        </div>
        <svg
          viewBox={`0 0 ${model.w} ${model.h}`}
          className="h-14 w-full overflow-visible sm:h-16"
          role="img"
          aria-label="Estimated circulating dose over the full injection cycle"
        >
          <defs>
            <linearGradient id={`reta-cycle-fill-${fillId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PEPTIDE_COLOR} stopOpacity="0.28" />
              <stop offset="100%" stopColor={PEPTIDE_COLOR} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={model.area} fill={`url(#reta-cycle-fill-${fillId})`} />
          <path
            d={model.path}
            fill="none"
            stroke={PEPTIDE_COLOR}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.9}
          />
          {/* Injection event ticks */}
          {model.injectionMarks.map((m, i) => (
            <g key={i}>
              <line
                x1={m.x}
                y1={m.y}
                x2={m.x}
                y2={model.h - 4}
                stroke="oklch(1 0 0 / 14%)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={m.x}
                cy={m.y}
                r="2.2"
                fill="oklch(0.18 0.01 250)"
                stroke={PEPTIDE_COLOR}
                strokeWidth="1.25"
                opacity={0.9}
              />
            </g>
          ))}
          {/* Now marker */}
          <line
            x1={model.nowX}
            y1={2}
            x2={model.nowX}
            y2={model.h - 2}
            stroke="oklch(1 0 0 / 22%)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <circle
            cx={model.nowX}
            cy={model.nowY}
            r="3"
            fill={PEPTIDE_COLOR}
            stroke="oklch(0.18 0.01 250)"
            strokeWidth="1.25"
          />
        </svg>
        <div className="flex items-center justify-between gap-2 type-hud-micro normal-case tracking-normal text-muted-foreground/45">
          <span>{model.startLabel}</span>
          <span>now</span>
          <span>{model.endLabel}</span>
        </div>
      </div>

      <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/45">
        Estimate only · Σ dose × 0.5^(days / {RETA_HALF_LIFE_DAYS})
        {model.shotCount > 1 ? ` · ${model.shotCount} shots` : ""}
      </p>
    </div>
  )
}

function formatCycleDayLabel(atMs: number): string {
  const d = new Date(atMs)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
