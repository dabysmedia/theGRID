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
 * Shots after `nowMs` are ignored (needed for historical curve sampling).
 */
export function estimateCirculatingMg(
  entries: { injectedAt: string; doseMg: number }[],
  nowMs = Date.now(),
  halfLifeDays = RETA_HALF_LIFE_DAYS,
): number {
  let sum = 0
  for (const e of entries) {
    if (!e.injectedAt || !(e.doseMg > 0)) continue
    const at = new Date(e.injectedAt).getTime()
    if (at > nowMs) continue
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

/**
 * Full-cycle circulating curve: first injection → now (+ optional lookahead).
 * `dayOffset` is days since the earliest shot (0 = cycle start).
 * Injection markers are included for timeline ticks.
 */
export function fullCycleCirculatingCurve(
  entries: { injectedAt: string; doseMg: number }[],
  opts?: {
    nowMs?: number
    toDaysAhead?: number
    steps?: number
    halfLifeDays?: number
  },
): {
  points: Array<{ dayOffset: number; mg: number; atMs: number }>
  injections: Array<{ dayOffset: number; doseMg: number; atMs: number }>
  nowDayOffset: number
  spanDays: number
} | null {
  const shots = entries
    .filter((e) => e.injectedAt && e.doseMg > 0)
    .map((e) => ({
      injectedAt: e.injectedAt,
      doseMg: e.doseMg,
      atMs: new Date(e.injectedAt).getTime(),
    }))
    .sort((a, b) => a.atMs - b.atMs)
  if (shots.length === 0) return null

  const nowMs = opts?.nowMs ?? Date.now()
  const toDaysAhead = opts?.toDaysAhead ?? RETA_HALF_LIFE_DAYS
  const halfLifeDays = opts?.halfLifeDays ?? RETA_HALF_LIFE_DAYS
  const startMs = shots[0]!.atMs
  const endMs = nowMs + toDaysAhead * 24 * 60 * 60 * 1000
  const spanDays = Math.max(0.001, (endMs - startMs) / (1000 * 60 * 60 * 24))
  // Dense enough for multi-week cycles without drowning mobile SVG.
  const steps = Math.max(24, opts?.steps ?? Math.min(96, Math.ceil(spanDays * 4)))

  const points: Array<{ dayOffset: number; mg: number; atMs: number }> = []
  for (let i = 0; i <= steps; i++) {
    const dayOffset = (spanDays * i) / steps
    const atMs = startMs + dayOffset * 24 * 60 * 60 * 1000
    points.push({
      dayOffset,
      atMs,
      mg: estimateCirculatingMg(shots, atMs, halfLifeDays),
    })
  }

  // Ensure a sample exactly at "now" so the marker sits on the path.
  const nowDayOffset = (nowMs - startMs) / (1000 * 60 * 60 * 24)
  const nowMg = estimateCirculatingMg(shots, nowMs, halfLifeDays)
  const insertAt = points.findIndex((p) => p.dayOffset >= nowDayOffset)
  if (insertAt < 0) {
    points.push({ dayOffset: nowDayOffset, atMs: nowMs, mg: nowMg })
  } else if (Math.abs(points[insertAt]!.dayOffset - nowDayOffset) > 1e-6) {
    points.splice(insertAt, 0, { dayOffset: nowDayOffset, atMs: nowMs, mg: nowMg })
  }

  const injections = shots.map((s) => ({
    dayOffset: (s.atMs - startMs) / (1000 * 60 * 60 * 24),
    doseMg: s.doseMg,
    atMs: s.atMs,
  }))

  return { points, injections, nowDayOffset, spanDays }
}

/**
 * Chronological ordinal (1-based) of each Monday-start week that had ≥1 dose.
 * Earliest dosed week = 1 … latest = countDosedWeeks.
 */
export function dosedWeekNumberMap(entries: { injectedAt: string }[]): Map<string, number> {
  const keys = new Set<string>()
  for (const e of entries) {
    if (!e.injectedAt) continue
    keys.add(injectionWeekKey(e.injectedAt))
  }
  const sorted = [...keys].sort((a, b) => a.localeCompare(b))
  const map = new Map<string, number>()
  sorted.forEach((k, i) => map.set(k, i + 1))
  return map
}

export type DosedWeekGroup<T extends { injectedAt: string }> = {
  weekKey: string
  weekNumber: number
  /** Short label for week-of Monday, e.g. "Jun 29". */
  weekOfLabel: string
  entries: T[]
}

/**
 * Group injections by Monday-start dosed week (newest week first).
 * Week numbers match protocol counting (oldest dosed week = Week 1).
 */
export function groupInjectionsByDosedWeek<T extends { injectedAt: string }>(
  entries: T[],
): DosedWeekGroup<T>[] {
  const weekNums = dosedWeekNumberMap(entries)
  const byWeek = new Map<string, T[]>()
  for (const e of entries) {
    if (!e.injectedAt) continue
    const key = injectionWeekKey(e.injectedAt)
    if (!byWeek.has(key)) byWeek.set(key, [])
    byWeek.get(key)!.push(e)
  }
  const groups: DosedWeekGroup<T>[] = []
  for (const [weekKey, weekEntries] of byWeek) {
    const sorted = [...weekEntries].sort(
      (a, b) => new Date(b.injectedAt).getTime() - new Date(a.injectedAt).getTime(),
    )
    groups.push({
      weekKey,
      weekNumber: weekNums.get(weekKey) ?? 0,
      weekOfLabel: format(new Date(`${weekKey}T12:00:00`), "MMM d"),
      entries: sorted,
    })
  }
  return groups.sort((a, b) => b.weekKey.localeCompare(a.weekKey))
}

/**
 * Inverse appetite cue from circulating level (1–10, 10 = very hungry).
 * Higher circulating → lower estimated hunger. Clearly secondary to logged data.
 */
export function estimateHungerFromCirculating(
  circulatingMg: number,
  referenceMg: number,
): number {
  const ref = Math.max(0.01, referenceMg)
  const ratio = Math.min(1.25, Math.max(0, circulatingMg / ref))
  // Full reference ≈ hunger 2; empty ≈ hunger 10; slight overshoot → ~1.
  const raw = 10 - ratio * 8
  return Math.min(10, Math.max(1, Math.round(raw * 10) / 10))
}

/** Prefer latest logged hunger; fall back to circulating inverse estimate. */
export function resolveHungerReadout(opts: {
  loggedHunger?: number | null
  circulatingMg?: number | null
  referenceMg?: number | null
}): {
  value: number | null
  source: "logged" | "estimate" | "none"
  estimate: number | null
} {
  const logged =
    opts.loggedHunger != null &&
    Number.isFinite(opts.loggedHunger) &&
    opts.loggedHunger >= 1 &&
    opts.loggedHunger <= 10
      ? opts.loggedHunger
      : null
  const circ = opts.circulatingMg
  const ref = opts.referenceMg
  const estimate =
    circ != null && circ >= 0 && ref != null && ref > 0
      ? estimateHungerFromCirculating(circ, ref)
      : null
  if (logged != null) return { value: logged, source: "logged", estimate }
  if (estimate != null) return { value: estimate, source: "estimate", estimate }
  return { value: null, source: "none", estimate: null }
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
