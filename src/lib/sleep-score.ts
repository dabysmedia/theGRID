/**
 * Google Health's SleepSummary exposes `minutesAsleep` / `minutesAwake` and per-stage
 * minutes (REM / light / deep / awake), but — unlike Fitbit's Web API — it has no
 * proprietary 0–100 "sleep score". We derive an equivalent score from what Google
 * Health *does* give us:
 *
 *   - 50%  sleep efficiency  (time asleep ÷ time in bed)
 *   - 25%  REM share vs a ~22% target share of total sleep
 *   - 25%  deep share vs a ~18% target share of total sleep
 *
 * The target shares approximate typical healthy-adult sleep architecture. Nights
 * without stage data fall back to a neutral share so efficiency still drives the score.
 */

export const REM_TARGET_SHARE = 0.22
export const DEEP_TARGET_SHARE = 0.18

export type SleepStageMinutes = {
  remMinutes?: number | null
  lightMinutes?: number | null
  deepMinutes?: number | null
  awakeMinutes?: number | null
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

/** Time asleep ÷ time in bed × 100, rounded to one decimal. */
export function computeSleepEfficiency(
  minutesAsleep: number,
  minutesInBed: number
): number | null {
  if (
    !Number.isFinite(minutesAsleep) ||
    !Number.isFinite(minutesInBed) ||
    minutesInBed <= 0 ||
    minutesAsleep < 0
  ) {
    return null
  }
  return Math.max(0, Math.min(100, Math.round((minutesAsleep / minutesInBed) * 1000) / 10))
}

/** Derives a 0–100 sleep score from efficiency + REM/deep stage shares. Null if no signal at all. */
export function deriveSleepScore(
  input: SleepStageMinutes & { efficiency?: number | null }
): number | null {
  const remMinutes = input.remMinutes ?? 0
  const lightMinutes = input.lightMinutes ?? 0
  const deepMinutes = input.deepMinutes ?? 0
  const totalAsleep = remMinutes + lightMinutes + deepMinutes
  const hasStages = totalAsleep > 0
  const hasEfficiency = input.efficiency != null && Number.isFinite(input.efficiency)

  if (!hasStages && !hasEfficiency) return null

  const efficiencyScore = hasEfficiency ? clamp01(input.efficiency! / 100) : 0.75
  const remShare = hasStages ? remMinutes / totalAsleep : REM_TARGET_SHARE
  const deepShare = hasStages ? deepMinutes / totalAsleep : DEEP_TARGET_SHARE
  const remScore = clamp01(1 - Math.abs(remShare - REM_TARGET_SHARE) / REM_TARGET_SHARE)
  const deepScore = clamp01(1 - Math.abs(deepShare - DEEP_TARGET_SHARE) / DEEP_TARGET_SHARE)

  const weighted = efficiencyScore * 0.5 + remScore * 0.25 + deepScore * 0.25
  return Math.round(weighted * 100)
}

/** Human-friendly render of a possibly-missing score. */
export function displaySleepScore(score: number | null | undefined): string {
  return score != null && Number.isFinite(score) ? String(Math.round(score)) : "—"
}

export type SleepScoreBand = "excellent" | "good" | "fair" | "poor"

export function sleepScoreBand(score: number | null | undefined): SleepScoreBand | null {
  if (score == null || !Number.isFinite(score)) return null
  if (score >= 85) return "excellent"
  if (score >= 70) return "good"
  if (score >= 50) return "fair"
  return "poor"
}

export const SLEEP_SCORE_BAND_LABEL: Record<SleepScoreBand, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
}

/** Maps the legacy 1–5 star quality rating onto the 0–100 score scale (1→20 … 5→100). */
export function qualityToScore(quality: number): number {
  return Math.max(0, Math.min(100, Math.round(quality * 20)))
}

/** Inverse of `qualityToScore`, used to keep the legacy `quality` column populated. */
export function scoreToLegacyQuality(score: number): number {
  return Math.max(1, Math.min(5, Math.round(score / 20)))
}
