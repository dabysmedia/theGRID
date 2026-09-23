import { customMachineId } from "@/lib/workouts/machine-brands"
import {
  normalizeWorkoutSessionExercises,
  type NormalizedWorkoutExercise,
} from "@/lib/workouts/session-exercises"
import { ActError, pick, str } from "@/lib/agent/act/parse"

const SET_TYPES = new Set(["working", "warmup", "dropset", "failure"])

export function parseAgentExercises(value: unknown): NormalizedWorkoutExercise[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 40) {
    throw new ActError("exercises must be 1–40 movements.")
  }

  const raw = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ActError(`Exercise ${index + 1} is invalid.`)
    }
    const exercise = item as Record<string, unknown>
    const name = str(exercise.name)
    if (!name || name.length > 120) throw new ActError(`Exercise ${index + 1} needs a name.`)
    if (!Array.isArray(exercise.sets) || exercise.sets.length === 0 || exercise.sets.length > 30) {
      throw new ActError(`${name} needs 1–30 sets.`)
    }
    const machine = str(exercise.machine ?? exercise.machineName)
    const sets = exercise.sets.map((set, setIndex) => parseSet(name, setIndex, set))
    return {
      name,
      notes: str(exercise.notes).slice(0, 500),
      ...(machine
        ? {
            machineId: machine.startsWith("custom:") ? machine : customMachineId(machine),
            machineName: machine.startsWith("custom:") ? machine.slice("custom:".length) : machine,
          }
        : {}),
      sets,
    }
  })

  return normalizeWorkoutSessionExercises(raw)
}

function parseSet(name: string, index: number, set: unknown) {
  let lb: unknown
  let reps: unknown
  let type: unknown
  let done: unknown
  if (Array.isArray(set)) {
    lb = set[0]
    reps = set[1]
    type = set[2]
  } else if (set && typeof set === "object") {
    const row = set as Record<string, unknown>
    lb = row.lb ?? row.weight ?? row.lbs
    reps = row.reps
    type = row.type
    done = row.done ?? row.completed
  } else {
    throw new ActError(`${name} set ${index + 1} is invalid. Use [lb, reps] or {lb, reps}.`)
  }
  const setType = str(type).toLowerCase() || "working"
  if (!SET_TYPES.has(setType)) {
    throw new ActError(`${name} set ${index + 1} type must be working, warmup, dropset, or failure.`)
  }
  return {
    weight: lb ?? null,
    reps: reps ?? null,
    type: setType,
    completed: done === false ? false : true,
  }
}

export function compactExercises(raw: unknown): Record<string, unknown>[] {
  return normalizeWorkoutSessionExercises(raw).map((exercise) =>
    pick({
      name: exercise.name,
      notes: exercise.notes,
      machine: exercise.machineName || exercise.machineId || null,
      sets: exercise.sets.map((set) =>
        pick({
          lb: set.weight,
          reps: set.reps,
          type: set.type === "working" ? null : set.type,
          done: set.completed ? null : false,
        }),
      ),
    }),
  )
}
