/**
 * Normalized anatomy / health UI model.
 * Rendering components consume this shape; population lives in derive-from-recovery.ts and mocks.
 */

export type BodyRegionId =
  | "head"
  | "chest"
  | "abdomen"
  | "leftArm"
  | "rightArm"
  | "leftLeg"
  | "rightLeg"

export type BodyView = "front" | "back"

/** Clinical-style severity for coloring and sorting — not a diagnosis. */
export type SeverityLevel = "none" | "low" | "moderate" | "high" | "critical"

export const BODY_REGION_IDS: BodyRegionId[] = [
  "head",
  "chest",
  "abdomen",
  "leftArm",
  "rightArm",
  "leftLeg",
  "rightLeg",
]

export interface TreatmentSuggestionRef {
  id: string
  label: string
}

export interface LocalizedCondition {
  id: string
  title: string
  severity: SeverityLevel
  status: string
  kind: "injury" | "illness"
  symptomTags: string[]
  treatmentSuggestions: TreatmentSuggestionRef[]
}

export interface BodyRegionState {
  id: BodyRegionId
  label: string
  health: number
  maxHealth: number
  severity: SeverityLevel
  injuries: LocalizedCondition[]
  symptoms: string[]
  treatmentSuggestions: TreatmentSuggestionRef[]
}

export interface GlobalCondition {
  id: string
  title: string
  severity: SeverityLevel
  summary: string
  source: "illness" | "system" | "daily"
}

export interface VitalsReadout {
  label: string
  value: string
  status?: "nominal" | "warn" | "alert"
}

export interface AnatomyHealthState {
  regions: Record<BodyRegionId, BodyRegionState>
  globalConditions: GlobalCondition[]
  vitalsReadouts: VitalsReadout[]
}

export function emptyRegion(id: BodyRegionId, label: string): BodyRegionState {
  return {
    id,
    label,
    health: 100,
    maxHealth: 100,
    severity: "none",
    injuries: [],
    symptoms: [],
    treatmentSuggestions: [],
  }
}

export function createEmptyAnatomyState(
  labels: Record<BodyRegionId, string>
): AnatomyHealthState {
  const regions = {} as Record<BodyRegionId, BodyRegionState>
  for (const id of BODY_REGION_IDS) {
    regions[id] = emptyRegion(id, labels[id])
  }
  return {
    regions,
    globalConditions: [],
    vitalsReadouts: [],
  }
}
