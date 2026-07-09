"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  READINESS_BAND_LABEL,
  readinessBand,
  type ReadinessBand,
} from "@/lib/readiness-score"

const BAND_ACCENT: Record<ReadinessBand, string> = {
  peak: "#34d399",
  high: "#22d3ee",
  balanced: "#f43f5e",
  low: "#f59e0b",
  very_low: "#fb7185",
}

type Props = {
  readiness: number | null
  hrvMs: number | null
  restingHeartRate?: number | null
  isWeekView?: boolean
  className?: string
}

/**
 * Low-profile hub readiness strip — keeps focus on the calorie/steps/sleep rings.
 * The mesh heart lives on the Vitals system tile instead.
 */
export function ReadinessHeartTile({
  readiness,
  hrvMs,
  restingHeartRate,
  isWeekView = false,
  className,
}: Props) {
  const band = readinessBand(readiness)
  const accent = band ? BAND_ACCENT[band] : "oklch(0.72 0.04 250)"
  const readinessLabel =
    readiness != null && Number.isFinite(readiness) ? String(Math.round(readiness)) : "—"

  const metaParts: string[] = []
  if (hrvMs != null && Number.isFinite(hrvMs)) metaParts.push(`${Math.round(hrvMs)} ms HRV`)
  if (restingHeartRate != null && Number.isFinite(restingHeartRate)) {
    metaParts.push(`RHR ${Math.round(restingHeartRate)}`)
  }

  return (
    <Link
      href="/vitals"
      className={cn(
        "group mb-4 block rounded-lg border border-border/25 bg-muted/10 px-3 py-2 transition-colors hover:border-border/40 hover:bg-muted/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="type-hud-label-soft text-[10px]">
            {isWeekView ? "Avg readiness" : "Readiness"}
            {band ? (
              <span className="ml-1.5 font-medium normal-case tracking-normal text-muted-foreground/70">
                · {READINESS_BAND_LABEL[band]}
              </span>
            ) : null}
          </p>
          {metaParts.length > 0 ? (
            <p className="mt-0.5 truncate text-[10px] tabular-nums text-muted-foreground/55">
              {metaParts.join(" · ")}
            </p>
          ) : (
            <p className="mt-0.5 text-[10px] text-muted-foreground/45">
              Sync Fitbit for readiness
            </p>
          )}
        </div>
        <p
          className="shrink-0 text-base font-semibold tabular-nums tracking-tight text-muted-foreground"
          style={band ? { color: accent } : undefined}
        >
          {readinessLabel}
          {readiness != null ? (
            <span className="ml-0.5 text-[10px] font-medium text-muted-foreground/50">
              /100
            </span>
          ) : null}
        </p>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted/20">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${readiness != null ? Math.max(3, Math.min(100, readiness)) : 0}%`,
            backgroundColor: accent,
            opacity: band ? 0.85 : 0.35,
          }}
        />
      </div>
    </Link>
  )
}
