import type { SeverityLevel } from "./model"

const ORDER: SeverityLevel[] = ["none", "low", "moderate", "high", "critical"]

export function maxSeverity(a: SeverityLevel, b: SeverityLevel): SeverityLevel {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b
}

export function injurySeverityToLevel(s: string | undefined): SeverityLevel {
  const x = (s || "").toLowerCase()
  if (x === "severe") return "critical"
  if (x === "moderate") return "moderate"
  return "low"
}

/** Map per-segment DOMS score (1–10) to diagram severity. */
export function domsScoreToSeverity(score: number): SeverityLevel {
  const s = Math.min(10, Math.max(1, Math.round(score)))
  if (s <= 4) return "low"
  if (s <= 6) return "moderate"
  if (s <= 8) return "high"
  return "critical"
}

export function healthFromSeverity(sev: SeverityLevel): number {
  switch (sev) {
    case "none":
      return 100
    case "low":
      return 82
    case "moderate":
      return 55
    case "high":
      return 30
    case "critical":
      return 12
    default:
      return 100
  }
}
