/**
 * Maps persisted recovery / injury rows into AnatomyHealthState.
 * No React; safe for tests and SSR-adjacent usage.
 */

import { getConditionById, getTreatmentById } from "@/lib/recovery-catalog"
import { bodySegmentsForView, slugToBodyRegion } from "./body-highlighter"
import { parseBodySegmentKey } from "./segment-labels"
import type {
  AnatomyHealthState,
  BodyRegionId,
  BodyView,
  GlobalCondition,
  LocalizedCondition,
  SeverityLevel,
} from "./model"
import { BODY_REGION_IDS, createEmptyAnatomyState } from "./model"
import { DEFAULT_REGION_LABELS } from "./region-labels"
import { domsScoreToSeverity, healthFromSeverity, injurySeverityToLevel, maxSeverity } from "./severity"

const VALID_BODY_SEGMENT_KEYS = new Set<string>()
for (const view of ["front", "back"] as const) {
  for (const s of bodySegmentsForView(view)) {
    VALID_BODY_SEGMENT_KEYS.add(s.interactionKey)
  }
}

/** Normalize client input to a JSON string array of known segment keys only. */
export function normalizeBodySegmentKeysJson(raw: unknown): string {
  if (!Array.isArray(raw)) return "[]"
  const keys = new Set<string>()
  for (const x of raw) {
    if (typeof x !== "string") continue
    const k = x.trim()
    if (VALID_BODY_SEGMENT_KEYS.has(k)) keys.add(k)
  }
  return JSON.stringify([...keys].sort())
}

export function parseBodySegmentKeysJson(json: unknown): string[] {
  if (json == null) return []
  if (Array.isArray(json)) {
    const out: string[] = []
    for (const x of json) {
      if (typeof x !== "string") continue
      const k = x.trim()
      if (VALID_BODY_SEGMENT_KEYS.has(k)) out.push(k)
    }
    return out
  }
  if (typeof json !== "string") return []
  const trimmed = json.trim()
  if (trimmed === "" || trimmed === "[]") return []
  try {
    const p = JSON.parse(trimmed) as unknown
    if (!Array.isArray(p)) return []
    const out: string[] = []
    for (const x of p) {
      if (typeof x !== "string") continue
      const k = x.trim()
      if (VALID_BODY_SEGMENT_KEYS.has(k)) out.push(k)
    }
    return out
  } catch {
    return []
  }
}

function segmentKeysForBodyRegions(regionIds: BodyRegionId[]): string[] {
  const ids = new Set(regionIds)
  const keys: string[] = []
  for (const view of ["front", "back"] as const) {
    for (const seg of bodySegmentsForView(view)) {
      if (ids.has(seg.regionId)) keys.push(seg.interactionKey)
    }
  }
  return keys
}

/**
 * When `bodySegmentKeysJson` is empty, avoid tinting every segment in a limb: use catalog
 * `injurySvgSlugs` ∩ segments whose `regionId` is in `resolveBodyRegions(row)`.
 */
function inferHighlightKeysFromCatalogSlugs(row: InjuryRowLike): string[] {
  const def = getConditionById(row.conditionKey)
  const slugs = def?.injurySvgSlugs
  if (!slugs?.length) return []
  const slugSet = new Set(slugs)

  const regions = new Set(resolveBodyRegions(row))
  if (regions.size === 0) return []

  const keys: string[] = []
  for (const view of ["front", "back"] as const) {
    for (const seg of bodySegmentsForView(view)) {
      if (!slugSet.has(seg.slug)) continue
      if (!regions.has(seg.regionId)) continue
      keys.push(seg.interactionKey)
    }
  }
  return keys
}

export interface RecoveryDailyLike {
  pain: number
  energy: number
  mood: number
  soreness: number
  stress: number
  mobility: number
  sleepFeel: number
}

export interface InjuryRowLike {
  id: string
  conditionKey: string
  customLabel: string | null
  kind: string
  bodyRegion: string | null
  bodySegmentKeysJson?: string | null
  severity: string
  status: string
  notes: string | null
}

function injuryTitle(row: InjuryRowLike): string {
  if (row.conditionKey === "custom") return row.customLabel || "Custom"
  return getConditionById(row.conditionKey)?.name ?? row.customLabel ?? row.conditionKey
}

/** Short label for UI tags / callouts (same as localized title). */
export function injuryDisplayTitle(row: InjuryRowLike): string {
  return injuryTitle(row)
}

/** Unique display titles for active (non-recovered) conditions — Tarkov-style tag strip. */
export function activeConditionTags(injuries: InjuryRowLike[]): string[] {
  const active = injuries.filter((i) => i.status !== "recovered")
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of active) {
    const title = injuryTitle(row)
    const key = title.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(title.length > 36 ? `${title.slice(0, 33)}…` : title)
  }
  return out
}

/** Segment keys used for diagram injury tinting (same rules as `buildInjurySegmentSeverityMap`). */
export function highlightSegmentKeysForInjury(row: InjuryRowLike): string[] {
  let keys = parseBodySegmentKeysJson(row.bodySegmentKeysJson ?? null)
  if (keys.length === 0) {
    keys = inferHighlightKeysFromCatalogSlugs(row)
    if (keys.length === 0) {
      const regions = resolveBodyRegionsForInjury(row)
      if (regions.length === 0) return []
      keys = segmentKeysForBodyRegions(regions)
    }
  }
  return keys
}

/**
 * Leader-line targets for the current diagram view: localized injuries only.
 * One callout per injury row — if it spans multiple segments in this view, a single representative
 * segment is chosen so the label is not duplicated.
 */
export function buildInjuryCalloutsForView(
  injuries: InjuryRowLike[],
  view: BodyView
): { injuryId: string; segmentKey: string; label: string }[] {
  const active = injuries.filter((i) => i.status !== "recovered")
  const out: { injuryId: string; segmentKey: string; label: string }[] = []
  for (const row of active) {
    const regions = resolveBodyRegionsForInjury(row)
    if (regions.length === 0) continue
    const viewKeys = highlightSegmentKeysForInjury(row).filter((k) => {
      const p = parseBodySegmentKey(k)
      return p != null && p.view === view
    })
    if (viewKeys.length === 0) continue
    viewKeys.sort((a, b) => a.localeCompare(b))
    out.push({ injuryId: row.id, segmentKey: viewKeys[0], label: injuryTitle(row) })
  }
  out.sort((a, b) => a.segmentKey.localeCompare(b.segmentKey))
  return out
}

function toLocalized(row: InjuryRowLike): LocalizedCondition {
  const def = getConditionById(row.conditionKey)
  const sev = injurySeverityToLevel(row.severity)
  const suggestions =
    def?.suggestedTreatments.map((id) => ({
      id,
      label: getTreatmentById(id)?.name ?? id,
    })) ?? []
  const tags: string[] = []
  if (def?.region) tags.push(def.region)
  if (row.notes) tags.push(row.notes.slice(0, 80))
  return {
    id: row.id,
    title: injuryTitle(row),
    severity: sev,
    status: row.status,
    kind: row.kind === "illness" ? "illness" : "injury",
    symptomTags: tags,
    treatmentSuggestions: suggestions,
  }
}

/** Map free-text + catalog hints to one or more body regions. */
export function resolveBodyRegions(row: InjuryRowLike): BodyRegionId[] {
  const explicit = row.bodyRegion?.trim()
  if (explicit && (BODY_REGION_IDS as readonly string[]).includes(explicit)) {
    return [explicit as BodyRegionId]
  }

  const def = getConditionById(row.conditionKey)
  const blob = `${def?.region ?? ""} ${row.bodyRegion ?? ""} ${def?.name ?? ""} ${row.conditionKey}`.toLowerCase()

  const has = (...words: string[]) => words.some((w) => blob.includes(w))

  // Illness / systemic → global only (empty here)
  if (
    row.kind === "illness" &&
    !has(
      "head",
      "neck",
      "throat",
      "sinus",
      "ear",
      "eye",
      "pelvic",
      "abdom",
      "stomach",
      "gi",
      "chest",
      "rib"
    )
  ) {
    return []
  }

  if (has("head", "concussion", "migraine", "sinus", "throat", "vertigo", "neck", "oral", "mouth", "eye", "ear"))
    return ["head"]
  if (has("chest", "rib", "shoulder", "pectoral")) return ["chest"]
  if (
    has("abdomen", "abdominal", "core", "gut", "gi", "stomach", "pelvic", "menstrual", "urinary", "ibs")
  )
    return ["abdomen"]

  const arm =
    has("elbow", "wrist", "hand", "finger", "forearm", "upper limb", "arm", "tennis", "golfer", "tfcc") ||
    (has("shoulder", "rotator") && !has("knee", "leg", "ankle"))
  if (arm) {
    if (has("left")) return ["leftArm"]
    if (has("right")) return ["rightArm"]
    return ["leftArm", "rightArm"]
  }

  const leg =
    has(
      "leg",
      "knee",
      "ankle",
      "foot",
      "calf",
      "thigh",
      "hamstring",
      "quad",
      "shin",
      "achilles",
      "plantar",
      "hip",
      "groin",
      "it band",
      "runner"
    ) || has("lower limb")
  if (leg) {
    if (has("left")) return ["leftLeg"]
    if (has("right")) return ["rightLeg"]
    return ["leftLeg", "rightLeg"]
  }

  if (has("back", "spine", "lumbar")) return ["chest", "abdomen"]

  return []
}

/**
 * Coarse regions for an injury row: prefer saved body segment keys (matches SVG), else catalog /
 * bodyRegion heuristics.
 */
export function resolveBodyRegionsForInjury(row: InjuryRowLike): BodyRegionId[] {
  const keys = parseBodySegmentKeysJson(row.bodySegmentKeysJson ?? null)
  if (keys.length > 0) {
    const ridSet = new Set<BodyRegionId>()
    for (const k of keys) {
      const p = parseBodySegmentKey(k)
      if (p) ridSet.add(slugToBodyRegion(p.slug, p.side, p.view))
    }
    if (ridSet.size > 0) return [...ridSet]
  }
  return resolveBodyRegions(row)
}

/**
 * Per-segment injury severity for SVG (red). Saved segment keys win; else catalog slugs scoped to
 * coarse regions; else every segment in those regions (legacy rows / custom with no slugs).
 */
export function buildInjurySegmentSeverityMap(injuries: InjuryRowLike[]): Record<string, SeverityLevel> {
  const out: Record<string, SeverityLevel> = {}
  const active = injuries.filter((i) => i.status !== "recovered")
  for (const row of active) {
    const sev = injurySeverityToLevel(row.severity)
    const keys = highlightSegmentKeysForInjury(row)
    for (const k of keys) {
      out[k] = maxSeverity(out[k] ?? "none", sev)
    }
  }
  return out
}

export function parseDomsSegments(json: string | null | undefined): { key: string; score: number }[] {
  if (!json || json === "[]") return []
  try {
    const p = JSON.parse(json) as unknown
    if (!Array.isArray(p)) return []
    const out: { key: string; score: number }[] = []
    for (const row of p) {
      if (!row || typeof row !== "object") continue
      const o = row as Record<string, unknown>
      const key = typeof o.key === "string" ? o.key : ""
      const score = typeof o.score === "number" ? o.score : parseInt(String(o.score), 10)
      if (!key || Number.isNaN(score)) continue
      out.push({ key, score: Math.min(10, Math.max(1, Math.round(score))) })
    }
    return out
  } catch {
    return []
  }
}

function domsMaxScoreByRegion(doms: { key: string; score: number }[]): Map<BodyRegionId, number> {
  const byKey = new Map<string, BodyRegionId>()
  for (const s of [...bodySegmentsForView("front"), ...bodySegmentsForView("back")]) {
    byKey.set(s.interactionKey, s.regionId)
  }
  const maxByRegion = new Map<BodyRegionId, number>()
  for (const { key, score } of doms) {
    const rid = byKey.get(key)
    if (!rid) continue
    const prev = maxByRegion.get(rid) ?? 0
    if (score > prev) maxByRegion.set(rid, score)
  }
  return maxByRegion
}

function mergeRegion(
  base: AnatomyHealthState["regions"][BodyRegionId],
  cond: LocalizedCondition
): void {
  base.injuries.push(cond)
  base.severity = maxSeverity(base.severity, cond.severity)
  base.health = Math.min(base.health, healthFromSeverity(cond.severity))
  for (const t of cond.symptomTags) {
    if (t && !base.symptoms.includes(t)) base.symptoms.push(t)
  }
  for (const t of cond.treatmentSuggestions) {
    if (!base.treatmentSuggestions.some((x) => x.id === t.id)) base.treatmentSuggestions.push(t)
  }
}

function dailyVitals(d: RecoveryDailyLike | null): GlobalCondition[] {
  if (!d) return []
  const out: GlobalCondition[] = []
  if (d.stress >= 7) {
    out.push({
      id: "sys-stress",
      title: "Elevated stress load",
      severity: d.stress >= 9 ? "high" : "moderate",
      summary: `Self-reported stress ${d.stress}/10`,
      source: "daily",
    })
  }
  if (d.energy <= 4) {
    out.push({
      id: "sys-energy",
      title: "Reduced energy state",
      severity: d.energy <= 2 ? "high" : "moderate",
      summary: `Energy ${d.energy}/10`,
      source: "daily",
    })
  }
  if (d.sleepFeel <= 4) {
    out.push({
      id: "sys-sleep",
      title: "Suboptimal rest perception",
      severity: "low",
      summary: `Rest quality feel ${d.sleepFeel}/10`,
      source: "daily",
    })
  }
  return out
}

export function deriveAnatomyHealthState(
  injuries: InjuryRowLike[],
  daily: RecoveryDailyLike | null,
  domsSegments: { key: string; score: number }[] | null = null
): AnatomyHealthState {
  const state = createEmptyAnatomyState(DEFAULT_REGION_LABELS)
  const active = injuries.filter((i) => i.status !== "recovered")

  const globalFromIllness: GlobalCondition[] = []

  for (const row of active) {
    const loc = toLocalized(row)
    const regions = resolveBodyRegionsForInjury(row)

    if (regions.length === 0) {
      globalFromIllness.push({
        id: `g-${row.id}`,
        title: loc.title,
        severity: loc.severity,
        summary: loc.symptomTags[0] ?? `${loc.kind} · ${loc.status}`,
        source: row.kind === "illness" ? "illness" : "system",
      })
      continue
    }

    for (const rid of regions) {
      mergeRegion(state.regions[rid], { ...loc, id: `${row.id}-${rid}` })
    }
  }

  const doms = domsSegments ?? []
  for (const [rid, score] of domsMaxScoreByRegion(doms)) {
    mergeRegion(state.regions[rid], {
      id: `doms-${rid}`,
      title: "Muscle soreness (DOMS)",
      severity: domsScoreToSeverity(score),
      status: "active",
      kind: "injury",
      symptomTags: [`Up to ${score}/10`],
      treatmentSuggestions: [],
    })
  }

  state.globalConditions = [...globalFromIllness, ...dailyVitals(daily)]

  if (daily) {
    state.vitalsReadouts = [
      { label: "PAIN", value: `${daily.pain}/10`, status: daily.pain >= 7 ? "alert" : daily.pain >= 5 ? "warn" : "nominal" },
      { label: "NRG", value: `${daily.energy}/10`, status: daily.energy <= 4 ? "warn" : "nominal" },
      { label: "MOOD", value: `${daily.mood}/10`, status: "nominal" },
      { label: "MOB", value: `${daily.mobility}/10`, status: daily.mobility <= 4 ? "warn" : "nominal" },
      { label: "RST", value: `${daily.sleepFeel}/10`, status: daily.sleepFeel <= 4 ? "warn" : "nominal" },
    ]
  }

  for (const id of BODY_REGION_IDS) {
    const r = state.regions[id]
    if (r.injuries.length === 0) {
      r.severity = "none"
      r.health = 100
    }
  }

  return state
}
