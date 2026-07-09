"use client"

import { useId } from "react"
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
  /** Week view: show average readiness label */
  isWeekView?: boolean
  className?: string
}

/**
 * Hub tile: mesh-line heart with HRV centered, readiness score replacing the old daily score bar.
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
  const hrvLabel =
    hrvMs != null && Number.isFinite(hrvMs) ? String(Math.round(hrvMs)) : "—"
  const readinessLabel =
    readiness != null && Number.isFinite(readiness) ? String(Math.round(readiness)) : "—"

  return (
    <Link
      href="/vitals"
      className={cn(
        "group relative mb-5 block overflow-hidden rounded-xl border border-rose-500/20 bg-gradient-to-b from-rose-500/[0.12] via-transparent to-cyan-500/[0.06] px-3 py-3.5 transition-colors hover:border-rose-400/35 hover:from-rose-500/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -left-8 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full opacity-40 blur-2xl"
        style={{ backgroundColor: accent }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-cyan-400/20 blur-2xl"
        aria-hidden
      />

      <div className="relative z-10 flex items-center gap-3">
        <div className="relative mx-auto flex h-[6.25rem] w-[6.25rem] shrink-0 items-center justify-center sm:mx-0">
          <MeshHeartSvg accent={accent} className="absolute inset-0 h-full w-full drop-shadow-[0_0_18px_rgba(244,63,94,0.35)]" />
          <div className="relative z-10 flex flex-col items-center justify-center pt-0.5 text-center">
            <span
              className="font-semibold tabular-nums leading-none tracking-tight text-foreground"
              style={{
                fontSize: hrvLabel.length > 3 ? "1.2rem" : "1.55rem",
                textShadow: `0 0 20px ${accent}88`,
              }}
            >
              {hrvLabel}
            </span>
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-rose-100/75">
              ms
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="type-hud-label-soft">
              {isWeekView ? "Avg readiness" : "Readiness"}
            </p>
            <p
              className="text-lg font-semibold tabular-nums tracking-tight"
              style={{ color: accent, textShadow: `0 0 12px ${accent}55` }}
            >
              {readinessLabel}
              {readiness != null ? (
                <span className="ml-0.5 text-[11px] font-medium text-muted-foreground/70">
                  /100
                </span>
              ) : null}
            </p>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/25">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${readiness != null ? Math.max(4, Math.min(100, readiness)) : 0}%`,
                background: `linear-gradient(90deg, ${accent}aa, ${accent})`,
                boxShadow: `0 0 10px ${accent}55`,
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
            <p className="text-[11px] font-medium tracking-wide" style={{ color: accent }}>
              {band ? READINESS_BAND_LABEL[band] : "Sync Fitbit for readiness"}
            </p>
            {restingHeartRate != null && Number.isFinite(restingHeartRate) ? (
              <p className="text-[10px] tabular-nums text-muted-foreground/65">
                RHR {Math.round(restingHeartRate)} bpm
                {hrvMs != null ? ` · ${Math.round(hrvMs)} ms` : ""}
              </p>
            ) : hrvMs != null ? (
              <p className="text-[10px] tabular-nums text-muted-foreground/65">
                {Math.round(hrvMs)} ms HRV
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  )
}

function MeshHeartSvg({
  accent,
  className,
}: {
  accent: string
  className?: string
}) {
  const uid = useId().replace(/:/g, "")
  const clipId = `mesh-heart-clip-${uid}`
  const fillId = `mesh-heart-fill-${uid}`
  const glowId = `mesh-heart-glow-${uid}`
  // Classic heart path in a 100×100 viewBox; mesh = clipped grid + contour strokes.
  const heartPath =
    "M50 88 C20 68 8 48 8 32 C8 18 18 10 30 10 C40 10 47 16 50 24 C53 16 60 10 70 10 C82 10 92 18 92 32 C92 48 80 68 50 88 Z"

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden
      fill="none"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={heartPath} />
        </clipPath>
        <linearGradient id={fillId} x1="20" y1="10" x2="80" y2="90">
          <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
          <stop offset="55%" stopColor={accent} stopOpacity="0.12" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.18" />
        </linearGradient>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path d={heartPath} fill={`url(#${fillId})`} />

      <g clipPath={`url(#${clipId})`} opacity="0.9">
        {Array.from({ length: 11 }, (_, i) => {
          const y = 12 + i * 7.5
          return (
            <line
              key={`h-${i}`}
              x1="6"
              y1={y}
              x2="94"
              y2={y}
              stroke={accent}
              strokeWidth="0.55"
              strokeOpacity={0.24 + (i % 3) * 0.05}
            />
          )
        })}
        {Array.from({ length: 11 }, (_, i) => {
          const x = 12 + i * 7.5
          return (
            <line
              key={`v-${i}`}
              x1={x}
              y1="8"
              x2={x}
              y2="92"
              stroke="#67e8f9"
              strokeWidth="0.45"
              strokeOpacity={0.16 + (i % 2) * 0.06}
            />
          )
        })}
        {Array.from({ length: 7 }, (_, i) => (
          <line
            key={`d-${i}`}
            x1={8 + i * 12}
            y1="10"
            x2={28 + i * 12}
            y2="90"
            stroke={accent}
            strokeWidth="0.4"
            strokeOpacity="0.14"
          />
        ))}
      </g>

      <path
        d={heartPath}
        stroke={accent}
        strokeWidth="1.85"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
        opacity="0.95"
      />
      <path
        d={heartPath}
        stroke="#ffffff"
        strokeWidth="0.5"
        strokeOpacity="0.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
