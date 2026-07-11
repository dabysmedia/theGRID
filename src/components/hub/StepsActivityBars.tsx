"use client"

import { Plus } from "lucide-react"
import { MeshHeartSvg } from "@/components/hub/MeshHeartSvg"
import { useQuickLog } from "@/context/QuickLogContext"
import { cn } from "@/lib/utils"
import { useCountUp } from "@/components/useCountUp"
import type { CSSProperties } from "react"
import {
  READINESS_BAND_ACCENT,
  READINESS_BAND_LABEL,
  readinessBand,
} from "@/lib/readiness-score"

/** Collapsed fallback when not using `--hub-bar-area` (matches CSS clamp max). */
const BAR_AREA_PX = 76
const BAR_MAX_PX = 72
/** Expanded chart: room for per-day value labels above taller bars. */
const BAR_AREA_EXPANDED_PX = 128
const BAR_MAX_EXPANDED_PX = 100
const VALUE_LABEL_SLOT_PX = 22

/** Compact step count for bar caps (e.g. 8.2k, 450). */
function formatBarSteps(value: number): string {
  const n = Math.round(value)
  if (n <= 0) return "—"
  if (n >= 10_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  if (n >= 1000) {
    const k = n / 1000
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`
  }
  return n.toLocaleString()
}

type Props = {
  values: number[]
  labels: string[]
  /** Daily step goal — drawn as a dotted yellow projection line across the bars. */
  goal?: number | null
  readiness?: number | null
  hrvMs?: number | null
  restingHeartRate?: number | null
  isWeekView?: boolean
  /** Hub expand: taller bars + per-day values + today/goal/week summary + log. */
  expanded?: boolean
  /** Tap the steps chart (collapsed) or header to expand/collapse steps. */
  onStepsClick?: () => void
  /** When set, readiness/HRV row toggles vitals expand instead of navigating away. */
  onReadinessClick?: () => void
  readinessSelected?: boolean
  /** Hide readiness while the steps panel is expanded. */
  hideReadiness?: boolean
  /** Hide the steps chart (keep readiness) — used when vitals panel is open. */
  hideSteps?: boolean
  /** Whether the chart is currently exposed in the hub stack. */
  chartVisible?: boolean
  /** Collapsed hub: use viewport-scaled bar area (`--hub-bar-area`) instead of fixed px. */
  scaleToFit?: boolean
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
  expanded = false,
  onStepsClick,
  onReadinessClick,
  readinessSelected = false,
  hideReadiness = false,
  hideSteps = false,
  chartVisible: _chartVisible = true,
  scaleToFit = false,
  className,
}: Props) {
  const { openQuickLog } = useQuickLog()
  const goalValue =
    goal != null && Number.isFinite(goal) && goal > 0 ? goal : null
  // Include goal in the scale so the yellow line always sits inside the chart.
  const scaleMax = Math.max(...values, goalValue ?? 0, 1)
  const todayIdx = values.length - 1
  const useScaledBars = scaleToFit && !expanded
  const barAreaPx = expanded ? BAR_AREA_EXPANDED_PX : BAR_AREA_PX
  const barMaxPx = expanded ? BAR_MAX_EXPANDED_PX : BAR_MAX_PX
  const barFillRatio = barMaxPx / barAreaPx
  const barAreaStyle = useScaledBars
    ? ({ height: "var(--hub-bar-area)" } as const)
    : ({ height: barAreaPx } as const)
  const band = readinessBand(readiness)
  const accent = band ? READINESS_BAND_ACCENT[band] : "#64748b"
  const readinessScore =
    readiness != null && Number.isFinite(readiness)
      ? Math.max(0, Math.min(100, Math.round(readiness)))
      : null
  const readinessLabel = readinessScore != null ? String(readinessScore) : "—"
  const highReadinessPulse = band === "peak" || band === "high"
  const animatedHrv = useCountUp(
    hrvMs != null && Number.isFinite(hrvMs) ? Math.round(hrvMs) : null,
    { durationMs: 1100, enabled: !hideReadiness },
  )
  const hrvLabel =
    hrvMs != null && Number.isFinite(hrvMs) ? String(Math.round(hrvMs)) : "—"
  const goalLineBottomPx =
    goalValue != null && !useScaledBars
      ? Math.max(4, Math.round((goalValue / scaleMax) * barMaxPx))
      : null
  const goalLineBottomPct =
    goalValue != null && useScaledBars
      ? Math.max(4, (goalValue / scaleMax) * barFillRatio * 100)
      : null
  const todaySteps = values[todayIdx] ?? 0
  const loggedDays = values.filter((v) => v > 0)
  const weekAvg =
    loggedDays.length > 0
      ? Math.round(loggedDays.reduce((s, v) => s + v, 0) / loggedDays.length)
      : 0
  const daysHitGoal =
    goalValue != null ? values.filter((v) => v >= goalValue).length : 0
  const stepsInteractive = Boolean(onStepsClick) && !hideSteps
  /** Chart surface expands when collapsed; collapse via ring / back / title. */
  const chartExpandsOnTap = stepsInteractive && !expanded

  return (
    <div
      className={cn("relative -mx-4 lg:-mx-5", className)}
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
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          hideReadiness
            ? "pointer-events-none grid-rows-[0fr] opacity-0"
            : "grid-rows-[1fr] opacity-100",
        )}
        aria-hidden={hideReadiness}
      >
      <div className="min-h-0 overflow-hidden">
      <button
        type="button"
        onClick={onReadinessClick}
        aria-label={readinessSelected ? "Collapse vitals" : "Expand vitals"}
        aria-expanded={readinessSelected}
        tabIndex={hideReadiness ? -1 : undefined}
        className={cn(
          "relative z-10 block w-full text-left transition-colors hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
          readinessSelected && "bg-muted/10",
          !onReadinessClick && "pointer-events-none",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2.5 px-4 py-2 lg:px-5",
            scaleToFit && !expanded && "max-lg:gap-2 max-lg:py-1.5",
          )}
        >
          {/* Outer keeps isometric tilt; inner pulse won't clobber rotateX/Y */}
          <div
            className={cn(
              "relative flex h-16 w-16 shrink-0 items-center justify-center",
              scaleToFit && !expanded && "max-lg:h-12 max-lg:w-12",
            )}
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
                {animatedHrv != null ? Math.round(animatedHrv) : hrvLabel}
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
              "linear-gradient(90deg, oklch(0.28 0.01 250 / 55%) 0%, oklch(0.34 0.01 250 / 70%) 50%, oklch(0.28 0.01 250 / 55%) 100%)",
          }}
        >
          {readinessScore != null ? (
            <>
              <div
                className={cn(
                  "absolute inset-0 origin-left",
                  !hideReadiness &&
                    "animate-readiness-bar motion-reduce:animate-none",
                )}
                style={{
                  background: `linear-gradient(90deg, ${accent}55 0%, ${accent} 42%, ${accent}cc 100%)`,
                  boxShadow: band
                    ? `inset 0 1px 0 #ffffff44, 0 0 10px ${accent}55`
                    : "inset 0 1px 0 oklch(0.40 0.01 250 / 22%)",
                }}
              />
              <div
                className="absolute inset-x-0 top-0 h-1/2 opacity-40"
                style={{
                  background: "linear-gradient(180deg, #ffffff66, transparent)",
                }}
              />
              {/* Soft score-position tick so /100 isn't only a number on the right */}
              <div
                className={cn(
                  "pointer-events-none absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2",
                  !hideReadiness &&
                    "animate-readiness-marker motion-reduce:animate-none",
                )}
                style={
                  {
                    left: `${readinessScore}%`,
                    "--readiness-position": `${readinessScore}%`,
                  } as CSSProperties
                }
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
      </button>
      </div>
      </div>

      {/* Soft seam only — no opaque cut between readiness and steps */}
      {!hideSteps ? (
        <div
          className={cn(
            "pointer-events-none bg-gradient-to-r from-transparent via-white/5 to-transparent transition-[height,opacity] duration-500",
            hideReadiness ? "h-0 opacity-0" : "h-px opacity-100",
          )}
          aria-hidden
        />
      ) : null}

      {/* Steps bars — same instance grows in place on expand (no remount). */}
      {!hideSteps ? (
      <div
        className={cn(
          "relative z-10 px-4 pb-1 pt-2.5 transition-[padding] duration-500 ease-out lg:px-5",
          expanded && "pb-3 pt-3",
          scaleToFit && !expanded && "max-lg:pt-1.5",
        )}
      >
        <div className="mb-2 flex items-end justify-between gap-1.5">
          {stepsInteractive ? (
            <button
              type="button"
              onClick={onStepsClick}
              aria-label={expanded ? "Collapse steps" : "Expand steps"}
              aria-expanded={expanded}
              className="min-w-0 shrink rounded-md text-left type-hud-subsection transition-colors hover:text-emerald-200/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30"
            >
              Steps Activity
            </button>
          ) : (
            <p className="min-w-0 shrink type-hud-subsection">Steps Activity</p>
          )}
          <p className="-mr-0.5 shrink-0 whitespace-nowrap text-[10px] tabular-nums tracking-normal text-muted-foreground/55">
            {todaySteps > 0
              ? `${Math.round(todaySteps).toLocaleString()} today`
              : "No steps yet"}
            {goalValue != null ? (
              <span className="text-amber-300/70">
                {" "}
                · goal {Math.round(goalValue).toLocaleString()}
              </span>
            ) : null}
          </p>
        </div>

        {/* Summary strip — grid-rows collapse so expand grows from the chart */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity,margin] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            expanded
              ? "mb-3 grid-rows-[1fr] opacity-100"
              : "pointer-events-none mb-0 grid-rows-[0fr] opacity-0",
          )}
          aria-hidden={!expanded}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="grid grid-cols-3 gap-2">
              <div className="min-w-0">
                <p className="type-hud-micro text-muted-foreground/55">Today</p>
                <p className="type-hud-stat-sm tabular-nums text-emerald-300">
                  {Math.round(todaySteps).toLocaleString()}
                </p>
              </div>
              <div className="min-w-0">
                <p className="type-hud-micro text-muted-foreground/55">Goal</p>
                <p className="type-hud-stat-sm tabular-nums text-amber-200/90">
                  {goalValue != null ? Math.round(goalValue).toLocaleString() : "—"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="type-hud-micro text-muted-foreground/55">7-day avg</p>
                <p className="type-hud-stat-sm tabular-nums text-foreground/85">
                  {weekAvg > 0 ? weekAvg.toLocaleString() : "—"}
                </p>
                {goalValue != null ? (
                  <p className="mt-0.5 text-[9px] text-muted-foreground/50">
                    {daysHitGoal}/{values.length} hit goal
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div
          className="pointer-events-none absolute inset-x-4 bottom-[2.15rem] h-px bg-gradient-to-r from-transparent via-white/8 to-transparent lg:inset-x-5"
          aria-hidden
        />

        <div
          role={chartExpandsOnTap ? "button" : undefined}
          tabIndex={chartExpandsOnTap ? 0 : undefined}
          aria-label={chartExpandsOnTap ? "Expand steps chart" : undefined}
          onClick={chartExpandsOnTap ? onStepsClick : undefined}
          onKeyDown={
            chartExpandsOnTap
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onStepsClick?.()
                  }
                }
              : undefined
          }
          className={cn(
            "relative outline-none",
            chartExpandsOnTap &&
              "cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-emerald-400/30",
          )}
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="relative flex items-end justify-between gap-1 px-0.5 transition-[height] duration-500 ease-out motion-reduce:transition-none"
            style={barAreaStyle}
          >
            {goalLineBottomPx != null || goalLineBottomPct != null ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 transition-[bottom] duration-500 ease-out"
                style={
                  goalLineBottomPct != null
                    ? { bottom: `${goalLineBottomPct}%` }
                    : { bottom: goalLineBottomPx! }
                }
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
              const heightPx = Math.max(10, Math.round(pct * barMaxPx))
              const heightPct = Math.max(
                (10 / barAreaPx) * 100,
                pct * barFillRatio * 100,
              )
              const isToday = i === todayIdx
              const delay = 60 + i * 95
              const hitGoal = goalValue != null && val >= goalValue

              return (
                <div
                  key={i}
                  className="relative flex min-w-0 flex-1 justify-center"
                  style={barAreaStyle}
                >
                  {/* Per-day step value — fades in as the chart grows */}
                  <div
                    className={cn(
                      "pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 text-center transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none",
                      expanded
                        ? "translate-y-0 opacity-100"
                        : "translate-y-1 opacity-0",
                    )}
                    style={{
                      bottom: useScaledBars
                        ? `calc(${heightPct}% + 4px)`
                        : heightPx + (expanded ? 10 : 4),
                      minHeight: VALUE_LABEL_SLOT_PX,
                    }}
                    aria-hidden={!expanded}
                  >
                    <span
                      className={cn(
                        "block text-[9px] font-semibold tabular-nums leading-none tracking-tight sm:text-[10px]",
                        isToday
                          ? "text-emerald-200"
                          : hitGoal
                            ? "text-emerald-300/80"
                            : "text-muted-foreground/70",
                      )}
                      style={
                        isToday
                          ? { textShadow: "0 0 10px #22c55e66" }
                          : undefined
                      }
                    >
                      {formatBarSteps(val)}
                    </span>
                  </div>

                  {/* Upright rectangular bars: height morph and entrance grow stay independent. */}
                  <div
                    className="absolute bottom-0 transition-[height,max-width] duration-500 ease-out motion-reduce:transition-none"
                    style={{
                      width: "72%",
                      maxWidth: expanded ? 36 : 32,
                      height: useScaledBars ? `${heightPct}%` : heightPx,
                    }}
                  >
                    <div
                      className="absolute inset-0 origin-bottom overflow-hidden rounded-t-[4px] rounded-b-[1px] border border-emerald-200/10 animate-bar-grow motion-reduce:animate-none"
                      style={{
                        transitionDelay: `${delay}ms`,
                        background: isToday
                          ? "linear-gradient(180deg, #86efac 0%, #22c55e 38%, #15803d 100%)"
                          : "linear-gradient(180deg, #4ade80aa 0%, #16a34a88 52%, #14532d77 100%)",
                        boxShadow: isToday
                          ? "inset 0 1px 0 #dcfce7aa, 0 0 14px #22c55e55"
                          : "inset 0 1px 0 #bbf7d044, 0 0 7px #22c55e22",
                      }}
                    >
                      <div
                        className="absolute inset-x-0 top-0 h-1/3 opacity-35"
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

        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity,margin] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            expanded
              ? "mt-3 grid-rows-[1fr] opacity-100"
              : "pointer-events-none mt-0 grid-rows-[0fr] opacity-0",
          )}
          aria-hidden={!expanded}
        >
          <div className="min-h-0 overflow-hidden">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openQuickLog("steps")
              }}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] type-hud-micro text-muted-foreground/90 transition-colors hover:border-emerald-400/30 hover:bg-emerald-400/[0.06] hover:text-emerald-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 sm:w-auto sm:px-4"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Log steps
            </button>
          </div>
        </div>
      </div>
      ) : null}
    </div>
  )
}
