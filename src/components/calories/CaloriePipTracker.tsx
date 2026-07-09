"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"

/** Over budget (red) only at ≥101% of target */
const OVER_TARGET_RATIO = 1.01

/**
 * Dense instrument grid. Each pip = target / pipCount so fill maths out.
 * Cells stay square via container aspect-ratio — never stretch into flat bars.
 */
const SIZE_CONFIG = {
  default: {
    pipCount: 200,
    columns: 20,
    gapPx: 8,
    glow: true,
  },
  compact: {
    pipCount: 100,
    columns: 20,
    gapPx: 5,
    glow: false,
  },
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
  size?: keyof typeof SIZE_CONFIG
  /** Override grid columns (defaults from size preset) */
  columns?: number
  className?: string
}

/**
 * Classic CSS isometric block (same language as Steps Activity bars),
 * sized for a dense pip grid — front + top + right faces.
 */
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
  const top = shade(accent, 55)
  const mid = shade(accent, 12)
  const side = shade(accent, -55)
  const emptyFront = "oklch(0.30 0.012 250 / 55%)"
  const emptyTop = "oklch(0.38 0.012 250 / 45%)"
  const emptySide = "oklch(0.22 0.01 250 / 55%)"

  return (
    <div className="relative aspect-square w-full">
      {/* Inset so extruded faces don't collide with neighbors */}
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
        {/* Front */}
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
        >
          {lit ? (
            <div
              className="absolute inset-x-0 top-0 h-[45%] opacity-40"
              style={{
                background: "linear-gradient(180deg, #ffffff77, transparent)",
              }}
            />
          ) : null}
        </div>
        {/* Top face */}
        <div
          className="absolute left-0 right-[18%] top-0"
          style={{
            height: "34%",
            transform: "translateY(-72%) skewX(-32deg)",
            transformOrigin: "bottom left",
            background: lit
              ? `linear-gradient(135deg, ${top}, ${mid})`
              : emptyTop,
            boxShadow: lit ? `0 0 8px ${accent}66` : undefined,
          }}
        />
        {/* Right face */}
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

  const accent = caloriePipAccentHex(consumed, target)
  const ratio = target > 0 ? consumed / target : 0
  /** Exact fill: each pip represents target/pipCount calories. */
  const filledAmount =
    target > 0 ? Math.min(pipCount, (consumed / target) * pipCount) : 0
  const fullPips = Math.floor(filledAmount + 1e-9)
  const partialFill = filledAmount - fullPips
  const remaining = target > 0 ? Math.max(0, target - consumed) : 0
  const calPerPip = target > 0 ? target / pipCount : 0

  /**
   * Visual order: fill bottom → top (tank), left → right within a row.
   * Data index 0 is bottom-left.
   */
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

  const fillParent = className?.includes("h-full") || className?.includes("absolute")

  return (
    <div
      className={cn(
        "relative mx-auto w-full min-w-0 max-w-full",
        fillParent && "flex h-full min-h-0 flex-col justify-end",
        className,
      )}
      role="img"
      aria-label={
        target > 0
          ? `${consumed.toLocaleString()} eaten, ${remaining.toLocaleString()} available of ${target.toLocaleString()} calorie target (${Math.round(calPerPip)} cal per pip)`
          : `${consumed.toLocaleString()} calories consumed`
      }
    >
      {config.glow ? (
        <div
          className="pointer-events-none absolute -inset-x-3 -inset-y-4 rounded-2xl opacity-60 blur-2xl"
          style={{
            background: `radial-gradient(ellipse 80% 70% at 50% 70%, ${accent}22 0%, transparent 72%)`,
          }}
          aria-hidden
        />
      ) : null}

      {/* Soft isometric floor under the block field */}
      {size === "default" ? (
        <div
          className="pointer-events-none absolute inset-x-[6%] bottom-0 h-[42%] opacity-30"
          aria-hidden
          style={{
            backgroundImage:
              "linear-gradient(to right, oklch(0.42 0.02 250 / 18%) 1px, transparent 1px), linear-gradient(to top, oklch(0.42 0.02 250 / 12%) 1px, transparent 1px)",
            backgroundSize: "10% 6px, 100% 6px",
            maskImage: "linear-gradient(to top, black, transparent)",
            transform: "rotateX(58deg) scaleY(0.7)",
            transformOrigin: "bottom center",
          }}
        />
      ) : null}

      <div
        className={cn("relative w-full", fillParent && "max-h-full")}
        style={{
          aspectRatio: `${gridColumns} / ${rowCount}`,
          perspective: "900px",
          perspectiveOrigin: "50% 140%",
        }}
      >
        <div
          className="grid h-full w-full"
          style={{
            gap: `${gapPx}px`,
            gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`,
            /* Room for extruded top/side faces + breathing room */
            paddingRight: "5%",
            paddingTop: "6%",
            paddingBottom: "2%",
          }}
        >
          {visualIndices.map((dataIndex, visualOrder) => {
            const isEaten = dataIndex < fullPips
            const isPartial =
              dataIndex === fullPips && partialFill > 0.12
            const lit = isEaten || isPartial
            const rowFromBottom = Math.floor(dataIndex / gridColumns)
            const col = dataIndex % gridColumns
            const delayMs = Math.min(
              720,
              rowFromBottom * 36 + col * 10 + (visualOrder % 3) * 4,
            )

            return (
              <IsoPip
                key={dataIndex}
                lit={lit}
                partial={isPartial}
                accent={accent}
                delayMs={delayMs}
              />
            )
          })}
        </div>

        {/* Progress readout chip — reinforces the math */}
        {target > 0 && size === "default" ? (
          <div className="pointer-events-none absolute -bottom-0.5 right-0 translate-y-full pt-1.5">
            <p className="text-[9px] font-medium tabular-nums tracking-wide text-muted-foreground/45">
              {Math.round(filledAmount)}/{pipCount} · {Math.round(calPerPip)}{" "}
              cal/pip
              {ratio > 0 ? ` · ${Math.round(ratio * 100)}%` : ""}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
