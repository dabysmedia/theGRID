import type { ProfileOverrides } from "@/lib/workouts/progressive-overload"

export const TRAINING_STYLES = ["science_based", "classic"] as const

export type TrainingStyle = (typeof TRAINING_STYLES)[number]

export const DEFAULT_TRAINING_STYLE: TrainingStyle = "science_based"

export interface TrainingStyleDefinition {
  id: TrainingStyle
  label: string
  shortLabel: string
  description: string
  activeWorkoutCue: string
  workingSetTarget: number | null
  progressionOverrides?: ProfileOverrides
}

export const TRAINING_STYLE_DEFINITIONS: Record<TrainingStyle, TrainingStyleDefinition> = {
  science_based: {
    id: "science_based",
    label: "Science-Based",
    shortLabel: "Science-Based",
    description:
      "Adaptive double progression, the existing 8–12 rep default, and optional volume when performance supports it.",
    activeWorkoutCue: "Adaptive volume · existing progression model",
    workingSetTarget: null,
  },
  classic: {
    id: "classic",
    label: "Classic",
    shortLabel: "Classic",
    description:
      "Two hard working sets per exercise, a heavier 6–10 rep target, and near-failure effort with no suggested extra sets.",
    activeWorkoutCue: "2 hard sets / exercise · aim 1 RIR",
    workingSetTarget: 2,
    progressionOverrides: {
      repMin: 6,
      repMax: 10,
      targetRir: 1,
      calibrationRir: 2,
      maxWorkingSets: 2,
      allowExtraSets: false,
    },
  },
}

export function normalizeTrainingStyle(value: unknown): TrainingStyle {
  return value === "classic" ? "classic" : DEFAULT_TRAINING_STYLE
}

/**
 * Style defaults sit below explicit per-movement overrides. That keeps a
 * user's existing movement-specific choices intact while changing the global
 * recommendation model everywhere else.
 */
export function progressionOverridesForStyle(
  style: TrainingStyle,
  exerciseOverrides?: ProfileOverrides,
): ProfileOverrides | undefined {
  const styleOverrides = TRAINING_STYLE_DEFINITIONS[style].progressionOverrides
  if (!styleOverrides) return exerciseOverrides
  return { ...styleOverrides, ...exerciseOverrides }
}

