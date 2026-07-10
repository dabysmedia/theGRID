"use client"

import { useId } from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export const WEEKLY_WORKOUT_GOAL = 3
export const WORKOUT_RING_COLOR = "#c4d632"

type WeekWorkoutGoalRingProps = {
  count: number
  /** sm = icon-sized; md = hub protocol/training rail; lg = tile / expand hero */
  size?: "sm" | "md" | "lg"
  color?: string
  className?: string
}

export function WeekWorkoutGoalRing({
  count,
  size = "sm",
  color = WORKOUT_RING_COLOR,
  className,
}: WeekWorkoutGoalRingProps) {
  const goal = WEEKLY_WORKOUT_GOAL
  const capped = Math.min(Math.max(count, 0), goal)
  const met = count >= goal
  const uid = useId().replace(/:/g, "")
  const arcGradId = `${uid}-arc`
  const showCenter = size === "md" || size === "lg"

  if (size === "sm" && met) {
    return (
      <Check
        className={cn("h-4 w-4", className)}
        style={{ color }}
        strokeWidth={2.8}
        aria-hidden
      />
    )
  }

  const stroke = size === "lg" ? 5.5 : size === "md" ? 4.25 : 2.35
  const vb = showCenter ? 76 : 24
  const r = (vb - stroke) / 2
  const cx = vb / 2
  const cy = vb / 2
  const circumference = 2 * Math.PI * r
  const pct = capped / goal
  const dash = circumference * pct

  const boxClass =
    size === "lg"
      ? "h-[8.25rem] w-[8.25rem] sm:h-[8.75rem] sm:w-[8.75rem]"
      : size === "md"
        ? "size-[var(--hub-protocol-glyph)] sm:h-[6rem] sm:w-[6rem]"
        : undefined

  const svgClass =
    size === "lg"
      ? "h-[88%] w-[88%] shrink-0 -rotate-90"
      : size === "md"
        ? "h-[90%] w-[90%] shrink-0 -rotate-90"
        : "h-4 w-4 shrink-0 -rotate-90 sm:size-6"

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-visible",
        boxClass,
        className
      )}
    >
      {showCenter && (
        <div
          className="pointer-events-none absolute inset-[2%] rounded-full opacity-45 blur-lg"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${color}50, transparent 68%)`,
          }}
          aria-hidden
        />
      )}
      <svg viewBox={`0 0 ${vb} ${vb}`} className={cn(svgClass, "relative z-10")} aria-hidden>
        <defs>
          <linearGradient id={arcGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={1} />
            <stop offset="100%" stopColor={color} stopOpacity={0.85} />
          </linearGradient>
        </defs>

        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted-foreground/25"
        />
        {!met && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={`url(#${arcGradId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        )}
      </svg>
      {showCenter && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {met ? (
            <Check
              className={
                size === "lg"
                  ? "h-9 w-9 sm:h-10 sm:w-10"
                  : "h-7 w-7 sm:h-8 sm:w-8"
              }
              style={{ color }}
              strokeWidth={2.75}
              aria-hidden
            />
          ) : (
            <span
              className={
                size === "lg"
                  ? "text-[1.65rem] font-bold tabular-nums leading-none tracking-tight text-foreground sm:text-[1.75rem]"
                  : "text-[1.2rem] font-bold tabular-nums leading-none tracking-tight text-foreground sm:text-[1.3rem]"
              }
            >
              {capped}/{goal}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
