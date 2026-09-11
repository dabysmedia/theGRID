import { normalizeExerciseKey } from "@/lib/workouts/progressive-overload"
import {
  customMachineId,
  customMachineName,
  isCustomMachineId,
  isKnownMachineBrand,
  normalizeMachineKey,
} from "@/lib/workouts/machine-brands"

/*
 * Machine variants.
 *
 * The same movement can exist on several manufacturers' machines, and each has
 * its own resistance profile — "100 lb on Arsenal" is not comparable to "80 lb
 * on Hammer Strength". A machine selection therefore becomes part of a logged
 * exercise's identity so that:
 *   • progressive overload history can be filtered per machine,
 *   • the last machine used for a movement can be remembered and pre-selected,
 *   • a genuine machine change is not mistaken for a change in strength.
 *
 * Only machine, cable and plate-loaded movements offer the selector — barbells,
 * dumbbells, bodyweight work and the like are left exactly as they were.
 */

export interface MachineSelection {
  machineId: string | null
  machineName: string | null
}

export interface MachineScopeInput {
  name?: string | null
  category?: string | null
  machineId?: string | null
}

const MACHINE_CATEGORY = /(machine|cable|smith|plate[- ]?loaded|selectorized|weight stack)/i
const NON_MACHINE_CATEGORY = /(free weight|body ?weight|dumbbell|barbell|kettlebell|band|medicine ball)/i

/**
 * Movements that are (or can be) performed on a specific manufacturer's machine.
 * Categories from the exercise library are authoritative; names are the fallback
 * for custom entries with no category.
 */
const MACHINE_NAME_HINT =
  /\b(machine|pec[ -]?deck|cable|pulldown|pull[ -]?down|pushdown|lat pull|leg press|hack squat|smith|assisted|glute drive|hip (abduction|adduction|thrust)|v[ -]?squat|belt squat|pendulum|torso rotation|back extension|nordic|preacher|chest press|shoulder press|rear delt|reverse (pec|fly)|leg extension|leg curl|(standing|seated|rotary|donkey) calf|row machine|seated row|seated dip|seated press|goblet)/i

export function supportsMachineSelection(exercise: MachineScopeInput): boolean {
  /* Already assigned a machine (routine slot, previous session) — always keep it visible. */
  if (exercise.machineId) return true
  const category = (exercise.category ?? "").trim()
  if (MACHINE_CATEGORY.test(category)) return true
  if (NON_MACHINE_CATEGORY.test(category)) return false
  return MACHINE_NAME_HINT.test(exercise.name ?? "")
}

/** Stable identity for a machine selection; `""` means "no specific machine". */
export function machineKeyOf(
  machineId?: string | null,
  machineName?: string | null,
): string {
  if (isKnownMachineBrand(machineId)) return machineId as string
  return normalizeMachineKey(machineId, machineName)
}

/**
 * History key for a movement + machine. Matches the `exerciseMachineKey` shape
 * used by the progress map so a machine change re-keys prefill, the "Previous"
 * column and the coach history in one place.
 */
export function exerciseMachineKey(
  exerciseName: string,
  machineId?: string | null,
  machineName?: string | null,
): string {
  return `${normalizeExerciseKey(exerciseName)}@@${machineKeyOf(machineId, machineName)}`
}

export function machineSelectionOf(exercise: {
  machineId?: string | null
  machineName?: string | null
}): MachineSelection {
  return {
    machineId: exercise.machineId ?? null,
    machineName: exercise.machineName ?? null,
  }
}

export function sameMachineSelection(a: MachineSelection, b: MachineSelection): boolean {
  return machineKeyOf(a.machineId, a.machineName) === machineKeyOf(b.machineId, b.machineName)
}

/** Normalise a raw picker choice into the pair stored on the exercise JSON. */
export function machineSelectionFromPick(input: {
  machineId?: string | null
  machineName?: string | null
}): MachineSelection {
  const id = (input.machineId ?? "").trim()
  const name = (input.machineName ?? "").trim()
  if (!machineKeyOf(id, name)) return { machineId: null, machineName: null }
  if (isKnownMachineBrand(id)) return { machineId: id, machineName: null }
  if (isCustomMachineId(id)) {
    const customName = customMachineName(id).trim() || name
    return { machineId: id, machineName: customName || null }
  }
  /* A bare typed name arrives as machineName only. */
  return name ? { machineId: customMachineId(name), machineName: name } : { machineId: null, machineName: null }
}

/* ──────────────────────────────────────────────────────────
   Per-user memory (client-side)
   ────────────────────────────────────────────────────────── */

/*
 * Server-side history is the source of truth, but it only updates once a session
 * is completed. This localStorage mirror remembers the machine you reached for
 * the moment you pick it, so abandoning a workout — or starting a fresh routine
 * slot — still defaults to the machine you actually use.
 */

const STORAGE_KEY = "thegrid:machine-selection"

export interface MachineMemoryEntry {
  exerciseName: string
  exerciseKey: string
  machineId: string | null
  machineName: string | null
  lastUsedAt: number
  useCount: number
}

export type MachineMemoryStore = Record<string, MachineMemoryEntry>

export function loadMachineMemory(): MachineMemoryStore {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed == null || typeof parsed !== "object") return {}
    return { ...(parsed as MachineMemoryStore) }
  } catch {
    return {}
  }
}

function persist(store: MachineMemoryStore) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* ignore quota */
  }
}

export function rememberMachineSelection(input: {
  exerciseName: string
  machineId?: string | null
  machineName?: string | null
}): MachineMemoryStore {
  if (typeof window === "undefined") return {}
  const exerciseName = input.exerciseName.trim()
  if (!exerciseName) return loadMachineMemory()
  const selection = machineSelectionFromPick(input)
  const exerciseKey = normalizeExerciseKey(exerciseName)
  const store = loadMachineMemory()
  const prev = store[exerciseKey]
  const next: MachineMemoryStore = {
    ...store,
    [exerciseKey]: {
      exerciseName,
      exerciseKey,
      machineId: selection.machineId,
      machineName: selection.machineName,
      lastUsedAt: Date.now(),
      useCount: (prev?.useCount ?? 0) + 1,
    },
  }
  persist(next)
  return next
}

export function getRememberedMachine(exerciseName: string): MachineMemoryEntry | null {
  const store = loadMachineMemory()
  return store[normalizeExerciseKey(exerciseName)] ?? null
}

/** Forget a movement's remembered machine (e.g. the exercise was deleted). */
export function forgetMachineSelection(exerciseName: string): MachineMemoryStore {
  if (typeof window === "undefined") return {}
  const store = loadMachineMemory()
  delete store[normalizeExerciseKey(exerciseName)]
  persist(store)
  return store
}
