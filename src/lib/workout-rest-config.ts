const STORAGE_KEY = "thegrid:workout-rest"

export interface WorkoutRestConfig {
  enabled: boolean
  seconds: number
}

export const DEFAULT_WORKOUT_REST: WorkoutRestConfig = {
  enabled: true,
  seconds: 90,
}

function clampSeconds(s: number): number {
  if (!Number.isFinite(s)) return DEFAULT_WORKOUT_REST.seconds
  return Math.min(600, Math.max(15, Math.round(s)))
}

export function loadWorkoutRestConfig(): WorkoutRestConfig {
  if (typeof window === "undefined") return DEFAULT_WORKOUT_REST
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_WORKOUT_REST
    const p = JSON.parse(raw) as Partial<WorkoutRestConfig>
    const enabled =
      typeof p.enabled === "boolean" ? p.enabled : DEFAULT_WORKOUT_REST.enabled
    const seconds = clampSeconds(
      typeof p.seconds === "number" ? p.seconds : DEFAULT_WORKOUT_REST.seconds,
    )
    return { enabled, seconds }
  } catch {
    return DEFAULT_WORKOUT_REST
  }
}

export function saveWorkoutRestConfig(
  patch: Partial<WorkoutRestConfig>,
): WorkoutRestConfig {
  const cur = loadWorkoutRestConfig()
  const next: WorkoutRestConfig = {
    enabled:
      typeof patch.enabled === "boolean" ? patch.enabled : cur.enabled,
    seconds:
      patch.seconds !== undefined ? clampSeconds(patch.seconds) : cur.seconds,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
