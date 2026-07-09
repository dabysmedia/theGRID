/**
 * Fitbit / Google Health "Daily Readiness" is NOT exposed by the Google Health API
 * (app-only / Takeout). We derive a transparent 0–100 readiness proxy from the same
 * underlying signals Google *does* give us:
 *
 *   - 40%  HRV vs personal baseline (higher = better)
 *   - 30%  Resting HR vs personal baseline (lower = better)
 *   - 30%  Sleep score (0–100, already derived from stages/efficiency)
 *
 * Baselines are means over available history for that user (typically last ~30 days).
 */

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

/** HRV sub-score: today's HRV relative to baseline. ~1.0 at baseline, >1 when elevated. */
function hrvSubScore(today: number, baseline: number): number {
  if (baseline <= 0) return 0.7
  // Cap at 1.35× baseline ≈ full credit; below ~0.65× is poor.
  return clamp01((today / baseline - 0.65) / (1.35 - 0.65))
}

/** RHR sub-score: lower than baseline is better. */
function rhrSubScore(today: number, baseline: number): number {
  if (baseline <= 0) return 0.7
  // ~8 bpm below baseline → full; ~8 bpm above → zero.
  return clamp01(1 - (today - baseline) / 8)
}

export type ReadinessInputs = {
  hrvMs?: number | null
  restingHeartRate?: number | null
  sleepScore?: number | null
  /** Historical HRV samples for baseline (exclude today if you want). */
  hrvBaselineSamples?: number[]
  /** Historical RHR samples for baseline. */
  rhrBaselineSamples?: number[]
}

export function computeReadinessScore(input: ReadinessInputs): number | null {
  const hrv = input.hrvMs
  const rhr = input.restingHeartRate
  const sleep = input.sleepScore
  const hasHrv = hrv != null && Number.isFinite(hrv) && hrv > 0
  const hasRhr = rhr != null && Number.isFinite(rhr) && rhr > 0
  const hasSleep = sleep != null && Number.isFinite(sleep)

  if (!hasHrv && !hasRhr && !hasSleep) return null

  const hrvBase = mean(input.hrvBaselineSamples?.filter((v) => v > 0) ?? []) ?? (hasHrv ? hrv! : null)
  const rhrBase = mean(input.rhrBaselineSamples?.filter((v) => v > 0) ?? []) ?? (hasRhr ? rhr! : null)

  let weighted = 0
  let weightSum = 0

  if (hasHrv && hrvBase != null) {
    weighted += hrvSubScore(hrv!, hrvBase) * 0.4
    weightSum += 0.4
  }
  if (hasRhr && rhrBase != null) {
    weighted += rhrSubScore(rhr!, rhrBase) * 0.3
    weightSum += 0.3
  }
  if (hasSleep) {
    weighted += clamp01(sleep! / 100) * 0.3
    weightSum += 0.3
  }

  if (weightSum <= 0) return null
  return Math.round((weighted / weightSum) * 100)
}

export type ReadinessBand = "peak" | "high" | "balanced" | "low" | "very_low"

export function readinessBand(score: number | null | undefined): ReadinessBand | null {
  if (score == null || !Number.isFinite(score)) return null
  if (score >= 85) return "peak"
  if (score >= 70) return "high"
  if (score >= 50) return "balanced"
  if (score >= 30) return "low"
  return "very_low"
}

export const READINESS_BAND_LABEL: Record<ReadinessBand, string> = {
  peak: "Peak",
  high: "High",
  balanced: "Balanced",
  low: "Low",
  very_low: "Recover",
}
