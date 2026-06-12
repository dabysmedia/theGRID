import type { ProfileOverrides } from "@/lib/workouts/progressive-overload"
import { normalizeExerciseKey } from "@/lib/workouts/progressive-overload"

/*
 * Client-side preferences for the Progressive Overload Coach.
 * Follows the same localStorage pattern as workout-rest-config.
 */

const STORAGE_KEY = "thegrid:workout-progression"

export type EffortScale = "rir" | "rpe"

export interface ProgressionPrefs {
  /** Display scale for effort prompts. Canonical stored value is always RIR. */
  effortScale: EffortScale
  /** Master switch for the coach card. */
  coachEnabled: boolean
  /** Per-exercise overrides keyed by normalized exercise name. */
  exercises: Record<string, ExerciseProgressionOverride>
}

export interface ExerciseProgressionOverride extends ProfileOverrides {
  /** Hide recommendations for this movement only. */
  disabled?: boolean
}

export const DEFAULT_PROGRESSION_PREFS: ProgressionPrefs = {
  effortScale: "rir",
  coachEnabled: true,
  exercises: {},
}

export function loadProgressionPrefs(): ProgressionPrefs {
  if (typeof window === "undefined") return DEFAULT_PROGRESSION_PREFS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PROGRESSION_PREFS
    const p = JSON.parse(raw) as Partial<ProgressionPrefs>
    return {
      effortScale: p.effortScale === "rpe" ? "rpe" : "rir",
      coachEnabled: typeof p.coachEnabled === "boolean" ? p.coachEnabled : true,
      exercises:
        p.exercises && typeof p.exercises === "object" ? { ...p.exercises } : {},
    }
  } catch {
    return DEFAULT_PROGRESSION_PREFS
  }
}

export function saveProgressionPrefs(
  patch: Partial<Omit<ProgressionPrefs, "exercises">>,
): ProgressionPrefs {
  const cur = loadProgressionPrefs()
  const next: ProgressionPrefs = {
    ...cur,
    ...(patch.effortScale !== undefined ? { effortScale: patch.effortScale } : {}),
    ...(patch.coachEnabled !== undefined ? { coachEnabled: patch.coachEnabled } : {}),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {}
  return next
}

export function getExerciseOverride(
  prefs: ProgressionPrefs,
  exerciseName: string,
): ExerciseProgressionOverride | undefined {
  return prefs.exercises[normalizeExerciseKey(exerciseName)]
}

export function saveExerciseOverride(
  exerciseName: string,
  patch: ExerciseProgressionOverride | null,
): ProgressionPrefs {
  const cur = loadProgressionPrefs()
  const key = normalizeExerciseKey(exerciseName)
  const exercises = { ...cur.exercises }
  if (patch == null) {
    delete exercises[key]
  } else {
    exercises[key] = { ...exercises[key], ...patch }
  }
  const next: ProgressionPrefs = { ...cur, exercises }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {}
  return next
}
