import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export const WEEKLY_WORKOUT_GOAL = 3

type WeekWorkoutGoalRingProps = {
  count: number
  /** sm = icon-sized (hero pills); lg = hub Systems tile footer */
  size?: "sm" | "lg"
  className?: string
}

export function WeekWorkoutGoalRing({
  count,
  size = "sm",
  className,
}: WeekWorkoutGoalRingProps) {
  const goal = WEEKLY_WORKOUT_GOAL
  const capped = Math.min(Math.max(count, 0), goal)
  const met = count >= goal

  if (size === "sm" && met) {
    return <Check className={cn("h-4 w-4 text-emerald-500", className)} strokeWidth={2.8} aria-hidden />
  }

  const stroke = size === "lg" ? 5.5 : 2.35
  const vb = size === "lg" ? 76 : 24
  const r = (vb - stroke) / 2
  const cx = vb / 2
  const cy = vb / 2
  const circumference = 2 * Math.PI * r
  const pct = capped / goal
  const dash = circumference * pct

  const boxClass =
    size === "lg"
      ? "h-[8.25rem] w-[8.25rem] sm:h-[8.75rem] sm:w-[8.75rem]"
      : undefined

  const svgClass =
    size === "lg"
      ? "h-[88%] w-[88%] shrink-0 -rotate-90"
      : "h-4 w-4 shrink-0 -rotate-90 sm:size-6"

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        boxClass,
        className
      )}
    >
      {size === "lg" && (
        <div
          className="pointer-events-none absolute inset-[8%] rounded-full opacity-40 blur-lg"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, oklch(0.82 0.18 110 / 45%), transparent 68%)",
          }}
          aria-hidden
        />
      )}
      <svg viewBox={`0 0 ${vb} ${vb}`} className={svgClass} aria-hidden>
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
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            className="text-emerald-500"
            style={{
              filter:
                size === "lg"
                  ? "drop-shadow(0 0 8px oklch(0.62 0.17 150 / 50%))"
                  : undefined,
            }}
          />
        )}
      </svg>
      {size === "lg" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {met ? (
            <Check className="h-9 w-9 text-emerald-500 sm:h-10 sm:w-10" strokeWidth={2.75} aria-hidden />
          ) : (
            <span className="text-[1.65rem] font-bold tabular-nums leading-none tracking-tight text-foreground sm:text-[1.75rem]">
              {capped}/{goal}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
