/**
 * Whoop-style readiness score derived from DOMS segment map (0–100, higher = better).
 */

export type RecoveryTier = "none" | "high" | "moderate" | "low"

export function sorenessFromDomsSegments(segments: { key: string; score: number }[]): number {
  if (segments.length === 0) return 3
  return Math.min(10, Math.max(1, Math.round(Math.max(...segments.map((s) => s.score)))))
}

/** Peak soreness 1–10 → readiness 10–100. Returns null when no soreness data. */
export function computeRecoveryScoreFromDoms(
  segments: { key: string; score: number }[]
): number | null {
  if (segments.length === 0) return null
  const peak = Math.max(...segments.map((s) => s.score))
  return Math.round(((11 - peak) / 10) * 100)
}

export function computeRecoveryScoreFromSoreness(soreness: number): number {
  const s = Math.min(10, Math.max(1, Math.round(soreness)))
  return Math.round(((11 - s) / 10) * 100)
}

export function recoveryScoreTier(score: number | null): RecoveryTier {
  if (score == null) return "none"
  if (score >= 67) return "high"
  if (score >= 34) return "moderate"
  return "low"
}

export function recoveryTierColor(tier: RecoveryTier): string {
  switch (tier) {
    case "high":
      return "#2dd4bf"
    case "moderate":
      return "oklch(0.78 0.16 95)"
    case "low":
      return "oklch(0.62 0.18 25)"
    default:
      return "oklch(0.45 0.01 250 / 40%)"
  }
}

export function recoveryTierLabel(tier: RecoveryTier): string {
  switch (tier) {
    case "high":
      return "Ready to train"
    case "moderate":
      return "Proceed with caution"
    case "low":
      return "Prioritize recovery"
    default:
      return "Log soreness to score"
  }
}

export function sorenessLevelLabel(score: number): string {
  if (score <= 2) return "Trace"
  if (score <= 4) return "Light"
  if (score <= 6) return "Moderate"
  if (score <= 8) return "Strong"
  return "Very strong"
}
