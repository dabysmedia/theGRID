export const PEPTIDE_COLOR = "#a855f7"

export const COMPOUNDS = [
  { id: "retatrutide", label: "Retatrutide (Reta)" },
] as const

export type CompoundId = (typeof COMPOUNDS)[number]["id"]

export const DOSE_PRESETS_MG = [1, 2, 4, 8, 12] as const

export const INJECTION_SITES = [
  { id: "abdomen_upper_left", label: "Abdomen — upper left", shortLabel: "Upper L", region: "abdomen" },
  { id: "abdomen_upper_right", label: "Abdomen — upper right", shortLabel: "Upper R", region: "abdomen" },
  { id: "abdomen_lower_left", label: "Abdomen — lower left", shortLabel: "Lower L", region: "abdomen" },
  { id: "abdomen_lower_right", label: "Abdomen — lower right", shortLabel: "Lower R", region: "abdomen" },
  { id: "thigh_left", label: "Thigh — left", shortLabel: "Left", region: "thigh" },
  { id: "thigh_right", label: "Thigh — right", shortLabel: "Right", region: "thigh" },
  { id: "upper_arm_left", label: "Upper arm — left", shortLabel: "Left", region: "arm" },
  { id: "upper_arm_right", label: "Upper arm — right", shortLabel: "Right", region: "arm" },
  { id: "glute_left", label: "Glute — left", shortLabel: "Left", region: "glute" },
  { id: "glute_right", label: "Glute — right", shortLabel: "Right", region: "glute" },
  { id: "other", label: "Other", shortLabel: "Other", region: "other" },
] as const

export const INJECTION_SITE_REGIONS = [
  { id: "abdomen", label: "Abdomen" },
  { id: "thigh", label: "Thigh" },
  { id: "arm", label: "Arm" },
  { id: "glute", label: "Glute" },
  { id: "other", label: "Other" },
] as const

export type InjectionSiteId = (typeof INJECTION_SITES)[number]["id"]

export const INJECTION_SITE_IDS = new Set<string>(INJECTION_SITES.map((s) => s.id))

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

export function injectionSiteLabel(id: string): string {
  return INJECTION_SITES.find((s) => s.id === id)?.label ?? id
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
