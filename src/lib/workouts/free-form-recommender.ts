import type { ApiExercise } from "./exercise-library"
import {
  aggregateMuscleStats,
  type MuscleWeekStats,
  type WorkoutSessionLike,
} from "./muscle-volume"
import {
  calculateExerciseSimilarity,
  inferMovementPattern,
  normalizeExerciseKey,
  type MovementPattern,
} from "./progressive-overload"

export type BodySplit = "upper" | "lower"

export interface RecommendedExercise {
  name: string
  primaryMuscles: Array<{ name: string; color: string; code: string }>
  secondaryMuscles: Array<{ name: string; color: string; code: string }>
  category: string
  /** Why this movement was picked (for UI hints). */
  reason: string
  score: number
}

export interface FreeFormRecommendInput {
  library: ApiExercise[]
  sessions: WorkoutSessionLike[]
  split: BodySplit
  weekStart: string
  weekEnd: string
  /** Already in the session — skip these names. */
  excludeNames?: string[]
  /** Target exercise count (default 5). */
  count?: number
  /** Weekly set target per primary muscle (default 10). */
  weeklySetTarget?: number
}

const UPPER_MUSCLES = new Set([
  "chest",
  "lats",
  "upper back",
  "rhomboids",
  "shoulders",
  "deltoids",
  "biceps",
  "triceps",
  "forearms",
  "forearm",
  "arms",
  "trapezius",
  "traps",
  "abdominals",
  "abs",
  "obliques",
  "core",
  "back",
])

const LOWER_MUSCLES = new Set([
  "quadriceps",
  "quads",
  "hamstrings",
  "hamstring",
  "glutes",
  "gluteal",
  "calves",
  "legs",
  "adductors",
  "abductors",
  "lower back",
  "erectors",
])

/** Pattern buckets used to keep a balanced free-form session. */
type PatternBucket =
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "elbow_flexion"
  | "elbow_extension"
  | "chest_isolation"
  | "shoulder_isolation"
  | "squat"
  | "hinge"
  | "lunge"
  | "glute"
  | "leg_isolation"
  | "calf"
  | "core"
  | "other"

/** Compounds first, then accessories / isolations. */
const UPPER_BUCKET_ORDER: PatternBucket[] = [
  "horizontal_push",
  "vertical_pull",
  "horizontal_pull",
  "vertical_push",
  "elbow_extension",
  "elbow_flexion",
  "chest_isolation",
  "shoulder_isolation",
  "core",
]

const LOWER_BUCKET_ORDER: PatternBucket[] = [
  "squat",
  "hinge",
  "lunge",
  "glute",
  "leg_isolation",
  "calf",
  "other",
]

const COMPOUND_BUCKETS: ReadonlySet<PatternBucket> = new Set([
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "squat",
  "hinge",
  "lunge",
  "glute",
])

const ISOLATION_BUCKETS: ReadonlySet<PatternBucket> = new Set([
  "chest_isolation",
  "shoulder_isolation",
  "elbow_flexion",
  "elbow_extension",
  "leg_isolation",
  "calf",
  "core",
])

export function isUpperBodyMuscle(name: string): boolean {
  return UPPER_MUSCLES.has(name.trim().toLowerCase())
}

export function isLowerBodyMuscle(name: string): boolean {
  return LOWER_MUSCLES.has(name.trim().toLowerCase())
}

export function muscleMatchesSplit(name: string, split: BodySplit): boolean {
  const key = name.trim().toLowerCase()
  if (split === "upper") return UPPER_MUSCLES.has(key)
  return LOWER_MUSCLES.has(key)
}

/** True for multi-joint presses, pulls, squats, hinges — not flies/raises/curls. */
export function isCompoundMovement(name: string, primaryMuscle?: string): boolean {
  const bucket = inferPatternBucket(name, primaryMuscle)
  return COMPOUND_BUCKETS.has(bucket)
}

export function inferPatternBucket(name: string, primaryMuscle?: string): PatternBucket {
  const n = normalizeExerciseKey(name)
  const m = (primaryMuscle ?? "").trim().toLowerCase()
  const pattern: MovementPattern = inferMovementPattern(name)

  // Prefer progressive-overload pattern when it cleanly maps to a free-form bucket
  switch (pattern) {
    case "chest_isolation":
      return "chest_isolation"
    case "shoulder_isolation":
      return "shoulder_isolation"
    case "leg_isolation":
      return "leg_isolation"
    case "elbow_flexion":
      return "elbow_flexion"
    case "elbow_extension":
      return "elbow_extension"
    case "core":
      return "core"
    case "calf":
      return "calf"
    case "lunge":
      return "lunge"
    case "squat":
      return "squat"
    case "hinge":
      return "hinge"
    case "vertical_pull":
      return "vertical_pull"
    case "horizontal_pull":
      return "horizontal_pull"
    case "vertical_push":
      return "vertical_push"
    case "horizontal_push":
      return "horizontal_push"
    default:
      break
  }

  // Muscle fallbacks when name didn't match a pattern rule
  if (/fly|flye|crossover|pec deck|pullover/.test(n)) return "chest_isolation"
  if (/lateral raise|front raise|rear delt|face.?pull|y.?raise|upright row/.test(n)) {
    return "shoulder_isolation"
  }
  if (/bench|chest press|push.?up|dip|floor press/.test(n) || m === "chest") {
    return "horizontal_push"
  }
  if (/overhead|shoulder press|military|arnold|landmine press/.test(n)) return "vertical_push"
  if (m === "shoulders" || m === "deltoids") return "shoulder_isolation"
  if (/row|seated row|chest.?supported|meadows|seal row/.test(n)) return "horizontal_pull"
  if (/pulldown|pull.?up|chin.?up|lat /.test(n) || m === "lats") return "vertical_pull"
  if (/curl|bicep/.test(n) || m === "biceps") return "elbow_flexion"
  if (/tricep|pushdown|skull|dip/.test(n) || m === "triceps") return "elbow_extension"
  if (
    /crunch|sit.?up|plank|ab |core|woodchop|knee raise/.test(n) ||
    m === "abdominals" ||
    m === "obliques" ||
    m === "core"
  ) {
    return "core"
  }
  if (/squat|leg press|hack|pendulum|sissy/.test(n) || m === "quadriceps") return "squat"
  if (
    /deadlift|rdl|romanian|good morning|hip hinge|back extension|hyperextension|rack pull/.test(n) ||
    m === "hamstrings" ||
    m === "lower back"
  ) {
    return "hinge"
  }
  if (/hip thrust|glute|kickback|abduction|abductor/.test(n) || m === "glutes" || m === "abductors") {
    return "glute"
  }
  if (/calf|gastroc|soleus/.test(n) || m === "calves") return "calf"
  if (m === "hamstrings") return "hinge"
  if (m === "quadriceps") return "squat"
  return "other"
}

export interface ExerciseFrequency {
  key: string
  name: string
  sessionCount: number
  setCount: number
  lastUsedAt: string | null
}

/** Count how often each exercise appears across completed sessions. */
export function aggregateExerciseFrequency(
  sessions: WorkoutSessionLike[],
): Map<string, ExerciseFrequency> {
  const map = new Map<string, ExerciseFrequency>()
  for (const session of sessions) {
    const dateKey = String(session.date).slice(0, 10)
    let exercises: Array<{ name?: string; sets?: unknown[] }> = []
    if (Array.isArray(session.exercises)) {
      exercises = session.exercises as Array<{ name?: string; sets?: unknown[] }>
    } else if (typeof session.exercises === "string") {
      try {
        exercises = JSON.parse(session.exercises)
      } catch {
        exercises = []
      }
    }
    const seenInSession = new Set<string>()
    for (const ex of exercises) {
      if (!ex?.name?.trim()) continue
      const key = normalizeExerciseKey(ex.name)
      const prev = map.get(key) ?? {
        key,
        name: ex.name,
        sessionCount: 0,
        setCount: 0,
        lastUsedAt: null,
      }
      if (!seenInSession.has(key)) {
        prev.sessionCount += 1
        seenInSession.add(key)
      }
      prev.setCount += Array.isArray(ex.sets) ? ex.sets.length : 0
      if (!prev.lastUsedAt || dateKey > prev.lastUsedAt) prev.lastUsedAt = dateKey
      if (ex.name.length > prev.name.length) prev.name = ex.name
      map.set(key, prev)
    }
  }
  return map
}

/**
 * Rank library exercises for the picker: favorites first, then compounds,
 * then alphabetical. Used to keep the default list focused.
 */
export function rankExercisesForPicker(
  exercises: ApiExercise[],
  freq: Map<string, ExerciseFrequency>,
): ApiExercise[] {
  return [...exercises].sort((a, b) => {
    const fa = freq.get(normalizeExerciseKey(a.name))?.sessionCount ?? 0
    const fb = freq.get(normalizeExerciseKey(b.name))?.sessionCount ?? 0
    if (fb !== fa) return fb - fa
    const ca = isCompoundMovement(a.name, a.primaryMuscles[0]?.name) ? 1 : 0
    const cb = isCompoundMovement(b.name, b.primaryMuscles[0]?.name) ? 1 : 0
    if (cb !== ca) return cb - ca
    return a.name.localeCompare(b.name)
  })
}

/** Top frequently logged exercises from the library (min 1 session). */
export function topFrequentExercises(
  library: ApiExercise[],
  freq: Map<string, ExerciseFrequency>,
  limit = 12,
  opts?: { muscleFilter?: string | null; excludeKeys?: Set<string> },
): ApiExercise[] {
  const muscle = opts?.muscleFilter?.trim()
  const exclude = opts?.excludeKeys ?? new Set<string>()
  const ranked = rankExercisesForPicker(library, freq).filter((ex) => {
    const key = normalizeExerciseKey(ex.name)
    if (exclude.has(key)) return false
    const count = freq.get(key)?.sessionCount ?? 0
    if (count < 1) return false
    if (muscle && muscle !== "All") {
      if (!ex.primaryMuscles.some((m) => m.name === muscle)) return false
    }
    return true
  })
  return ranked.slice(0, Math.max(1, limit))
}

/**
 * Suggested compounds for a muscle group (or general compounds) when the user
 * has little history — keeps the picker useful for new accounts.
 */
export function suggestedCompoundExercises(
  library: ApiExercise[],
  opts?: {
    muscleFilter?: string | null
    excludeKeys?: Set<string>
    limit?: number
  },
): ApiExercise[] {
  const muscle = opts?.muscleFilter?.trim()
  const exclude = opts?.excludeKeys ?? new Set<string>()
  const limit = opts?.limit ?? 8
  const hits = library.filter((ex) => {
    const key = normalizeExerciseKey(ex.name)
    if (exclude.has(key)) return false
    if (!isCompoundMovement(ex.name, ex.primaryMuscles[0]?.name)) return false
    if (muscle && muscle !== "All") {
      if (!ex.primaryMuscles.some((m) => m.name === muscle)) return false
    }
    return true
  })
  hits.sort((a, b) => a.name.localeCompare(b.name))
  return hits.slice(0, limit)
}

function muscleDeficitMap(
  stats: MuscleWeekStats[],
  split: BodySplit,
  weeklySetTarget: number,
): Map<string, number> {
  const byKey = new Map(stats.map((s) => [s.muscle.trim().toLowerCase(), s.sets]))
  const deficits = new Map<string, number>()
  const pool = split === "upper" ? UPPER_MUSCLES : LOWER_MUSCLES
  for (const muscle of pool) {
    const sets = byKey.get(muscle) ?? 0
    deficits.set(muscle, Math.max(0, weeklySetTarget - sets))
  }
  return deficits
}

function toPickedMuscles(ex: ApiExercise) {
  return {
    primaryMuscles: ex.primaryMuscles.map((m) => ({
      name: m.name,
      color: m.color,
      code: m.code,
    })),
    secondaryMuscles: ex.secondaryMuscles.map((m) => ({
      name: m.name,
      color: m.color,
      code: m.code,
    })),
    category: ex.categories[0]?.name ?? "",
  }
}

type Candidate = RecommendedExercise & {
  bucket: PatternBucket
  primaryKey: string
  compound: boolean
  api: ApiExercise
}

function isTooSimilar(candidate: Candidate, picked: Candidate[]): boolean {
  for (const p of picked) {
    const sim = calculateExerciseSimilarity(
      {
        name: candidate.name,
        category: candidate.category,
        primaryMuscles: candidate.primaryMuscles,
      },
      {
        name: p.name,
        category: p.category,
        primaryMuscles: p.primaryMuscles,
      },
    )
    if (sim >= 0.82) return true
  }
  return false
}

function bucketPriority(bucket: PatternBucket): number {
  if (COMPOUND_BUCKETS.has(bucket)) return 0
  if (ISOLATION_BUCKETS.has(bucket)) return 2
  return 1
}

/**
 * Build a free-form Upper/Lower session: favor undertrained muscles this week
 * and movements the user already trains often. Heavy compounds fill first.
 */
export function recommendFreeFormWorkout(
  input: FreeFormRecommendInput,
): RecommendedExercise[] {
  const count = Math.max(3, Math.min(8, input.count ?? 5))
  const weeklySetTarget = input.weeklySetTarget ?? 10
  const exclude = new Set(
    (input.excludeNames ?? []).map((n) => normalizeExerciseKey(n)),
  )
  const freq = aggregateExerciseFrequency(input.sessions)
  const muscleStats = aggregateMuscleStats(
    input.sessions,
    input.weekStart,
    input.weekEnd,
  )
  const deficits = muscleDeficitMap(muscleStats, input.split, weeklySetTarget)
  const bucketOrder =
    input.split === "upper" ? UPPER_BUCKET_ORDER : LOWER_BUCKET_ORDER

  const candidates: Candidate[] = []
  for (const ex of input.library) {
    const key = normalizeExerciseKey(ex.name)
    if (exclude.has(key)) continue
    const primary = ex.primaryMuscles[0]
    if (!primary || !muscleMatchesSplit(primary.name, input.split)) continue
    // Skip pure cardio for strength free-form
    if (primary.name.trim().toLowerCase() === "cardio") continue

    const primaryKey = primary.name.trim().toLowerCase()
    const bucket = inferPatternBucket(ex.name, primary.name)
    const compound = COMPOUND_BUCKETS.has(bucket)
    const deficit = deficits.get(primaryKey) ?? weeklySetTarget
    const f = freq.get(key)
    const sessionCount = f?.sessionCount ?? 0
    const daysSince = f?.lastUsedAt
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(f.lastUsedAt).getTime()) / 86_400_000,
          ),
        )
      : 999
    const recencyBonus = daysSince <= 14 ? 1.5 : daysSince <= 30 ? 0.5 : 0
    const favoriteBonus = Math.log1p(sessionCount) * 2.4
    const deficitBonus = deficit * 3.2
    // Mild novelty so we don't only pick the same 5 forever
    const novelty = sessionCount === 0 ? 0.8 : 0
    // Heavy compounds always outrank flies / raises / curls for the same muscle
    const compoundBonus = compound ? 5.5 : 0

    const score =
      deficitBonus + favoriteBonus + recencyBonus + novelty + compoundBonus
    const reasonParts: string[] = []
    if (compound) reasonParts.push("compound lift")
    if (deficit >= weeklySetTarget * 0.7) {
      reasonParts.push(`fills ${primary.name} volume`)
    } else if (deficit > 0) {
      reasonParts.push(`tops up ${primary.name}`)
    }
    if (sessionCount >= 3) reasonParts.push("a favorite of yours")
    else if (sessionCount > 0) reasonParts.push("you've logged this before")
    else if (!compound) reasonParts.push("fresh for this week")

    candidates.push({
      name: ex.name,
      ...toPickedMuscles(ex),
      reason: reasonParts.join(" · "),
      score,
      bucket,
      primaryKey,
      compound,
      api: ex,
    })
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.compound) - Number(a.compound) ||
      a.name.localeCompare(b.name),
  )

  const picked: Candidate[] = []
  const usedBuckets = new Set<PatternBucket>()
  const usedPrimaries = new Set<string>()

  // Pass 1: one exercise per pattern bucket in preferred order (compounds first)
  for (const bucket of bucketOrder) {
    if (picked.length >= count) break
    const hit = candidates.find(
      (c) =>
        c.bucket === bucket &&
        !picked.some((p) => p.name === c.name) &&
        !usedPrimaries.has(c.primaryKey),
    )
    if (!hit) continue
    if (isTooSimilar(hit, picked)) continue
    picked.push(hit)
    usedBuckets.add(bucket)
    usedPrimaries.add(hit.primaryKey)
  }

  // Pass 2: fill remaining slots by score, still diversifying muscles
  for (const c of candidates) {
    if (picked.length >= count) break
    if (picked.some((p) => p.name === c.name)) continue
    if (usedPrimaries.has(c.primaryKey) && picked.length < count - 1) continue
    if (isTooSimilar(c, picked)) continue
    picked.push(c)
    usedBuckets.add(c.bucket)
    usedPrimaries.add(c.primaryKey)
  }

  // Session order: compounds first, then accessories — never open with a fly/raise
  picked.sort(
    (a, b) =>
      bucketPriority(a.bucket) - bucketPriority(b.bucket) ||
      Number(b.compound) - Number(a.compound) ||
      b.score - a.score,
  )

  return picked.map(
    ({ api: _api, bucket: _b, primaryKey: _pk, compound: _c, ...rest }) => rest,
  )
}

/** Default working sets for a free-form recommendation. */
export function defaultFreeFormSets(count = 3): Array<{
  setNumber: number
  weight: null
  reps: null
  type: "working"
  completed: false
}> {
  return Array.from({ length: Math.max(1, count) }, (_, i) => ({
    setNumber: i + 1,
    weight: null,
    reps: null,
    type: "working" as const,
    completed: false as const,
  }))
}
