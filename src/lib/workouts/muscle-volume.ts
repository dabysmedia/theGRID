import { bodySegmentsForView } from "@/lib/anatomy-health/body-highlighter"

export interface WorkoutSetLike {
  weight: number | null
  reps: number | null
  completed: boolean
}

export interface WorkoutMuscleTag {
  name: string
  color?: string
}

export interface WorkoutExerciseLike {
  primaryMuscles?: WorkoutMuscleTag[]
  secondaryMuscles?: WorkoutMuscleTag[]
  sets: WorkoutSetLike[]
}

export interface WorkoutSessionLike {
  id?: string
  date: string
  exercises: string | WorkoutExerciseLike[]
}

export interface MuscleWeekStats {
  muscle: string
  color: string
  sets: number
  volumeLb: number
  sessions: number
  lastTrainedDate: string | null
}

/** Coarse library muscle names → SVG slugs (both sides when bilateral). */
const MUSCLE_SLUGS: Record<string, string[]> = {
  chest: ["chest"],
  "upper chest": ["chest"],
  "lower chest": ["chest"],
  back: ["upper-back", "lower-back", "trapezius"],
  lats: ["upper-back"],
  "upper back": ["upper-back"],
  rhomboids: ["upper-back"],
  "lower back": ["lower-back"],
  erectors: ["lower-back"],
  shoulders: ["deltoids"],
  deltoids: ["deltoids"],
  "front delts": ["deltoids"],
  "rear delts": ["deltoids"],
  "side delts": ["deltoids"],
  biceps: ["biceps"],
  brachialis: ["biceps"],
  triceps: ["triceps"],
  arms: ["biceps", "triceps", "forearm"],
  forearms: ["forearm"],
  forearm: ["forearm"],
  core: ["abs", "obliques"],
  abdominals: ["abs"],
  abs: ["abs"],
  obliques: ["obliques"],
  quadriceps: ["quadriceps"],
  quads: ["quadriceps"],
  hamstrings: ["hamstring"],
  hamstring: ["hamstring"],
  glutes: ["gluteal"],
  gluteal: ["gluteal"],
  calves: ["calves"],
  legs: ["quadriceps", "hamstring", "gluteal", "calves"],
  trapezius: ["trapezius"],
  traps: ["trapezius"],
  adductors: ["adductors"],
  "hip adductors": ["adductors"],
  abductors: ["gluteal"],
  "hip abductors": ["gluteal"],
  cardio: [],
}

const DEFAULT_MUSCLE_COLOR = "#c4d632"

function normalizeMuscleKey(name: string): string {
  return name.trim().toLowerCase()
}

function slugsForMuscle(name: string): string[] {
  const key = normalizeMuscleKey(name)
  if (MUSCLE_SLUGS[key]) return MUSCLE_SLUGS[key]
  if (key.endsWith("s") && MUSCLE_SLUGS[key.slice(0, -1)]) return MUSCLE_SLUGS[key.slice(0, -1)]!
  return []
}

function segmentKeysForSlugs(slugs: string[]): string[] {
  if (slugs.length === 0) return []
  const slugSet = new Set(slugs)
  const keys: string[] = []
  for (const view of ["front", "back"] as const) {
    for (const seg of bodySegmentsForView(view)) {
      if (slugSet.has(seg.slug)) keys.push(seg.interactionKey)
    }
  }
  return keys
}

function normalizeDateKey(d: string): string {
  return d.split("T")[0]
}

function parseExercises(raw: string | WorkoutExerciseLike[]): WorkoutExerciseLike[] {
  if (Array.isArray(raw)) return raw
  try {
    return JSON.parse(raw) as WorkoutExerciseLike[]
  } catch {
    return []
  }
}

function isSetCounted(set: WorkoutSetLike): boolean {
  if (set.completed) return true
  return set.weight != null && set.reps != null
}

function setVolume(set: WorkoutSetLike): number {
  if (set.weight == null || set.reps == null) return 0
  return set.weight * set.reps
}

function addMuscleLoad(
  map: Map<
    string,
    { color: string; sets: number; volumeLb: number; sessionIds: Set<string>; lastDate: string | null }
  >,
  muscle: WorkoutMuscleTag,
  setsDelta: number,
  volumeDelta: number,
  sessionId: string,
  dateKey: string,
  weight: number,
) {
  const name = muscle.name.trim()
  if (!name) return
  const key = normalizeMuscleKey(name)
  const prev = map.get(key) ?? {
    label: name,
    color: muscle.color?.trim() || DEFAULT_MUSCLE_COLOR,
    sets: 0,
    volumeLb: 0,
    sessionIds: new Set<string>(),
    lastDate: null,
  }
  prev.sets += setsDelta * weight
  prev.volumeLb += volumeDelta * weight
  if (setsDelta > 0) {
    prev.sessionIds.add(sessionId)
    if (!prev.lastDate || dateKey > prev.lastDate) prev.lastDate = dateKey
  }
  if (muscle.color?.trim()) prev.color = muscle.color.trim()
  map.set(key, prev)
}

/**
 * Aggregate completed-set volume and set counts by primary (100%) and secondary (40%) muscle.
 */
export function aggregateMuscleStats(
  sessions: WorkoutSessionLike[],
  weekStart: string,
  weekEnd: string,
): MuscleWeekStats[] {
  const map = new Map<
    string,
    {
      label: string
      color: string
      sets: number
      volumeLb: number
      sessionIds: Set<string>
      lastDate: string | null
    }
  >()

  for (const session of sessions) {
    const dateKey = normalizeDateKey(session.date)
    if (dateKey < weekStart || dateKey > weekEnd) continue
    const sessionId = session.id ?? `${dateKey}-${normalizeDateKey(session.date)}`
    const exercises = parseExercises(session.exercises)

    for (const ex of exercises) {
      const countedSets = ex.sets.filter(isSetCounted)
      if (countedSets.length === 0) continue

      let vol = 0
      for (const set of countedSets) vol += setVolume(set)
      const setCount = countedSets.length

      const primaries = ex.primaryMuscles?.filter((m) => m.name.trim()) ?? []
      const secondaries = ex.secondaryMuscles?.filter((m) => m.name.trim()) ?? []

      if (primaries.length === 0 && secondaries.length === 0) {
        addMuscleLoad(map, { name: "Other", color: DEFAULT_MUSCLE_COLOR }, setCount, vol, sessionId, dateKey, 1)
        continue
      }

      for (const m of primaries) {
        addMuscleLoad(map, m, setCount, vol, sessionId, dateKey, 1)
      }
      for (const m of secondaries) {
        addMuscleLoad(map, m, setCount, vol, sessionId, dateKey, 0.4)
      }
    }
  }

  const out: MuscleWeekStats[] = []
  for (const [, row] of map) {
    if (row.sets <= 0) continue
    out.push({
      muscle: row.label,
      color: row.color,
      sets: Math.round(row.sets * 10) / 10,
      volumeLb: Math.round(row.volumeLb),
      sessions: row.sessionIds.size,
      lastTrainedDate: row.lastDate,
    })
  }

  return out.sort((a, b) => b.sets - a.sets || b.volumeLb - a.volumeLb || a.muscle.localeCompare(b.muscle))
}

/** Map weekly muscle set counts to body segment keys (absolute sets, not normalized). */
export function muscleStatsToSegmentScores(stats: MuscleWeekStats[]): Record<string, number> {
  if (stats.length === 0) return {}
  const scores: Record<string, number> = {}

  for (const row of stats) {
    const slugs = slugsForMuscle(row.muscle)
    const keys = segmentKeysForSlugs(slugs)
    if (keys.length === 0) continue
    for (const k of keys) {
      scores[k] = Math.max(scores[k] ?? 0, row.sets)
    }
  }
  return scores
}

export function formatVolumeLb(n: number): string {
  if (n <= 0) return "—"
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k lb`
  return `${Math.round(n)} lb`
}
