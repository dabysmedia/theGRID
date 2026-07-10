"use client"

import dynamic from "next/dynamic"
import { useMemo } from "react"
import { cn } from "@/lib/utils"

/** Must match CaloriePipScene tank (20×10). */
const THREE_PIP_COUNT = 200

/** Over budget (red) only at ≥101% of target */
const OVER_TARGET_RATIO = 1.01

const CaloriePipScene = dynamic(
  () =>
    import("@/components/calories/CaloriePipScene").then((m) => m.CaloriePipScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-48 w-full items-center justify-center sm:h-56">
        <div className="h-24 w-2/3 animate-pulse rounded-xl bg-muted/15" />
      </div>
    ),
  },
)

/**
 * Compact SYSTEMS tile stays CSS (no WebGL).
 * Default / expanded views use the Three.js isometric tank.
 */
const COMPACT = {
  pipCount: 100,
  columns: 20,
  gapPx: 5,
} as const

export function caloriePipAccentHex(consumed: number, target: number): string {
  if (target <= 0) return "#38bdf8"
  const r = consumed / target
  if (r >= OVER_TARGET_RATIO) return "#f87171"
  if (r >= 0.95) return "#34d399"
  return "#38bdf8"
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
  size?: "default" | "compact"
  /** Override grid columns (compact CSS only) */
  columns?: number
  /** Stretch the 3D tank to the parent height (hub expand background). */
  fillHeight?: boolean
  /** Hide the cal/pip meta line under the tank. */
  hideMeta?: boolean
  className?: string
}

function CompactIsoPip({
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
  const top = shade(accent, 55)
  const mid = shade(accent, 12)
  const side = shade(accent, -55)
  const emptyFront = "oklch(0.30 0.012 250 / 55%)"
  const emptyTop = "oklch(0.38 0.012 250 / 45%)"
  const emptySide = "oklch(0.22 0.01 250 / 55%)"

  return (
    <div className="relative aspect-square w-full">
      <div
        className={cn(
          "absolute inset-[12%] origin-bottom",
          lit && "motion-safe:animate-calorie-pip-pop motion-reduce:animate-none",
        )}
        style={{
          animationDelay: lit ? `${delayMs}ms` : undefined,
          opacity: partial ? 0.65 : 1,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            borderRadius: "1px",
            background: lit
              ? `linear-gradient(180deg, ${mid} 0%, ${accent} 55%, ${side} 100%)`
              : emptyFront,
            boxShadow: lit
              ? `inset 0 1px 0 ${top}99, 0 0 10px ${accent}55`
              : "inset 0 0 0 1px oklch(0.5 0.01 250 / 12%)",
          }}
        />
        <div
          className="absolute left-0 right-[18%] top-0"
          style={{
            height: "34%",
            transform: "translateY(-72%) skewX(-32deg)",
            transformOrigin: "bottom left",
            background: lit ? `linear-gradient(135deg, ${top}, ${mid})` : emptyTop,
          }}
        />
        <div
          className="absolute bottom-0 right-0 top-[2%]"
          style={{
            width: "22%",
            transform: "translateX(72%) skewY(-32deg)",
            transformOrigin: "left bottom",
            background: lit
              ? `linear-gradient(180deg, ${shade(accent, -28)}, ${side})`
              : emptySide,
          }}
        />
      </div>
    </div>
  )
}

function CompactPipGrid({
  consumed,
  target,
  columns,
  className,
}: {
  consumed: number
  target: number
  columns?: number
  className?: string
}) {
  const pipCount = COMPACT.pipCount
  const gridColumns = columns ?? COMPACT.columns
  const rowCount = Math.ceil(pipCount / gridColumns)
  const gapPx = COMPACT.gapPx
  const accent = caloriePipAccentHex(consumed, target)
  const filledAmount =
    target > 0 ? Math.min(pipCount, (consumed / target) * pipCount) : 0
  const fullPips = Math.floor(filledAmount + 1e-9)
  const partialFill = filledAmount - fullPips

  const visualIndices = useMemo(() => {
    const idxs: number[] = []
    for (let r = rowCount - 1; r >= 0; r--) {
      for (let c = 0; c < gridColumns; c++) {
        const i = r * gridColumns + c
        if (i < pipCount) idxs.push(i)
      }
    }
    return idxs
  }, [gridColumns, pipCount, rowCount])

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full flex-col justify-end",
        className,
      )}
    >
      <div
        className="relative w-full max-h-full"
        style={{ aspectRatio: `${gridColumns} / ${rowCount}` }}
      >
        <div
          className="grid h-full w-full"
          style={{
            gap: `${gapPx}px`,
            gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`,
            paddingRight: "5%",
            paddingTop: "6%",
          }}
        >
          {visualIndices.map((dataIndex, visualOrder) => {
            const isEaten = dataIndex < fullPips
            const isPartial = dataIndex === fullPips && partialFill > 0.12
            const rowFromBottom = Math.floor(dataIndex / gridColumns)
            const col = dataIndex % gridColumns
            const delayMs = Math.min(
              720,
              rowFromBottom * 36 + col * 10 + (visualOrder % 3) * 4,
            )
            return (
              <CompactIsoPip
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
    </div>
  )
}

export function CaloriePipTracker({
  consumed,
  target,
  size = "default",
  columns,
  fillHeight = false,
  hideMeta = false,
  className,
}: CaloriePipTrackerProps) {
  const accent = caloriePipAccentHex(consumed, target)
  const pipCount = size === "compact" ? COMPACT.pipCount : THREE_PIP_COUNT
  const remaining = target > 0 ? Math.max(0, target - consumed) : 0
  const calPerPip = target > 0 ? target / pipCount : 0
  const filledAmount =
    target > 0 ? Math.min(pipCount, (consumed / target) * pipCount) : 0
  const ratio = target > 0 ? consumed / target : 0

  if (size === "compact") {
    return (
      <div
        className={cn("relative h-full w-full min-w-0", className)}
        role="img"
        aria-label={
          target > 0
            ? `${consumed.toLocaleString()} eaten, ${remaining.toLocaleString()} available of ${target.toLocaleString()} calorie target`
            : `${consumed.toLocaleString()} calories consumed`
        }
      >
        <CompactPipGrid
          consumed={consumed}
          target={target}
          columns={columns}
          className="h-full"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative mx-auto w-full min-w-0 max-w-full",
        fillHeight && "h-full max-w-none",
        className,
      )}
      role="img"
      aria-label={
        target > 0
          ? `${consumed.toLocaleString()} eaten, ${remaining.toLocaleString()} available of ${target.toLocaleString()} calorie target (${Math.round(calPerPip)} cal per pip)`
          : `${consumed.toLocaleString()} calories consumed`
      }
    >
      <div
        className="pointer-events-none absolute -inset-x-3 -inset-y-4 rounded-2xl opacity-30 blur-2xl"
        style={{
          background: `radial-gradient(ellipse 80% 70% at 50% 70%, ${accent}12 0%, transparent 72%)`,
        }}
        aria-hidden
      />
      <div
        className={cn(
          "relative w-full touch-none",
          fillHeight
            ? "h-full opacity-[0.48]"
            : "h-[min(58vh,28rem)] sm:h-[min(56vh,30rem)]",
        )}
      >
        <CaloriePipScene
          consumed={consumed}
          target={target}
          accent={accent}
          className="h-full w-full"
        />
      </div>
      {target > 0 && !hideMeta ? (
        <p className="mt-1 text-right text-[9px] font-medium tabular-nums tracking-wide text-muted-foreground/45">
          {Math.round(filledAmount)}/{pipCount} · {Math.round(calPerPip)} cal/pip
          {ratio > 0 ? ` · ${Math.round(ratio * 100)}%` : ""}
        </p>
      ) : null}
    </div>
  )
}
