"use client"

import { useMemo } from "react"
import {
  PEPTIDE_COLOR,
  estimateCirculatingMg,
  estimateHungerFromCirculating,
  resolveHungerReadout,
} from "@/lib/peptides"
import { cn } from "@/lib/utils"

type DoseEntry = { injectedAt: string; doseMg: number }
type HungerLog = { date: string; hungerLevel: number }

/**
 * Steel HUD appetite readout. Prefers logged hunger (1–10);
 * falls back to an inverse estimate from circulating Reta.
 */
export function PeptideHungerMeter({
  hungerLogs = [],
  doseEntries = [],
  lastDoseMg = null,
  className,
  compact = false,
}: {
  /** Recent daily appetite rows (newest-first or any order). */
  hungerLogs?: HungerLog[]
  doseEntries?: DoseEntry[]
  lastDoseMg?: number | null
  className?: string
  compact?: boolean
}) {
  const model = useMemo(() => {
    const nowMs = Date.now()
    const circulating =
      doseEntries.length > 0 ? estimateCirculatingMg(doseEntries, nowMs) : null
    const refMg =
      lastDoseMg != null && lastDoseMg > 0
        ? lastDoseMg
        : doseEntries.length > 0
          ? Math.max(...doseEntries.map((e) => e.doseMg), 0.01)
          : null

    const sortedLogs = [...hungerLogs]
      .filter((l) => l.hungerLevel >= 1 && l.hungerLevel <= 10)
      .sort((a, b) => b.date.localeCompare(a.date))
    const latestLogged = sortedLogs[0]?.hungerLevel ?? null

    const readout = resolveHungerReadout({
      loggedHunger: latestLogged,
      circulatingMg: circulating,
      referenceMg: refMg,
    })

    // Sparkline: prefer last ~10 logged days; else estimate from circulating over lookback.
    const w = 120
    const h = 36
    const padY = 3
    let path = ""
    let nowX = w
    let nowY = h / 2
    let sparkSource: "logged" | "estimate" | "none" = "none"

    if (sortedLogs.length >= 2) {
      sparkSource = "logged"
      const series = sortedLogs.slice(0, 10).reverse()
      path = series
        .map((p, i) => {
          const x = series.length === 1 ? w / 2 : (i / (series.length - 1)) * w
          const y = h - padY - ((p.hungerLevel - 1) / 9) * (h - padY * 2)
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
        })
        .join(" ")
      const last = series[series.length - 1]!
      nowX = w
      nowY = h - padY - ((last.hungerLevel - 1) / 9) * (h - padY * 2)
    } else if (doseEntries.length > 0 && refMg != null && circulating != null) {
      sparkSource = "estimate"
      const lookbackDays = 14
      const steps = 20
      const pts: Array<{ t: number; hunger: number }> = []
      for (let i = 0; i <= steps; i++) {
        const dayOffset = -lookbackDays + (lookbackDays * i) / steps
        const t = nowMs + dayOffset * 24 * 60 * 60 * 1000
        const mg = estimateCirculatingMg(doseEntries, t)
        pts.push({ t, hunger: estimateHungerFromCirculating(mg, refMg) })
      }
      path = pts
        .map((p, i) => {
          const x = (i / (pts.length - 1)) * w
          const y = h - padY - ((p.hunger - 1) / 9) * (h - padY * 2)
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
        })
        .join(" ")
      nowX = w
      nowY = h - padY - ((pts[pts.length - 1]!.hunger - 1) / 9) * (h - padY * 2)
    }

    const value = readout.value
    const fillPct = value != null ? ((value - 1) / 9) * 100 : 0

    return {
      value,
      source: readout.source,
      estimate: readout.estimate,
      fillPct,
      path,
      nowX,
      nowY,
      w,
      h,
      sparkSource,
      logCount: sortedLogs.length,
      circulating,
    }
  }, [hungerLogs, doseEntries, lastDoseMg])

  if (model.source === "none") {
    return (
      <div className={cn("space-y-1.5", className)}>
        <p className="type-hud-caption">Hunger</p>
        <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/55">
          Log appetite, or add a shot for an estimate from circulating Reta.
        </p>
      </div>
    )
  }

  const sourceLabel =
    model.source === "logged"
      ? model.logCount > 1
        ? `Logged · ${model.logCount} days`
        : "Logged today"
      : "Est. from circulating"

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="type-hud-caption">Hunger</p>
        <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/50">
          {sourceLabel}
        </p>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "font-semibold tabular-nums tracking-tight",
              compact ? "text-2xl" : "text-[1.75rem] leading-none",
            )}
            style={{ color: PEPTIDE_COLOR }}
          >
            {model.value != null
              ? Number.isInteger(model.value)
                ? String(model.value)
                : model.value.toFixed(1)
              : "—"}
            <span className="ml-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/65">
              /10
            </span>
          </p>
          <p className="mt-1 type-hud-micro normal-case tracking-normal text-muted-foreground/55">
            {model.source === "logged"
              ? model.estimate != null
                ? `10 = very hungry · circ. est. ${formatHunger(model.estimate)}`
                : "10 = very hungry"
              : "Inverse of circulating · not a log"}
          </p>
        </div>
        {model.path ? (
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
              strokeDasharray={model.sparkSource === "estimate" ? "3 2.5" : undefined}
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
        ) : null}
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-slate-400/75 transition-[width] duration-500"
          style={{ width: `${Math.round(model.fillPct)}%` }}
        />
      </div>
      <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/45">
        {model.source === "logged"
          ? "From daily appetite logs"
          : "Estimate only · higher circulating → lower hunger"}
      </p>
    </div>
  )
}

function formatHunger(n: number): string {
  return Number.isInteger(n) ? `${n}/10` : `${n.toFixed(1)}/10`
}
