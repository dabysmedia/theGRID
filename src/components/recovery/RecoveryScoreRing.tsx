"use client"

import { cn } from "@/lib/utils"
import {
  recoveryScoreTier,
  recoveryTierColor,
  type RecoveryTier,
} from "@/lib/anatomy-health/recovery-score"

export interface RecoveryScoreRingProps {
  score: number | null
  className?: string
  /** lg = hero (default), md = compact */
  size?: "md" | "lg"
}

export function RecoveryScoreRing({ score, className, size = "lg" }: RecoveryScoreRingProps) {
  const tier = recoveryScoreTier(score)
  const color = recoveryTierColor(tier)
  const dim = size === "lg" ? 132 : 88
  const radius = size === "lg" ? 56 : 38
  const stroke = size === "lg" ? 5 : 3
  const circumference = 2 * Math.PI * radius
  const pct = score != null ? Math.min(score / 100, 1) : 0
  const offset = circumference - pct * circumference
  const center = dim / 2

  return (
    <div
      className={cn(
        "relative shrink-0 motion-safe:animate-ring-pop motion-reduce:animate-none",
        size === "lg" ? "h-[132px] w-[132px]" : "h-[88px] w-[88px]",
        className
      )}
      role="img"
      aria-label={
        score != null ? `Recovery score ${score} percent` : "Recovery score not logged"
      }
    >
      <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${dim} ${dim}`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/25"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={tier === "none" ? circumference : offset}
          style={
            tier === "none"
              ? undefined
              : { filter: `drop-shadow(0 0 8px ${color}55)` }
          }
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            "font-semibold tabular-nums leading-none text-foreground",
            size === "lg" ? "text-3xl" : "text-xl",
            tier === "none" && "text-muted-foreground"
          )}
        >
          {score != null ? score : "—"}
        </span>
        {score != null ? (
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            %
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function recoveryTierTextClass(tier: RecoveryTier): string {
  switch (tier) {
    case "high":
      return "text-[#2dd4bf]"
    case "moderate":
      return "text-amber-200/95"
    case "low":
      return "text-red-400/90"
    default:
      return "text-muted-foreground"
  }
}
