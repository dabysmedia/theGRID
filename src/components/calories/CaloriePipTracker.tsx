"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"

/** Over budget (red) only at ≥101% of target */
const OVER_TARGET_RATIO = 1.01

/**
 * Dense instrument grid (~screenshot density).
 * Each pip = target / pipCount calories so the fill always maths out.
 */
const SIZE_CONFIG = {
  default: {
    pipCount: 312,
    columns: 26,
    gapPx: 2,
    glow: true,
    /** Extra vertical room for isometric top/side faces */
    extrude: true,
  },
  compact: {
    pipCount: 288,
    columns: 24,
    gapPx: 1.5,
    glow: false,
    extrude: true,
  },
} as const

export function caloriePipAccentHex(consumed: number, target: number): string {
  if (target <= 0) return "#38bdf8"
  const r = consumed / target
  if (r >= OVER_TARGET_RATIO) return "#f87171"
  if (r >= 0.95) return "#059669"
  return "#0284c7"
}

function shade(hex: string, amount: number): string {
  const raw = hex.replace("#", "")
  if (raw.length !== 6) return hex
  const n = Number.parseInt(raw, 16)
  if (!Number.isFinite(n)) return hex
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount))
  const b = Math.max(0, Math.min(255, (n & 255) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`
}

export type CaloriePipTrackerProps = {
  consumed: number
  target: number
  size?: keyof typeof SIZE_CONFIG
  /** Override grid columns (defaults from size preset) */
  columns?: number
  className?: string
}

function pipColumnTemplate(columns: number, gapPx: number): string {
  const totalGap = (columns - 1) * gapPx
  return `repeat(${columns}, calc((100% - ${totalGap}px) / ${columns}))`
}

function IsometricPip({
  state,
  accent,
  delayMs,
  compact,
}: {
  state: "eaten" | "partial" | "available" | "empty"
  accent: string
  delayMs: number
  compact: boolean
}) {
  const top = shade(accent, 48)
  const side = shade(accent, -42)
  const front = accent
  const lit = state === "eaten" || state === "partial"
  const partialOpacity = state === "partial" ? 0.55 : 1

  return (
    <div
      className={cn(
        "relative min-h-0 min-w-0",
        compact ? "h-full w-full" : "aspect-square w-full",
      )}
      style={{ perspective: "120px" }}
    >
      {/* Outer keeps isometric tilt; inner rise anim won't clobber rotateX/Y */}
      <div
        className="absolute inset-[8%]"
        style={{
          transform: "rotateX(14deg) rotateY(-22deg)",
          transformStyle: "preserve-3d",
          opacity: state === "partial" ? partialOpacity : undefined,
        }}
      >
        <div
          className={cn(
            "absolute inset-0 origin-bottom",
            lit && "motion-safe:animate-calorie-pip-rise motion-reduce:animate-none",
          )}
          style={{
            transformStyle: "preserve-3d",
            animationDelay: lit ? `${delayMs}ms` : undefined,
          }}
        >
          {/* Top face */}
          <div
            className="absolute left-0 right-0 top-0"
            style={{
              height: compact ? "28%" : "30%",
              transform: "translateY(-70%) rotateX(68deg)",
              transformOrigin: "bottom",
              background: lit
                ? `linear-gradient(135deg, ${top}, ${front})`
                : state === "available"
                  ? `${accent}22`
                  : "oklch(0.32 0.01 250 / 35%)",
              boxShadow: lit ? `0 0 6px ${accent}44` : undefined,
            }}
          />
          {/* Right face */}
          <div
            className="absolute bottom-0 top-[8%]"
            style={{
              width: compact ? "22%" : "24%",
              right: compact ? "-14%" : "-16%",
              transform: "skewY(-36deg)",
              transformOrigin: "left bottom",
              background: lit
                ? `linear-gradient(180deg, ${side}, ${shade(side, -20)})`
                : state === "available"
                  ? `${accent}14`
                  : "oklch(0.24 0.01 250 / 40%)",
            }}
          />
          {/* Front face */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              borderRadius: "1px",
              background: lit
                ? `linear-gradient(180deg, ${shade(front, 18)} 0%, ${front} 48%, ${side} 100%)`
                : state === "available"
                  ? "transparent"
                  : "oklch(0.28 0.01 250 / 28%)",
              boxShadow: lit
                ? `inset 0 1px 0 ${top}88, 0 0 8px ${accent}33`
                : state === "available"
                  ? `inset 0 0 0 1px ${accent}40`
                  : "inset 0 0 0 1px oklch(0.45 0.01 250 / 18%)",
            }}
          >
            {lit ? (
              <div
                className="absolute inset-x-0 top-0 h-1/3 opacity-35"
                style={{
                  background: "linear-gradient(180deg, #ffffff66, transparent)",
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export function CaloriePipTracker({
  consumed,
  target,
  size = "default",
  columns,
  className,
}: CaloriePipTrackerProps) {
  const config = SIZE_CONFIG[size]
  const pipCount = config.pipCount
  const gridColumns = columns ?? config.columns
  const rowCount = Math.ceil(pipCount / gridColumns)
  const gapPx = config.gapPx
  const compact = size === "compact"

  const accent = caloriePipAccentHex(consumed, target)
  const ratio = target > 0 ? consumed / target : 0
  /** Exact fill: each pip represents target/pipCount calories. */
  const filledAmount = target > 0 ? Math.min(pipCount, (consumed / target) * pipCount) : 0
  const fullPips = Math.floor(filledAmount)
  const partialFill = filledAmount - fullPips
  const remaining = target > 0 ? Math.max(0, target - consumed) : 0
  const calPerPip = target > 0 ? target / pipCount : 0

  const gridStyle = useMemo(
    () => ({
      gap: `${gapPx}px`,
      gridTemplateColumns: pipColumnTemplate(gridColumns, gapPx),
      height: "100%",
      gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`,
      alignContent: "stretch" as const,
    }),
    [gapPx, gridColumns, rowCount],
  )

  return (
    <div
      className={cn(
        "relative min-h-0 min-w-0",
        "h-full w-full",
        className,
      )}
      role="img"
      aria-label={
        target > 0
          ? `${consumed.toLocaleString()} eaten, ${remaining.toLocaleString()} available of ${target.toLocaleString()} calorie target (${Math.round(calPerPip)} cal per pip)`
          : `${consumed.toLocaleString()} calories consumed`
      }
    >
      {config.glow && (
        <div
          className="pointer-events-none absolute -inset-x-2 -inset-y-3 rounded-xl opacity-50 blur-2xl"
          style={{
            background: `radial-gradient(ellipse 90% 80% at 50% 50%, ${accent}16 0%, transparent 70%)`,
          }}
          aria-hidden
        />
      )}
      <div
        className="relative grid h-full min-h-0 w-full min-w-0"
        style={{
          ...gridStyle,
          perspective: "640px",
          perspectiveOrigin: "50% 120%",
        }}
      >
        {Array.from({ length: pipCount }, (_, i) => {
          const isEaten = i < fullPips
          const isPartialEaten = i === fullPips && partialFill > 0.08
          const isAvailable = !isEaten && !isPartialEaten && target > 0 && ratio < 1
          const state = isEaten
            ? "eaten"
            : isPartialEaten
              ? "partial"
              : isAvailable
                ? "available"
                : "empty"
          const row = Math.floor(i / gridColumns)
          const col = i % gridColumns
          const delayMs = Math.min(900, row * 28 + col * 8)

          return (
            <IsometricPip
              key={i}
              state={state}
              accent={accent}
              delayMs={delayMs}
              compact={compact}
            />
          )
        })}
      </div>
    </div>
  )
}
