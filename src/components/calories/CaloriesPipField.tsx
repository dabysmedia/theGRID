"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { caloriePipAccentHex } from "@/components/calories/CaloriePipTracker"

const COLS = 14
const ROWS = 9
const PIP_COUNT = COLS * ROWS

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

function IsoPip({
  lit,
  partial,
  accent,
  delayMs,
}: {
  lit: boolean
  partial: boolean
  accent: string
  delayMs: number
}) {
  const top = shade(accent, 58)
  const mid = shade(accent, 14)
  const side = shade(accent, -48)
  const emptyFront = "oklch(0.28 0.014 250 / 70%)"
  const emptyTop = "oklch(0.36 0.014 250 / 55%)"
  const emptySide = "oklch(0.2 0.012 250 / 65%)"

  return (
    <div className="relative aspect-square w-full">
      <div
        className={cn(
          "absolute inset-[10%] origin-bottom",
          lit && "motion-safe:animate-calorie-pip-pop motion-reduce:animate-none",
        )}
        style={{
          animationDelay: lit ? `${delayMs}ms` : undefined,
          opacity: partial ? 0.72 : 1,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            borderRadius: "1.5px",
            background: lit
              ? `linear-gradient(180deg, ${mid} 0%, ${accent} 52%, ${side} 100%)`
              : emptyFront,
            boxShadow: lit
              ? `inset 0 1px 0 ${top}aa, 0 0 12px ${accent}44`
              : "inset 0 0 0 1px oklch(0.55 0.01 250 / 14%)",
          }}
        />
        <div
          className="absolute left-0 right-[16%] top-0"
          style={{
            height: "36%",
            transform: "translateY(-70%) skewX(-30deg)",
            transformOrigin: "bottom left",
            background: lit ? `linear-gradient(135deg, ${top}, ${mid})` : emptyTop,
          }}
        />
        <div
          className="absolute bottom-0 right-0 top-[2%]"
          style={{
            width: "20%",
            transform: "translateX(68%) skewY(-30deg)",
            transformOrigin: "left bottom",
            background: lit
              ? `linear-gradient(180deg, ${shade(accent, -22)}, ${side})`
              : emptySide,
          }}
        />
      </div>
    </div>
  )
}

/**
 * Expand-mode pip field — CSS isometric grid (no WebGL).
 * Fills bottom-up to match intake %, with clear lit/empty contrast.
 */
export function CaloriesPipField({
  consumed,
  target,
  className,
}: {
  consumed: number
  target: number
  className?: string
}) {
  const accent = caloriePipAccentHex(consumed, target)
  const filledAmount =
    target > 0 ? Math.min(PIP_COUNT, (consumed / target) * PIP_COUNT) : 0
  const fullPips = Math.floor(filledAmount + 1e-9)
  const partialFill = filledAmount - fullPips
  const remaining = target > 0 ? Math.max(0, target - consumed) : 0

  const visualIndices = useMemo(() => {
    const idxs: number[] = []
    for (let r = ROWS - 1; r >= 0; r--) {
      for (let c = 0; c < COLS; c++) {
        idxs.push(r * COLS + c)
      }
    }
    return idxs
  }, [])

  return (
    <div
      className={cn("relative flex h-full min-h-0 w-full flex-col", className)}
      role="img"
      aria-label={
        target > 0
          ? `${consumed.toLocaleString()} eaten, ${remaining.toLocaleString()} left of ${target.toLocaleString()} calorie target`
          : `${consumed.toLocaleString()} calories consumed`
      }
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-50 blur-2xl"
        style={{
          background: `radial-gradient(ellipse 75% 70% at 40% 70%, ${accent}28 0%, transparent 68%)`,
        }}
        aria-hidden
      />
      <div className="relative flex min-h-0 flex-1 flex-col justify-end px-1.5 pb-1.5 pt-2.5 sm:px-2.5">
        <div
          className="relative mx-auto w-full max-w-[20rem] sm:max-w-[24rem]"
          style={{ aspectRatio: `${COLS} / ${ROWS}` }}
        >
          <div
            className="grid h-full w-full"
            style={{
              gap: "5px",
              gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
              paddingRight: "5%",
              paddingTop: "6%",
            }}
          >
            {visualIndices.map((dataIndex, visualOrder) => {
              const isEaten = dataIndex < fullPips
              const isPartial = dataIndex === fullPips && partialFill > 0.12
              const rowFromBottom = Math.floor(dataIndex / COLS)
              const col = dataIndex % COLS
              const delayMs = Math.min(
                640,
                rowFromBottom * 28 + col * 8 + (visualOrder % 4) * 3,
              )
              return (
                <IsoPip
                  key={dataIndex}
                  lit={isEaten || isPartial}
                  partial={isPartial}
                  accent={accent}
                  delayMs={delayMs}
                />
              )
            })}
          </div>
        </div>
        {target > 0 ? (
          <p className="mt-2 text-center text-[9px] font-medium tabular-nums tracking-wide text-muted-foreground/50">
            {Math.round(filledAmount)}/{PIP_COUNT} pips
            {` · ${Math.round((consumed / target) * 100)}%`}
          </p>
        ) : null}
      </div>
    </div>
  )
}
