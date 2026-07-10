/** Steel HUD accent — matches hub protocol rail (not purple). */
export const PEPTIDE_COLOR = "#94a3b8"

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
