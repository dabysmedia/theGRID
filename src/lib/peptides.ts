import { format, startOfWeek } from "date-fns"

/** Steel HUD accent — matches hub protocol rail (not purple). */
export const PEPTIDE_COLOR = "#94a3b8"

/** Retatrutide (Reta) approximate plasma half-life used for circulating estimates. */
export const RETA_HALF_LIFE_DAYS = 6

/**
 * Monday-start week key (`yyyy-MM-dd` of week start).
 * Matches hub / workouts / calories (`weekStartsOn: 1`).
 */
export function injectionWeekKey(injectedAt: string | Date): string {
  const d = typeof injectedAt === "string" ? new Date(injectedAt) : injectedAt
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd")
}

/**
 * Protocol week number = how many distinct Monday-start weeks have had ≥1 dose.
 * e.g. doses across 4 different weeks → 4 ("Week 4"), even if a calendar week was skipped.
 */
export function countDosedWeeks(entries: { injectedAt: string }[]): number {
  const keys = new Set<string>()
  for (const e of entries) {
    if (!e.injectedAt) continue
    keys.add(injectionWeekKey(e.injectedAt))
  }
  return keys.size
}

/** Fractional days since an injection (never negative). */
export function daysElapsedSince(injectedAt: string, nowMs = Date.now()): number {
  return Math.max(0, (nowMs - new Date(injectedAt).getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Single-shot remaining dose: `doseMg * 0.5^(days / halfLifeDays)`.
 */
export function remainingDoseMg(
  doseMg: number,
  daysSince: number,
  halfLifeDays = RETA_HALF_LIFE_DAYS,
): number {
  if (!(doseMg > 0) || !(halfLifeDays > 0) || daysSince < 0) return 0
  return doseMg * Math.pow(0.5, daysSince / halfLifeDays)
}

/**
 * Multi-dose superposition: sum of each past shot’s remaining contribution.
 * Prefer this when injection history is available.
 */
export function estimateCirculatingMg(
  entries: { injectedAt: string; doseMg: number }[],
  nowMs = Date.now(),
  halfLifeDays = RETA_HALF_LIFE_DAYS,
): number {
  let sum = 0
  for (const e of entries) {
    if (!e.injectedAt || !(e.doseMg > 0)) continue
    sum += remainingDoseMg(e.doseMg, daysElapsedSince(e.injectedAt, nowMs), halfLifeDays)
  }
  return sum
}

/** Compact display for estimated mg (HUD readouts). */
export function formatEstimateMg(mg: number): string {
  if (!(mg > 0)) return "0"
  if (mg < 0.05) return "<0.1"
  if (mg < 10) return (Math.round(mg * 10) / 10).toFixed(1)
  return String(Math.round(mg * 10) / 10).replace(/\.0$/, "")
}

/**
 * Sample points for a decay curve of stacked circulating mg.
 * `fromDaysAgo` → `toDaysAhead` relative to `nowMs` (negative = past).
 */
export function circulatingCurvePoints(
  entries: { injectedAt: string; doseMg: number }[],
  opts?: {
    nowMs?: number
    fromDaysAgo?: number
    toDaysAhead?: number
    steps?: number
    halfLifeDays?: number
  },
): Array<{ dayOffset: number; mg: number }> {
  const nowMs = opts?.nowMs ?? Date.now()
  const fromDaysAgo = opts?.fromDaysAgo ?? 0
  const toDaysAhead = opts?.toDaysAhead ?? RETA_HALF_LIFE_DAYS * 2
  const steps = Math.max(2, opts?.steps ?? 25)
  const halfLifeDays = opts?.halfLifeDays ?? RETA_HALF_LIFE_DAYS
  const span = fromDaysAgo + toDaysAhead
  const points: Array<{ dayOffset: number; mg: number }> = []
  for (let i = 0; i <= steps; i++) {
    const dayOffset = -fromDaysAgo + (span * i) / steps
    const t = nowMs + dayOffset * 24 * 60 * 60 * 1000
    points.push({
      dayOffset,
      mg: estimateCirculatingMg(entries, t, halfLifeDays),
    })
  }
  return points
}

export const COMPOUNDS = [
  { id: "retatrutide", label: "Retatrutide (Reta)" },
] as const

export type CompoundId = (typeof COMPOUNDS)[number]["id"]

export const DOSE_PRESETS_MG = [1, 2, 4, 8, 12] as const

/** Sites offered for new logs — abdomen / leg / glute only. */
export const INJECTION_SITES = [
  { id: "abd", label: "Abdomen", shortLabel: "Abd" },
  { id: "leg", label: "Leg", shortLabel: "Leg" },
  { id: "glute", label: "Glute", shortLabel: "Glute" },
] as const

export type InjectionSiteId = (typeof INJECTION_SITES)[number]["id"]

export const INJECTION_SITE_IDS = new Set<string>(INJECTION_SITES.map((s) => s.id))

/** Legacy site ids still present in older DB rows — display only. */
const LEGACY_SITE_LABELS: Record<string, string> = {
  abdomen_upper_left: "Abdomen — upper left",
  abdomen_upper_right: "Abdomen — upper right",
  abdomen_lower_left: "Abdomen — lower left",
  abdomen_lower_right: "Abdomen — lower right",
  thigh_left: "Thigh — left",
  thigh_right: "Thigh — right",
  upper_arm_left: "Upper arm — left",
  upper_arm_right: "Upper arm — right",
  glute_left: "Glute — left",
  glute_right: "Glute — right",
  other: "Other",
  abdomen: "Abdomen",
  thigh: "Leg",
  arm: "Arm",
}

/** Map a legacy site id to the closest current site for UI hints (e.g. last-used). */
export function coerceInjectionSite(id: string | null | undefined): InjectionSiteId {
  if (id && INJECTION_SITE_IDS.has(id)) return id as InjectionSiteId
  if (!id) return "abd"
  if (id.startsWith("abdomen") || id === "abdomen") return "abd"
  if (id.startsWith("thigh") || id === "thigh" || id === "leg") return "leg"
  if (id.startsWith("glute") || id === "glute") return "glute"
  return "abd"
}

export const SIDE_EFFECTS = [
  { id: "nausea", label: "Nausea" },
  { id: "vomiting", label: "Vomiting" },
  { id: "diarrhea", label: "Diarrhea" },
  { id: "constipation", label: "Constipation" },
  { id: "fatigue", label: "Fatigue" },
  { id: "injection_site_reaction", label: "Injection site reaction" },
  { id: "reduced_appetite", label: "Reduced appetite" },
  { id: "reflux", label: "Reflux / heartburn" },
  { id: "headache", label: "Headache" },
  { id: "dizziness", label: "Dizziness" },
] as const

export type SideEffectId = (typeof SIDE_EFFECTS)[number]["id"]

export const SIDE_EFFECT_IDS = new Set<string>(SIDE_EFFECTS.map((s) => s.id))

export const INJECTION_INTERVAL_PRESETS = [5, 7, 14] as const

export function injectionSiteLabel(id: string): string {
  const current = INJECTION_SITES.find((s) => s.id === id)
  if (current) return current.label
  return LEGACY_SITE_LABELS[id] ?? id
}

export function sideEffectLabel(id: string): string {
  return SIDE_EFFECTS.find((s) => s.id === id)?.label ?? id
}

export function compoundLabel(id: string): string {
  return COMPOUNDS.find((c) => c.id === id)?.label ?? id
}

export function normalizeSideEffects(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is string => typeof x === "string")
    .filter((x) => SIDE_EFFECT_IDS.has(x))
    .slice(0, 20)
}

export function parseSideEffectsJson(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []
  } catch {
    return []
  }
}

export function daysSinceLastInjection(entries: { injectedAt: string }[]): number | null {
  if (entries.length === 0) return null
  const latest = entries.reduce((a, b) =>
    new Date(a.injectedAt) > new Date(b.injectedAt) ? a : b
  )
  const ms = Date.now() - new Date(latest.injectedAt).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}
