/** Weekly set thresholds per muscle (primary + secondary attribution). */
export const LOAD_TIER_GREEN_MIN = 12
export const LOAD_TIER_BLUE_MIN = 6
export const LOAD_TIER_YELLOW_MIN = 0.5

export type LoadTier = "none" | "yellow" | "blue" | "green"

export function weeklySetsToLoadTier(sets: number): LoadTier {
  if (sets < LOAD_TIER_YELLOW_MIN) return "none"
  if (sets >= LOAD_TIER_GREEN_MIN) return "green"
  if (sets >= LOAD_TIER_BLUE_MIN) return "blue"
  return "yellow"
}

export interface LoadTierStyle {
  fill: string
  stroke: string
  tier: LoadTier
  glow: boolean
}

const TIER_PALETTE: Record<Exclude<LoadTier, "none">, Omit<LoadTierStyle, "tier">> = {
  green: {
    fill: "oklch(0.67 0.22 128 / 0.84)",
    stroke: "oklch(0.78 0.22 128 / 0.94)",
    glow: true,
  },
  blue: {
    fill: "oklch(0.62 0.16 240 / 0.78)",
    stroke: "oklch(0.74 0.15 240 / 0.9)",
    glow: false,
  },
  yellow: {
    fill: "oklch(0.72 0.17 110 / 0.74)",
    stroke: "oklch(0.82 0.16 110 / 0.88)",
    glow: false,
  },
}

/** Tiered fill/stroke from weekly set count. Returns null for untrained (white/base). */
export function weeklySetsToLoadStyle(sets: number): LoadTierStyle | null {
  const tier = weeklySetsToLoadTier(sets)
  if (tier === "none") return null
  const palette = TIER_PALETTE[tier]
  return { ...palette, tier }
}

export interface LoadLegendTier {
  tier: LoadTier
  label: string
  sublabel: string
  fill: string
}

export function loadLegendTiers(): LoadLegendTier[] {
  return [
    {
      tier: "none",
      label: "None",
      sublabel: "0 sets",
      fill: "var(--anatomy-sev-none-fill)",
    },
    {
      tier: "yellow",
      label: "Low",
      sublabel: "1–5",
      fill: TIER_PALETTE.yellow.fill,
    },
    {
      tier: "blue",
      label: "Mid",
      sublabel: "6–11",
      fill: TIER_PALETTE.blue.fill,
    },
    {
      tier: "green",
      label: "High",
      sublabel: "12+",
      fill: TIER_PALETTE.green.fill,
    },
  ]
}
