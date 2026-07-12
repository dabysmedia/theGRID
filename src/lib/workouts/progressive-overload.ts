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
  calibration: "Find your load",
  push: "Progress",
  hold: "Build reps",
  "back-off": "Ease up",
  "on-track": "On track",
  "new-best": "New best",
}

/** Plain-language labels for reason codes shown in the Why? sheet. */
export const REASON_CODE_LABELS: Partial<Record<ReasonCode, string>> = {
  EXACT_HISTORY_FOUND: "Matched your recent history on this movement",
  SIMILAR_EXERCISE_FALLBACK: "Estimated from a similar movement",
  FIRST_SET_CALIBRATION: "First exposure — pick a confident starting load",
  ABOVE_TARGET_RIR: "Left more reps in reserve than the target",
  BELOW_TARGET_RIR: "Closer to failure than planned",
  ON_TARGET_RIR: "Effort landed on the target RIR",
  RIR_MISSING: "No effort rating logged — confidence is lower",
  UPPER_REP_RANGE_REACHED: "Top of the rep range hit on most sets",
  IN_REP_RANGE: "Inside the target rep range",
  MISSED_MINIMUM_REPS: "Fell short of the minimum reps",
  SHARP_REP_DECLINE: "Reps dropped sharply between sets",
  EQUIPMENT_INCREMENT_ROUNDED: "Rounded to the next equipment increment",
  LARGE_INCREMENT_PREFERS_REPS: "Next weight jump is large — add reps first",
  TECHNIQUE_FLAGGED: "Technique broke down",
  PAIN_FLAGGED: "Pain or discomfort flagged",
  OPTIONAL_VOLUME_APPROPRIATE: "Room for an optional extra set",
  VOLUME_CAP_REACHED: "Volume cap reached for this movement",
  INSUFFICIENT_DATA: "Not enough history yet",
  BODYWEIGHT_REPS_ONLY: "Bodyweight — progress with reps",
  NEW_BEST_DETECTED: "New best performance",
  REPEATED_BELOW_TARGET: "Below target across multiple sessions",
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
  incrementLb: number
  maxWorkingSets: number
  allowExtraSets: boolean
}

export interface ProfileOverrides {
  repMin?: number
  repMax?: number
  targetRir?: number
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

function describeExposure(exp: Exposure, basis: LoadBasis): string {
  const top = exp.bestSet
  const load = top ? fmtLb(top.weight, basis) : "—"
  const rir = exp.medianRir != null ? ` @ ${formatRoundedRir(exp.medianRir)} RIR` : ""
  return `${load} × ${top?.reps ?? 0}${rir}`
}

function formatRoundedRir(rir: number): string {
  return Number.isInteger(rir) ? String(rir) : rir.toFixed(1)
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
    const calibRir = 3
    explanation.push(
      "No history found for this movement or a credible similar one.",
      `Pick a load you could comfortably do for ${profile.repMax}+ reps, then treat set 1 as a calibration set.`,
      `Defaults for this movement type: ${fmtRange(profile.repMin, profile.repMax)} reps at ${calibRir} RIR.`,
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
          : `Pick a light start × ${fmtRange(profile.repMin, profile.repMax)}`,
      detail: `Stop at ${calibRir} RIR · use set 1 as a calibration set`,
      basedOn: null,
      goal: "Find a load you can repeat with good form, then build from it",
      sourceLabel: "Low-confidence starting estimate",
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
    const calibRir = 3
    explanation.push(
      `No history for ${input.exercise.name}; estimated from ${source.sourceExerciseName} (similarity ${(100 * (source.similarity ?? 0)).toFixed(0)}%).`,
      `Last ${source.sourceExerciseName}: ${describeExposure(latest, basis)} on ${latest.dateKey}.`,
      `Applied a conservative ${Math.round(source.loadRatio * 100)}% transfer and rounded down to the ${profile.incrementLb} lb increment — machine and cable numbers rarely transfer exactly.`,
      "Treat set 1 as a calibration set and adjust from how it feels.",
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
          : `Conservative start × ${fmtRange(profile.repMin, profile.repMax)}`,
      detail: `Stop at ${calibRir} RIR · use set 1 as a calibration set`,
      basedOn: `Based on: ${describeExposure(latest, basis)} (${source.sourceExerciseName})`,
      goal: "Calibrate today, then progress from a verified baseline",
      sourceLabel: `Estimated from ${source.sourceExerciseName} · low confidence`,
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

  const baseWeight = latest.workingWeight ?? latest.topWeight
  const lastBest = latest.bestSet
  const medianRir = latest.medianRir
  const sourceIds = source.exposures.map((e) => e.sessionId)
  const basedOn = `Based on: ${describeExposure(latest, basis)} last session`

  explanation.push(
    `Used your last ${Math.min(source.exposures.length, 5)} session${source.exposures.length === 1 ? "" : "s"} of ${input.exercise.name} (most recent ${latest.dateKey}).`,
    `Recent repeatable performance is weighted over all-time bests; warm-ups, incomplete and flagged sets are excluded.`,
  )
  if (latest.excludedOutliers > 0) {
    explanation.push(
      `${latest.excludedOutliers} set${latest.excludedOutliers === 1 ? "" : "s"} excluded as a likely logging mistake.`,
    )
  }
  if (medianRir == null) {
    explanation.push(
      "No effort (RIR) data in recent history, so the recommendation leans on reps only — log RIR for sharper targets.",
    )
  }

  /* Bodyweight: progress through reps. */
  if (basis === "bodyweight" && (baseWeight == null || baseWeight === 0)) {
    reasons.push("BODYWEIGHT_REPS_ONLY")
    const targetReps = Math.min((lastBest?.reps ?? profile.repMin) + 1, profile.repMax + 3)
    explanation.push(
      `Bodyweight movement: progression is repetitions. Last best set was ${lastBest?.reps ?? 0} reps.`,
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
      detail: `Stop at ${profile.targetRir} RIR`,
      basedOn,
      goal: `Goal: beat ${lastBest?.reps ?? 0} reps on your best set`,
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

  /* Double progression: was the top of the range reached at/easier than target RIR? */
  const setsAtBase = latest.sets.filter(
    (s) => s.weight === baseWeight && s.reps != null,
  )
  const mostReachedTop =
    setsAtBase.length > 0 &&
    setsAtBase.filter((s) => (s.reps ?? 0) >= profile.repMax).length * 2 >=
      setsAtBase.length
  const effortOk = medianRir == null ? false : medianRir >= profile.targetRir
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
    mostReachedTop &&
    effortOk &&
    !latest.hadPainOrTechniqueFlag &&
    profile.incrementLb > 0
  ) {
    /* Increase load */
    reasons.push("UPPER_REP_RANGE_REACHED", "ABOVE_TARGET_RIR", "EQUIPMENT_INCREMENT_ROUNDED")
    const nextLoad = roundToIncrement(
      baseWeight + dir * profile.incrementLb,
      profile.incrementLb,
      "nearest",
    )
    /* Assisted loads: the assist number is not the moved load, so the relative
       jump check does not apply (10 lb less assistance is a small change). */
    const jumpPct =
      basis === "assisted" ? 0 : Math.abs(nextLoad - baseWeight) / baseWeight
    if (jumpPct > 0.12 && profile.repMax - profile.repMin >= 2) {
      /* Increment too large relative to load → add reps instead */
      reasons.push("LARGE_INCREMENT_PREFERS_REPS")
      explanation.push(
        `The next available increment (${profile.incrementLb} lb) is a ${(jumpPct * 100).toFixed(0)}% jump, so adding reps first is the safer progression.`,
      )
      return {
        kind: "initial",
        status: "push",
        action: "add_reps",
        loadLb: baseWeight,
        repMin: profile.repMax,
        repMax: profile.repMax + 2,
        targetRir: profile.targetRir,
        delta: "+1 rep",
        headline: `${fmtLb(baseWeight, basis)} × ${fmtRange(profile.repMax, profile.repMax + 2)}`,
        detail: `Stop at ${profile.targetRir} RIR`,
        basedOn,
        goal: "Goal: outgrow the rep range before taking the big jump",
        sourceLabel: null,
        confidence,
        reasonCodes: reasons,
        explanation,
        apply: {
          weight: baseWeight,
          reps: profile.repMax,
          label: `Keep ${formatLoad(baseWeight)} lb, aim ${profile.repMax}+`,
        },
        sourceSessionIds: sourceIds,
        sourceExerciseKey: null,
      }
    }
    explanation.push(
      `Most working sets reached ${profile.repMax} reps at ${formatRoundedRir(medianRir ?? profile.targetRir)} RIR, so the double-progression model moves to the next ${profile.incrementLb} lb increment.`,
      `Reps are expected to drop back toward ${profile.repMin} at the new load.`,
    )
    const deltaLb = dir * profile.incrementLb
    return {
      kind: "initial",
      status: "push",
      action: "increase_load",
      loadLb: nextLoad,
      repMin: profile.repMin,
      repMax: profile.repMax,
      targetRir: profile.targetRir,
      delta: basis === "assisted" ? `−${profile.incrementLb} lb assist` : `+${deltaLb} lb`,
      headline: `${fmtLb(nextLoad, basis)} × ${fmtRange(profile.repMin, profile.repMax)}`,
      detail: `Stop at ${profile.targetRir} RIR`,
      basedOn,
      goal: `Goal: ${fmtRange(profile.repMin, profile.repMax)} clean reps at the new load`,
      sourceLabel: null,
      confidence,
      reasonCodes: reasons,
      explanation,
      apply: {
        weight: nextLoad,
        reps: profile.repMin,
        label: `Use ${formatLoad(nextLoad)} lb next set`,
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
      "Performance has been below target across three sessions (or pain/technique intervened). Drop one increment, rebuild clean reps, then push again.",
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
      detail: `Stop at ${profile.targetRir + 1} RIR · rebuild quality`,
      basedOn,
      goal: "Goal: clean sets in range, then resume progressive overload",
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
      "Last session was tough, but progressive overload stays aggressive: keep the load and rebuild toward the top of the rep range before considering a deload.",
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
      detail: `Stop at ${profile.targetRir} RIR · rebuild reps`,
      basedOn,
      goal: `Goal: reclaim ${fmtRange(profile.repMin, profile.repMax)} before changing load`,
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
  const repTarget = Math.min((lastBest?.reps ?? profile.repMin) + 1, profile.repMax)
  explanation.push(
    `You're inside the ${fmtRange(profile.repMin, profile.repMax)} rep range but haven't topped it on most sets yet, so the load stays and the rep target moves up.`,
    `Increase to the next increment once most sets reach ${profile.repMax} reps at about ${profile.targetRir} RIR.`,
  )
  return {
    kind: "initial",
    status: "on-track",
    action: "add_reps",
    loadLb: baseWeight,
    repMin: profile.repMin,
    repMax: profile.repMax,
    targetRir: profile.targetRir,
    delta: "Same weight",
    headline: `${fmtLb(baseWeight, basis)} × ${fmtRange(Math.min(repTarget, profile.repMax), profile.repMax)}`,
    detail: `Stop at ${profile.targetRir} RIR`,
    basedOn,
    goal: "Goal: add 1 rep or use the next available weight increment",
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
      "Pain was flagged, so the coach will not suggest more load or extra sets. Reduce the load or stop the movement if pain persists.",
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
        `The final set still had ${lastRir} RIR with steady performance, so one optional set is a productive way to add volume today.`,
      )
      return {
        ...initial,
        kind: "next-set",
        status: "push",
        action: "optional_set",
        loadLb: lastWeight,
        delta: "Optional extra set",
        headline: `Optional: ${fmtLb(lastWeight, basis)} × ${fmtRange(initial.repMin, initial.repMax)}`,
        detail: `Stop at ${initial.targetRir} RIR · skip if you're done`,
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
    return summarizeAsHold(initial, lastWeight, basis, confidence, reasons, explanation, "Planned sets complete", null)
  }

  /* ── Technique breakdown ─────────────────────────── */
  if (assess.techniqueFlag || anyTechnique) {
    reasons.push("TECHNIQUE_FLAGGED")
    explanation.push(
      "Technique broke down, so the load holds. Tighten execution before adding weight or reps.",
    )
    return summarizeAsHold(
      initial,
      lastWeight,
      basis,
      confidence,
      reasons,
      explanation,
      "Technique first — keep the load",
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
          ? `${setLabel} collapsed ~35%+ from the previous set — drop one increment and finish clean.`
          : `${setLabel} was the second hard set in a row. Drop one increment so the remaining work stays productive.`,
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
        detail: `Stop at ${initial.targetRir} RIR`,
        goal: `Or keep ${formatLoad(lastWeight)} lb and target ${lowerRepTarget} reps`,
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
      `${setLabel} was harder than planned. Keep the load for maximum progressive overload and aim ${lowerRepTarget} clean reps — only deload if the next set also falls apart.`,
    )
    return {
      ...initial,
      kind: "next-set",
      status: "hold",
      action: "hold",
      loadLb: lastWeight,
      delta: `Aim ${lowerRepTarget} reps`,
      headline: `${fmtLb(lastWeight, basis)} × ${lowerRepTarget}`,
      detail: `Stop at ${initial.targetRir} RIR · hold the load`,
      goal: "Goal: finish remaining sets without dropping weight",
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

  /* ── Clearly easy: increase next set ─────────────── */
  const reachedTarget = (last.reps ?? 0) >= Math.min(initial.repMax, initial.repMin)
  if (
    assess.vsRir === "easier" &&
    reachedTarget &&
    lastWeight != null &&
    profile.incrementLb > 0
  ) {
    const nextLoad = roundToIncrement(
      lastWeight + dir * profile.incrementLb,
      profile.incrementLb,
      "nearest",
    )
    const jumpPct =
      basis === "assisted" ? 0 : Math.abs(nextLoad - lastWeight) / Math.max(1, lastWeight)
    if (jumpPct <= 0.15) {
      reasons.push("ABOVE_TARGET_RIR", "EQUIPMENT_INCREMENT_ROUNDED")
      const repLow = Math.max(1, initial.repMin - 1)
      explanation.push(
        `${setLabel} was easier than planned at ${last.rir} RIR (target ${initial.targetRir}), so the next set moves up one increment.`,
      )
      return {
        ...initial,
        kind: "next-set",
        status: "push",
        action: "increase_load",
        loadLb: nextLoad,
        delta: basis === "assisted" ? `−${profile.incrementLb} lb assist` : `+${profile.incrementLb} lb`,
        headline: `${fmtLb(nextLoad, basis)} × ${fmtRange(repLow, initial.repMax)}`,
        detail: `Stop at ${initial.targetRir} RIR`,
        goal: null,
        confidence,
        reasonCodes: [...initial.reasonCodes, ...reasons],
        explanation,
        apply: { weight: nextLoad, reps: null, label: `Use ${formatLoad(nextLoad)} lb next set` },
      }
    }
    reasons.push("ABOVE_TARGET_RIR", "LARGE_INCREMENT_PREFERS_REPS")
    const repTarget = Math.min((last.reps ?? initial.repMin) + 1, initial.repMax + 2)
    explanation.push(
      `${setLabel} was easy, but the next increment is a big jump — adding reps is the better progression here.`,
    )
    return {
      ...initial,
      kind: "next-set",
      status: "push",
      action: "add_reps",
      loadLb: lastWeight,
      delta: "+1 rep",
      headline: `${fmtLb(lastWeight, basis)} × ${repTarget}`,
      detail: `Stop at ${initial.targetRir} RIR`,
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
    `${setLabel} landed in range${typeof last.rir === "number" ? ` at ${last.rir} RIR` : ""} — normal within-exercise fatigue means holding the load is the right call.`,
  )
  const aim = Math.max(initial.repMin, Math.min((last.reps ?? initial.repMin), initial.repMax))
  return summarizeAsHold(
    initial,
    lastWeight,
    basis,
    confidence,
    reasons,
    explanation,
    `On target. Keep ${lastWeight != null ? `${formatLoad(lastWeight)} lb` : "the load"} and aim for ${aim}+`,
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
          ? " at a similar effort"
          : medianRir > prev.medianRir
            ? " at an easier effort"
            : " at a harder effort"
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
            ? `New best: ${formatLoad(topWeight)} lb assist (less assistance than ever)`
            : `New load PR: ${formatLoad(topWeight)} lb`,
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
          text: `New rep PR: ${bestRepsAtLoad} reps at ${formatLoad(topWeight)} lb`,
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
    return `Increase to ${formatLoad(rec.loadLb)} lb × ${range} at ${rec.targetRir} RIR`
  }
  if (rec.action === "reduce_load" && rec.loadLb != null) {
    return `Lighter exposure: ${formatLoad(rec.loadLb)} lb × ${range}, then reassess`
  }
  if (rec.action === "add_reps") {
    return rec.loadLb != null
      ? `Keep ${formatLoad(rec.loadLb)} lb and add reps toward ${rec.repMax} at ${rec.targetRir} RIR`
      : `Add reps toward ${rec.repMax} at ${rec.targetRir} RIR`
  }
  if (rec.action === "choose_load" || rec.action === "calibrate") {
    return rec.loadLb != null
      ? `Calibrate around ${formatLoad(rec.loadLb)} lb × ${range}`
      : `Calibrate with a conservative load × ${range}`
  }
  return rec.loadLb != null
    ? `Hold ${formatLoad(rec.loadLb)} lb × ${range} at ${rec.targetRir} RIR`
    : `Hold steady at ${range} reps`
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
      ? "No completed sets to analyze."
      : `${progressed} of ${total} movement${total === 1 ? "" : "s"} progressed`

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
