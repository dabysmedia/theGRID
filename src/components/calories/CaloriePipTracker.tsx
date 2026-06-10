"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"

/** Over budget (red) only at ≥101% of target */
const OVER_TARGET_RATIO = 1.01

const PIP_GAP_PX = 3

const SIZE_CONFIG = {
  default: {
    pipCount: 100,
    columns: 50,
    pipClass: "rounded-[2px] sm:rounded-[3px]",
    glow: true,
  },
  compact: {
    pipCount: 288,
    columns: 24,
    pipClass: "rounded-[1.5px] sm:rounded-[2px]",
    glow: false,
  },
} as const

export function caloriePipAccentHex(consumed: number, target: number): string {
  if (target <= 0) return "#38bdf8"
  const r = consumed / target
  if (r >= OVER_TARGET_RATIO) return "#f87171"
  if (r >= 0.95) return "#059669"
  return "#0284c7"
}

export type CaloriePipTrackerProps = {
  consumed: number
  target: number
  size?: keyof typeof SIZE_CONFIG
  /** Override grid columns (defaults from size preset) */
  columns?: number
  className?: string
}

function pipColumnTemplate(columns: number): string {
  const totalGap = (columns - 1) * PIP_GAP_PX
  return `repeat(${columns}, calc((100% - ${totalGap}px) / ${columns}))`
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

  const accent = caloriePipAccentHex(consumed, target)
  const ratio = target > 0 ? consumed / target : 0
  const filledAmount = target > 0 ? Math.min(pipCount, ratio * pipCount) : 0
  const fullPips = Math.floor(filledAmount)
  const partialFill = filledAmount - fullPips
  const remaining = target > 0 ? Math.max(0, target - consumed) : 0

  const gridStyle = useMemo(
    () => ({
      gap: `${PIP_GAP_PX}px`,
      gridTemplateColumns: pipColumnTemplate(gridColumns),
      ...(size === "compact"
        ? {
            height: "100%",
            gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`,
            alignContent: "stretch",
          }
        : {}),
    }),
    [gridColumns, rowCount, size]
  )

  return (
    <div
      className={cn(
        "relative min-h-0 min-w-0",
        size === "compact" ? "h-full w-full" : "w-full",
        className
      )}
      role="img"
      aria-label={
        target > 0
          ? `${consumed.toLocaleString()} eaten, ${remaining.toLocaleString()} available of ${target.toLocaleString()} calorie target`
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
      <div className="relative grid h-full min-h-0 w-full min-w-0" style={gridStyle}>
        {Array.from({ length: pipCount }, (_, i) => {
          const isEaten = i < fullPips
          const isPartialEaten = i === fullPips && partialFill > 0
          const isAvailable = !isEaten && !isPartialEaten && target > 0 && ratio < 1

          return (
            <span
              key={i}
              className={cn(
                config.pipClass,
                "box-border min-h-0 min-w-0 border border-transparent transition-[background-color,opacity,border-color] duration-500 ease-out",
                size === "compact" ? "h-full w-full" : "aspect-square w-full",
                !isEaten && !isPartialEaten && !isAvailable && "bg-muted/12 dark:bg-muted/20",
                isAvailable && "bg-transparent"
              )}
              style={
                isEaten
                  ? { backgroundColor: accent }
                  : isPartialEaten
                    ? {
                        backgroundColor: accent,
                        opacity: Math.max(0.35, partialFill),
                      }
                    : isAvailable
                      ? { borderColor: `${accent}38` }
                      : undefined
              }
            />
          )
        })}
      </div>
    </div>
  )
}
