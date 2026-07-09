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
  values: number[]
  labels: string[]
  readiness?: number | null
  hrvMs?: number | null
  restingHeartRate?: number | null
  isWeekView?: boolean
  className?: string
}

/**
 * Shared hub HUD panel: readiness + isometric steps bars in one container.
 */
export function StepsActivityBars({
  values,
  labels,
  readiness = null,
  hrvMs = null,
  restingHeartRate = null,
  isWeekView = false,
  className,
}: Props) {
  const max = Math.max(...values, 1)
  const todayIdx = values.length - 1
  const band = readinessBand(readiness)
  const accent = band ? BAND_ACCENT[band] : "#22c55e"
  const readinessLabel =
    readiness != null && Number.isFinite(readiness) ? String(Math.round(readiness)) : "—"
  const hrvLabel =
    hrvMs != null && Number.isFinite(hrvMs) ? String(Math.round(hrvMs)) : "—"

  return (
    <div className={cn("relative", className)}>
      <div
        className="relative overflow-hidden rounded-xl border border-emerald-500/15 bg-gradient-to-b from-emerald-500/[0.08] via-transparent to-transparent"
        style={{
          perspective: "520px",
          perspectiveOrigin: "50% 120%",
        }}
      >
        {/* Floor grid behind bars */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-8 h-14 opacity-35"
          aria-hidden
          style={{
            backgroundImage:
              "linear-gradient(to right, oklch(0.7 0.15 150 / 12%) 1px, transparent 1px), linear-gradient(to top, oklch(0.7 0.15 150 / 10%) 1px, transparent 1px)",
            backgroundSize: "14% 8px, 100% 8px",
            maskImage: "linear-gradient(to top, black, transparent)",
            transform: "rotateX(58deg) scaleY(0.85)",
            transformOrigin: "bottom center",
          }}
        />

        {/* Readiness row — same HUD language as the bars */}
        <Link
          href="/vitals"
          className="relative z-10 flex items-center gap-2.5 border-b border-emerald-500/10 px-2.5 py-2.5 transition-colors hover:bg-emerald-500/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30"
        >
          <div
            className="relative flex h-12 w-12 shrink-0 items-center justify-center"
            style={{
              transform: "rotateX(8deg) rotateY(-12deg)",
              transformStyle: "preserve-3d",
            }}
          >
            <MeshHeartSvg
              accent={accent}
              className="absolute inset-0 h-full w-full drop-shadow-[0_0_10px_rgba(34,197,94,0.25)]"
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
              <span className="mt-px text-[8px] font-semibold uppercase tracking-[0.14em] text-emerald-100/65">
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
                style={{
                  color: accent,
                  textShadow: band ? `0 0 12px ${accent}44` : undefined,
                }}
              >
                {readinessLabel}
                {readiness != null ? (
                  <span className="ml-0.5 text-[11px] font-medium text-muted-foreground/55">
                    /100
                  </span>
                ) : null}
              </p>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-emerald-950/40 shadow-[inset_0_1px_0_rgba(0,0,0,0.35)]">
              <div
                className="relative h-full overflow-hidden rounded-sm transition-all duration-700 ease-out"
                style={{
                  width: `${readiness != null ? Math.max(4, Math.min(100, readiness)) : 0}%`,
                  background: `linear-gradient(180deg, ${accent}dd 0%, ${accent} 45%, ${accent}99 100%)`,
                  boxShadow: band
                    ? `inset 0 1px 0 #ffffff55, 0 0 10px ${accent}55`
                    : undefined,
                }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-1/2 opacity-40"
                  style={{
                    background: "linear-gradient(180deg, #ffffff66, transparent)",
                  }}
                />
              </div>
            </div>
          </div>
        </Link>

        {/* Steps bars */}
        <div className="relative z-10 px-2.5 pb-2 pt-2.5">
          <div className="mb-2 flex items-end justify-between gap-2">
            <p className="type-hud-subsection">Steps Activity</p>
            <p className="text-[10px] tabular-nums tracking-wide text-muted-foreground/55">
              {values[todayIdx] > 0
                ? `${Math.round(values[todayIdx]).toLocaleString()} today`
                : "No steps yet"}
            </p>
          </div>

          <div
            className="pointer-events-none absolute inset-x-3 bottom-[2.15rem] h-px bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent"
            aria-hidden
          />

          <div
            className="relative flex h-[4.5rem] items-end justify-between gap-1.5 px-0.5"
            style={{ transformStyle: "preserve-3d" }}
          >
            {values.map((val, i) => {
              const pct = max > 0 ? val / max : 0
              const heightPx = Math.max(10, Math.round(pct * 56))
              const isToday = i === todayIdx
              const delay = 280 + i * 70

              return (
                <div
                  key={i}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
                >
                  <div
                    className="relative flex w-full justify-center"
                    style={{ height: 58, perspective: "240px" }}
                  >
                    <div
                      className="absolute bottom-0 origin-bottom animate-bar-grow"
                      style={{
                        width: "62%",
                        maxWidth: 22,
                        height: heightPx,
                        animationDelay: `${delay}ms`,
                        transformStyle: "preserve-3d",
                        transform: "rotateX(12deg) rotateY(-18deg)",
                      }}
                    >
                      <div
                        className="absolute left-0 right-0 top-0"
                        style={{
                          height: 7,
                          transform: "translateY(-6px) rotateX(72deg)",
                          transformOrigin: "bottom",
                          background: isToday
                            ? "linear-gradient(135deg, #86efac, #22c55e)"
                            : "linear-gradient(135deg, #4ade8088, #16a34a66)",
                          boxShadow: isToday
                            ? "0 0 12px #22c55e66"
                            : "0 0 6px #22c55e22",
                        }}
                      />
                      <div
                        className="absolute bottom-0 top-0"
                        style={{
                          width: 6,
                          right: -5,
                          transform: "skewY(-38deg)",
                          transformOrigin: "left bottom",
                          background: isToday
                            ? "linear-gradient(180deg, #16a34a, #14532d)"
                            : "linear-gradient(180deg, #15803d88, #052e1688)",
                        }}
                      />
                      <div
                        className="absolute inset-0 overflow-hidden"
                        style={{
                          background: isToday
                            ? "linear-gradient(180deg, #4ade80 0%, #22c55e 45%, #15803d 100%)"
                            : "linear-gradient(180deg, #22c55e99 0%, #16a34a66 55%, #14532d55 100%)",
                          boxShadow: isToday
                            ? "inset 0 1px 0 #bbf7d0aa, 0 0 14px #22c55e55"
                            : "inset 0 1px 0 #86efac33",
                          borderRadius: "1px 1px 0 0",
                        }}
                      >
                        <div
                          className="absolute inset-x-0 top-0 h-1/3 opacity-40"
                          style={{
                            background:
                              "linear-gradient(180deg, #ffffff55, transparent)",
                          }}
                        />
                        {isToday ? (
                          <div
                            className="absolute inset-0 animate-pulse opacity-25"
                            style={{
                              background:
                                "linear-gradient(105deg, transparent 35%, #ffffff66 50%, transparent 65%)",
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <span
                    className={cn(
                      "text-[10px] tracking-wider",
                      isToday
                        ? "font-semibold text-emerald-300"
                        : "text-muted-foreground/50",
                    )}
                  >
                    {labels[i] ?? ""}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
