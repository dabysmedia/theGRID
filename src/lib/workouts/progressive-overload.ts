/*
 * Progressive Overload Coach — pure recommendation engine.
 *
 * No React, no fetch, no storage. Every function takes plain data and returns
 * structured results with reason codes so the UI never derives coaching logic
 * from JSX conditionals. Loads are always pounds (the workout UI is lb-only).
 *
 * Canonical effort value is RIR (reps in reserve). RPE = 10 - RIR.
 */

/* ──────────────────────────────────────────────────────────
   Data shapes (structurally compatible with the workout page types)
   ────────────────────────────────────────────────────────── */

export type PoSetType = "working" | "warmup" | "dropset" | "failure"

export interface PoSet {
  id: string
  setNumber: number
  weight: number | null
  reps: number | null
  type: PoSetType
  completed: boolean
  /** Canonical reps-in-reserve. 5 means "5+". Null/undefined = not reported. */
  rir?: number | null
  /** User explicitly skipped the effort prompt for this set. */
  rirSkipped?: boolean
  techniqueFlag?: boolean
  painFlag?: boolean
  /** Set added from an "optional extra set" recommendation. */
  optionalSet?: boolean
}

export interface PoMuscle {
  name: string
  code?: string
  color?: string
}

export interface PoExercise {
  id: string
  name: string
  category?: string
  primaryMuscles?: PoMuscle[]
  secondaryMuscles?: PoMuscle[]
  sets: PoSet[]
}

export interface PoSession {
  id: string
  date: string
  startedAt: string
  finishedAt?: string | null
  status: string
  exercises: string | PoExercise[]
}

/* ──────────────────────────────────────────────────────────
   Recommendation vocabulary
   ────────────────────────────────────────────────────────── */

export type ReasonCode =
  | "EXACT_HISTORY_FOUND"
  | "SIMILAR_EXERCISE_FALLBACK"
  | "PERSONAL_RATIO_APPLIED"
  | "FIRST_SET_CALIBRATION"
  | "ABOVE_TARGET_RIR"
  | "BELOW_TARGET_RIR"
  | "ON_TARGET_RIR"
  | "RIR_MISSING"
  | "UPPER_REP_RANGE_REACHED"
  | "IN_REP_RANGE"
  | "MISSED_MINIMUM_REPS"
  | "SHARP_REP_DECLINE"
  | "EQUIPMENT_INCREMENT_ROUNDED"
  | "LARGE_INCREMENT_PREFERS_REPS"
  | "TECHNIQUE_FLAGGED"
  | "PAIN_FLAGGED"
  | "OPTIONAL_VOLUME_APPROPRIATE"
  | "VOLUME_CAP_REACHED"
  | "INSUFFICIENT_DATA"
  | "OUTLIER_SETS_EXCLUDED"
  | "ASSISTED_INVERTED"
  | "BODYWEIGHT_REPS_ONLY"
  | "NEW_BEST_DETECTED"
  | "REPEATED_BELOW_TARGET"
  | "LAST_LOAD_CARRIED"

export type Confidence = "high" | "medium" | "low"

export type CoachStatus =
  | "calibration"
  | "push"
  | "hold"
  | "back-off"
  | "on-track"
  | "new-best"

export type CoachAction =
  | "increase_load"
  | "add_reps"
  | "hold"
  | "reduce_load"
  | "optional_set"
  | "calibrate"
  | "choose_load"

export const COACH_STATUS_LABELS: Record<CoachStatus, string> = {
  calibration: "Find your weight",
  push: "Move up",
  hold: "Build reps",
  "back-off": "Ease up",
  "on-track": "On track",
  "new-best": "New best",
}

/** Plain-language labels for reason codes shown in the Why? sheet. */
export const REASON_CODE_LABELS: Partial<Record<ReasonCode, string>> = {
  EXACT_HISTORY_FOUND: "Based on your last workouts with this exercise",
  SIMILAR_EXERCISE_FALLBACK: "Estimated from a similar exercise you've done",
  PERSONAL_RATIO_APPLIED: "Scaled using your own numbers on both exercises",
  FIRST_SET_CALIBRATION: "First time here — start light and find your weight",
  ABOVE_TARGET_RIR: "You had reps to spare",
  BELOW_TARGET_RIR: "That was closer to failure than planned",
  ON_TARGET_RIR: "Effort landed right where you want it",
  RIR_MISSING: "No effort rating logged, so this goes off your reps",
  UPPER_REP_RANGE_REACHED: "You hit the top of your rep range",
  IN_REP_RANGE: "You're inside your rep range",
  MISSED_MINIMUM_REPS: "You came up short of the rep target",
  SHARP_REP_DECLINE: "Your reps dropped off sharply",
  EQUIPMENT_INCREMENT_ROUNDED: "Rounded to the next weight you can actually load",
  LARGE_INCREMENT_PREFERS_REPS: "The next weight up is a big jump — add reps first",
  TECHNIQUE_FLAGGED: "Your form slipped",
  PAIN_FLAGGED: "You flagged pain",
  OPTIONAL_VOLUME_APPROPRIATE: "You had enough left for one more set",
  VOLUME_CAP_REACHED: "That's enough sets on this exercise today",
  INSUFFICIENT_DATA: "Not enough history yet",
  OUTLIER_SETS_EXCLUDED: "One set looked like a typo and was ignored",
  ASSISTED_INVERTED: "Here you progress by using less assistance",
  BODYWEIGHT_REPS_ONLY: "Bodyweight move — you progress by adding reps",
  NEW_BEST_DETECTED: "That was a personal best",
  REPEATED_BELOW_TARGET: "You've come up short several sessions in a row",
  LAST_LOAD_CARRIED: "Picked up from the heaviest weight you finished on",
}

export interface ApplyPayload {
  /** Weight to write into the next planned set; null leaves it untouched. */
  weight: number | null
  /** Reps to write into the next planned set; null leaves it untouched. */
  reps: number | null
  /** Button label, e.g. "Use 50 lb next set". */
  label: string
  /** When true the apply action appends an optional set instead of editing one. */
  addSet?: boolean
}

export interface CoachRecommendation {
  kind: "initial" | "next-set" | "next-session"
  status: CoachStatus
  action: CoachAction
  loadLb: number | null
  repMin: number
  repMax: number
  targetRir: number
  /** Short change chip, e.g. "+5 lb", "+1 rep", "Same weight". */
  delta: string | null
  /** Primary line, e.g. "50 lb × 10–12". */
  headline: string
  /** Secondary line, e.g. "Stop at 2 RIR". */
  detail: string
  /** "Based on: 45 lb × 12 @ 3 RIR last session" */
  basedOn: string | null
  /** "Goal: add 1 rep or use the next available weight increment" */
  goal: string | null
  /** Set when estimated from another movement, e.g. "Estimated from Cable Crunch". */
  sourceLabel: string | null
  confidence: Confidence
  reasonCodes: ReasonCode[]
  /** Full reasoning bullets for the "Why?" sheet. */
  explanation: string[]
  apply: ApplyPayload | null
  sourceSessionIds: string[]
  sourceExerciseKey: string | null
}

/* ──────────────────────────────────────────────────────────
   Exercise profile inference
   ────────────────────────────────────────────────────────── */

export type LoadBasis = "total" | "per-hand" | "added" | "assisted" | "bodyweight"

export type EquipmentKind =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "bodyweight"
  | "other"

export type MovementPattern =
  | "squat"
  | "hinge"
  | "lunge"
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "elbow_flexion"
  | "elbow_extension"
  | "shoulder_isolation"
  | "chest_isolation"
  | "leg_isolation"
  | "calf"
  | "core"
  | "carry"
  | "other"

export interface ExerciseProfile {
  key: string
  name: string
  equipment: EquipmentKind
  pattern: MovementPattern
  isolation: boolean
  unilateral: boolean
  loadBasis: LoadBasis
  repMin: number
  repMax: number
  targetRir: number
  calibrationRir: number
  incrementLb: number
  maxWorkingSets: number
  allowExtraSets: boolean
}

export interface ProfileOverrides {
  repMin?: number
  repMax?: number
  targetRir?: number
  calibrationRir?: number
  incrementLb?: number
  maxWorkingSets?: number
  allowExtraSets?: boolean
}

export function normalizeExerciseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

export function rirToRpe(rir: number): number {
  return Math.min(10, Math.max(0, 10 - rir))
}

export function rpeToRir(rpe: number): number {
  return Math.min(10, Math.max(0, 10 - rpe))
}

const PATTERN_RULES: Array<{ pattern: MovementPattern; re: RegExp }> = [
  { pattern: "calf", re: /calf|calves/ },
  { pattern: "leg_isolation", re: /leg extension|leg curl|hamstring curl|adduct|abduct/ },
  { pattern: "core", re: /crunch|sit[ -]?up|plank|ab |abs |ab-|rollout|roller|leg raise|knee raise|woodchop|russian twist|dead bug|hollow/ },
  { pattern: "elbow_flexion", re: /curl/ },
  { pattern: "elbow_extension", re: /pushdown|push-down|skull ?crusher|tricep|kickback|french press|overhead extension/ },
  { pattern: "shoulder_isolation", re: /lateral raise|side raise|front raise|rear delt|reverse fly|face pull|shrug/ },
  { pattern: "chest_isolation", re: /fly|flye|crossover|pec deck|pec-deck|pullover/ },
  { pattern: "lunge", re: /lunge|split squat|step[ -]?up/ },
  { pattern: "squat", re: /squat|leg press|hack/ },
  { pattern: "hinge", re: /deadlift|rdl|romanian|good morning|hip thrust|glute bridge|swing|pull[ -]?through|back extension|hyperextension/ },
  { pattern: "vertical_pull", re: /pull[ -]?up|chin[ -]?up|pulldown|pull[ -]?down|lat pull/ },
  { pattern: "horizontal_pull", re: /row|reverse grip pull/ },
  { pattern: "vertical_push", re: /overhead press|shoulder press|military|arnold|push press|ohp|landmine press/ },
  { pattern: "horizontal_push", re: /bench|chest press|push[ -]?up|dip|floor press|incline press|decline press|press/ },
  { pattern: "carry", re: /carry|farmer/ },
]

const ISOLATION_PATTERNS: ReadonlySet<MovementPattern> = new Set([
  "elbow_flexion",
  "elbow_extension",
  "shoulder_isolation",
  "chest_isolation",
  "leg_isolation",
  "calf",
  "core",
])

export function inferMovementPattern(name: string): MovementPattern {
  const n = normalizeExerciseKey(name)
  for (const rule of PATTERN_RULES) {
    if (rule.re.test(n)) return rule.pattern
  }
  return "other"
}

export function inferEquipment(name: string, category?: string): EquipmentKind {
  const n = normalizeExerciseKey(name)
  if (/dumbbell|db |kettlebell/.test(n)) return "dumbbell"
  if (/smith/.test(n)) return "machine"
  const cat = (category ?? "").toLowerCase()
  if (cat.includes("machine")) return "machine"
  if (cat.includes("cable")) return "cable"
  if (cat.includes("body")) return "bodyweight"
  if (/cable|pushdown|pulldown|crossover|face pull/.test(n)) return "cable"
  if (/machine|pec deck|leg press|leg extension|leg curl|hack/.test(n)) return "machine"
  if (/barbell|bench press|deadlift|squat|ohp|ez[ -]?bar/.test(n)) return "barbell"
  if (cat.includes("free")) return "barbell"
  if (/push[ -]?up|pull[ -]?up|chin[ -]?up|dip|plank|sit[ -]?up|crunch/.test(n)) return "bodyweight"
  return "other"
}

export function inferLoadBasis(name: string, equipment: EquipmentKind): LoadBasis {
  const n = normalizeExerciseKey(name)
  if (/assisted/.test(n)) return "assisted"
  if (equipment === "dumbbell") return "per-hand"
  if (equipment === "bodyweight") {
    if (/weighted/.test(n)) return "added"
    return "bodyweight"
  }
  if (/weighted (pull|chin|dip)/.test(n)) return "added"
  return "total"
}

export function inferUnilateral(name: string): boolean {
  return /single[ -]?(arm|leg)|one[ -]?(arm|leg)|unilateral|each side|per side/.test(
    normalizeExerciseKey(name),
  )
}

const DEFAULT_INCREMENTS: Record<EquipmentKind, number> = {
  barbell: 5,
  dumbbell: 5,
  machine: 10,
  cable: 5,
  bodyweight: 0,
  other: 5,
}

export function defaultRepRange(
  _pattern: MovementPattern,
  _isolation: boolean,
): { repMin: number; repMax: number; targetRir: number } {
  /* Default to a hypertrophy-friendly 8–12 double-progression band for all
     movements. Users can still override per exercise in the coach Why? sheet. */
  return { repMin: 8, repMax: 12, targetRir: 2 }
}

export function buildExerciseProfile(
  name: string,
  category?: string,
  overrides?: ProfileOverrides,
): ExerciseProfile {
  const pattern = inferMovementPattern(name)
  const equipment = inferEquipment(name, category)
  const isolation = ISOLATION_PATTERNS.has(pattern)
  const range = defaultRepRange(pattern, isolation)
  const loadBasis = inferLoadBasis(name, equipment)
  return {
    key: normalizeExerciseKey(name),
    name,
    equipment,
    pattern,
    isolation,
    unilateral: inferUnilateral(name),
    loadBasis,
    repMin: overrides?.repMin ?? range.repMin,
    repMax: overrides?.repMax ?? range.repMax,
    targetRir: overrides?.targetRir ?? range.targetRir,
    calibrationRir: overrides?.calibrationRir ?? 3,
    incrementLb:
      overrides?.incrementLb ??
      (loadBasis === "bodyweight" ? 0 : DEFAULT_INCREMENTS[equipment]),
    maxWorkingSets: overrides?.maxWorkingSets ?? 5,
    allowExtraSets: overrides?.allowExtraSets ?? true,
  }
}

/* ──────────────────────────────────────────────────────────
   Load rounding
   ────────────────────────────────────────────────────────── */

/**
 * The next real load above (or below, when assisted) `from`.
 *
 * Rounding the raw sum to the *nearest* increment overshoots whenever the
 * current load isn't a clean multiple: 33 lb dumbbells + 5 became 40, skipping
 * the 35s that were sitting right there. Rounding toward the smaller change
 * always lands on a rack weight and is still guaranteed to be a real step.
 */
export function nextLoadStep(
  from: number,
  incrementLb: number,
  direction: 1 | -1 = 1,
): number {
  if (incrementLb <= 0) return from
  return roundToIncrement(
    from + direction * incrementLb,
    incrementLb,
    direction === 1 ? "down" : "up",
  )
}

export function roundToIncrement(
  value: number,
  incrementLb: number,
  mode: "down" | "nearest" | "up" = "nearest",
): number {
  if (!Number.isFinite(value)) return 0
  if (incrementLb <= 0) return Math.round(value)
  const ratio = value / incrementLb
  const steps =
    mode === "down" ? Math.floor(ratio) : mode === "up" ? Math.ceil(ratio) : Math.round(ratio)
  return Math.max(0, steps * incrementLb)
}

/* ──────────────────────────────────────────────────────────
   History extraction
   ────────────────────────────────────────────────────────── */

export interface Exposure {
  sessionId: string
  /** yyyy-MM-dd portion of the session date. */
  dateKey: string
  when: number
  exerciseName: string
  sets: PoSet[]
  /** Most-used working weight (mode of recent sets); null for pure bodyweight work. */
  workingWeight: number | null
  topWeight: number | null
  totalReps: number
  bestSet: { weight: number | null; reps: number } | null
  medianRir: number | null
  hadPainOrTechniqueFlag: boolean
  excludedOutliers: number
}

export function parsePoExercises(raw: string | PoExercise[]): PoExercise[] {
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Working/failure set with logged reps; warm-ups, incomplete and flagged sets excluded. */
export function isValidWorkingSet(set: PoSet): boolean {
  if (set.type !== "working" && set.type !== "failure") return false
  if (!set.completed) return false
  if (set.reps == null || set.reps <= 0) return false
  if (set.painFlag || set.techniqueFlag) return false
  return true
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Drop sets whose weight is wildly inconsistent with the rest of the exposure
 * (a likely logging mistake, e.g. 450 among 45s). Requires ≥3 weighted sets so
 * legitimate single heavy sessions are never discarded.
 */
export function filterOutlierSets(sets: PoSet[]): { kept: PoSet[]; excluded: number } {
  const weighted = sets.filter((s) => s.weight != null && s.weight > 0)
  if (weighted.length < 3) return { kept: sets, excluded: 0 }
  const med = median(weighted.map((s) => s.weight as number))
  if (med == null || med <= 0) return { kept: sets, excluded: 0 }
  const kept = sets.filter((s) => {
    if (s.weight == null || s.weight <= 0) return true
    const ratio = s.weight / med
    return ratio <= 4 && ratio >= 0.25
  })
  return { kept, excluded: sets.length - kept.length }
}

function modeWeight(sets: PoSet[]): number | null {
  const counts = new Map<number, number>()
  for (const s of sets) {
    if (s.weight == null || s.weight <= 0) continue
    counts.set(s.weight, (counts.get(s.weight) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  let best: number | null = null
  let bestCount = -1
  for (const [w, c] of counts) {
    if (c > bestCount || (c === bestCount && best != null && w > best)) {
      best = w
      bestCount = c
    }
  }
  return best
}

function buildExposure(session: PoSession, ex: PoExercise): Exposure | null {
  const rawValid = ex.sets.filter(isValidWorkingSet)
  if (rawValid.length === 0) return null
  const { kept, excluded } = filterOutlierSets(rawValid)
  if (kept.length === 0) return null
  const rirs = kept
    .map((s) => s.rir)
    .filter((r): r is number => typeof r === "number" && Number.isFinite(r))
  const weighted = kept.filter((s) => s.weight != null && s.weight > 0)
  const topWeight =
    weighted.length > 0 ? Math.max(...weighted.map((s) => s.weight as number)) : null
  const best =
    kept.length > 0
      ? kept.reduce((acc, s) => {
          const score = (s.weight ?? 0) * 1000 + (s.reps ?? 0)
          const accScore = (acc.weight ?? 0) * 1000 + (acc.reps ?? 0)
          return score > accScore ? s : acc
        })
      : null
  const when = new Date(session.finishedAt ?? session.startedAt).getTime()
  return {
    sessionId: session.id,
    dateKey: String(session.date).split("T")[0],
    when: Number.isFinite(when) ? when : 0,
    exerciseName: ex.name,
    sets: kept,
    workingWeight: modeWeight(kept),
    topWeight,
    totalReps: kept.reduce((sum, s) => sum + (s.reps ?? 0), 0),
    bestSet: best ? { weight: best.weight, reps: best.reps ?? 0 } : null,
    medianRir: median(rirs),
    hadPainOrTechniqueFlag: ex.sets.some((s) => s.painFlag || s.techniqueFlag),
    excludedOutliers: excluded,
  }
}

/**
 * Recent valid exposures for one movement (newest first), matched by normalized
 * exercise name — the app has no stable cross-session exercise ids, so the
 * normalized name IS the stable key (the prefill column uses the same match).
 */
export function getComparableExerciseHistory(
  sessions: PoSession[],
  exerciseName: string,
  opts?: { limit?: number; excludeSessionId?: string },
): Exposure[] {
  const key = normalizeExerciseKey(exerciseName)
  const limit = opts?.limit ?? 5
  const out: Exposure[] = []
  const completed = sessions
    .filter(
      (s) =>
        String(s.status).trim().toLowerCase() === "completed" &&
        s.id !== opts?.excludeSessionId,
    )
    .sort(
      (a, b) =>
        new Date(b.finishedAt ?? b.startedAt).getTime() -
        new Date(a.finishedAt ?? a.startedAt).getTime(),
    )
  for (const session of completed) {
    if (out.length >= limit) break
    const exs = parsePoExercises(session.exercises)
    for (const ex of exs) {
      if (normalizeExerciseKey(ex.name) !== key) continue
      const exp = buildExposure(session, ex)
      if (exp) out.push(exp)
      break
    }
  }
  return out
}

/* ──────────────────────────────────────────────────────────
   Exercise similarity
   ────────────────────────────────────────────────────────── */

export interface SimilarityInput {
  name: string
  category?: string
  primaryMuscles?: PoMuscle[]
  secondaryMuscles?: PoMuscle[]
}

const STABILITY_BY_EQUIPMENT: Record<EquipmentKind, number> = {
  barbell: 2,
  dumbbell: 3,
  machine: 0,
  cable: 1,
  bodyweight: 2,
  other: 1,
}

function muscleNames(list?: PoMuscle[]): Set<string> {
  return new Set((list ?? []).map((m) => m.name.trim().toLowerCase()).filter(Boolean))
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let hits = 0
  for (const m of a) if (b.has(m)) hits++
  return hits / Math.max(a.size, b.size)
}

/**
 * Transparent weighted similarity (0..1):
 * primary muscles 40%, movement pattern 25%, equipment 15%,
 * unilateral match 10%, stability demand 10%.
 */
export function calculateExerciseSimilarity(
  target: SimilarityInput,
  candidate: SimilarityInput,
): number {
  const tp = buildExerciseProfile(target.name, target.category)
  const cp = buildExerciseProfile(candidate.name, candidate.category)

  const primary = overlapRatio(
    muscleNames(target.primaryMuscles),
    muscleNames(candidate.primaryMuscles),
  )
  const pattern =
    tp.pattern === cp.pattern ? 1 : tp.isolation === cp.isolation ? 0.3 : 0
  const equipment =
    tp.equipment === cp.equipment
      ? 1
      : (tp.equipment === "machine" && cp.equipment === "cable") ||
          (tp.equipment === "cable" && cp.equipment === "machine")
        ? 0.6
        : 0.2
  const unilateral = tp.unilateral === cp.unilateral ? 1 : 0
  const stability =
    1 -
    Math.abs(STABILITY_BY_EQUIPMENT[tp.equipment] - STABILITY_BY_EQUIPMENT[cp.equipment]) / 3

  return (
    0.4 * primary + 0.25 * pattern + 0.15 * equipment + 0.1 * unilateral + 0.1 * stability
  )
}

export const SIMILARITY_THRESHOLD = 0.55

export interface RecommendationSource {
  kind: "exact" | "similar" | "none"
  exposures: Exposure[]
  sourceExerciseName: string | null
  similarity: number | null
  /** Multiplier applied to the source load (conversion or conservative default). */
  loadRatio: number
}

/**
 * Personal conversion ratio between two movements the user has logged:
 * ratio of their typical working weights. Null when either side lacks history.
 */
export function learnConversionRatio(
  targetExposures: Exposure[],
  sourceExposures: Exposure[],
): number | null {
  const t = targetExposures.find((e) => e.workingWeight != null)?.workingWeight
  const s = sourceExposures.find((e) => e.workingWeight != null)?.workingWeight
  if (t == null || s == null || s <= 0) return null
  return t / s
}

/** Conservative default when transferring a load between different movements/machines. */
export const DEFAULT_TRANSFER_RATIO = 0.75

export function selectRecommendationSource(
  sessions: PoSession[],
  exercise: SimilarityInput,
  opts?: { excludeSessionId?: string },
): RecommendationSource {
  const exact = getComparableExerciseHistory(sessions, exercise.name, {
    excludeSessionId: opts?.excludeSessionId,
  })
  if (exact.length > 0) {
    return {
      kind: "exact",
      exposures: exact,
      sourceExerciseName: null,
      similarity: null,
      loadRatio: 1,
    }
  }

  // Gather candidate movements (most recent metadata per name) from history.
  const targetKey = normalizeExerciseKey(exercise.name)
  const candidates = new Map<string, SimilarityInput>()
  for (const session of sessions) {
    if (String(session.status).trim().toLowerCase() !== "completed") continue
    if (session.id === opts?.excludeSessionId) continue
    for (const ex of parsePoExercises(session.exercises)) {
      const key = normalizeExerciseKey(ex.name)
      if (key === targetKey || candidates.has(key)) continue
      candidates.set(key, {
        name: ex.name,
        category: ex.category,
        primaryMuscles: ex.primaryMuscles,
        secondaryMuscles: ex.secondaryMuscles,
      })
    }
  }

  let best: { input: SimilarityInput; score: number } | null = null
  for (const input of candidates.values()) {
    const score = calculateExerciseSimilarity(exercise, input)
    if (score >= SIMILARITY_THRESHOLD && (best == null || score > best.score)) {
      best = { input, score }
    }
  }
  if (best) {
    const exposures = getComparableExerciseHistory(sessions, best.input.name, {
      excludeSessionId: opts?.excludeSessionId,
    })
    if (exposures.length > 0) {
      return {
        kind: "similar",
        exposures,
        sourceExerciseName: best.input.name,
        similarity: best.score,
        loadRatio: DEFAULT_TRANSFER_RATIO,
      }
    }
  }
  return { kind: "none", exposures: [], sourceExerciseName: null, similarity: null, loadRatio: 1 }
}

/* ──────────────────────────────────────────────────────────
   Copy helpers
   ────────────────────────────────────────────────────────── */

function fmtLb(weight: number | null, basis: LoadBasis): string {
  if (basis === "bodyweight" && (weight == null || weight === 0)) return "Bodyweight"
  if (weight == null) return "— lb"
  const suffix =
    basis === "per-hand" ? " lb/hand" : basis === "assisted" ? " lb assist" : basis === "added" ? " lb added" : " lb"
  return `${formatLoad(weight)}${suffix}`
}

export function formatLoad(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 10) / 10)
}

function fmtRange(repMin: number, repMax: number): string {
  return repMin === repMax ? String(repMin) : `${repMin}–${repMax}`
}

export function formatEffort(rir: number, scale: "rir" | "rpe"): string {
  if (scale === "rpe") return `RPE ${rirToRpe(rir)}`
  return `${rir} RIR`
}

/**
 * "100 lb × 12, 12, 10" — the actual sets, which reads far better than a single
 * best set plus an RIR number most people never learn to parse.
 */
function describeExposure(exp: Exposure, basis: LoadBasis): string {
  const weights = new Set(
    exp.sets.filter((s) => s.weight != null).map((s) => s.weight as number),
  )
  const reps = exp.sets.map((s) => s.reps ?? 0)
  if (weights.size === 1) {
    return `${fmtLb([...weights][0], basis)} × ${reps.join(", ")}`
  }
  if (weights.size === 0) {
    return `${basis === "bodyweight" ? "Bodyweight" : "—"} × ${reps.join(", ")}`
  }
  return exp.sets
    .map((s) => `${fmtLb(s.weight, basis)} × ${s.reps ?? 0}`)
    .join(", ")
}

/**
 * Plain-English effort cue. RIR/RPE are jargon, so the number is always spelled
 * out as "reps left" and the scale name only tags along for people who use it.
 */
export function describeEffortTarget(
  targetRir: number,
  scale: "rir" | "rpe" = "rir",
): string {
  if (targetRir <= 0) {
    return scale === "rpe" ? "Take it to failure (RPE 10)" : "Take it to failure"
  }
  const reps = targetRir === 1 ? "1 rep" : `${targetRir} reps`
  return scale === "rpe"
    ? `Stop with about ${reps} left (RPE ${rirToRpe(targetRir)})`
    : `Stop with about ${reps} left in the tank`
}

/**
 * The detail line rendered for a user's chosen effort scale. Detail strings are
 * always built from `describeEffortTarget`, so swapping the phrase is exact.
 */
export function formatCoachDetail(
  rec: Pick<CoachRecommendation, "detail" | "targetRir">,
  scale: "rir" | "rpe",
): string {
  if (scale === "rir") return rec.detail
  return rec.detail.replace(
    describeEffortTarget(rec.targetRir, "rir"),
    describeEffortTarget(rec.targetRir, "rpe"),
  )
}

/* ──────────────────────────────────────────────────────────
   Working baseline (which load do we progress from?)
   ────────────────────────────────────────────────────────── */

export interface WorkingBaseline {
  /** The load progression is measured from. Null for pure bodyweight work. */
  load: number | null
  /** Sets performed at that load — the reps decision is made on these only. */
  setsAtLoad: PoSet[]
  /** True when that load is heavier than the weight used for most of the session. */
  steppedUp: boolean
}

/**
 * The load to progress from is the heaviest weight the user actually *owned*
 * last time — the heaviest load where at least one set cleared the rep floor.
 *
 * Using the most-used weight instead (the old behaviour) silently threw away
 * mid-session progress: someone who went 45, 45, 50 got recommended 45 again
 * the next week, which reads as the coach ignoring their last set.
 */
export function deriveWorkingBaseline(
  exposure: Exposure,
  profile: Pick<ExerciseProfile, "repMin" | "loadBasis">,
): WorkingBaseline {
  const dir = profile.loadBasis === "assisted" ? -1 : 1
  const weighted = exposure.sets.filter((s) => s.weight != null && s.weight > 0)
  if (weighted.length === 0) {
    return { load: null, setsAtLoad: exposure.sets, steppedUp: false }
  }
  const loads = [...new Set(weighted.map((s) => s.weight as number))]
  const owned = loads.filter((w) =>
    weighted.some((s) => s.weight === w && (s.reps ?? 0) >= profile.repMin),
  )
  /* Nothing cleared the floor (a genuinely hard session) — fall back to the
     most-used weight so a failed top set can't inflate the next target. */
  const pool = owned.length > 0 ? owned : loads
  const load = pool.reduce((acc, w) => (dir * w > dir * acc ? w : acc), pool[0])
  const mode = exposure.workingWeight
  return {
    load,
    setsAtLoad: weighted.filter((s) => s.weight === load),
    steppedUp: mode != null && dir * load > dir * mode,
  }
}

/* ──────────────────────────────────────────────────────────
   Initial prescription
   ────────────────────────────────────────────────────────── */

export interface PrescriptionInput {
  exercise: SimilarityInput
  sessions: PoSession[]
  overrides?: ProfileOverrides
  excludeSessionId?: string
}

function confidenceFromExposures(exposures: Exposure[]): Confidence {
  const withRir = exposures.filter((e) => e.medianRir != null).length
  if (exposures.length >= 2 && withRir >= 1) return "high"
  return "medium"
}

export function calculateInitialPrescription(
  input: PrescriptionInput,
): CoachRecommendation {
  const profile = buildExerciseProfile(
    input.exercise.name,
    input.exercise.category,
    input.overrides,
  )
  const source = selectRecommendationSource(input.sessions, input.exercise, {
    excludeSessionId: input.excludeSessionId,
  })
  const reasons: ReasonCode[] = []
  const explanation: string[] = []

  /* ── No relevant history: calibration ───────────── */
  if (source.kind === "none") {
    reasons.push("INSUFFICIENT_DATA", "FIRST_SET_CALIBRATION")
    const calibRir = profile.calibrationRir
    explanation.push(
      "You haven't logged this exercise — or anything close enough to guess from — yet.",
      `Pick a weight you could comfortably do for ${profile.repMax}+ reps and treat set 1 as a test set.`,
      `From then on the coach fills in your weights and reps for you, aiming for ${fmtRange(profile.repMin, profile.repMax)} reps a set.`,
    )
    return {
      kind: "initial",
      status: "calibration",
      action: profile.loadBasis === "bodyweight" ? "calibrate" : "choose_load",
      loadLb: null,
      repMin: profile.repMin,
      repMax: profile.repMax,
      targetRir: calibRir,
      delta: null,
      headline:
        profile.loadBasis === "bodyweight"
          ? `Bodyweight × ${fmtRange(profile.repMin, profile.repMax)}`
          : `Start light × ${fmtRange(profile.repMin, profile.repMax)}`,
      detail: `${describeEffortTarget(calibRir)} · set 1 is a test set`,
      basedOn: null,
      goal: "Find a weight you can control, then the coach takes it from there",
      sourceLabel: "First time on this exercise — this is a rough starting point",
      confidence: "low",
      reasonCodes: reasons,
      explanation,
      apply: null,
      sourceSessionIds: [],
      sourceExerciseKey: null,
    }
  }

  const latest = source.exposures[0]
  const basis = profile.loadBasis

  /* ── Similar-movement fallback ──────────────────── */
  if (source.kind === "similar") {
    reasons.push("SIMILAR_EXERCISE_FALLBACK", "FIRST_SET_CALIBRATION")
    const srcLoad = latest.workingWeight ?? latest.topWeight
    let estimate: number | null = null
    if (srcLoad != null && srcLoad > 0 && profile.incrementLb > 0) {
      estimate = roundToIncrement(srcLoad * source.loadRatio, profile.incrementLb, "down")
      reasons.push("EQUIPMENT_INCREMENT_ROUNDED")
    }
    const calibRir = profile.calibrationRir
    explanation.push(
      `You haven't done ${input.exercise.name} before, so this starts from ${source.sourceExerciseName}, the closest thing you've trained.`,
      `Last ${source.sourceExerciseName}: ${describeExposure(latest, basis)} on ${latest.dateKey}.`,
      `Weights rarely carry over exactly between machines, so this is deliberately light — about ${Math.round(source.loadRatio * 100)}% of that, rounded down to the nearest ${profile.incrementLb} lb.`,
      "Treat set 1 as a test set and adjust from how it feels.",
    )
    return {
      kind: "initial",
      status: "calibration",
      action: "calibrate",
      loadLb: estimate,
      repMin: profile.repMin,
      repMax: profile.repMax,
      targetRir: calibRir,
      delta: null,
      headline:
        estimate != null
          ? `${fmtLb(estimate, basis)} × ${fmtRange(profile.repMin, profile.repMax)}`
          : `Start light × ${fmtRange(profile.repMin, profile.repMax)}`,
      detail: `${describeEffortTarget(calibRir)} · set 1 is a test set`,
      basedOn: `Based on your ${source.sourceExerciseName}: ${describeExposure(latest, basis)}`,
      goal: "Get a real number on the board today — the coach progresses it from here",
      sourceLabel: `Estimated from ${source.sourceExerciseName} — expect to adjust it`,
      confidence: "low",
      reasonCodes: reasons,
      explanation,
      apply:
        estimate != null
          ? {
              weight: estimate,
              reps: profile.repMin,
              label: `Use ${formatLoad(estimate)} lb next set`,
            }
          : null,
      sourceSessionIds: source.exposures.map((e) => e.sessionId),
      sourceExerciseKey: normalizeExerciseKey(source.sourceExerciseName ?? ""),
    }
  }

  /* ── Exact history ──────────────────────────────── */
  reasons.push("EXACT_HISTORY_FOUND")
  if (latest.excludedOutliers > 0) reasons.push("OUTLIER_SETS_EXCLUDED")
  const confidence = confidenceFromExposures(source.exposures)
  if (confidence === "medium" && latest.medianRir == null) reasons.push("RIR_MISSING")

  const baseline = deriveWorkingBaseline(latest, profile)
  const baseWeight = baseline.load
  const lastBest = latest.bestSet
  const medianRir = latest.medianRir
  const sourceIds = source.exposures.map((e) => e.sessionId)
  const basedOn = `Last time: ${describeExposure(latest, basis)}`

  explanation.push(
    `This comes from your last ${Math.min(source.exposures.length, 5)} ${input.exercise.name} session${source.exposures.length === 1 ? "" : "s"} — most recently ${latest.dateKey}: ${describeExposure(latest, basis)}.`,
    "Warm-ups, unfinished sets and anything you flagged are left out.",
  )
  if (latest.excludedOutliers > 0) {
    explanation.push(
      `${latest.excludedOutliers} set${latest.excludedOutliers === 1 ? " was" : "s were"} ignored — the weight looked like a typo next to the rest.`,
    )
  }
  if (medianRir == null) {
    explanation.push(
      "You didn't rate how hard those sets felt, so this goes purely off your reps. Rating a set sharpens the next target.",
    )
  }

  /* Bodyweight: progress through reps. */
  if (basis === "bodyweight" && (baseWeight == null || baseWeight === 0)) {
    reasons.push("BODYWEIGHT_REPS_ONLY")
    const lastReps = lastBest?.reps ?? profile.repMin
    const targetReps = lastReps + 1
    explanation.push(
      `There's no weight to add here, so you progress by reps. Your best set last time was ${lastReps}.`,
    )
    return {
      kind: "initial",
      status: "on-track",
      action: "add_reps",
      loadLb: null,
      repMin: profile.repMin,
      repMax: profile.repMax,
      targetRir: profile.targetRir,
      delta: "+1 rep",
      headline: `Bodyweight × ${targetReps}`,
      detail: describeEffortTarget(profile.targetRir),
      basedOn,
      goal: `Beat ${lastReps} reps on at least one set`,
      sourceLabel: null,
      confidence,
      reasonCodes: reasons,
      explanation,
      apply: { weight: null, reps: targetReps, label: `Aim for ${targetReps} reps` },
      sourceSessionIds: sourceIds,
      sourceExerciseKey: null,
    }
  }

  const dir = basis === "assisted" ? -1 : 1
  if (basis === "assisted") reasons.push("ASSISTED_INVERTED")
  if (baseline.steppedUp) reasons.push("LAST_LOAD_CARRIED")

  /* ── Double progression ───────────────────────────────────
     Fill the rep range at a given weight, then move the weight up. The rep
     ceiling is the trigger; effort ratings only break ties. Requiring an RIR
     rating used to block every weight increase for anyone who skipped the
     effort prompt, which is why loads could sit still forever. */
  const setsAtBase = baseline.setsAtLoad.filter((s) => s.reps != null)
  const repsAtBase = setsAtBase.map((s) => s.reps ?? 0)
  const topCount = repsAtBase.filter((r) => r >= profile.repMax).length
  const allReachedTop = repsAtBase.length > 0 && topCount === repsAtBase.length
  const mostReachedTop = repsAtBase.length > 0 && topCount * 2 >= repsAtBase.length
  const effortOk = medianRir == null || medianRir >= profile.targetRir
  /* Every set at the ceiling earns the weight regardless of how hard it felt —
     that is the whole point of the model. A majority at the ceiling still earns
     it as long as the effort wasn't past the target. */
  const earnedLoadJump = allReachedTop || (mostReachedTop && effortOk)
  /* Prefer maximum progressive overload: only treat a session as a struggle when
     every working set missed the floor OR median RIR is clearly past failure
     (target − 2). A single missed-rep set should not trigger a deload. */
  const struggled =
    (medianRir != null && medianRir < Math.max(0, profile.targetRir - 2)) ||
    (setsAtBase.length > 0 && setsAtBase.every((s) => (s.reps ?? 0) < profile.repMin))

  /* Require three consecutive below-target sessions before backing off load.
     Two hard sessions alone keep the load and rebuild reps. */
  const prior = source.exposures[1]
  const prior2 = source.exposures[2]
  const sessionClearlyBelow = (
    sets: { reps: number | null; rir?: number | null }[],
  ) =>
    sets.length > 0 &&
    sets.every(
      (s) =>
        (s.reps ?? 0) < profile.repMin ||
        ((s.rir ?? 99) as number) < Math.max(0, profile.targetRir - 2),
    )
  const repeatedBelow =
    struggled &&
    prior != null &&
    prior2 != null &&
    sessionClearlyBelow(prior.sets) &&
    sessionClearlyBelow(prior2.sets)

  if (latest.hadPainOrTechniqueFlag) {
    reasons.push(latest.sets.some((s) => s.painFlag) ? "PAIN_FLAGGED" : "TECHNIQUE_FLAGGED")
  }

  if (
    baseWeight != null &&
    earnedLoadJump &&
    !latest.hadPainOrTechniqueFlag &&
    profile.incrementLb > 0
  ) {
    /* Increase load */
    reasons.push("UPPER_REP_RANGE_REACHED", "EQUIPMENT_INCREMENT_ROUNDED")
    if (medianRir != null && medianRir >= profile.targetRir) reasons.push("ABOVE_TARGET_RIR")
    const nextLoad = nextLoadStep(baseWeight, profile.incrementLb, dir)
    /* Assisted loads: the assist number is not the moved load, so the relative
       jump check does not apply (10 lb less assistance is a small change). */
    const jumpPct =
      basis === "assisted" ? 0 : Math.abs(nextLoad - baseWeight) / baseWeight
    /* Stacking reps to dodge a big jump has to end somewhere: once every set is
       two clear of the ceiling, take the jump however large it looks. */
    const wellPastCeiling =
      repsAtBase.length > 0 && Math.min(...repsAtBase) >= profile.repMax + 2
    if (jumpPct > 0.12 && profile.repMax - profile.repMin >= 2 && !wellPastCeiling) {
      /* Increment too large relative to load → add reps instead */
      reasons.push("LARGE_INCREMENT_PREFERS_REPS")
      /* Uncapped: capping at repMax + 2 would ask for fewer reps than the user
         already did, which reads as the coach going backwards. */
      const stretchTarget = Math.max(...repsAtBase, profile.repMax) + 1
      explanation.push(
        `The smallest jump available here is ${profile.incrementLb} lb — a ${(jumpPct * 100).toFixed(0)}% increase on ${formatLoad(baseWeight)} lb. That's a lot at once, so keep the weight and stack on reps first.`,
        `Once every set reaches ${profile.repMax + 2} reps, the coach takes the jump to ${fmtLb(nextLoad, basis)} anyway.`,
      )
      return {
        kind: "initial",
        status: "push",
        action: "add_reps",
        loadLb: baseWeight,
        repMin: profile.repMax,
        repMax: Math.max(profile.repMax + 2, stretchTarget),
        targetRir: profile.targetRir,
        delta: "+1 rep",
        headline: `${fmtLb(baseWeight, basis)} × ${fmtRange(profile.repMax, Math.max(profile.repMax + 2, stretchTarget))}`,
        detail: describeEffortTarget(profile.targetRir),
        basedOn,
        goal: `Get every set to ${profile.repMax + 2} reps and the ${profile.incrementLb} lb jump is on`,
        sourceLabel: null,
        confidence,
        reasonCodes: reasons,
        explanation,
        apply: {
          weight: baseWeight,
          reps: stretchTarget,
          label: `Keep ${formatLoad(baseWeight)} lb, aim ${stretchTarget}`,
        },
        sourceSessionIds: sourceIds,
        sourceExerciseKey: null,
      }
    }
    explanation.push(
      allReachedTop
        ? `You hit ${profile.repMax} reps on every set at ${fmtLb(baseWeight, basis)} — that's the ceiling, so the weight goes up to ${fmtLb(nextLoad, basis)}.`
        : `You hit ${profile.repMax} reps on most of your sets at ${fmtLb(baseWeight, basis)} and still had something left, so the weight goes up to ${fmtLb(nextLoad, basis)}.`,
      `Expect reps to drop back toward ${profile.repMin} at ${fmtLb(nextLoad, basis)}. That's normal — climb back to ${profile.repMax} and it goes up again.`,
    )
    if (baseline.steppedUp) {
      explanation.push(
        `You finished last session on ${fmtLb(baseWeight, basis)}, so that's the weight this builds on — not the one you spent most of the session at.`,
      )
    }
    /* Report the change actually being made, not the nominal increment: from an
       odd 33 lb the real step onto the 35s is +2, and a "+5 lb" chip is a lie. */
    const deltaLb = Math.abs(nextLoad - baseWeight)
    return {
      kind: "initial",
      status: "push",
      action: "increase_load",
      loadLb: nextLoad,
      repMin: profile.repMin,
      repMax: profile.repMax,
      targetRir: profile.targetRir,
      delta: basis === "assisted" ? `−${deltaLb} lb assist` : `+${formatLoad(deltaLb)} lb`,
      headline: `${fmtLb(nextLoad, basis)} × ${fmtRange(profile.repMin, profile.repMax)}`,
      detail: describeEffortTarget(profile.targetRir),
      basedOn,
      goal: `Get ${profile.repMin}+ reps at ${fmtLb(nextLoad, basis)} today`,
      sourceLabel: null,
      confidence,
      reasonCodes: reasons,
      explanation,
      apply: {
        weight: nextLoad,
        reps: profile.repMin,
        label: `Use ${formatLoad(nextLoad)} lb`,
      },
      sourceSessionIds: sourceIds,
      sourceExerciseKey: null,
    }
  }

  if (baseWeight != null && (repeatedBelow || (struggled && latest.hadPainOrTechniqueFlag))) {
    /* Back off — only after repeated failure or struggle + pain/technique. */
    reasons.push(repeatedBelow ? "REPEATED_BELOW_TARGET" : "MISSED_MINIMUM_REPS", "BELOW_TARGET_RIR")
    const reduced =
      profile.incrementLb > 0
        ? roundToIncrement(baseWeight - dir * profile.incrementLb, profile.incrementLb, "down")
        : Math.round(baseWeight * 0.9)
    explanation.push(
      repeatedBelow
        ? `Three sessions in a row have come in under ${profile.repMin} reps at ${fmtLb(baseWeight, basis)}. Take ${profile.incrementLb} lb off, rebuild clean sets, and you'll pass this weight sooner than by grinding it.`
        : `You flagged pain or form on a session that was already a grind. Take ${profile.incrementLb} lb off and rebuild from a weight you can control.`,
    )
    return {
      kind: "initial",
      status: "back-off",
      action: "reduce_load",
      loadLb: reduced,
      repMin: profile.repMin,
      repMax: profile.repMax,
      targetRir: profile.targetRir + 1,
      delta: basis === "assisted" ? `+${profile.incrementLb} lb assist` : `−${profile.incrementLb} lb`,
      headline: `${fmtLb(reduced, basis)} × ${fmtRange(profile.repMin, profile.repMax)}`,
      detail: `${describeEffortTarget(profile.targetRir + 1)} · rebuild clean reps`,
      basedOn,
      goal: `Get ${fmtRange(profile.repMin, profile.repMax)} clean reps here, then start climbing again`,
      sourceLabel: null,
      confidence,
      reasonCodes: reasons,
      explanation,
      apply: {
        weight: reduced,
        reps: profile.repMin,
        label: `Reduce to ${formatLoad(reduced)} lb`,
      },
      sourceSessionIds: sourceIds,
      sourceExerciseKey: null,
    }
  }

  /* Hard session but not a multi-session collapse: hold load, rebuild reps. */
  if (baseWeight != null && struggled && !latest.hadPainOrTechniqueFlag) {
    reasons.push("MISSED_MINIMUM_REPS", "BELOW_TARGET_RIR", "IN_REP_RANGE")
    explanation.push(
      `Last session was a grind, but one hard day isn't a reason to go lighter. Stay on ${fmtLb(baseWeight, basis)} and claw back to ${profile.repMin} reps a set — the weight only drops if this keeps happening.`,
    )
    return {
      kind: "initial",
      status: "hold",
      action: "hold",
      loadLb: baseWeight,
      repMin: profile.repMin,
      repMax: profile.repMax,
      targetRir: profile.targetRir,
      delta: "Same weight",
      headline: `${fmtLb(baseWeight, basis)} × ${fmtRange(profile.repMin, profile.repMax)}`,
      detail: `${describeEffortTarget(profile.targetRir)} · rebuild reps`,
      basedOn,
      goal: `Get back to ${profile.repMin}+ reps a set before the weight moves`,
      sourceLabel: null,
      confidence,
      reasonCodes: reasons,
      explanation,
      apply: {
        weight: baseWeight,
        reps: profile.repMin,
        label: `Keep ${formatLoad(baseWeight)} lb`,
      },
      sourceSessionIds: sourceIds,
      sourceExerciseKey: null,
    }
  }

  /* Hold load, add reps (default double-progression step) */
  reasons.push("IN_REP_RANGE")
  if (medianRir != null) {
    reasons.push(medianRir >= profile.targetRir ? "ON_TARGET_RIR" : "BELOW_TARGET_RIR")
  }
  /* The weakest set is what's holding the weight back, so that's what the target
     chases. Aiming off the *best* set (the old behaviour) let a session like
     12 / 8 / 8 sit at "aim 12" forever — no push where it was actually needed. */
  const weakestAtBase = repsAtBase.length > 0 ? Math.min(...repsAtBase) : null
  const repTarget = Math.min(
    Math.max((weakestAtBase ?? profile.repMin - 1) + 1, profile.repMin),
    profile.repMax,
  )
  const shortBy = repsAtBase.filter((r) => r < profile.repMax).length
  explanation.push(
    weakestAtBase != null
      ? `${shortBy === 1 ? "One set is" : `${shortBy} sets are`} still short of ${profile.repMax} reps at ${fmtLb(baseWeight, basis)}, so the weight stays and the reps go up — your lowest set last time was ${weakestAtBase}.`
      : `Stay at ${fmtLb(baseWeight, basis)} and add reps.`,
    `Once every set hits ${profile.repMax} reps, the weight goes up ${profile.incrementLb} lb automatically.`,
  )
  if (baseline.steppedUp) {
    explanation.push(
      `You finished last session on ${fmtLb(baseWeight, basis)}, so that's the weight this builds on — not the one you spent most of the session at.`,
    )
  }
  return {
    kind: "initial",
    status: "on-track",
    action: "add_reps",
    loadLb: baseWeight,
    repMin: profile.repMin,
    repMax: profile.repMax,
    targetRir: profile.targetRir,
    delta: weakestAtBase != null && repTarget > weakestAtBase ? "+1 rep" : "Same weight",
    headline: `${fmtLb(baseWeight, basis)} × ${fmtRange(Math.min(repTarget, profile.repMax), profile.repMax)}`,
    detail: describeEffortTarget(profile.targetRir),
    basedOn,
    goal: `Hit ${profile.repMax} reps on every set and the weight goes up`,
    sourceLabel: null,
    confidence,
    reasonCodes: reasons,
    explanation,
    apply:
      baseWeight != null
        ? {
            weight: baseWeight,
            reps: repTarget,
            label: `Keep ${formatLoad(baseWeight)} lb, aim for ${repTarget}`,
          }
        : null,
    sourceSessionIds: sourceIds,
    sourceExerciseKey: null,
  }
}

/* ──────────────────────────────────────────────────────────
   Session plan — the coach fills in every set before you start
   ────────────────────────────────────────────────────────── */

export interface PlannedSet {
  setNumber: number
  /** Target load; null means bodyweight or "you still have to pick one". */
  weight: number | null
  /** Target reps for this specific set. */
  reps: number | null
  /** Short chip for the set row, e.g. "+5 lb", "Beat 10", "Hold 12". */
  hint: string
  /** What this same set did last time, for the "previous" column. */
  previous: { weight: number | null; reps: number | null } | null
}

export interface SessionPlan {
  recommendation: CoachRecommendation
  sets: PlannedSet[]
  /** One plain line for the whole movement, e.g. "105 lb × 8–12 · +5 lb". */
  summary: string
}

/**
 * Per-set targets for a movement you're about to train.
 *
 * The movement-level recommendation decides the weight; this decides each set's
 * rep target off the same set last time, so every set is asking for either more
 * weight or one more rep than you managed. Nothing here mutates state — the
 * caller writes the numbers into the session.
 */
export function planSessionSets(input: {
  exercise: SimilarityInput
  sessions: PoSession[]
  setCount: number
  overrides?: ProfileOverrides
  excludeSessionId?: string
  /** Reuse an already-computed recommendation instead of recalculating it. */
  recommendation?: CoachRecommendation
}): SessionPlan {
  const profile = buildExerciseProfile(
    input.exercise.name,
    input.exercise.category,
    input.overrides,
  )
  const rec =
    input.recommendation ??
    calculateInitialPrescription({
      exercise: input.exercise,
      sessions: input.sessions,
      overrides: input.overrides,
      excludeSessionId: input.excludeSessionId,
    })

  const previous =
    getComparableExerciseHistory(input.sessions, input.exercise.name, {
      excludeSessionId: input.excludeSessionId,
      limit: 1,
    })[0] ?? null
  const previousSets = previous?.sets ?? []
  const bodyweight = profile.loadBasis === "bodyweight" && rec.loadLb == null
  /* The recommendation's range wins over the profile's: when the next weight up
     is a big jump the coach deliberately shifts the target above the normal
     ceiling, and clamping back to the profile would ask for last week's reps. */
  const repMin = rec.repMin
  const repMax = Math.max(rec.repMax, rec.repMin)
  /* Only "keep the weight" outcomes chase per-set reps. When the weight moves
     (up, down, or is still being found) every set restarts at the same target. */
  const holdingLoad = rec.action === "add_reps" || rec.action === "hold"

  const count = Math.max(1, Math.floor(input.setCount))
  const sets: PlannedSet[] = []
  for (let i = 0; i < count; i++) {
    const prior =
      previousSets.find((s) => s.setNumber === i + 1) ??
      previousSets[Math.min(i, previousSets.length - 1)] ??
      null
    const priorReps = prior?.reps ?? null
    const previousEntry = prior
      ? { weight: prior.weight ?? null, reps: prior.reps ?? null }
      : null

    if (bodyweight) {
      const reps = priorReps != null ? priorReps + 1 : (rec.apply?.reps ?? repMin)
      sets.push({
        setNumber: i + 1,
        weight: null,
        reps,
        hint: priorReps != null ? `Beat ${priorReps}` : `Aim ${reps}`,
        previous: previousEntry,
      })
      continue
    }

    if (!holdingLoad) {
      sets.push({
        setNumber: i + 1,
        weight: rec.loadLb,
        reps: rec.loadLb != null ? repMin : null,
        hint:
          rec.action === "increase_load"
            ? (rec.delta ?? `Aim ${repMin}`)
            : rec.action === "reduce_load"
              ? "Lighter — rebuild"
              : "Find your weight",
        previous: previousEntry,
      })
      continue
    }

    const sameLoad =
      prior?.weight != null && rec.loadLb != null && prior.weight === rec.loadLb
    if (sameLoad && priorReps != null) {
      const reps = Math.min(Math.max(priorReps + 1, repMin), repMax)
      sets.push({
        setNumber: i + 1,
        weight: rec.loadLb,
        reps,
        hint: reps > priorReps ? `Beat ${priorReps}` : `Hold ${reps}`,
        previous: previousEntry,
      })
      continue
    }
    /* No matching set at this weight (extra set, or the weight changed since):
       fall back to the movement-level target. */
    const reps = rec.apply?.reps ?? repMin
    sets.push({
      setNumber: i + 1,
      weight: rec.loadLb,
      reps,
      hint: `Aim ${reps}`,
      previous: previousEntry,
    })
  }

  return {
    recommendation: rec,
    sets,
    summary: rec.delta ? `${rec.headline} · ${rec.delta}` : rec.headline,
  }
}

/* ──────────────────────────────────────────────────────────
   Per-set evaluation + live next-set recommendation
   ────────────────────────────────────────────────────────── */

export interface SetAssessment {
  vsRange: "below" | "in" | "above"
  vsRir: "easier" | "on" | "harder" | null
  painFlag: boolean
  techniqueFlag: boolean
}

export function evaluateCompletedSet(
  set: PoSet,
  rx: { repMin: number; repMax: number; targetRir: number },
): SetAssessment {
  const reps = set.reps ?? 0
  const vsRange = reps < rx.repMin ? "below" : reps >= rx.repMax ? "above" : "in"
  let vsRir: SetAssessment["vsRir"] = null
  if (typeof set.rir === "number") {
    if (set.rir >= rx.targetRir + 2) vsRir = "easier"
    else if (set.rir <= Math.max(0, rx.targetRir - 2) && set.rir < rx.targetRir) vsRir = "harder"
    else vsRir = "on"
  }
  return {
    vsRange,
    vsRir,
    painFlag: !!set.painFlag,
    techniqueFlag: !!set.techniqueFlag,
  }
}

export interface NextSetInput {
  exercise: PoExercise
  sessions: PoSession[]
  overrides?: ProfileOverrides
  excludeSessionId?: string
}

/**
 * Live recommendation for the next planned set, recalculated after every
 * completed set. Returns the initial prescription when nothing is logged yet.
 */
export function calculateNextSetRecommendation(input: NextSetInput): CoachRecommendation {
  const profile = buildExerciseProfile(
    input.exercise.name,
    input.exercise.category,
    input.overrides,
  )
  const initial = calculateInitialPrescription({
    exercise: input.exercise,
    sessions: input.sessions,
    overrides: input.overrides,
    excludeSessionId: input.excludeSessionId,
  })

  const working = input.exercise.sets.filter(
    (s) => s.type === "working" || s.type === "failure",
  )
  const done = working.filter((s) => s.completed && s.reps != null)
  if (done.length === 0) return initial

  const basis = profile.loadBasis
  const dir = basis === "assisted" ? -1 : 1
  const last = done[done.length - 1]
  const lastWeight = last.weight
  const remaining = working.filter((s) => !s.completed)
  const allPlannedDone = remaining.length === 0
  const assess = evaluateCompletedSet(last, {
    repMin: initial.repMin,
    repMax: initial.repMax,
    targetRir: initial.targetRir,
  })
  const reasons: ReasonCode[] = []
  const explanation: string[] = [...initial.explanation]
  const confidence: Confidence =
    typeof last.rir === "number" ? initial.confidence : initial.confidence === "high" ? "medium" : initial.confidence
  if (typeof last.rir !== "number") reasons.push("RIR_MISSING")

  const setLabel = `Set ${done.length}`
  const anyPain = done.some((s) => s.painFlag)
  const anyTechnique = done.some((s) => s.techniqueFlag)

  /* Sharp decline check (~35%+ drop between same-load sets). Normal fatigue
     between sets should not trigger a deload — only a collapse. */
  let sharpDecline = false
  if (done.length >= 2) {
    const prevSame = [...done.slice(0, -1)]
      .reverse()
      .find((s) => s.weight === lastWeight && s.reps != null)
    if (prevSame && (prevSame.reps ?? 0) > 0) {
      sharpDecline = (last.reps ?? 0) <= (prevSame.reps ?? 0) * 0.65
    }
  }

  /* Consecutive hard sets at this load — one tough set is not enough to deload. */
  const consecutiveHard = (() => {
    let n = 0
    for (let i = done.length - 1; i >= 0; i--) {
      const s = done[i]
      if (s.weight !== lastWeight) break
      const a = evaluateCompletedSet(s, {
        repMin: initial.repMin,
        repMax: initial.repMax,
        targetRir: initial.targetRir,
      })
      const hard =
        a.vsRange === "below" ||
        a.vsRir === "harder" ||
        s.type === "failure" ||
        s.rir === 0
      if (!hard) break
      n++
    }
    return n
  })()

  /* ── Pain: suppress all progression ─────────────── */
  if (anyPain) {
    reasons.push("PAIN_FLAGGED")
    explanation.push(
      "You flagged pain, so the coach won't suggest more weight or extra sets. Take some weight off, or stop this exercise if it keeps hurting.",
    )
    const reduced =
      lastWeight != null && profile.incrementLb > 0
        ? roundToIncrement(lastWeight - dir * profile.incrementLb, profile.incrementLb, "down")
        : lastWeight
    return {
      ...initial,
      kind: "next-set",
      status: "back-off",
      action: "reduce_load",
      loadLb: reduced ?? null,
      delta: lastWeight != null && reduced !== lastWeight ? (basis === "assisted" ? `+${profile.incrementLb} lb assist` : `−${profile.incrementLb} lb`) : null,
      headline:
        reduced != null
          ? `${fmtLb(reduced, basis)} × ${fmtRange(initial.repMin, initial.repMax)}`
          : `Reduce or stop`,
      detail: "Pain flagged — ease off and reassess",
      goal: null,
      confidence,
      reasonCodes: [...initial.reasonCodes, ...reasons],
      explanation,
      apply:
        reduced != null && reduced !== lastWeight && !allPlannedDone
          ? { weight: reduced, reps: null, label: `Reduce to ${formatLoad(reduced)} lb` }
          : null,
    }
  }

  /* ── All planned sets complete: optional extra set? ── */
  if (allPlannedDone) {
    const lastRir = typeof last.rir === "number" ? last.rir : null
    const okVolume = working.length < profile.maxWorkingSets
    const easyEnough = lastRir != null && lastRir >= 3
    const noCollapse = !sharpDecline
    if (
      profile.allowExtraSets &&
      easyEnough &&
      okVolume &&
      noCollapse &&
      !anyTechnique
    ) {
      reasons.push("OPTIONAL_VOLUME_APPROPRIATE", "ABOVE_TARGET_RIR")
      explanation.push(
        `You finished with about ${lastRir} reps still in the tank and your reps held up, so there's room for one more set if you want it.`,
      )
      return {
        ...initial,
        kind: "next-set",
        status: "push",
        action: "optional_set",
        loadLb: lastWeight,
        delta: "Optional extra set",
        headline: `Optional: ${fmtLb(lastWeight, basis)} × ${fmtRange(initial.repMin, initial.repMax)}`,
        detail: `${describeEffortTarget(initial.targetRir)} · skip it if you're done`,
        goal: null,
        confidence,
        reasonCodes: [...initial.reasonCodes, ...reasons],
        explanation,
        apply: {
          weight: lastWeight,
          reps: last.reps,
          label: "Add one optional set",
          addSet: true,
        },
      }
    }
    if (!okVolume) reasons.push("VOLUME_CAP_REACHED")
    return summarizeAsHold(initial, lastWeight, basis, confidence, reasons, explanation, "All sets done", null)
  }

  /* ── Technique breakdown ─────────────────────────── */
  if (assess.techniqueFlag || anyTechnique) {
    reasons.push("TECHNIQUE_FLAGGED")
    explanation.push(
      "Your form slipped, so the weight stays put. Clean up the reps before adding anything.",
    )
    return summarizeAsHold(
      initial,
      lastWeight,
      basis,
      confidence,
      reasons,
      explanation,
      "Form first — same weight",
      lastWeight != null && !allPlannedDone
        ? { weight: lastWeight, reps: Math.max(initial.repMin, Math.min(last.reps ?? initial.repMin, initial.repMax)), label: `Keep ${formatLoad(lastWeight)} lb` }
        : null,
    )
  }

  /* ── Too hard: prefer holding load + lower rep target; only drop weight
     after consecutive hard sets or a true collapse. ── */
  const unexpectedFailure = last.type === "failure" || last.rir === 0
  const tooHard =
    assess.vsRange === "below" ||
    assess.vsRir === "harder" ||
    unexpectedFailure ||
    sharpDecline
  if (tooHard) {
    if (assess.vsRange === "below") reasons.push("MISSED_MINIMUM_REPS")
    if (assess.vsRir === "harder" || unexpectedFailure) reasons.push("BELOW_TARGET_RIR")
    if (sharpDecline) reasons.push("SHARP_REP_DECLINE")

    const lowerRepTarget = Math.max(
      1,
      Math.min((last.reps ?? initial.repMin), Math.max(initial.repMin - 1, 1)),
    )
    const shouldDropLoad = sharpDecline || consecutiveHard >= 2

    if (shouldDropLoad && lastWeight != null && profile.incrementLb > 0) {
      const reduced = roundToIncrement(
        lastWeight - dir * profile.incrementLb,
        profile.incrementLb,
        "down",
      )
      explanation.push(
        sharpDecline
          ? `${setLabel} dropped off a cliff compared with the set before it. Take ${profile.incrementLb} lb off and finish the rest clean.`
          : `${setLabel} was your second hard set in a row. Take ${profile.incrementLb} lb off so the sets you have left still count.`,
      )
      return {
        ...initial,
        kind: "next-set",
        status: "back-off",
        action: "reduce_load",
        loadLb: reduced,
        delta:
          basis === "assisted"
            ? `+${profile.incrementLb} lb assist`
            : `−${profile.incrementLb} lb`,
        headline: `${fmtLb(reduced, basis)} × ${fmtRange(initial.repMin, initial.repMax)}`,
        detail: describeEffortTarget(initial.targetRir),
        goal: `Or stay on ${formatLoad(lastWeight)} lb and get ${lowerRepTarget} reps`,
        confidence,
        reasonCodes: [...initial.reasonCodes, ...reasons],
        explanation,
        apply: {
          weight: reduced,
          reps: null,
          label: `Reduce to ${formatLoad(reduced)} lb`,
        },
      }
    }

    /* Default aggressive path: keep the load, tighten the rep target. */
    explanation.push(
      `${setLabel} was harder than planned. Stay on this weight and get ${lowerRepTarget} clean reps — the weight only comes off if the next set falls apart too.`,
    )
    return {
      ...initial,
      kind: "next-set",
      status: "hold",
      action: "hold",
      loadLb: lastWeight,
      delta: `Aim ${lowerRepTarget} reps`,
      headline: `${fmtLb(lastWeight, basis)} × ${lowerRepTarget}`,
      detail: `${describeEffortTarget(initial.targetRir)} · same weight`,
      goal: "Finish your remaining sets without dropping the weight",
      confidence,
      reasonCodes: [...initial.reasonCodes, ...reasons],
      explanation,
      apply: {
        weight: lastWeight,
        reps: lowerRepTarget,
        label: `Keep ${lastWeight != null ? formatLoad(lastWeight) : "weight"}, aim ${lowerRepTarget}`,
      },
    }
  }

  /* ── Room to go up: increase the next set ────────────
     Two ways in. Either the set was clearly easier than planned, or it topped
     out the rep range with the planned effort still in hand — the second case
     matters because the effort prompt only offers 0–3 reps in reserve, so
     "easier than a 2 RIR target" is not something most users can even log. */
  const toppedRange = (last.reps ?? 0) >= initial.repMax
  const heldEffort =
    typeof last.rir === "number"
      ? last.rir >= initial.targetRir
      : (last.reps ?? 0) > initial.repMax
  const reachedTarget = (last.reps ?? 0) >= Math.min(initial.repMax, initial.repMin)
  if (
    (assess.vsRir === "easier" || (toppedRange && heldEffort)) &&
    reachedTarget &&
    lastWeight != null &&
    profile.incrementLb > 0
  ) {
    const nextLoad = nextLoadStep(lastWeight, profile.incrementLb, dir)
    const jumpPct =
      basis === "assisted" ? 0 : Math.abs(nextLoad - lastWeight) / Math.max(1, lastWeight)
    if (jumpPct <= 0.15) {
      reasons.push("ABOVE_TARGET_RIR", "EQUIPMENT_INCREMENT_ROUNDED")
      if (toppedRange) reasons.push("UPPER_REP_RANGE_REACHED")
      const repLow = Math.max(1, initial.repMin - 1)
      const stepLb = Math.abs(nextLoad - lastWeight)
      explanation.push(
        toppedRange
          ? `${setLabel} hit ${last.reps} reps and you still had ${typeof last.rir === "number" ? `about ${last.rir}` : "reps"} left — that's the top of the range, so go up to ${fmtLb(nextLoad, basis)} now instead of waiting for next week.`
          : `${setLabel} was easier than planned, so the next set goes up to ${fmtLb(nextLoad, basis)}.`,
      )
      return {
        ...initial,
        kind: "next-set",
        status: "push",
        action: "increase_load",
        loadLb: nextLoad,
        delta: basis === "assisted" ? `−${stepLb} lb assist` : `+${formatLoad(stepLb)} lb`,
        headline: `${fmtLb(nextLoad, basis)} × ${fmtRange(repLow, initial.repMax)}`,
        detail: describeEffortTarget(initial.targetRir),
        goal: null,
        confidence,
        reasonCodes: [...initial.reasonCodes, ...reasons],
        explanation,
        apply: { weight: nextLoad, reps: repLow, label: `Use ${formatLoad(nextLoad)} lb` },
      }
    }
    reasons.push("ABOVE_TARGET_RIR", "LARGE_INCREMENT_PREFERS_REPS")
    const repTarget = Math.min((last.reps ?? initial.repMin) + 1, initial.repMax + 2)
    explanation.push(
      `${setLabel} had more in it, but the next weight up is a big jump on this machine — add a rep instead.`,
    )
    return {
      ...initial,
      kind: "next-set",
      status: "push",
      action: "add_reps",
      loadLb: lastWeight,
      delta: "+1 rep",
      headline: `${fmtLb(lastWeight, basis)} × ${repTarget}`,
      detail: describeEffortTarget(initial.targetRir),
      goal: null,
      confidence,
      reasonCodes: [...initial.reasonCodes, ...reasons],
      explanation,
      apply: { weight: lastWeight, reps: repTarget, label: `Keep ${formatLoad(lastWeight)} lb, aim ${repTarget}` },
    }
  }

  /* ── On target: hold ─────────────────────────────── */
  reasons.push(assess.vsRir === "on" ? "ON_TARGET_RIR" : "IN_REP_RANGE")
  explanation.push(
    `${setLabel} landed in range${typeof last.rir === "number" ? ` with about ${last.rir} left in the tank` : ""}. Getting a little tired set to set is normal, so the weight stays where it is.`,
  )
  const aim = Math.max(initial.repMin, Math.min((last.reps ?? initial.repMin), initial.repMax))
  return summarizeAsHold(
    initial,
    lastWeight,
    basis,
    confidence,
    reasons,
    explanation,
    `Match that: ${lastWeight != null ? `${formatLoad(lastWeight)} lb` : "same weight"} for ${aim}+ reps`,
    lastWeight != null
      ? { weight: lastWeight, reps: aim, label: `Keep ${formatLoad(lastWeight)} lb, aim ${aim}` }
      : null,
  )
}

function summarizeAsHold(
  initial: CoachRecommendation,
  lastWeight: number | null,
  basis: LoadBasis,
  confidence: Confidence,
  reasons: ReasonCode[],
  explanation: string[],
  detail: string,
  apply: ApplyPayload | null,
): CoachRecommendation {
  return {
    ...initial,
    kind: "next-set",
    status: "hold",
    action: "hold",
    loadLb: lastWeight ?? initial.loadLb,
    delta: "Same weight",
    headline: `${fmtLb(lastWeight ?? initial.loadLb, basis)} × ${fmtRange(initial.repMin, initial.repMax)}`,
    detail,
    goal: null,
    confidence,
    reasonCodes: [...initial.reasonCodes, ...reasons],
    explanation,
    apply,
  }
}

/* ──────────────────────────────────────────────────────────
   Estimated 1RM (secondary signal only)
   ────────────────────────────────────────────────────────── */

/** Epley estimate; only meaningful for ≤12 reps, returns null otherwise. */
export function estimate1Rm(weight: number | null, reps: number | null): number | null {
  if (weight == null || weight <= 0 || reps == null || reps <= 0 || reps > 12) return null
  return Math.round(weight * (1 + reps / 30))
}

/* ──────────────────────────────────────────────────────────
   Movement summary
   ────────────────────────────────────────────────────────── */

export type ProgressionOutcome = "progressed" | "held" | "adjust"

export interface SetProgressComparison {
  setNumber: number
  currentWeight: number | null
  currentReps: number
  previousWeight: number | null
  previousReps: number | null
  outcome: ProgressionOutcome | "baseline"
  label: string
}

export interface MovementSummary {
  exerciseName: string
  completedSets: number
  totalReps: number
  volumeLb: number
  bestSet: { weight: number | null; reps: number } | null
  medianRir: number | null
  est1Rm: number | null
  comparison: {
    sessionId: string
    dateKey: string
    totalRepsDelta: number
    loadDelta: number | null
    sameLoad: boolean
    text: string
  } | null
  newBest: { kind: "load" | "reps"; text: string } | null
  outcome: ProgressionOutcome
  setComparisons: SetProgressComparison[]
  flags: { pain: boolean; technique: boolean }
  nextSession: CoachRecommendation
}

/**
 * Compare each completed working set with the same numbered set from the most
 * recent session. A load improvement wins; at the same load, reps decide.
 */
export function compareCompletedSets(input: {
  exercise: PoExercise
  sessions: PoSession[]
  excludeSessionId?: string
}): SetProgressComparison[] {
  const profile = buildExerciseProfile(input.exercise.name, input.exercise.category)
  const direction = profile.loadBasis === "assisted" ? -1 : 1
  const previous =
    getComparableExerciseHistory(input.sessions, input.exercise.name, {
      excludeSessionId: input.excludeSessionId,
    })[0] ?? null

  return input.exercise.sets.filter(isValidWorkingSet).map((current) => {
    const prior = previous?.sets.find((set) => set.setNumber === current.setNumber) ?? null
    const currentReps = current.reps ?? 0
    if (prior == null) {
      return {
        setNumber: current.setNumber,
        currentWeight: current.weight,
        currentReps,
        previousWeight: null,
        previousReps: null,
        outcome: "baseline",
        label: "Baseline",
      }
    }

    const previousReps = prior.reps ?? 0
    const comparableLoads =
      current.weight != null && prior.weight != null
    const loadDelta = comparableLoads ? current.weight! - prior.weight! : 0
    const directedLoadDelta = direction * loadDelta
    const repDelta = currentReps - previousReps
    const outcome: SetProgressComparison["outcome"] =
      directedLoadDelta > 0 || (directedLoadDelta === 0 && repDelta > 0)
        ? "progressed"
        : directedLoadDelta === 0 && repDelta === 0
          ? "held"
          : "adjust"

    let label: string
    if (directedLoadDelta > 0) {
      label =
        profile.loadBasis === "assisted"
          ? `${Math.abs(loadDelta)} lb less assist`
          : `+${formatLoad(loadDelta)} lb`
    } else if (directedLoadDelta < 0) {
      label =
        profile.loadBasis === "assisted"
          ? `${Math.abs(loadDelta)} lb more assist`
          : `${formatLoad(loadDelta)} lb`
    } else if (repDelta !== 0) {
      label = `${repDelta > 0 ? "+" : ""}${repDelta} rep${Math.abs(repDelta) === 1 ? "" : "s"}`
    } else {
      label = "Matched"
    }

    return {
      setNumber: current.setNumber,
      currentWeight: current.weight,
      currentReps,
      previousWeight: prior.weight,
      previousReps,
      outcome,
      label,
    }
  })
}

export function summarizeMovementPerformance(input: {
  exercise: PoExercise
  sessions: PoSession[]
  overrides?: ProfileOverrides
  excludeSessionId?: string
}): MovementSummary {
  const profile = buildExerciseProfile(
    input.exercise.name,
    input.exercise.category,
    input.overrides,
  )
  const basis = profile.loadBasis
  const valid = input.exercise.sets.filter(isValidWorkingSet)
  const completed = input.exercise.sets.filter((s) => s.completed)
  const totalReps = valid.reduce((sum, s) => sum + (s.reps ?? 0), 0)
  const volumeLb = valid.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0)
  const best =
    valid.length > 0
      ? valid.reduce((acc, s) => {
          const score = (s.weight ?? 0) * 1000 + (s.reps ?? 0)
          return score > (acc.weight ?? 0) * 1000 + (acc.reps ?? 0) ? s : acc
        })
      : null
  const rirs = valid
    .map((s) => s.rir)
    .filter((r): r is number => typeof r === "number")
  const medianRir = median(rirs)
  const flags = {
    pain: input.exercise.sets.some((s) => s.painFlag),
    technique: input.exercise.sets.some((s) => s.techniqueFlag),
  }

  const history = getComparableExerciseHistory(input.sessions, input.exercise.name, {
    excludeSessionId: input.excludeSessionId,
  })
  const prev = history[0] ?? null
  const setComparisons = compareCompletedSets(input)

  let comparison: MovementSummary["comparison"] = null
  let newBest: MovementSummary["newBest"] = null
  let outcome: ProgressionOutcome = "held"

  const dir = basis === "assisted" ? -1 : 1
  const topWeight =
    valid.length > 0
      ? valid.reduce<number | null>(
          (acc, s) =>
            s.weight != null && (acc == null || dir * s.weight > dir * acc) ? s.weight : acc,
          null,
        )
      : null

  if (prev) {
    const repsDelta = totalReps - prev.totalReps
    const loadDelta =
      topWeight != null && prev.topWeight != null ? topWeight - prev.topWeight : null
    const sameLoad = topWeight != null && topWeight === prev.topWeight
    const effortNote =
      medianRir != null && prev.medianRir != null
        ? Math.abs(medianRir - prev.medianRir) <= 1
          ? " for about the same effort"
          : medianRir > prev.medianRir
            ? " and it felt easier"
            : " and it felt harder"
        : ""
    let text: string
    if (loadDelta != null && dir * loadDelta > 0) {
      text = `${basis === "assisted" ? `−${Math.abs(loadDelta)} lb assist` : `+${loadDelta} lb`} vs last time${effortNote}`
    } else if (repsDelta !== 0) {
      text = `${repsDelta > 0 ? "+" : ""}${repsDelta} total reps vs last time${effortNote}`
    } else {
      text = `Matched last session${effortNote}`
    }
    comparison = {
      sessionId: prev.sessionId,
      dateKey: prev.dateKey,
      totalRepsDelta: repsDelta,
      loadDelta,
      sameLoad,
      text,
    }

    /* PR detection against all known history */
    const allPriorTop = history.reduce<number | null>(
      (acc, e) =>
        e.topWeight != null && (acc == null || dir * e.topWeight > dir * acc)
          ? e.topWeight
          : acc,
      null,
    )
    if (topWeight != null && allPriorTop != null && dir * topWeight > dir * allPriorTop) {
      newBest = {
        kind: "load",
        text:
          basis === "assisted"
            ? `New best — ${formatLoad(topWeight)} lb assist, the least you've ever needed`
            : `New best weight: ${formatLoad(topWeight)} lb`,
      }
    } else if (topWeight != null) {
      const priorBestRepsAtLoad = history.reduce((accReps, e) => {
        for (const s of e.sets) {
          if (s.weight === topWeight && (s.reps ?? 0) > accReps) accReps = s.reps ?? 0
        }
        return accReps
      }, 0)
      const bestRepsAtLoad = valid.reduce(
        (acc, s) => (s.weight === topWeight && (s.reps ?? 0) > acc ? (s.reps ?? 0) : acc),
        0,
      )
      if (priorBestRepsAtLoad > 0 && bestRepsAtLoad > priorBestRepsAtLoad) {
        newBest = {
          kind: "reps",
          text: `New best: ${bestRepsAtLoad} reps at ${formatLoad(topWeight)} lb`,
        }
      }
    }

    if (flags.pain || flags.technique) outcome = "adjust"
    else if (newBest != null || (loadDelta != null && dir * loadDelta > 0) || repsDelta > 0)
      outcome = "progressed"
    else if (repsDelta < -2) outcome = "adjust"
    else outcome = "held"
  } else if (valid.length > 0) {
    outcome = "progressed" // first exposure logged = baseline established
  }

  /* Next-session recommendation: feed this session into a pseudo history. */
  const pseudoSession: PoSession = {
    id: input.excludeSessionId ?? "current",
    date: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: "completed",
    exercises: [input.exercise],
  }
  const nextSession = calculateInitialPrescription({
    exercise: input.exercise,
    sessions: [pseudoSession, ...input.sessions],
    overrides: input.overrides,
  })
  nextSession.kind = "next-session"
  if (newBest != null && !flags.pain && !flags.technique) {
    nextSession.status = "new-best"
    nextSession.reasonCodes = [...nextSession.reasonCodes, "NEW_BEST_DETECTED"]
  }

  return {
    exerciseName: input.exercise.name,
    completedSets: completed.length,
    totalReps,
    volumeLb,
    bestSet: best ? { weight: best.weight, reps: best.reps ?? 0 } : null,
    medianRir,
    est1Rm: best ? estimate1Rm(best.weight, best.reps) : null,
    comparison,
    newBest,
    outcome,
    setComparisons,
    flags,
    nextSession,
  }
}

/* ──────────────────────────────────────────────────────────
   Workout-level summary
   ────────────────────────────────────────────────────────── */

export interface WorkoutMovementReport {
  exerciseName: string
  outcome: ProgressionOutcome
  completedSets: number
  totalReps: number
  bestSetText: string | null
  comparisonText: string | null
  newBestText: string | null
  nextRecText: string
  confidence: Confidence
  lowConfidenceSource: string | null
  flagged: boolean
}

export interface WorkoutProgressionSummaryData {
  sessionId: string
  sessionName: string
  dateKey: string
  finishedAt: string
  exercisesProgressed: number
  exercisesHeld: number
  exercisesAdjusted: number
  repPrs: number
  loadPrs: number
  totalRepDelta: number | null
  headline: string
  message: string
  nextPriority: string | null
  movements: WorkoutMovementReport[]
}

function nextRecText(rec: CoachRecommendation): string {
  const range = fmtRange(rec.repMin, rec.repMax)
  if (rec.action === "increase_load" && rec.loadLb != null) {
    return `Go up to ${formatLoad(rec.loadLb)} lb × ${range} reps`
  }
  if (rec.action === "reduce_load" && rec.loadLb != null) {
    return `Drop to ${formatLoad(rec.loadLb)} lb × ${range} reps and rebuild`
  }
  if (rec.action === "add_reps") {
    return rec.loadLb != null
      ? `Stay on ${formatLoad(rec.loadLb)} lb and push toward ${rec.repMax} reps a set`
      : `Push toward ${rec.repMax} reps a set`
  }
  if (rec.action === "choose_load" || rec.action === "calibrate") {
    return rec.loadLb != null
      ? `Try ${formatLoad(rec.loadLb)} lb × ${range} reps and see how it feels`
      : `Start light, ${range} reps, and find your weight`
  }
  return rec.loadLb != null
    ? `Stay on ${formatLoad(rec.loadLb)} lb × ${range} reps`
    : `Stay at ${range} reps`
}

export function summarizeWorkoutProgression(
  session: PoSession,
  previousSessions: PoSession[],
  overridesByKey?: Map<string, ProfileOverrides>,
): WorkoutProgressionSummaryData {
  const exercises = parsePoExercises(session.exercises).filter((ex) =>
    ex.sets.some((s) => s.completed),
  )
  const movements: WorkoutMovementReport[] = []
  let progressed = 0
  let held = 0
  let adjusted = 0
  let repPrs = 0
  let loadPrs = 0
  let totalRepDelta: number | null = null

  const summaries = exercises.map((ex) =>
    summarizeMovementPerformance({
      exercise: ex,
      sessions: previousSessions,
      overrides: overridesByKey?.get(normalizeExerciseKey(ex.name)),
      excludeSessionId: session.id,
    }),
  )

  for (const ms of summaries) {
    if (ms.outcome === "progressed") progressed++
    else if (ms.outcome === "held") held++
    else adjusted++
    if (ms.newBest?.kind === "reps") repPrs++
    if (ms.newBest?.kind === "load") loadPrs++
    if (ms.comparison) {
      totalRepDelta = (totalRepDelta ?? 0) + ms.comparison.totalRepsDelta
    }
    movements.push({
      exerciseName: ms.exerciseName,
      outcome: ms.outcome,
      completedSets: ms.completedSets,
      totalReps: ms.totalReps,
      bestSetText: ms.bestSet
        ? `${ms.bestSet.weight != null && ms.bestSet.weight > 0 ? `${formatLoad(ms.bestSet.weight)} lb × ` : ""}${ms.bestSet.reps}`
        : null,
      comparisonText: ms.comparison?.text ?? null,
      newBestText: ms.newBest?.text ?? null,
      nextRecText: nextRecText(ms.nextSession),
      confidence: ms.nextSession.confidence,
      lowConfidenceSource: ms.nextSession.sourceLabel,
      flagged: ms.flags.pain || ms.flags.technique,
    })
  }

  const total = movements.length
  const headline =
    total === 0
      ? "Workout saved"
      : progressed >= Math.max(1, Math.ceil(total * 0.6))
        ? "Strong session"
        : adjusted > progressed
          ? "Recovery-minded session"
          : "Steady session"
  const message =
    total === 0
      ? "Nothing logged to compare yet."
      : `You beat last time on ${progressed} of ${total} exercise${total === 1 ? "" : "s"}`

  /* Next priority: the most actionable upcoming change. */
  const priorityMs =
    summaries.find((m) => m.nextSession.action === "increase_load") ??
    summaries.find((m) => m.nextSession.action === "reduce_load") ??
    summaries.find((m) => m.nextSession.action === "add_reps")
  const nextPriority = priorityMs
    ? `${priorityMs.exerciseName}: ${nextRecText(priorityMs.nextSession)}`
    : null

  return {
    sessionId: session.id,
    sessionName: (session as { name?: string }).name ?? "Workout",
    dateKey: String(session.date).split("T")[0],
    finishedAt: session.finishedAt ?? new Date().toISOString(),
    exercisesProgressed: progressed,
    exercisesHeld: held,
    exercisesAdjusted: adjusted,
    repPrs,
    loadPrs,
    totalRepDelta,
    headline,
    message,
    nextPriority,
    movements,
  }
}

/* ──────────────────────────────────────────────────────────
   RIR prompt choices (centralized copy)
   ────────────────────────────────────────────────────────── */

export interface RirChoice {
  rir: number
  label: string
  hint: string | null
}

export const RIR_CHOICES: RirChoice[] = [
  { rir: 5, label: "5+", hint: "Very easy" },
  { rir: 4, label: "4", hint: null },
  { rir: 3, label: "3", hint: null },
  { rir: 2, label: "2", hint: "Target" },
  { rir: 1, label: "1", hint: null },
  { rir: 0, label: "0", hint: "Nothing left" },
]
