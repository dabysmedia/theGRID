export interface NormalizedWorkoutSet {
  id: string
  setNumber: number
  weight: number | null
  reps: number | null
  type: "working" | "warmup" | "dropset" | "failure"
  completed: boolean
  [key: string]: unknown
}

export interface NormalizedWorkoutExercise {
  id: string
  name: string
  notes: string
  sets: NormalizedWorkoutSet[]
  [key: string]: unknown
}

const SET_TYPES = new Set<NormalizedWorkoutSet["type"]>([
  "working",
  "warmup",
  "dropset",
  "failure",
])

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

function numericValue(value: unknown, allowRange = true): number | null {
  if (value == null || value === "") return null
  const text = String(value).trim()
  if (!text || (!allowRange && /[-–—]/.test(text))) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

/**
 * Workout plans store template-shaped `setRows`, while a live workout stores
 * `sets`. Older planned sessions can become active without being converted, so
 * every active-session boundary accepts both shapes and returns the live shape.
 */
export function normalizeWorkoutSessionExercises<
  T = NormalizedWorkoutExercise,
>(raw: unknown): T[] {
  let parsed: unknown = raw
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []

  return parsed.flatMap((value, exerciseIndex) => {
    const exercise = record(value)
    if (!exercise) return []

    const currentSets = Array.isArray(exercise.sets) ? exercise.sets : null
    const legacyRows = Array.isArray(exercise.setRows) ? exercise.setRows : null
    let sourceSets: unknown[] = currentSets ?? legacyRows ?? []

    if (sourceSets.length === 0 && currentSets == null && legacyRows == null) {
      const targetSets = numericValue(exercise.targetSets)
      const count = Math.max(1, Math.floor(targetSets ?? 3))
      sourceSets = Array.from({ length: count }, () => ({
        reps: exercise.targetReps,
      }))
    }

    const sets = sourceSets.flatMap((setValue, setIndex) => {
      const set = record(setValue)
      if (!set) return []
      const type = SET_TYPES.has(set.type as NormalizedWorkoutSet["type"])
        ? (set.type as NormalizedWorkoutSet["type"])
        : "working"
      const { setRows: _setRows, ...rest } = set
      void _setRows
      return [{
        ...rest,
        id:
          typeof set.id === "string" && set.id.trim()
            ? set.id
            : `set-${exerciseIndex + 1}-${setIndex + 1}`,
        setNumber:
          typeof set.setNumber === "number" && Number.isFinite(set.setNumber)
            ? set.setNumber
            : setIndex + 1,
        weight: numericValue(set.weight),
        // A template range such as "8-12" is a target, not a completed rep value.
        reps: numericValue(set.reps, false),
        type,
        completed: set.completed === true,
      }]
    })

    const { sets: _sets, setRows: _setRows, targetSets: _targetSets, targetReps: _targetReps, ...rest } = exercise
    void _sets
    void _setRows
    void _targetSets
    void _targetReps
    return [{
      ...rest,
      id:
        typeof exercise.id === "string" && exercise.id.trim()
          ? exercise.id
          : `exercise-${exerciseIndex + 1}`,
      name:
        typeof exercise.name === "string" && exercise.name.trim()
          ? exercise.name
          : `Exercise ${exerciseIndex + 1}`,
      notes: typeof exercise.notes === "string" ? exercise.notes : "",
      sets,
    } as T]
  })
}
