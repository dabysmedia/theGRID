import type { ApiExercise } from "./exercise-library"
import {
  aggregateMuscleStats,
  type MuscleWeekStats,
  type WorkoutSessionLike,
} from "./muscle-volume"
import {
  calculateExerciseSimilarity,
  normalizeExerciseKey,
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
  | "squat"
  | "hinge"
  | "lunge"
  | "glute"
  | "calf"
  | "core"
  | "other"

const UPPER_BUCKET_ORDER: PatternBucket[] = [
  "horizontal_push",
  "vertical_pull",
  "horizontal_pull",
  "vertical_push",
  "elbow_extension",
  "elbow_flexion",
  "core",
]

const LOWER_BUCKET_ORDER: PatternBucket[] = [
  "squat",
  "hinge",
  "lunge",
  "glute",
  "calf",
  "other",
]

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

export function inferPatternBucket(name: string, primaryMuscle?: string): PatternBucket {
  const n = normalizeExerciseKey(name)
  const m = (primaryMuscle ?? "").trim().toLowerCase()

  if (/bench|chest press|push.?up|fly|pec/.test(n) || m === "chest") return "horizontal_push"
  if (/overhead|shoulder press|military|arnold|landmine press/.test(n)) return "vertical_push"
  if (/lateral raise|front raise|rear delt|face.?pull|upright row/.test(n) || m === "shoulders") {
    return "vertical_push"
  }
  if (/row|seated row|chest.?supported|meadows|seal row/.test(n)) return "horizontal_pull"
  if (/pulldown|pull.?up|chin.?up|lat /.test(n) || m === "lats") return "vertical_pull"
  if (/curl|bicep/.test(n) || m === "biceps") return "elbow_flexion"
  if (/tricep|pushdown|skull|dip/.test(n) || m === "triceps") return "elbow_extension"
  if (/crunch|sit.?up|plank|ab |core|woodchop|knee raise/.test(n) || m === "abdominals" || m === "obliques" || m === "core") {
    return "core"
  }
  if (/squat|leg press|lunge|split squat|step.?up|hack|pendulum|sissy/.test(n) || m === "quadriceps") {
    if (/lunge|split squat|step.?up|bulgarian/.test(n)) return "lunge"
    return "squat"
  }
  if (/deadlift|rdl|romanian|good morning|hip hinge|back extension|hyperextension|rack pull/.test(n) || m === "hamstrings" || m === "lower back") {
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

/**
 * Build a free-form Upper/Lower session: favor undertrained muscles this week
 * and movements the user already trains often.
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

    const score = deficitBonus + favoriteBonus + recencyBonus + novelty
    const reasonParts: string[] = []
    if (deficit >= weeklySetTarget * 0.7) {
      reasonParts.push(`fills ${primary.name} volume`)
    } else if (deficit > 0) {
      reasonParts.push(`tops up ${primary.name}`)
    }
    if (sessionCount >= 3) reasonParts.push("a favorite of yours")
    else if (sessionCount > 0) reasonParts.push("you've logged this before")
    else reasonParts.push("fresh for this week")

    candidates.push({
      name: ex.name,
      ...toPickedMuscles(ex),
      reason: reasonParts.join(" · "),
      score,
      bucket: inferPatternBucket(ex.name, primary.name),
      primaryKey,
      api: ex,
    })
  }

  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

  const picked: Candidate[] = []
  const usedBuckets = new Set<PatternBucket>()
  const usedPrimaries = new Set<string>()

  // Pass 1: one exercise per pattern bucket in preferred order
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

  return picked.map(({ api: _api, bucket: _b, primaryKey: _pk, ...rest }) => rest)
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
