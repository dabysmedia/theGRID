"use client"

import Link from "next/link"
import { MeshHeartSvg } from "@/components/hub/MeshHeartSvg"
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
 * Compact hub readiness strip: height-fitted mesh heart with readable HRV,
 * without competing with the calorie/steps/sleep rings above.
 */
export function ReadinessHeartTile({
  readiness,
  hrvMs,
  restingHeartRate,
  isWeekView = false,
  className,
}: Props) {
  const band = readinessBand(readiness)
  const accent = band ? BAND_ACCENT[band] : "#f43f5e"
  const readinessLabel =
    readiness != null && Number.isFinite(readiness) ? String(Math.round(readiness)) : "—"
  const hrvLabel =
    hrvMs != null && Number.isFinite(hrvMs) ? String(Math.round(hrvMs)) : "—"

  return (
    <Link
      href="/vitals"
      className={cn(
        "group mb-4 block rounded-xl border border-border/30 bg-muted/[0.08] px-2.5 py-2 transition-colors hover:border-border/45 hover:bg-muted/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        {/* Heart scaled to strip height — HRV is the hero number inside */}
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center sm:h-12 sm:w-12">
          <MeshHeartSvg
            accent={accent}
            className="absolute inset-0 h-full w-full opacity-90"
          />
          <div className="relative z-10 flex flex-col items-center justify-center pt-px text-center">
            <span
              className="font-semibold tabular-nums leading-none tracking-tight text-foreground"
              style={{
                fontSize: hrvLabel.length > 2 ? "0.95rem" : "1.1rem",
                textShadow: `0 0 12px ${accent}66`,
              }}
            >
              {hrvLabel}
            </span>
            <span className="mt-px text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              ms
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/85">
                {isWeekView ? "Avg readiness" : "Readiness"}
                {band ? (
                  <span
                    className="ml-1.5 font-medium normal-case tracking-normal"
                    style={{ color: accent }}
                  >
                    {READINESS_BAND_LABEL[band]}
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 truncate text-[12px] font-medium tabular-nums text-foreground/80">
                {hrvMs != null ? (
                  <>
                    <span className="text-foreground">{Math.round(hrvMs)}</span>
                    <span className="text-muted-foreground/70"> ms HRV</span>
                  </>
                ) : (
                  <span className="text-muted-foreground/55">Sync Fitbit for HRV</span>
                )}
                {restingHeartRate != null && Number.isFinite(restingHeartRate) ? (
                  <span className="text-muted-foreground/55">
                    {" "}
                    · RHR {Math.round(restingHeartRate)}
                  </span>
                ) : null}
              </p>
            </div>

            <p
              className="shrink-0 text-xl font-semibold tabular-nums leading-none tracking-tight sm:text-2xl"
              style={{ color: accent }}
            >
              {readinessLabel}
              {readiness != null ? (
                <span className="ml-0.5 text-[11px] font-medium text-muted-foreground/55">
                  /100
                </span>
              ) : null}
            </p>
          </div>

          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted/25">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${readiness != null ? Math.max(3, Math.min(100, readiness)) : 0}%`,
                backgroundColor: accent,
                boxShadow: band ? `0 0 8px ${accent}55` : undefined,
              }}
            />
          </div>
        </div>
      </div>
    </Link>
  )
}
