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

const BAR_AREA_PX = 58
const BAR_MAX_PX = 56

type Props = {
  values: number[]
  labels: string[]
  /** Daily step goal — drawn as a dotted yellow projection line across the bars. */
  goal?: number | null
  readiness?: number | null
  hrvMs?: number | null
  restingHeartRate?: number | null
  isWeekView?: boolean
  className?: string
}

/**
 * Shared hub HUD panel: readiness + isometric steps bars in one container.
 * Breaks out of WeeklyHero padding (`-mx-4 lg:-mx-5`) so the readiness
 * gradient sits flush to the overview card edges. Background wash lives on
 * WeeklyHero only — no local steel layer (avoids a lighter readiness slab).
 */
export function StepsActivityBars({
  values,
  labels,
  goal = null,
  readiness = null,
  hrvMs = null,
  restingHeartRate = null,
  isWeekView = false,
  className,
}: Props) {
  const goalValue =
    goal != null && Number.isFinite(goal) && goal > 0 ? goal : null
  // Include goal in the scale so the yellow line always sits inside the chart.
  const scaleMax = Math.max(...values, goalValue ?? 0, 1)
  const todayIdx = values.length - 1
  const band = readinessBand(readiness)
  const accent = band ? BAND_ACCENT[band] : "#64748b"
  const readinessScore =
    readiness != null && Number.isFinite(readiness)
      ? Math.max(0, Math.min(100, Math.round(readiness)))
      : null
  const readinessLabel = readinessScore != null ? String(readinessScore) : "—"
  const highReadinessPulse = band === "peak" || band === "high"
  const hrvLabel =
    hrvMs != null && Number.isFinite(hrvMs) ? String(Math.round(hrvMs)) : "—"
  const goalLineBottomPx =
    goalValue != null
      ? Math.max(4, Math.round((goalValue / scaleMax) * BAR_MAX_PX))
      : null

  return (
    <div
      className={cn("relative -mx-4 lg:-mx-5", className)}
      style={{
        perspective: "520px",
        perspectiveOrigin: "50% 120%",
      }}
    >
      {/* Floor grid behind bars — no local steel wash (card wash is continuous) */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-8 h-14 opacity-22"
        aria-hidden
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0.28 0.01 250 / 14%) 1px, transparent 1px), linear-gradient(to top, oklch(0.28 0.01 250 / 10%) 1px, transparent 1px)",
          backgroundSize: "14% 8px, 100% 8px",
          /* Offset so the first vertical grid line is not a bright strip on the card edge */
          backgroundPosition: "7% 0, 0 0",
          maskImage: "linear-gradient(to top, black, transparent)",
          transform: "rotateX(58deg) scaleY(0.85)",
          transformOrigin: "bottom center",
        }}
      />

      {/* Readiness — text inset; gradient full-bleed to card edges */}
      <Link
        href="/vitals"
        className="relative z-10 block transition-colors hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
      >
        <div className="flex items-center gap-2.5 px-4 py-2 lg:px-5">
          {/* Outer keeps isometric tilt; inner pulse won't clobber rotateX/Y */}
          <div
            className="relative flex h-16 w-16 shrink-0 items-center justify-center"
            style={{
              transform: "rotateX(8deg) rotateY(-12deg)",
              transformStyle: "preserve-3d",
            }}
          >
            <div
              className={cn(
                "absolute inset-0",
                highReadinessPulse &&
                  "motion-safe:animate-mesh-heart-pulse motion-reduce:animate-none",
              )}
            >
              <MeshHeartSvg
                accent={accent}
                pulse={highReadinessPulse}
                className="h-full w-full drop-shadow-[0_0_10px_rgba(100,116,139,0.28)]"
              />
            </div>
            <div className="relative z-10 flex flex-col items-center justify-center pt-px text-center">
              <span
                className="font-semibold tabular-nums leading-none tracking-tight text-foreground"
                style={{
                  fontSize: hrvLabel.length > 2 ? "1.05rem" : "1.25rem",
                  textShadow: `0 0 12px ${accent}66`,
                }}
              >
                {hrvLabel}
              </span>
              <span className="mt-px text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/65">
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
                {(hrvMs == null ||
                  (restingHeartRate != null && Number.isFinite(restingHeartRate))) && (
                  <p className="mt-0.5 truncate text-[12px] font-medium tabular-nums text-foreground/80">
                    {hrvMs == null ? (
                      <span className="text-muted-foreground/55">Sync Fitbit for HRV</span>
                    ) : null}
                    {restingHeartRate != null && Number.isFinite(restingHeartRate) ? (
                      <span className="text-muted-foreground/55">
                        {hrvMs == null ? " · " : null}
                        RHR {Math.round(restingHeartRate)}
                      </span>
                    ) : null}
                  </p>
                )}
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
          </div>
        </div>

        {/* Edge-to-edge band gradient — full overview card width + score tick */}
        <div
          className="relative h-1.5 w-full overflow-visible transition-opacity duration-700 ease-out"
          style={{
            opacity: readinessScore != null ? 1 : 0.45,
            background:
              readinessScore != null
                ? `linear-gradient(90deg, ${accent}55 0%, ${accent} 42%, ${accent}cc 100%)`
                : "linear-gradient(90deg, oklch(0.28 0.01 250 / 55%) 0%, oklch(0.34 0.01 250 / 70%) 50%, oklch(0.28 0.01 250 / 55%) 100%)",
            boxShadow: band
              ? `inset 0 1px 0 #ffffff44, 0 0 10px ${accent}55`
              : "inset 0 1px 0 oklch(0.40 0.01 250 / 22%)",
          }}
        >
          {readinessScore != null ? (
            <>
              <div
                className="absolute inset-x-0 top-0 h-1/2 opacity-40"
                style={{
                  background: "linear-gradient(180deg, #ffffff66, transparent)",
                }}
              />
              {/* Soft score-position tick so /100 isn't only a number on the right */}
              <div
                className="pointer-events-none absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${readinessScore}%` }}
                aria-hidden
              >
                <div
                  className="h-3 w-px rounded-full"
                  style={{
                    background: `linear-gradient(180deg, #ffffffcc, ${accent}, #ffffff88)`,
                    boxShadow: `0 0 6px ${accent}aa, 0 0 12px ${accent}55`,
                  }}
                />
                <div
                  className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    background: "#ffffff",
                    boxShadow: `0 0 8px ${accent}`,
                  }}
                />
              </div>
            </>
          ) : null}
        </div>
      </Link>

      {/* Soft seam only — no opaque cut between readiness and steps */}
      <div
        className="pointer-events-none h-px bg-gradient-to-r from-transparent via-white/5 to-transparent"
        aria-hidden
      />

      {/* Steps bars — re-inset to match card content padding */}
      <div className="relative z-10 px-4 pb-1 pt-2.5 lg:px-5">
        <div className="mb-2 flex items-end justify-between gap-2">
          <p className="type-hud-subsection">Steps Activity</p>
          <p className="text-[10px] tabular-nums tracking-wide text-muted-foreground/55">
            {values[todayIdx] > 0
              ? `${Math.round(values[todayIdx]).toLocaleString()} today`
              : "No steps yet"}
            {goalValue != null ? (
              <span className="text-amber-300/70">
                {" "}
                · goal {Math.round(goalValue).toLocaleString()}
              </span>
            ) : null}
          </p>
        </div>

        <div
          className="pointer-events-none absolute inset-x-4 bottom-[2.15rem] h-px bg-gradient-to-r from-transparent via-white/8 to-transparent lg:inset-x-5"
          aria-hidden
        />

        <div className="relative" style={{ transformStyle: "preserve-3d" }}>
          <div
            className="relative flex items-end justify-between gap-1 px-0.5"
            style={{ height: BAR_AREA_PX }}
          >
            {goalLineBottomPx != null ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-20"
                style={{ bottom: goalLineBottomPx }}
                aria-hidden
              >
                <div
                  className="mx-0.5 h-0 border-t-[1.5px] border-dashed border-amber-300/90"
                  style={{ boxShadow: "0 0 8px #fbbf2466" }}
                />
                <span className="absolute -top-3 right-0 text-[8px] font-semibold uppercase tracking-[0.14em] text-amber-300/85">
                  Goal
                </span>
              </div>
            ) : null}

            {values.map((val, i) => {
              const pct = scaleMax > 0 ? val / scaleMax : 0
              const heightPx = Math.max(10, Math.round(pct * BAR_MAX_PX))
              const isToday = i === todayIdx
              const delay = 280 + i * 70

              return (
                <div
                  key={i}
                  className="relative flex min-w-0 flex-1 justify-center"
                  style={{ height: BAR_AREA_PX, perspective: "240px" }}
                >
                  <div
                    className="absolute bottom-0 origin-bottom animate-bar-grow"
                    style={{
                      width: "78%",
                      maxWidth: 30,
                      height: heightPx,
                      animationDelay: `${delay}ms`,
                      transformStyle: "preserve-3d",
                      transform: "rotateX(12deg) rotateY(-18deg)",
                    }}
                  >
                    <div
                      className="absolute left-0 right-0 top-0"
                      style={{
                        height: 9,
                        transform: "translateY(-7px) rotateX(72deg)",
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
                        width: 8,
                        right: -7,
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
              )
            })}
          </div>

          <div className="mt-1.5 flex justify-between gap-1 px-0.5">
            {values.map((_, i) => {
              const isToday = i === todayIdx
              return (
                <span
                  key={`lbl-${i}`}
                  className={cn(
                    "min-w-0 flex-1 text-center text-[10px] tracking-wider",
                    isToday
                      ? "font-semibold text-emerald-300"
                      : "text-muted-foreground/50",
                  )}
                >
                  {labels[i] ?? ""}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
