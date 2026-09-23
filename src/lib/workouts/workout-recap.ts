export interface RecapSet {
  weight: number | null
  reps: number | null
  completed: boolean
  type?: string
}

export interface RecapExercise {
  name: string
  sets: RecapSet[]
}

export interface WorkoutRecapMovement {
  name: string
  setsDone: number
  bestSet: { weight: number; reps: number } | null
  volume: number
  isPr: boolean
}

export interface WorkoutRecap {
  durationMin: number
  setsDone: number
  setsPlanned: number
  volume: number
  movements: WorkoutRecapMovement[]
  prCount: number
}

/** Epley estimate; a single rep is its own max. */
export function estimateOneRepMax(weight: number, reps: number): number {
  if (!(weight > 0) || !(reps > 0)) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

function isScoredSet(set: RecapSet): set is RecapSet & { weight: number; reps: number } {
  return (
    set.completed &&
    set.type !== "warmup" &&
    typeof set.weight === "number" &&
    typeof set.reps === "number" &&
    set.weight > 0 &&
    set.reps > 0
  )
}

function movementKey(name: string): string {
  return name.trim().toLowerCase()
}

export function buildWorkoutRecap({
  exercises,
  previous,
  durationMin,
}: {
  exercises: RecapExercise[]
  previous: Array<{ exercises: RecapExercise[] }>
  durationMin: number
}): WorkoutRecap {
  const historyBest = new Map<string, number>()
  for (const session of previous) {
    for (const exercise of session.exercises) {
      const key = movementKey(exercise.name)
      for (const set of exercise.sets) {
        if (!isScoredSet(set)) continue
        const e1rm = estimateOneRepMax(set.weight, set.reps)
        if (e1rm > (historyBest.get(key) ?? 0)) historyBest.set(key, e1rm)
      }
    }
  }

  let setsDone = 0
  let setsPlanned = 0
  let volume = 0
  const movements: WorkoutRecapMovement[] = []

  for (const exercise of exercises) {
    setsPlanned += exercise.sets.length
    const done = exercise.sets.filter((set) => set.completed)
    setsDone += done.length
    let movementVolume = 0
    let bestSet: WorkoutRecapMovement["bestSet"] = null
    let bestE1rm = 0
    for (const set of exercise.sets) {
      if (!isScoredSet(set)) continue
      movementVolume += set.weight * set.reps
      const e1rm = estimateOneRepMax(set.weight, set.reps)
      if (e1rm > bestE1rm) {
        bestE1rm = e1rm
        bestSet = { weight: set.weight, reps: set.reps }
      }
    }
    volume += movementVolume
    if (done.length === 0) continue
    const previousBest = historyBest.get(movementKey(exercise.name))
    movements.push({
      name: exercise.name,
      setsDone: done.length,
      bestSet,
      volume: movementVolume,
      isPr: previousBest != null && bestE1rm > previousBest + 1e-9,
    })
  }

  return {
    durationMin: Math.max(0, Math.round(durationMin)),
    setsDone,
    setsPlanned,
    volume: Math.round(volume),
    movements,
    prCount: movements.filter((movement) => movement.isPr).length,
  }
}
