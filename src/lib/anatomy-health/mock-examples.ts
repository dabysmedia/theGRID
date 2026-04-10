/**
 * Storybook-style fixture states for the anatomy UI (dev / demos).
 */

import type { AnatomyHealthState, BodyRegionId, SeverityLevel } from "./model"
import { createEmptyAnatomyState } from "./model"
import { DEFAULT_REGION_LABELS } from "./region-labels"

function base(): AnatomyHealthState {
  return createEmptyAnatomyState(DEFAULT_REGION_LABELS)
}

/** All regions nominal — empty slate. */
export function mockNominal(): AnatomyHealthState {
  return base()
}

/** Left leg critical, right leg moderate — stress-test legend + inspector. */
export function mockLowerLimbFocus(): AnatomyHealthState {
  const s = base()
  s.regions.leftLeg.health = 12
  s.regions.leftLeg.severity = "critical"
  s.regions.leftLeg.symptoms = ["Weight-bearing pain", "Localized edema (self-reported)"]
  s.regions.leftLeg.injuries = [
    {
      id: "mock-ll-1",
      title: "Ankle sprain — grade II (mock)",
      severity: "critical",
      status: "active",
      kind: "injury",
      symptomTags: ["Inversion injury"],
      treatmentSuggestions: [
        { id: "rest", label: "Rest / activity reduction" },
        { id: "ice", label: "Ice / cold therapy" },
        { id: "see_clinician", label: "Medical evaluation" },
      ],
    },
  ]
  s.regions.leftLeg.treatmentSuggestions = s.regions.leftLeg.injuries[0].treatmentSuggestions

  s.regions.rightLeg.health = 58
  s.regions.rightLeg.severity = "moderate"
  s.regions.rightLeg.injuries = [
    {
      id: "mock-rl-1",
      title: "Shin splints (mock)",
      severity: "moderate",
      status: "improving",
      kind: "injury",
      symptomTags: ["Post-run ache"],
      treatmentSuggestions: [{ id: "rest", label: "Rest" }],
    },
  ]

  s.globalConditions = [
    {
      id: "mock-g1",
      title: "Common cold (mock)",
      severity: "low",
      summary: "Upper respiratory — self-limiting",
      source: "illness",
    },
  ]

  s.vitalsReadouts = [
    { label: "PAIN", value: "6/10", status: "warn" },
    { label: "NRG", value: "5/10", status: "warn" },
  ]
  return s
}

/** Multi-region + global — dense rail. */
export function mockMultiSite(): AnatomyHealthState {
  const s = base()
  const arm: BodyRegionId = "rightArm"
  s.regions[arm].severity = "moderate"
  s.regions[arm].health = 52
  s.regions[arm].injuries = [
    {
      id: "m-a1",
      title: "Lateral epicondylalgia (mock)",
      severity: "moderate",
      status: "active",
      kind: "injury",
      symptomTags: ["Grip-sensitive"],
      treatmentSuggestions: [{ id: "brace_tape", label: "Brace / taping" }],
    },
  ]
  s.regions.head.severity = "low"
  s.regions.head.health = 78
  s.regions.head.injuries = [
    {
      id: "m-h1",
      title: "Tension headache (mock)",
      severity: "low",
      status: "active",
      kind: "illness",
      symptomTags: ["Bilateral band"],
      treatmentSuggestions: [],
    },
  ]
  s.regions.head.symptoms = ["Pressure behind eyes"]
  s.globalConditions = [
    { id: "m-g1", title: "Fatigue cluster", severity: "moderate", summary: "Several subsystems degraded", source: "system" },
    { id: "m-g2", title: "Sleep debt", severity: "low", summary: "RST below nominal", source: "daily" },
  ]
  s.vitalsReadouts = [
    { label: "PAIN", value: "4/10", status: "nominal" },
    { label: "STR", value: "7/10", status: "alert" },
  ]
  return s
}

export const MOCK_EXAMPLES = {
  nominal: mockNominal,
  lowerLimbFocus: mockLowerLimbFocus,
  multiSite: mockMultiSite,
} as const

/** Per-example segment keys for BodySilhouetteSvg (matches HUD coloring). */
export const MOCK_EXAMPLE_INJURY_SEGMENTS: Record<keyof typeof MOCK_EXAMPLES, Record<string, SeverityLevel>> = {
  nominal: {},
  lowerLimbFocus: {
    "front:ankles:left": "critical",
    "front:tibialis:right": "moderate",
  },
  multiSite: {
    "front:forearm:right": "moderate",
    "front:head:common": "low",
  },
}
