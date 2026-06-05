/** Standard Olympic plates (lb), largest first. */
export const STANDARD_PLATES_LB = [45, 35, 25, 10, 5, 2.5] as const

export const DEFAULT_BAR_WEIGHT_LB = 45

export const BAR_WEIGHT_OPTIONS_LB = [45, 35, 25, 15] as const

const BAR_WEIGHT_STORAGE_KEY = "thegrid_workout_bar_weight_lb"

export type PlateCalcResult =
  | {
      ok: true
      perSide: number[]
      totalWeight: number
      barWeight: number
    }
  | {
      ok: false
      reason: "invalid" | "too_light" | "not_loadable"
      /** Total lb still needed (both sides) to reach target with available plates. */
      shortByLb?: number
    }

/** Visual accent per plate size (gym color convention). */
export const PLATE_COLORS_LB: Record<number, string> = {
  45: "#ef4444",
  35: "#eab308",
  25: "#22c55e",
  10: "#3b82f6",
  5: "#94a3b8",
  2.5: "#64748b",
}

export function loadBarWeightLb(): number {
  if (typeof window === "undefined") return DEFAULT_BAR_WEIGHT_LB
  try {
    const raw = localStorage.getItem(BAR_WEIGHT_STORAGE_KEY)
    if (!raw) return DEFAULT_BAR_WEIGHT_LB
    const n = parseFloat(raw)
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_BAR_WEIGHT_LB
    return n
  } catch {
    return DEFAULT_BAR_WEIGHT_LB
  }
}

export function saveBarWeightLb(lb: number): void {
  if (typeof window === "undefined" || !Number.isFinite(lb) || lb <= 0) return
  try {
    localStorage.setItem(BAR_WEIGHT_STORAGE_KEY, String(lb))
  } catch {
    /* ignore */
  }
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2
}

/** Greedy plate breakdown for one side of the bar. */
export function calculatePlatesPerSide(
  totalWeightLb: number,
  barWeightLb: number,
  plates: readonly number[] = STANDARD_PLATES_LB,
): PlateCalcResult {
  if (!Number.isFinite(totalWeightLb) || totalWeightLb <= 0) {
    return { ok: false, reason: "invalid" }
  }
  if (totalWeightLb < barWeightLb) {
    return { ok: false, reason: "too_light" }
  }

  const perSideTarget = roundHalf((totalWeightLb - barWeightLb) / 2)
  const smallest = Math.min(...plates)
  const mod = roundHalf(perSideTarget % smallest)
  if (mod !== 0 && mod !== smallest) {
    return {
      ok: false,
      reason: "not_loadable",
      shortByLb: roundHalf(smallest - mod) * 2,
    }
  }

  let remaining = perSideTarget
  const perSide: number[] = []
  const sorted = [...plates].sort((a, b) => b - a)

  for (const plate of sorted) {
    while (remaining >= plate - 0.001) {
      perSide.push(plate)
      remaining = roundHalf(remaining - plate)
    }
  }

  if (remaining > 0.001) {
    return {
      ok: false,
      reason: "not_loadable",
      shortByLb: roundHalf(remaining) * 2,
    }
  }

  return {
    ok: true,
    perSide,
    totalWeight: totalWeightLb,
    barWeight: barWeightLb,
  }
}

/** Group identical plates for display: [[45, 2], [25, 1]] */
export function groupPlatesPerSide(
  perSide: number[],
): Array<{ weight: number; count: number }> {
  const counts = new Map<number, number>()
  for (const w of perSide) {
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([weight, count]) => ({ weight, count }))
    .sort((a, b) => b.weight - a.weight)
}

export function formatPlateSummary(perSide: number[]): string {
  const groups = groupPlatesPerSide(perSide)
  if (!groups.length) return "Bar only"
  return groups.map((g) => (g.count > 1 ? `${g.weight}×${g.count}` : `${g.weight}`)).join(" + ")
}
