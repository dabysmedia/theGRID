"use client"

import { useEffect, useMemo, useState, useRef, Suspense } from "react"
import {
  AlertTriangle,
  ArrowLeftRight,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Dumbbell,
  Flag,
  HeartPulse,
  ImagePlus,
  ListOrdered,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SkipForward,
  Timer,
  Trash2,
  X,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { apiFetch } from "@/lib/api-fetch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import { useFullscreenOverlay } from "@/context/FullscreenOverlayContext"
import {
  DEFAULT_WORKOUT_REST,
  loadWorkoutRestConfig,
  saveWorkoutRestConfig,
  type WorkoutRestConfig,
} from "@/lib/workout-rest-config"
import { cn, glassCtaButtonClass } from "@/lib/utils"
import { getTrackingPeriod } from "@/lib/work-cycle"
import { PlateCalculatorDialog } from "@/components/workouts/PlateCalculatorDialog"
import { MachineBrandMark } from "@/components/workouts/MachineBrandMark"
import { MachinePickerDialog } from "@/components/workouts/MachinePickerDialog"
import { FALLBACK_EXERCISES, type ApiExercise } from "@/lib/workouts/exercise-library"
import {
  ProgressiveOverloadCoach,
  type SetEffortPatch,
} from "@/components/workouts/ProgressiveOverloadCoach"
import { MovementCompleteOverview } from "@/components/workouts/MovementCompleteOverview"
import { SessionMuscleLoadWidget } from "@/components/workouts/SessionMuscleLoadWidget"
import {
  normalizeExerciseKey,
  planSessionSets,
  summarizeWorkoutProgression,
  type PoSession,
} from "@/lib/workouts/progressive-overload"
import {
  loadProgressionPrefs,
  type ProgressionPrefs,
} from "@/lib/workouts/progression-settings"
import {
  getPreferredSubstitute,
  getRecentSubstitutes,
  rememberSubstitution,
} from "@/lib/workouts/exercise-substitutions"
import {
  exerciseMachineKey,
  getRememberedMachine,
  machineSelectionFromPick,
  rememberMachineSelection,
  supportsMachineSelection,
  type MachineSelection,
} from "@/lib/workouts/machine-selection"
import { machineLabel } from "@/lib/workouts/machine-brands"
import {
  aggregateExerciseFrequency,
  defaultFreeFormSets,
  isCompoundMovement,
  recommendFreeFormWorkout,
  suggestedCompoundExercises,
  topFrequentExercises,
  type WorkoutFocus,
} from "@/lib/workouts/free-form-recommender"
import {
  normalizeTrainingStyle,
  progressionOverridesForStyle,
  TRAINING_STYLE_DEFINITIONS,
  type TrainingStyle,
} from "@/lib/workouts/training-style"
import { deferExercise } from "@/lib/workouts/active-queue"
import {
  clearActiveWorkoutUiState,
  loadActiveWorkoutUiState,
  saveActiveWorkoutUiState,
} from "@/lib/workouts/active-workout-ui-state"
import { buildWorkoutRecap, type WorkoutRecap } from "@/lib/workouts/workout-recap"
import { ActiveWorkoutSheet } from "@/components/workouts/ActiveWorkoutSheet"
import { WorkoutCompleteScreen } from "@/components/workouts/WorkoutCompleteScreen"
import { normalizeWorkoutSessionExercises } from "@/lib/workouts/session-exercises"
import {
  normalizeTrainingSplit,
  TRAINING_SPLIT_DEFINITIONS,
  trainingSplitFocuses,
  type TrainingSplit,
} from "@/lib/workouts/training-split"

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Types
   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

interface ExerciseSet {
  id: string
  setNumber: number
  weight: number | null
  reps: number | null
  type: "working" | "warmup" | "dropset" | "failure"
  completed: boolean
  /** Progressive overload coach: canonical reps-in-reserve (5 = "5+"); null/absent = not reported. */
  rir?: number | null
  /** User skipped the effort prompt for this set. */
  rirSkipped?: boolean
  techniqueFlag?: boolean
  painFlag?: boolean
  /** Added from an "optional extra set" recommendation. */
  optionalSet?: boolean
}

interface MuscleTag {
  name: string
  color: string
  code: string
}

interface SessionExercise {
  id: string
  name: string
  notes: string
  sets: ExerciseSet[]
  primaryMuscles?: MuscleTag[]
  secondaryMuscles?: MuscleTag[]
  category?: string
  /** Template slot this session exercise came from (for remembering swaps). */
  templateExerciseId?: string
  /** Original template exercise name before any in-session swap. */
  originalName?: string
  /**
   * Machine variant this movement is being performed on (see machine-brands.ts).
   * Part of the movement's identity for prefill, the Previous column and the
   * progressive-overload history, so weights are never compared across machines.
   */
  machineId?: string | null
  /** Label for a custom (non-catalogue) machine. */
  machineName?: string | null
}

interface TemplateSetRow {
  id: string
  /** Target weight in lb (empty = leave blank when starting workout) */
  weight: string
  /** Target reps, e.g. "10" or "8-12" (ranges start empty in workout) */
  reps: string
}

interface TemplateExercise {
  id: string
  name: string
  notes: string
  primaryMuscles?: MuscleTag[]
  setRows: TemplateSetRow[]
  /** Legacy templates only â€” migrated to `setRows` on load */
  targetSets?: number
  targetReps?: string
  /** Last preferred substitute for this slot (persisted on the template). */
  preferredSubstituteName?: string
  /** Recent substitutes for this slot (newest first). */
  recentSubstitutes?: string[]
  /** Machine this slot is normally performed on (see machine-brands.ts). */
  machineId?: string | null
  machineName?: string | null
}

interface PickedExercise {
  name: string
  primaryMuscles: MuscleTag[]
  secondaryMuscles: MuscleTag[]
  category: string
}

interface WorkoutTemplate {
  id: string
  name: string
  exercises: string | TemplateExercise[]
  /** JSON string array from API */
  tags?: string | null
  coverImageUrl?: string | null
  sortOrder?: number
  createdAt: string
}

interface WorkoutSession {
  id: string
  name: string
  date: string
  startedAt: string
  finishedAt: string | null
  duration: number | null
  notes: string | null
  status: string
  exercises: string | SessionExercise[]
  bodyWeightLb?: number | null
  /** Routine cover when started from a template with art (`/uploads/routine-covers/â€¦`). */
  coverImageUrl?: string | null
}

function parseExercises<T>(raw: string | T[]): T[] {
  if (Array.isArray(raw)) return raw
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

const ROUTINE_TAG_PRESETS = [
  "Crossfit",
  "Strength",
  "Hypertrophy",
  "Endurance",
  "Mobility",
  "Cardio",
  "Powerlifting",
  "Olympic",
] as const

function parseTemplateTags(raw: string | string[] | null | undefined): string[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))].slice(0, 12)
  }
  if (raw == null || raw === "") return []
  try {
    const a = JSON.parse(raw) as unknown
    if (Array.isArray(a)) {
      return parseTemplateTags(a as string[])
    }
  } catch {
    /* fall through */
  }
  if (raw.includes(",")) {
    return [
      ...new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ].slice(0, 12)
  }
  return []
}

function migrateTemplateExercise(raw: TemplateExercise): TemplateExercise {
  const ex = raw as TemplateExercise & { setRows?: TemplateSetRow[] }
  const recent =
    Array.isArray(ex.recentSubstitutes)
      ? ex.recentSubstitutes.map((n) => String(n).trim()).filter(Boolean).slice(0, 6)
      : []
  const preferred =
    typeof ex.preferredSubstituteName === "string" && ex.preferredSubstituteName.trim()
      ? ex.preferredSubstituteName.trim()
      : recent[0]
  const rows = ex.setRows
  if (Array.isArray(rows) && rows.length > 0) {
    return {
      id: ex.id,
      name: ex.name,
      notes: ex.notes ?? "",
      primaryMuscles: ex.primaryMuscles,
      preferredSubstituteName: preferred,
      recentSubstitutes: recent,
      machineId: ex.machineId ?? null,
      machineName: ex.machineName ?? null,
      setRows: rows.map((r) => ({
        id: r.id || uid(),
        weight: r.weight != null && r.weight !== "" ? String(r.weight) : "",
        reps: r.reps != null && r.reps !== "" ? String(r.reps) : "",
      })),
    }
  }
  const n = Math.max(
    1,
    typeof ex.targetSets === "number" && Number.isFinite(ex.targetSets) ? ex.targetSets : 3,
  )
  const reps =
    ex.targetReps != null && String(ex.targetReps).trim()
      ? String(ex.targetReps)
      : "8-12"
  return {
    id: ex.id,
    name: ex.name,
    notes: ex.notes ?? "",
    primaryMuscles: ex.primaryMuscles,
    preferredSubstituteName: preferred,
    recentSubstitutes: recent,
    machineId: ex.machineId ?? null,
    machineName: ex.machineName ?? null,
    setRows: Array.from({ length: n }, () => ({
      id: uid(),
      reps,
      weight: "",
    })),
  }
}

function templateExerciseToPersist(ex: TemplateExercise): TemplateExercise {
  return {
    id: ex.id,
    name: ex.name,
    notes: ex.notes ?? "",
    primaryMuscles: ex.primaryMuscles,
    preferredSubstituteName: ex.preferredSubstituteName,
    recentSubstitutes: ex.recentSubstitutes,
    machineId: ex.machineId ?? null,
    machineName: ex.machineName ?? null,
    setRows: ex.setRows.map((r) => ({
      id: r.id,
      weight: r.weight,
      reps: r.reps,
    })),
  }
}

function parseTemplateWeightToNumber(s: string): number | null {
  const t = String(s ?? "").trim()
  if (!t) return null
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

function parseTemplateRepsToNumber(s: string): number | null {
  const t = String(s ?? "").trim()
  if (!t) return null
  if (/[-–—]/.test(t)) return null
  const n = parseInt(t, 10)
  return Number.isFinite(n) ? n : null
}

function sessionSetsFromTemplate(
  m: TemplateExercise,
  trainingStyle: TrainingStyle,
): ExerciseSet[] {
  const sets = m.setRows.map((row, i) => ({
    id: uid(),
    setNumber: i + 1,
    weight: parseTemplateWeightToNumber(row.weight),
    reps: parseTemplateRepsToNumber(row.reps),
    type: "working" as const,
    completed: false,
  }))
  const target = TRAINING_STYLE_DEFINITIONS[trainingStyle].workingSetTarget
  if (target == null) return sets

  const adjusted = sets.slice(0, target)
  const fallback = adjusted.at(-1) ?? sets.at(-1)
  while (adjusted.length < target) {
    adjusted.push({
      id: uid(),
      setNumber: adjusted.length + 1,
      weight: fallback?.weight ?? null,
      reps: fallback?.reps ?? null,
      type: "working",
      completed: false,
    })
  }
  return adjusted.map((set, index) => ({ ...set, setNumber: index + 1 }))
}

/**
 * Fill every un-logged set with the coach's target for this session.
 *
 * This used to copy last session's numbers verbatim, which quietly cancelled
 * progressive overload: the copied weight made the set "not empty", and the
 * coach's own auto-fill refused to overwrite a non-empty set, so you were shown
 * last week's weight forever. The planner now owns those cells — the user's own
 * typing (tracked in `touched`) still wins, and anything the planner can't
 * decide is left exactly as it was.
 */
function applyCoachPlan(
  list: SessionExercise[],
  options: {
    sessions: PoSession[]
    sessionId: string
    trainingStyle: TrainingStyle
    prefs: ProgressionPrefs
    /** Most recent sets for a movement, scoped to its machine. */
    prevSets: (exercise: SessionExercise) => ExerciseSet[] | undefined
    touched: Set<string>
  },
): { updated: SessionExercise[]; ghost: Set<string> } {
  const { sessions, sessionId, trainingStyle, prefs, prevSets, touched } = options
  const ghost = new Set<string>()

  const updated = list.map((ex) => {
    const overrides = prefs.exercises[normalizeExerciseKey(ex.name)]
    const coachOff = !prefs.coachEnabled || overrides?.disabled === true
    /* The planner only sets the table. Once a set is logged the live coach owns
       the remaining rows — re-planning here would keep stomping the target it
       just wrote after each set. */
    if (ex.sets.some((s) => s.completed)) return ex
    if (ex.sets.length === 0) return ex

    /* Coach turned off for this movement: fall back to the plain copy of last
       session so the sheet is still pre-filled with something familiar. */
    if (coachOff) {
      const prev = prevSets(ex)
      if (!prev) return ex
      return {
        ...ex,
        sets: ex.sets.map((set, idx) => {
          if (touched.has(set.id) || set.completed) return set
          if (set.weight != null || set.reps != null) return set
          const p = prev[idx]
          if (!p || (p.weight == null && p.reps == null)) return set
          ghost.add(set.id)
          return { ...set, weight: p.weight ?? null, reps: p.reps ?? null }
        }),
      }
    }

    const plan = planSessionSets({
      exercise: {
        name: ex.name,
        category: ex.category,
        primaryMuscles: ex.primaryMuscles,
        secondaryMuscles: ex.secondaryMuscles,
        machineId: ex.machineId ?? null,
        machineName: ex.machineName ?? null,
      },
      sessions,
      setCount: ex.sets.length,
      overrides: progressionOverridesForStyle(trainingStyle, overrides),
      excludeSessionId: sessionId,
    })

    return {
      ...ex,
      sets: ex.sets.map((set, idx) => {
        if (touched.has(set.id) || set.completed) return set
        const target = plan.sets[idx]
        if (!target) return set
        /* Never blank out an existing value — with no history the planner has
           no weight to offer and a routine template's numbers must survive. */
        const weight = target.weight ?? set.weight
        const reps = target.reps ?? set.reps
        if (weight === set.weight && reps === set.reps) return set
        ghost.add(set.id)
        return { ...set, weight, reps }
      }),
    }
  })

  return { updated, ghost }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Client-side module-level cache so the picker doesn't re-fetch on every open. */
let exerciseListCache: ApiExercise[] | null = null

/* ──────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────── */

/** Weigh-in / bodyweight goal values may be stored in kg or lb. */
function goalWeightToLb(value: number, unit: string | undefined): number {
  const u = (unit ?? "lbs").toLowerCase()
  if (u === "kg" || u === "kgs" || u === "kilogram" || u === "kilograms") {
    return value * 2.2046226218
  }
  return value
}

/** Muscle/API hex swatch, or theme ladder yellow (`--primary`) when missing. */
function muscleSwatchStyles(hex: string | undefined): { soft: string; dot: string } {
  const c = hex?.trim()
  if (c && /^#[0-9A-Fa-f]{6}$/.test(c)) {
    return { soft: `${c}20`, dot: c }
  }
  return {
    soft: "color-mix(in oklch, var(--primary) 14%, transparent)",
    dot: "var(--primary)",
  }
}

function normalizeSessionStatus(s: WorkoutSession): WorkoutSession {
  const status = String(s.status ?? "").trim().toLowerCase()
  return { ...s, status: status || "active" }
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

function formatRestCountdown(totalSeconds: number): string {
  const sec = Math.max(0, Math.ceil(totalSeconds))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

const REST_PRESETS = [
  { sec: 45, label: "45s" },
  { sec: 60, label: "1m" },
  { sec: 90, label: "1:30" },
  { sec: 120, label: "2m" },
  { sec: 180, label: "3m" },
  { sec: 240, label: "4m" },
] as const

function totalVolume(exercises: SessionExercise[]): number {
  let vol = 0
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (set.weight != null && set.reps != null) {
        vol += set.weight * set.reps
      }
    }
  }
  return vol
}

function totalSetsCompleted(exercises: SessionExercise[]): number {
  return exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
    0,
  )
}

function totalPlannedSets(exercises: SessionExercise[]): number {
  return exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
}

function completedVolume(exercises: SessionExercise[]): number {
  let vol = 0
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (set.completed && set.weight != null && set.reps != null) {
        vol += set.weight * set.reps
      }
    }
  }
  return vol
}

function isExerciseComplete(ex: SessionExercise): boolean {
  return ex.sets.length > 0 && ex.sets.every((s) => s.completed)
}

/** Active movement queue: non-skipped first (session order), then skipped (deferred to end). */
function getActiveWorkoutQueue(
  exercises: SessionExercise[],
  skippedIds: readonly string[] = [],
) {
  const skippedSet = new Set(skippedIds)
  const byId = new Map(exercises.map((e) => [e.id, e]))

  const activeIncomplete = exercises.filter(
    (e) => !skippedSet.has(e.id) && !isExerciseComplete(e),
  )
  const skippedIncomplete = skippedIds
    .map((id) => byId.get(id))
    .filter((e): e is SessionExercise => !!e && !isExerciseComplete(e))

  const remaining = [...activeIncomplete, ...skippedIncomplete]
  const current = remaining[0] ?? null
  const next = remaining[1] ?? null
  const totalSets = totalPlannedSets(exercises)
  const completedSets = totalSetsCompleted(exercises)
  const allSetsComplete = totalSets > 0 && completedSets >= totalSets
  const completedMovements = exercises.filter(isExerciseComplete).length

  return {
    totalSets,
    completedSets,
    completedMovements,
    current,
    next,
    remaining,
    skippedPending: skippedIncomplete,
    currentDone: current?.sets.filter((s) => s.completed).length ?? 0,
    currentTotal: current?.sets.length ?? 0,
    allSetsComplete,
    onLastMovement: remaining.length <= 1 && !!current,
    movementIndex: current ? completedMovements + 1 : 0,
    movementTotal: exercises.length,
    canSkip: remaining.length > 1,
  }
}

function formatVolumeLb(vol: number): string {
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}k`
  return String(vol)
}

const SET_TYPE_LABELS: Record<string, { short: string; color: string }> = {
  working: { short: "W", color: "text-foreground" },
  warmup: { short: "WU", color: "text-amber-400" },
  dropset: { short: "D", color: "text-red-400" },
  failure: { short: "F", color: "text-rose-500" },
}

const EFFORT_CHOICES = [
  { rir: 0, label: "Failure", hint: "0 left" },
  { rir: 1, label: "RPE 9", hint: "1 left" },
  { rir: 2, label: "RPE 8", hint: "2 left" },
  { rir: 3, label: "RPE 7", hint: "3 left" },
] as const

function effortLabel(set: ExerciseSet): string | null {
  if (typeof set.rir !== "number") return null
  if (set.rir <= 0) return "Failure"
  if (set.rir >= 5) return "RPE ≤5"
  return `RPE ${10 - set.rir}`
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Exercise Picker Dialog
   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function ExercisePicker({
  open,
  onClose,
  onSelect,
  title = "Add Exercise",
  description = "Search or filter by muscle group, then pick an exercise",
  initialMuscleGroup,
  recentNames,
  frequencySessions,
}: {
  open: boolean
  onClose: () => void
  onSelect: (exercise: PickedExercise) => void
  /** Dialog title (e.g. "Swap exercise"). */
  title?: string
  /** `DialogDescription` text (screen-reader). */
  description?: string
  /** Swap flow: pre-select this muscle chip when it exists in the library list. */
  initialMuscleGroup?: string | null
  /** Recent substitutes to pin at the top of the picker. */
  recentNames?: string[]
  /** Completed sessions used to rank favorites / frequency. */
  frequencySessions?: WorkoutSession[]
}) {
  const [exercises, setExercises] = useState<ApiExercise[]>(exerciseListCache ?? [])
  const [loading, setLoading] = useState(false)
  const [usingFallback, setUsingFallback] = useState(false)
  const [search, setSearch] = useState("")
  const [muscleFilter, setMuscleFilter] = useState<string>("All")
  const [browseAll, setBrowseAll] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setSearch("")
    setBrowseAll(false)
    const g = initialMuscleGroup?.trim()
    setMuscleFilter(g && g.length > 0 ? g : "All")
    setTimeout(() => inputRef.current?.focus(), 100)

    if (exerciseListCache) {
      setExercises(exerciseListCache)
      return
    }

    setLoading(true)
    apiFetch("/api/exercise-library", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          exerciseListCache = data
          setExercises(data)
          setUsingFallback(false)
        } else {
          setExercises(FALLBACK_EXERCISES)
          setUsingFallback(true)
        }
      })
      .catch(() => {
        setExercises(FALLBACK_EXERCISES)
        setUsingFallback(true)
      })
      .finally(() => setLoading(false))
  }, [open, initialMuscleGroup])

  const allMuscles = useMemo(() => {
    const seen = new Set<string>()
    for (const ex of exercises) {
      for (const m of ex.primaryMuscles) seen.add(m.name)
    }
    return ["All", ...Array.from(seen).sort()]
  }, [exercises])

  useEffect(() => {
    if (!open || loading) return
    if (muscleFilter === "All") return
    if (!allMuscles.includes(muscleFilter)) setMuscleFilter("All")
  }, [open, loading, allMuscles, muscleFilter])

  const freq = useMemo(
    () => aggregateExerciseFrequency(frequencySessions ?? []),
    [frequencySessions],
  )

  const searching = search.trim().length > 0
  const showFullLibrary = searching || browseAll

  const results = useMemo(() => {
    const q = search.toLowerCase().trim()
    const filtered = exercises.filter((ex) => {
      if (
        muscleFilter !== "All" &&
        !ex.primaryMuscles.some((m) => m.name === muscleFilter)
      )
        return false
      if (q && !ex.name.toLowerCase().includes(q)) return false
      return true
    })
    // Favorites + compounds first so the list isn't a wall of obscure isolations
    return [...filtered].sort((a, b) => {
      const fa = freq.get(normalizeExerciseKey(a.name))?.sessionCount ?? 0
      const fb = freq.get(normalizeExerciseKey(b.name))?.sessionCount ?? 0
      if (fb !== fa) return fb - fa
      const ca = isCompoundMovement(a.name, a.primaryMuscles[0]?.name) ? 1 : 0
      const cb = isCompoundMovement(b.name, b.primaryMuscles[0]?.name) ? 1 : 0
      if (cb !== ca) return cb - ca
      return a.name.localeCompare(b.name)
    })
  }, [exercises, search, muscleFilter, freq])

  const recentPicks = useMemo(() => {
    if (!recentNames?.length) return [] as ApiExercise[]
    const byKey = new Map(exercises.map((ex) => [ex.name.toLowerCase(), ex]))
    const out: ApiExercise[] = []
    for (const name of recentNames) {
      const hit = byKey.get(name.toLowerCase())
      if (hit && !out.some((e) => e.name === hit.name)) out.push(hit)
    }
    return out
  }, [exercises, recentNames])

  const recentKeys = useMemo(
    () => new Set(recentPicks.map((e) => normalizeExerciseKey(e.name))),
    [recentPicks],
  )

  const favoritePicks = useMemo(() => {
    if (searching) return [] as ApiExercise[]
    return topFrequentExercises(exercises, freq, 10, {
      muscleFilter,
      excludeKeys: recentKeys,
    })
  }, [exercises, freq, muscleFilter, recentKeys, searching])

  const favoriteKeys = useMemo(
    () => new Set(favoritePicks.map((e) => normalizeExerciseKey(e.name))),
    [favoritePicks],
  )

  const suggestedPicks = useMemo(() => {
    if (searching) return [] as ApiExercise[]
    // When the user already has plenty of favorites, skip generic suggestions
    if (favoritePicks.length >= 6) return [] as ApiExercise[]
    const exclude = new Set([...recentKeys, ...favoriteKeys])
    return suggestedCompoundExercises(exercises, {
      muscleFilter,
      excludeKeys: exclude,
      limit: 8,
    })
  }, [
    exercises,
    muscleFilter,
    recentKeys,
    favoriteKeys,
    favoritePicks.length,
    searching,
  ])

  const suggestedKeys = useMemo(
    () => new Set(suggestedPicks.map((e) => normalizeExerciseKey(e.name))),
    [suggestedPicks],
  )

  const pinnedKeys = useMemo(
    () => new Set([...recentKeys, ...favoriteKeys, ...suggestedKeys]),
    [recentKeys, favoriteKeys, suggestedKeys],
  )

  const grouped = useMemo(() => {
    if (!showFullLibrary) return new Map<string, ApiExercise[]>()
    const map = new Map<string, ApiExercise[]>()
    for (const ex of results) {
      if (!searching && pinnedKeys.has(normalizeExerciseKey(ex.name))) continue
      const muscle = ex.primaryMuscles[0]?.name ?? "Other"
      if (!map.has(muscle)) map.set(muscle, [])
      map.get(muscle)!.push(ex)
    }
    return map
  }, [results, pinnedKeys, searching, showFullLibrary])

  const hiddenCount = useMemo(() => {
    if (showFullLibrary || searching) return 0
    return Math.max(0, results.length - pinnedKeys.size)
  }, [showFullLibrary, searching, results.length, pinnedKeys.size])

  function pickFromLibrary(ex: ApiExercise) {
    onSelect({
      name: ex.name,
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
    })
    onClose()
  }

  function renderRow(
    ex: ApiExercise,
    badge?: { label: string; className?: string },
  ) {
    const swatch = muscleSwatchStyles(ex.primaryMuscles[0]?.color)
    const sessions = freq.get(normalizeExerciseKey(ex.name))?.sessionCount ?? 0
    return (
      <button
        key={ex.id}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          pickFromLibrary(ex)
        }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/[0.08] active:bg-primary/10 touch-manipulation sm:py-2.5"
      >
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold sm:size-8"
          style={{ backgroundColor: swatch.soft, color: swatch.dot }}
        >
          {(ex.primaryMuscles[0]?.code ?? "?").slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-snug text-foreground">
            {ex.name}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {ex.primaryMuscles.map((m) => (
              <span
                key={m.code}
                className="rounded px-1.5 py-0.5 text-[9px] font-medium"
                style={{
                  backgroundColor: `${m.color}22`,
                  color: m.color,
                }}
              >
                {m.name}
              </span>
            ))}
            {sessions > 0 && (
              <span className="text-[9px] text-muted-foreground/45">
                · {sessions}× logged
              </span>
            )}
            {ex.categories[0]?.name && sessions === 0 && (
              <span className="text-[9px] text-muted-foreground/45">
                · {ex.categories[0].name}
              </span>
            )}
          </div>
        </div>
        {badge ? (
          <span
            className={cn(
              "shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
              badge.className ?? "bg-primary/15 text-primary",
            )}
          >
            {badge.label}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton
        priority="high"
        className={cn(
          "glass-frost flex min-h-0 w-[min(100%,calc(100vw-1rem))] max-w-lg flex-col gap-0 overflow-hidden p-0",
          "max-h-[min(88dvh,calc(100dvh-1rem))] sm:max-h-[85vh]",
          "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3",
        )}
      >
        <div className="shrink-0 border-b border-border/15 px-4 pb-3 pt-4 pr-12">
          <DialogHeader className="space-y-0">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{description}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="shrink-0 space-y-2.5 px-4 pb-3 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              ref={inputRef}
              placeholder="Search exercises…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 border-primary/15 bg-background/40 pl-9 text-base sm:text-sm"
            />
          </div>

          {!loading && (
            <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-0.5">
              {allMuscles.map((mg) => (
                <button
                  key={mg}
                  type="button"
                  onClick={() => {
                    setMuscleFilter(mg)
                    setBrowseAll(false)
                  }}
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 py-2 text-[10px] font-medium uppercase tracking-wider transition-colors touch-manipulation sm:py-1.5",
                    muscleFilter === mg
                      ? "bg-primary/20 text-primary ring-1 ring-primary/35"
                      : "bg-muted/25 text-muted-foreground/70 hover:bg-muted/40 active:bg-muted/50",
                  )}
                >
                  {mg}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]",
            "scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:size-0",
          )}
        >
          {loading && (
            <div className="space-y-1 px-2 py-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse items-center gap-3 rounded-xl px-3 py-3"
                >
                  <div className="size-9 shrink-0 rounded-lg bg-muted/20" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-3/4 rounded bg-muted/20" />
                    <div className="h-2 w-1/2 rounded bg-muted/15" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && usingFallback && (
            <p className="px-4 pb-0 pt-2 text-center text-[10px] text-amber-400/70">
              Offline — using built-in list
            </p>
          )}

          {!loading && recentPicks.length > 0 && !searching && (
            <div>
              <p className="px-4 pb-1 pt-3 text-[10px] font-medium uppercase tracking-[0.15em] text-primary/70">
                Recently substituted
              </p>
              {recentPicks.map((ex) =>
                renderRow(ex, {
                  label: "Recent",
                  className: "bg-primary/15 text-primary",
                }),
              )}
            </div>
          )}

          {!loading && favoritePicks.length > 0 && (
            <div>
              <p className="px-4 pb-1 pt-3 text-[10px] font-medium uppercase tracking-[0.15em] text-primary/70">
                Your favorites
              </p>
              {favoritePicks.map((ex) =>
                renderRow(ex, {
                  label: "Often",
                  className: "bg-primary/15 text-primary",
                }),
              )}
            </div>
          )}

          {!loading && suggestedPicks.length > 0 && (
            <div>
              <p className="px-4 pb-1 pt-3 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/55">
                Suggested compounds
              </p>
              {suggestedPicks.map((ex) =>
                renderRow(ex, {
                  label: "Best",
                  className: "bg-muted/40 text-muted-foreground",
                }),
              )}
            </div>
          )}

          {!loading && results.length === 0 && searching && (
            <div className="px-4 py-6 text-center">
              <p className="mb-3 text-sm text-muted-foreground/70">
                No matches for &ldquo;{search}&rdquo;
              </p>
              <Button
                size="sm"
                variant="outline"
                className="touch-manipulation"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect({
                    name: search.trim(),
                    primaryMuscles: [],
                    secondaryMuscles: [],
                    category: "",
                  })
                  onClose()
                }}
              >
                <Plus className="mr-1 size-3.5" />
                Add &ldquo;{search.trim()}&rdquo; as custom
              </Button>
            </div>
          )}

          {!loading && !showFullLibrary && hiddenCount > 0 && (
            <div className="px-4 py-4">
              <button
                type="button"
                onClick={() => setBrowseAll(true)}
                className="w-full rounded-xl border border-border/30 bg-glass-highlight/[0.06] px-3 py-3 text-center transition-colors hover:border-primary/30 hover:bg-primary/[0.06] touch-manipulation"
              >
                <p className="text-sm font-medium text-foreground">
                  Browse full library
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                  {hiddenCount} more exercise{hiddenCount === 1 ? "" : "s"}
                  {muscleFilter !== "All" ? ` for ${muscleFilter}` : ""}
                </p>
              </button>
            </div>
          )}

          {!loading &&
            showFullLibrary &&
            Array.from(grouped.entries()).map(([muscle, exList]) => (
              <div key={muscle}>
                <p className="px-4 pb-1 pt-3 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/50">
                  {muscle}
                </p>
                {exList.map((ex) => renderRow(ex))}
              </div>
            ))}

          {!loading && showFullLibrary && !searching && browseAll && (
            <div className="px-4 py-3">
              <button
                type="button"
                onClick={() => setBrowseAll(false)}
                className="w-full text-center text-[11px] font-medium text-muted-foreground/60 underline-offset-2 hover:text-foreground hover:underline touch-manipulation"
              >
                Show favorites only
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Routine Editor Dialog
   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function RoutineEditor({
  open,
  onClose,
  initial,
  hydrationKey,
  importAsNew = false,
  onSave,
}: {
  open: boolean
  onClose: () => void
  initial?: WorkoutTemplate | null
  /** Changes when opening a different template or journal import â€” drives form reset. */
  hydrationKey?: string
  /** Pre-fill from `initial` but POST a new template (journal â†’ routine). */
  importAsNew?: boolean
  onSave: (
    name: string,
    exercises: TemplateExercise[],
    id?: string,
    coverImageUrl?: string | null,
    tags?: string[],
  ) => Promise<boolean>
}) {
  const [name, setName] = useState("")
  const [exercises, setExercises] = useState<TemplateExercise[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [showPicker, setShowPicker] = useState(false)
  const [machinePickerExId, setMachinePickerExId] = useState<string | null>(null)
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)
  const [coverUploading, setCoverUploading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  /** Only re-hydrate from `initial` when the dialog opens or the template id changes â€” not when `initial` is a new object reference for the same row (that was wiping tag edits). */
  const hydratedTemplateIdRef = useRef<string | null>(null)
  const isEdit = Boolean(initial?.id && !importAsNew)

  useEffect(() => {
    if (!open) {
      hydratedTemplateIdRef.current = null
      setSaveError(null)
      return
    }
    const templateId = hydrationKey ?? initial?.id ?? "new"
    if (hydratedTemplateIdRef.current === templateId) return
    hydratedTemplateIdRef.current = templateId

    setName(initial?.name ?? "")
    setExercises(
      initial
        ? parseExercises<TemplateExercise>(initial.exercises).map(migrateTemplateExercise)
        : [],
    )
    setTags(parseTemplateTags(initial?.tags))
    setTagInput("")
    setCoverImageUrl(initial?.coverImageUrl?.trim() ? initial.coverImageUrl.trim() : null)
  }, [open, initial, hydrationKey])

  useEffect(() => {
    if (!open || showPicker) return
    const t = setTimeout(() => nameInputRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [open, showPicker])

  /** Keep page from scrolling behind the routine flow (dialog + exercise picker swap). */
  useEffect(() => {
    if (!open) return undefined
    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
    }
    html.style.overflow = "hidden"
    html.style.overscrollBehavior = "contain"
    body.style.overflow = "hidden"
    return () => {
      html.style.overflow = prev.htmlOverflow
      html.style.overscrollBehavior = prev.htmlOverscroll
      body.style.overflow = prev.bodyOverflow
    }
  }, [open])

  function addExercise(picked: PickedExercise) {
    setExercises((prev) => [
      ...prev,
      {
        id: uid(),
        name: picked.name,
        notes: "",
        primaryMuscles: picked.primaryMuscles,
        ...machineSelectionFromPick(
          getRememberedMachine(picked.name) ?? { machineId: null, machineName: null },
        ),
        setRows: [
          { id: uid(), reps: "8-12", weight: "" },
          { id: uid(), reps: "8-12", weight: "" },
          { id: uid(), reps: "8-12", weight: "" },
        ],
      },
    ])
  }

  function setTemplateMachine(exId: string, selection: MachineSelection) {
    const next = machineSelectionFromPick(selection)
    setExercises((prev) =>
      prev.map((e) =>
        e.id !== exId
          ? e
          : { ...e, machineId: next.machineId, machineName: next.machineName },
      ),
    )
  }

  const templateMachineExercise =
    machinePickerExId != null
      ? exercises.find((e) => e.id === machinePickerExId) ?? null
      : null

  function removeExercise(id: string) {
    setExercises((prev) => prev.filter((e) => e.id !== id))
  }

  function updateTemplateSetRow(
    exId: string,
    rowId: string,
    field: "weight" | "reps",
    value: string,
  ) {
    setExercises((prev) =>
      prev.map((e) =>
        e.id !== exId
          ? e
          : {
              ...e,
              setRows: e.setRows.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)),
            },
      ),
    )
  }

  function addTemplateSetRow(exId: string) {
    setExercises((prev) =>
      prev.map((e) => {
        if (e.id !== exId) return e
        const last = e.setRows[e.setRows.length - 1]
        return {
          ...e,
          setRows: [
            ...e.setRows,
            {
              id: uid(),
              reps: last?.reps ?? "10",
              weight: last?.weight ?? "",
            },
          ],
        }
      }),
    )
  }

  function removeTemplateSetRow(exId: string, rowId: string) {
    setExercises((prev) =>
      prev.map((e) => {
        if (e.id !== exId || e.setRows.length <= 1) return e
        return { ...e, setRows: e.setRows.filter((r) => r.id !== rowId) }
      }),
    )
  }

  function tagKey(t: string) {
    return t.toLowerCase()
  }

  function togglePresetTag(label: string) {
    setTags((prev) => {
      const k = tagKey(label)
      if (prev.some((t) => tagKey(t) === k)) {
        return prev.filter((t) => tagKey(t) !== k)
      }
      if (prev.length >= 12) return prev
      return [...prev, label]
    })
  }

  function addTagFromInput() {
    const t = tagInput.trim().slice(0, 40)
    if (!t) return
    setTags((prev) => {
      if (prev.some((x) => tagKey(x) === tagKey(t))) return prev
      if (prev.length >= 12) return prev
      return [...prev, t]
    })
    setTagInput("")
  }

  function removeTag(label: string) {
    setTags((prev) => prev.filter((x) => tagKey(x) !== tagKey(label)))
  }

  async function handleCoverFile(file: File | null) {
    if (!file) return
    setCoverUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await apiFetch("/api/workout-templates/cover", { method: "POST", body: fd })
      if (!res.ok) return
      const data = (await res.json()) as { url?: string }
      const url = typeof data.url === "string" ? data.url : ""
      if (!url.startsWith("/uploads/routine-covers/")) return
      if (
        coverImageUrl?.startsWith("/uploads/routine-covers/") &&
        coverImageUrl !== initial?.coverImageUrl
      ) {
        await apiFetch(`/api/workout-templates/cover?url=${encodeURIComponent(coverImageUrl)}`, {
          method: "DELETE",
        }).catch(() => {})
      }
      setCoverImageUrl(url)
    } finally {
      setCoverUploading(false)
      if (coverInputRef.current) coverInputRef.current.value = ""
    }
  }

  return (
    <>
      <Dialog open={open && !showPicker} onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          showCloseButton
          className={cn(
            "glass-frost flex min-h-0 w-[min(100%,calc(100vw-1rem))] max-w-lg flex-col gap-0 overflow-hidden overscroll-contain p-0",
            "max-h-[min(88dvh,calc(100dvh-1rem))] sm:max-h-[85vh]",
            "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3",
          )}
        >
          <div className="shrink-0 border-b border-border/15 px-4 pb-3 pt-4 pr-12">
            <DialogHeader className="space-y-0">
              <DialogTitle>{isEdit ? "Edit Routine" : "New Routine"}</DialogTitle>
              <DialogDescription className="sr-only">
                {importAsNew
                  ? "Review exercises from your workout and save as a reusable routine"
                  : "Name your routine and add exercises from the library"}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="shrink-0 px-4 pb-3 pt-3">
            <Input
              ref={nameInputRef}
              placeholder="Routine name (e.g. Push Day)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 border-primary/15 bg-background/40 text-base sm:text-sm"
            />
          </div>

          <div className="shrink-0 space-y-2 border-b border-border/10 px-4 pb-3">
            <p className="text-[10px] font-medium text-muted-foreground/75">
              Tags
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ROUTINE_TAG_PRESETS.map((preset) => {
                const on = tags.some((t) => tagKey(t) === tagKey(preset))
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => togglePresetTag(preset)}
                    className={cn(
                      "rounded-lg px-2 py-2 text-[10px] font-medium leading-snug tracking-normal transition-colors touch-manipulation sm:py-1.5 sm:text-[11px]",
                      on
                        ? "bg-cyan-500/25 text-cyan-950 ring-1 ring-cyan-600/45 dark:bg-cyan-400/22 dark:text-cyan-50 dark:ring-cyan-300/45"
                        : "bg-muted/25 text-muted-foreground hover:bg-muted/40 hover:text-foreground/90 active:bg-muted/50",
                    )}
                  >
                    {preset}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add tag…"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addTagFromInput()
                  }
                }}
                className="h-9 flex-1 border-primary/15 bg-background/40 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 touch-manipulation"
                onClick={() => addTagFromInput()}
              >
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {tags.map((t) => (
                  <span
                    key={t + tagKey(t)}
                    className="inline-flex items-center gap-0.5 rounded-md border border-cyan-600/30 bg-cyan-500/15 py-0.5 pl-2 pr-0.5 text-[10px] font-medium leading-snug text-cyan-950 dark:border-cyan-300/35 dark:bg-cyan-400/15 dark:text-cyan-50 sm:text-[11px]"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="rounded p-0.5 text-cyan-800/70 hover:bg-cyan-500/20 hover:text-cyan-950 dark:text-cyan-100/70 dark:hover:bg-cyan-400/25 dark:hover:text-cyan-50 touch-manipulation"
                      aria-label={`Remove ${t}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 space-y-2 px-4 pb-3 pt-3">
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void handleCoverFile(e.target.files?.[0] ?? null)}
            />
            <div className="relative aspect-[16/9] max-h-[132px] overflow-hidden rounded-xl border border-border/15 bg-muted/15">
              {coverImageUrl ? (
                <>
                  <img
                    src={coverImageUrl}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-black/55 to-transparent p-2 pt-8">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 touch-manipulation border-0 bg-white/90 text-foreground hover:bg-white"
                      disabled={coverUploading}
                      onClick={() => coverInputRef.current?.click()}
                    >
                      Change
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 touch-manipulation border-0 bg-white/15 text-white hover:bg-white/25"
                      disabled={coverUploading}
                      onClick={() => setCoverImageUrl(null)}
                    >
                      Remove
                    </Button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  disabled={coverUploading}
                  onClick={() => coverInputRef.current?.click()}
                  className="flex size-full min-h-[104px] w-full flex-col items-center justify-center gap-1.5 px-4 text-muted-foreground/70 transition-colors hover:bg-muted/25 hover:text-muted-foreground disabled:opacity-50 touch-manipulation"
                >
                  {coverUploading ? (
                    <span className="text-xs">Uploading…</span>
                  ) : (
                    <>
                      <ImagePlus className="size-7 opacity-60" />
                      <span className="text-xs font-medium">Add cover image</span>
                      <span className="text-[10px] text-muted-foreground/50">JPEG, PNG, or WebP · up to 8 MB</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2",
              "scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:size-0",
            )}
          >
            {exercises.length === 0 && (
              <p className="px-4 pt-1 pb-2 text-center text-sm text-muted-foreground/70">
                Add exercises to build this routine
              </p>
            )}

            {exercises.map((ex, i) => {
              const swatch = muscleSwatchStyles(ex.primaryMuscles?.[0]?.color)
              return (
                <div
                  key={ex.id}
                  className="flex gap-3 border-b border-border/10 px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/25 sm:py-2.5"
                >
                  <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                    <div
                      className="flex size-9 items-center justify-center rounded-lg sm:size-8"
                      style={{ backgroundColor: swatch.soft }}
                    >
                      <div
                        className="size-2 rounded-full"
                        style={{ backgroundColor: swatch.dot }}
                      />
                    </div>
                    <span className="text-[9px] font-bold tabular-nums text-muted-foreground/45">
                      {i + 1}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{ex.name}</p>
                    {ex.primaryMuscles && ex.primaryMuscles.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {ex.primaryMuscles.map((m) => (
                          <span
                            key={m.code}
                            className="rounded px-1.5 py-0.5 text-[9px] font-medium"
                            style={{ backgroundColor: `${m.color}22`, color: m.color }}
                          >
                            {m.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {supportsMachineSelection(ex) ? (
                      <button
                        type="button"
                        onClick={() => setMachinePickerExId(ex.id)}
                        className={cn(
                          "mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[9px] font-bold uppercase tracking-wide transition-colors touch-manipulation active:scale-[0.98]",
                          ex.machineId
                            ? "border-primary/20 bg-primary/[0.07] text-foreground/85 hover:bg-primary/[0.12]"
                            : "border-dashed border-border/35 text-muted-foreground/55 hover:border-primary/30 hover:text-primary/85",
                        )}
                        aria-label={
                          ex.machineId
                            ? `Change machine — currently ${machineLabel(ex.machineId, ex.machineName) ?? "selected"}`
                            : `Choose a machine for ${ex.name}`
                        }
                      >
                        {ex.machineId ? (
                          <>
                            <MachineBrandMark
                              machineId={ex.machineId}
                              machineName={ex.machineName}
                              size="xs"
                              variant="plate"
                            />
                            <span className="truncate">
                              {machineLabel(ex.machineId, ex.machineName)}
                            </span>
                          </>
                        ) : (
                          <>
                            <Plus className="size-2.5" aria-hidden />
                            <span>Machine</span>
                          </>
                        )}
                      </button>
                    ) : null}
                    <div className="mt-2 space-y-1">
                      <div className="grid grid-cols-[1.75rem_1fr_1fr_1.75rem] items-center gap-1 px-0.5">
                        <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground/45 text-center">
                          #
                        </span>
                        <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground/45 text-center">
                          lb
                        </span>
                        <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground/45 text-center">
                          Reps
                        </span>
                        <span className="sr-only">Remove</span>
                      </div>
                      {ex.setRows.map((row, si) => (
                        <div
                          key={row.id}
                          className="grid grid-cols-[1.75rem_1fr_1fr_1.75rem] items-center gap-1"
                        >
                          <span className="text-center text-[10px] font-bold tabular-nums text-muted-foreground/50">
                            {si + 1}
                          </span>
                          <Input
                            className="h-8 border-primary/15 bg-background/40 px-1.5 text-center text-xs tabular-nums"
                            inputMode="decimal"
                            placeholder="—"
                            value={row.weight}
                            onChange={(e) =>
                              updateTemplateSetRow(ex.id, row.id, "weight", e.target.value)
                            }
                          />
                          <Input
                            className="h-8 border-primary/15 bg-background/40 px-1.5 text-center text-xs"
                            placeholder="10"
                            value={row.reps}
                            onChange={(e) =>
                              updateTemplateSetRow(ex.id, row.id, "reps", e.target.value)
                            }
                          />
                          <button
                            type="button"
                            disabled={ex.setRows.length <= 1}
                            onClick={() => removeTemplateSetRow(ex.id, row.id)}
                            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground/35 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:pointer-events-none disabled:opacity-25 touch-manipulation"
                            aria-label={`Remove set ${si + 1}`}
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addTemplateSetRow(ex.id)}
                        className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border/25 py-1.5 text-[10px] font-medium text-muted-foreground/60 transition-colors hover:bg-muted/20 hover:text-muted-foreground touch-manipulation"
                      >
                        <Plus className="size-3" />
                        Add set
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExercise(ex.id)}
                    className="h-9 shrink-0 self-start rounded-lg p-2 text-muted-foreground/40 transition-colors hover:bg-red-500/10 hover:text-red-400 touch-manipulation"
                    aria-label={`Remove ${ex.name}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )
            })}

            <div className="px-4 pt-1">
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/30 py-3 text-sm text-muted-foreground/60 transition-colors hover:bg-muted/15 hover:text-muted-foreground touch-manipulation"
              >
                <Plus className="size-4" />
                Add exercise
              </button>
            </div>
          </div>

          <div className="shrink-0 border-t border-border/15 px-4 py-3 pb-[max(1rem,calc(0.75rem+env(safe-area-inset-bottom)))]">
            {saveError && (
              <p className="mb-2 text-center text-xs text-destructive" role="alert">
                {saveError}
              </p>
            )}
            <Button
              variant="glass"
              className="w-full press-scale"
              size="lg"
              disabled={!name.trim() || exercises.length === 0}
              onClick={async () => {
                setSaveError(null)
                const tagPayload = [...tags]
                const ok = await onSave(
                  name.trim(),
                  exercises.map(templateExerciseToPersist),
                  isEdit ? initial?.id : undefined,
                  coverImageUrl,
                  tagPayload,
                )
                if (ok) onClose()
                else
                  setSaveError(
                    "Could not save this routine. If it keeps failing, check the browser network tab for the /api/workout-templates response.",
                  )
              }}
            >
              {isEdit ? "Save Changes" : "Create Routine"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {templateMachineExercise ? (
        <MachinePickerDialog
          open
          onClose={() => setMachinePickerExId(null)}
          exerciseName={templateMachineExercise.name}
          value={{
            machineId: templateMachineExercise.machineId ?? null,
            machineName: templateMachineExercise.machineName ?? null,
          }}
          onSelect={(selection) =>
            setTemplateMachine(templateMachineExercise.id, selection)
          }
        />
      ) : null}

      <ExercisePicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(picked) => addExercise(picked)}
      />
    </>
  )
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Active Workout Component
   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function ActiveWorkout({
  session,
  onUpdate,
  onFinish,
  onDiscard,
  actionError,
  previousSessions,
  templateId,
  onRememberSubstitution,
  weekStart,
  weekEnd,
  trainingStyle,
  trainingSplit,
}: {
  session: WorkoutSession
  onUpdate: (
    exercises: SessionExercise[],
    name?: string,
    bodyWeightLb?: number | null,
  ) => void
  onFinish: () => Promise<void>
  onDiscard: () => Promise<void>
  actionError?: string | null
  previousSessions: WorkoutSession[]
  templateId?: string | null
  onRememberSubstitution?: (input: {
    templateExerciseId?: string
    fromName: string
    toName: string
  }) => void
  weekStart: string
  weekEnd: string
  trainingStyle: TrainingStyle
  trainingSplit: TrainingSplit
}) {
  const { activeDate } = useActiveDate()
  const { setFullscreen } = useFullscreenOverlay()
  const exercises = normalizeWorkoutSessionExercises<SessionExercise>(session.exercises)
  const exercisesRef = useRef(exercises)
  exercisesRef.current = exercises
  const [showPicker, setShowPicker] = useState(false)
  const [confirmEndAction, setConfirmEndAction] = useState<
    null | "discard" | "finish"
  >(null)
  const [ending, setEnding] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [exerciseMenuOpen, setExerciseMenuOpen] = useState(false)
  const [removeArmed, setRemoveArmed] = useState(false)
  /** Movement the lifter jumped to from the overview; overrides the queue until cleared. */
  const [pinnedExerciseId, setPinnedExerciseId] = useState<string | null>(null)
  const [lastLoggedSetId, setLastLoggedSetId] = useState<string | null>(null)
  /** Hard set whose row is asking "how hard was that?" before it's logged. */
  const [effortTarget, setEffortTarget] = useState<{ exId: string; setId: string } | null>(null)
  const [effortFlags, setEffortFlags] = useState({ technique: false, pain: false })
  const [restFlash, setRestFlash] = useState(false)
  const restFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [freeFormSplit, setFreeFormSplit] = useState<WorkoutFocus | null>(null)
  const [freeFormBusy, setFreeFormBusy] = useState(false)
  const [freeFormError, setFreeFormError] = useState<string | null>(null)
  const [restConfig, setRestConfig] =
    useState<WorkoutRestConfig>(DEFAULT_WORKOUT_REST)
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  /** Total seconds for the current rest (config at start, +15s bumps this) â€” drives progress bar. */
  const [restTotalSec, setRestTotalSec] = useState(DEFAULT_WORKOUT_REST.seconds)
  const [, setRestTick] = useState(0)
  const [restSheetOpen, setRestSheetOpen] = useState(false)
  /** Survives dialog close racing React state â€” see swap picker `onClose` / `onSelect`. */
  const swapTargetRef = useRef<string | null>(null)
  const [swapExerciseId, setSwapExerciseId] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [collapsedExerciseIds, setCollapsedExerciseIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [skippedExerciseIds, setSkippedExerciseIds] = useState<string[]>([])
  /** Movements whose completion overview the user has acknowledged with "Continue". */
  const [ackedSummaryIds, setAckedSummaryIds] = useState<Set<string>>(
    () => new Set(),
  )
  /** Movement whose sets are being edited from the completion overview. */
  const [summaryEditExId, setSummaryEditExId] = useState<string | null>(null)
  const [displayedExerciseId, setDisplayedExerciseId] = useState<string | null>(
    null,
  )
  const [cardPhase, setCardPhase] = useState<"idle" | "out" | "in" | "celebrate">(
    "idle",
  )
  const cardTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const weighInPrefilledRef = useRef(false)
  const setSwipeDragRef = useRef<{
    pointerId: number
    key: string
    exId: string
    setId: string
    startX: number
  } | null>(null)
  const [setSwipeVisual, setSetSwipeVisual] = useState<{ key: string; dx: number } | null>(null)
  const [plateCalcTarget, setPlateCalcTarget] = useState<{
    exId: string
    setId: string
    weight: number | null
  } | null>(null)
  const [machinePickerExId, setMachinePickerExId] = useState<string | null>(null)

  useEffect(() => {
    const start = new Date(session.startedAt).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [session.startedAt])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    setFullscreen(true)
    return () => setFullscreen(false)
  }, [setFullscreen])

  useEffect(() => {
    setRestConfig(loadWorkoutRestConfig())
  }, [])

  useEffect(() => {
    if (restEndsAt == null) return
    const id = window.setInterval(() => {
      if (Date.now() < restEndsAt) {
        setRestTick((t) => t + 1)
        return
      }
      setRestEndsAt(null)
      setRestFlash(true)
      navigator.vibrate?.([80, 40, 80])
      if (restFlashTimerRef.current != null) clearTimeout(restFlashTimerRef.current)
      restFlashTimerRef.current = setTimeout(() => setRestFlash(false), 2600)
    }, 250)
    return () => clearInterval(id)
  }, [restEndsAt])

  useEffect(() => {
    const list = normalizeWorkoutSessionExercises<SessionExercise>(session.exercises)
    const ids = new Set(list.map((ex) => ex.id))
    const c = new Set<string>()
    for (const ex of list) {
      if (ex.sets.length > 0 && ex.sets.every((s) => s.completed)) c.add(ex.id)
    }
    const saved = loadActiveWorkoutUiState(session.id)
    setCollapsedExerciseIds(c)
    setSkippedExerciseIds(saved ? saved.skipped.filter((id) => ids.has(id)) : [])
    /* Movements already fully complete when the session loads (e.g. reopening) skip the overview. */
    setAckedSummaryIds(new Set([...c, ...(saved?.acked ?? [])]))
    setPinnedExerciseId(saved?.pinned && ids.has(saved.pinned) ? saved.pinned : null)
    if (saved?.restEndsAt != null && saved.restEndsAt > Date.now()) {
      setRestEndsAt(saved.restEndsAt)
      setRestTotalSec(saved.restTotalSec ?? DEFAULT_WORKOUT_REST.seconds)
    } else {
      setRestEndsAt(null)
    }
    setSummaryEditExId(null)
    setDisplayedExerciseId(null)
    setCardPhase("idle")
    weighInPrefilledRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once per session, not on every edit
  }, [session.id])

  useEffect(() => {
    return () => {
      if (cardTransitionTimerRef.current != null) {
        clearTimeout(cardTransitionTimerRef.current)
      }
      if (restFlashTimerRef.current != null) clearTimeout(restFlashTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (weighInPrefilledRef.current) return
    if (session.bodyWeightLb != null && Number.isFinite(session.bodyWeightLb)) return
    let cancelled = false
    void apiFetch(`/api/weigh-in?d=${encodeURIComponent(activeDate)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then(
        (data: {
          latestEntry?: { value: number } | null
          unit?: string
        }) => {
          if (cancelled || weighInPrefilledRef.current) return
          const v = data.latestEntry?.value
          if (v == null || !Number.isFinite(v)) return
          const lb = goalWeightToLb(v, data.unit)
          if (!Number.isFinite(lb) || lb <= 0) return
          const rounded = Math.round(lb * 10) / 10
          weighInPrefilledRef.current = true
          onUpdate(exercisesRef.current, undefined, rounded)
        },
      )
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onUpdate is stable enough; avoid refetch loops
  }, [session.id, session.bodyWeightLb, activeDate])

  /**
   * Most recent completed session wins per movement. Indexed twice: by movement
   * + machine (so switching machines shows that machine's own numbers and never
   * mixes weight stacks) and by movement alone (so movements logged before
   * machines existed, or without one, keep their original behaviour).
   */
  const previousIndex = useMemo(() => {
    const byKey = new Map<string, ExerciseSet[]>()
    const byName = new Map<string, ExerciseSet[]>()
    const completed = previousSessions
      .filter((s) => s.status === "completed" && s.id !== session.id)
      .sort((a, b) => {
        const ta = new Date(a.finishedAt ?? a.startedAt).getTime()
        const tb = new Date(b.finishedAt ?? b.startedAt).getTime()
        return tb - ta
      })
    for (const s of completed) {
      const exs = normalizeWorkoutSessionExercises<SessionExercise>(s.exercises)
      for (const ex of exs) {
        const nameKey = ex.name.toLowerCase()
        /* Full set history (not only checkbox-completed) for progressive overload */
        if (!byName.has(nameKey)) byName.set(nameKey, ex.sets)
        const machineKey = exerciseMachineKey(ex.name, ex.machineId, ex.machineName)
        if (!byKey.has(machineKey)) byKey.set(machineKey, ex.sets)
      }
    }
    return { byKey, byName }
  }, [previousSessions, session.id])

  const prevSetsFor = useMemo(() => {
    return (ex: SessionExercise): ExerciseSet[] | undefined => {
      const exact = previousIndex.byKey.get(
        exerciseMachineKey(ex.name, ex.machineId, ex.machineName),
      )
      if (exact) return exact
      /* A machine was chosen: only that machine's history is comparable. */
      if (ex.machineId) return undefined
      return (
        previousIndex.byName.get(ex.name.toLowerCase()) ??
        (ex.originalName
          ? previousIndex.byName.get(ex.originalName.toLowerCase())
          : undefined)
      )
    }
  }, [previousIndex])

  /** Pre-filled from last session â€” muted until user edits weight/reps. */
  const [ghostSetIds, setGhostSetIds] = useState<Set<string>>(() => new Set())
  const touchedSetIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const saved = loadActiveWorkoutUiState(session.id)
    touchedSetIdsRef.current = new Set(saved?.touched ?? [])
    setGhostSetIds(new Set(saved?.ghost ?? []))
  }, [session.id])

  /* The first pass for a session still holds pre-restore defaults; saving them
     would clobber storage before a StrictMode re-run of the restore reads it. */
  const uiStateArmedRef = useRef<string | null>(null)
  useEffect(() => {
    if (uiStateArmedRef.current !== session.id) {
      uiStateArmedRef.current = session.id
      return
    }
    saveActiveWorkoutUiState(session.id, {
      skipped: skippedExerciseIds,
      acked: [...ackedSummaryIds],
      pinned: pinnedExerciseId,
      restEndsAt,
      restTotalSec,
      touched: [...touchedSetIdsRef.current],
      ghost: [...ghostSetIds],
    })
  }, [
    session.id,
    session.exercises,
    skippedExerciseIds,
    ackedSummaryIds,
    pinnedExerciseId,
    restEndsAt,
    restTotalSec,
    ghostSetIds,
  ])

  const exerciseCount = exercises.length
  const setCountSig = exercises.reduce((n, ex) => n + ex.sets.length, 0)
  /* Re-plan when a machine changes: the prefill for the new machine is not the
     same as the old one's, and set counts alone would not notice. */
  const machineSig = exercises
    .map((ex) => `${ex.id}:${ex.machineId ?? ""}:${ex.machineName ?? ""}`)
    .join("|")

  /* Latched per session so an explicit "No specific machine" is never fought. */
  const machineDefaultsRef = useRef<string | null>(null)

  // onUpdate omitted from deps: parent passes a new function each render; session.exercises omitted to avoid re-running on every keystroke.
  useEffect(() => {
    const base = normalizeWorkoutSessionExercises<SessionExercise>(session.exercises)
    /* Default each machine-capable movement to the machine last used for it, so
       walking in the door on a different day already lands on your usual rig.
       Done inside this effect (rather than its own) so the coach's prefill below
       is planned for that machine instead of overwriting the choice. */
    const shouldApplyDefaults =
      machineDefaultsRef.current !== session.id && base.length > 0
    if (shouldApplyDefaults) machineDefaultsRef.current = session.id
    const list = shouldApplyDefaults
      ? base.map((ex) => {
          if (ex.machineId || ex.machineName) return ex
          if (!supportsMachineSelection(ex)) return ex
          const remembered = getRememberedMachine(ex.name)
          if (!remembered?.machineId) return ex
          return {
            ...ex,
            machineId: remembered.machineId,
            machineName: remembered.machineName,
          }
        })
      : base

    const { updated, ghost } = applyCoachPlan(list, {
      sessions: previousSessions as unknown as PoSession[],
      sessionId: session.id,
      trainingStyle,
      /* Read on the fly rather than from state: the coach writes preference
         changes straight to localStorage, and this effect re-runs after them. */
      prefs: loadProgressionPrefs(),
      prevSets: prevSetsFor,
      touched: touchedSetIdsRef.current,
    })
    const changed = updated.some(
      (ex, ei) =>
        ex.machineId !== base[ei].machineId ||
        ex.machineName !== base[ei].machineName ||
        ex.sets.some(
          (s, si) =>
            s.weight !== base[ei].sets[si].weight ||
            s.reps !== base[ei].sets[si].reps,
        ),
    )
    if (!changed) return
    setGhostSetIds((prev) => new Set([...prev, ...ghost]))
    onUpdate(updated)
    // previousSessions omitted: prevSetsFor is derived from it and memoized,
    // so depending on the raw array would re-plan on every parent render.
  }, [session.id, prevSetsFor, trainingStyle, exerciseCount, setCountSig, machineSig])

  function addExercise(picked: PickedExercise) {
    const setTarget = TRAINING_STYLE_DEFINITIONS[trainingStyle].workingSetTarget ?? 1
    const machine = machineSelectionFromPick(
      getRememberedMachine(picked.name) ?? { machineId: null, machineName: null },
    )
    const updated: SessionExercise[] = [
      ...exercises,
      {
        id: uid(),
        name: picked.name,
        notes: "",
        primaryMuscles: picked.primaryMuscles,
        secondaryMuscles: picked.secondaryMuscles,
        category: picked.category,
        machineId: machine.machineId,
        machineName: machine.machineName,
        sets: Array.from({ length: setTarget }, (_, index) => ({
            id: uid(),
            setNumber: index + 1,
            weight: null,
            reps: null,
            type: "working",
            completed: false,
          })),
      },
    ]
    onUpdate(updated)
  }

  async function generateFreeFormWorkout(focus: WorkoutFocus) {
    if (freeFormBusy) return
    setFreeFormBusy(true)
    setFreeFormError(null)
    setFreeFormSplit(focus)
    try {
      let library = exerciseListCache
      if (!library || library.length === 0) {
        const res = await apiFetch("/api/exercise-library", { cache: "no-store" })
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          exerciseListCache = data
          library = data
        } else {
          library = FALLBACK_EXERCISES
        }
      }
      const recs = recommendFreeFormWorkout({
        library,
        sessions: previousSessions,
        split: focus === "lower" || focus === "legs" ? "lower" : "upper",
        focus,
        weekStart,
        weekEnd,
        count: 5,
      })
      if (recs.length === 0) {
        setFreeFormError("Couldn’t build a session from your library — add exercises manually.")
        return
      }
      const next: SessionExercise[] = recs.map((r) => ({
        id: uid(),
        name: r.name,
        notes: "",
        primaryMuscles: r.primaryMuscles,
        secondaryMuscles: r.secondaryMuscles,
        category: r.category,
        ...machineSelectionFromPick(
          getRememberedMachine(r.name) ?? { machineId: null, machineName: null },
        ),
        sets: defaultFreeFormSets(
          TRAINING_STYLE_DEFINITIONS[trainingStyle].workingSetTarget ?? 3,
        ).map((s) => ({ ...s, id: uid() })),
      }))
      const focusDefinition = trainingSplitFocuses(trainingSplit).find((option) => option.id === focus)
      onUpdate(next, `${focusDefinition?.label ?? "Free-form"} workout`)
    } catch {
      setFreeFormError("Something went wrong building this workout. Try again.")
    } finally {
      setFreeFormBusy(false)
    }
  }

  function swapExercise(exId: string, picked: PickedExercise) {
    const list = exercisesRef.current
    const current = list.find((ex) => ex.id === exId)
    const fromName = current?.originalName || current?.name || ""
    const newExId = uid()
    const updated = list.map((ex) => {
      if (ex.id !== exId) return ex
      const n = Math.max(1, ex.sets.length)
      const sets: ExerciseSet[] = Array.from({ length: n }, (_, i) => ({
        id: uid(),
        setNumber: i + 1,
        weight: null,
        reps: null,
        type: "working",
        completed: false,
      }))
      return {
        id: newExId,
        name: picked.name,
        notes: "",
        primaryMuscles: picked.primaryMuscles,
        secondaryMuscles: picked.secondaryMuscles,
        category: picked.category,
        ...machineSelectionFromPick(
          getRememberedMachine(picked.name) ?? { machineId: null, machineName: null },
        ),
        sets,
        templateExerciseId: ex.templateExerciseId,
        originalName: ex.originalName || ex.name,
      }
    })
    setCollapsedExerciseIds((p) => {
      const next = new Set(p)
      next.delete(exId)
      return next
    })
    setDisplayedExerciseId(newExId)
    if (fromName && picked.name && fromName.toLowerCase() !== picked.name.toLowerCase()) {
      rememberSubstitution({
        fromName,
        toName: picked.name,
        templateId,
        templateExerciseId: current?.templateExerciseId,
      })
      onRememberSubstitution?.({
        templateExerciseId: current?.templateExerciseId,
        fromName,
        toName: picked.name,
      })
    }
    onUpdate(updated)
  }

  /**
   * Attach a machine to a movement (or clear it). Switching machines wipes the
   * un-logged rows so the coach can prefill the new machine's own weight — the
   * old stack's numbers would be meaningless here. Completed sets are kept as
   * logged, because they really were performed.
   */
  function setExerciseMachine(exId: string, selection: MachineSelection) {
    const next = machineSelectionFromPick(selection)
    const list = exercisesRef.current
    const target = list.find((ex) => ex.id === exId)
    if (!target) return
    if (
      (target.machineId ?? null) === next.machineId &&
      (target.machineName ?? null) === next.machineName
    ) {
      return
    }
    rememberMachineSelection({
      exerciseName: target.name,
      machineId: next.machineId,
      machineName: next.machineName,
    })
    const clearedIds = new Set<string>()
    const updated = list.map((ex) => {
      if (ex.id !== exId) return ex
      return {
        ...ex,
        machineId: next.machineId,
        machineName: next.machineName,
        sets: ex.sets.map((s) => {
          if (s.completed) return s
          clearedIds.add(s.id)
          return { ...s, weight: null, reps: null }
        }),
      }
    })
    for (const id of clearedIds) touchedSetIdsRef.current.delete(id)
    if (clearedIds.size > 0) {
      setGhostSetIds((prev) => {
        const copy = new Set(prev)
        for (const id of clearedIds) copy.delete(id)
        return copy
      })
    }
    onUpdate(updated)
  }

  function removeExercise(exId: string) {
    setCollapsedExerciseIds((p) => {
      const next = new Set(p)
      next.delete(exId)
      return next
    })
    setSkippedExerciseIds((prev) => prev.filter((id) => id !== exId))
    setPinnedExerciseId((cur) => (cur === exId ? null : cur))
    onUpdate(exercises.filter((e) => e.id !== exId))
  }

  function skipExercise(exId: string) {
    setPinnedExerciseId((cur) => (cur === exId ? null : cur))
    setSkippedExerciseIds((prev) => deferExercise(prev, exId))
  }

  function jumpToExercise(exId: string) {
    const list = exercisesRef.current
    const target = list.find((e) => e.id === exId)
    if (!target) return
    const showing = list.find((e) => e.id === displayedExerciseId) ?? null
    setAckedSummaryIds((prev) => {
      const next = new Set(prev)
      if (isExerciseComplete(target)) next.add(exId)
      /* Navigating away is an explicit choice — don't hold on the summary. */
      if (showing && isExerciseComplete(showing)) next.add(showing.id)
      return next
    })
    setSummaryEditExId(null)
    setPinnedExerciseId(exId === queue.current?.id ? null : exId)
    setOverviewOpen(false)
  }

  function addSet(exId: string) {
    setCollapsedExerciseIds((p) => {
      const next = new Set(p)
      next.delete(exId)
      return next
    })
    onUpdate(
      exercises.map((ex) => {
        if (ex.id !== exId) return ex
        const lastSet = ex.sets[ex.sets.length - 1]
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              id: uid(),
              setNumber: ex.sets.length + 1,
              weight: lastSet?.weight ?? null,
              reps: lastSet?.reps ?? null,
              type: "working",
              completed: false,
            },
          ],
        }
      }),
    )
  }

  function removeSet(exId: string, setId: string) {
    const updated = exercises.map((ex) => {
      if (ex.id !== exId) return ex
      const filtered = ex.sets.filter((s) => s.id !== setId)
      return {
        ...ex,
        sets: filtered.map((s, i) => ({ ...s, setNumber: i + 1 })),
      }
    })
    const exAfter = updated.find((e) => e.id === exId)
    if (
      !exAfter ||
      exAfter.sets.length === 0 ||
      !exAfter.sets.every((s) => s.completed)
    ) {
      setCollapsedExerciseIds((p) => {
        const next = new Set(p)
        next.delete(exId)
        return next
      })
    }
    onUpdate(updated)
  }

  function setSwipeRowKey(exId: string, setId: string) {
    return `${exId}:${setId}`
  }

  function onSetRowPointerDown(
    ex: SessionExercise,
    set: ExerciseSet,
    e: React.PointerEvent<HTMLDivElement>,
  ) {
    const t = e.target as HTMLElement
    if (t.closest("input, button")) return
    if (ex.sets.length <= 1) return
    const key = setSwipeRowKey(ex.id, set.id)
    setSwipeDragRef.current = {
      pointerId: e.pointerId,
      key,
      exId: ex.id,
      setId: set.id,
      startX: e.clientX,
    }
    setSetSwipeVisual({ key, dx: 0 })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onSetRowPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = setSwipeDragRef.current
    if (!r || e.pointerId !== r.pointerId) return
    const dx = Math.min(0, Math.max(-120, e.clientX - r.startX))
    setSetSwipeVisual({ key: r.key, dx })
  }

  function onSetRowPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const r = setSwipeDragRef.current
    const el = e.currentTarget as HTMLDivElement
    if (el.hasPointerCapture?.(e.pointerId)) {
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    if (!r || e.pointerId !== r.pointerId) {
      setSwipeDragRef.current = null
      setSetSwipeVisual(null)
      return
    }
    const dx = e.clientX - r.startX
    const { exId, setId } = r
    setSwipeDragRef.current = null
    setSetSwipeVisual(null)
    const ex = exercisesRef.current.find((x) => x.id === exId)
    if (dx < -64 && ex && ex.sets.length > 1) {
      removeSet(exId, setId)
    }
  }

  function updateSet(
    exId: string,
    setId: string,
    field: keyof ExerciseSet,
    value: unknown,
  ) {
    const ex = exercises.find((e) => e.id === exId)
    const setIndex = ex?.sets.findIndex((s) => s.id === setId) ?? -1
    const propagateWeight = field === "weight" && ex != null && setIndex >= 0
    const affectedSetIds = propagateWeight
      ? ex.sets.slice(setIndex).map((s) => s.id)
      : [setId]

    if (field === "weight" || field === "reps") {
      for (const id of affectedSetIds) touchedSetIdsRef.current.add(id)
      setGhostSetIds((prev) => {
        const next = new Set(prev)
        for (const id of affectedSetIds) next.delete(id)
        return next
      })
    }
    onUpdate(
      exercises.map((e) => {
        if (e.id !== exId) return e
        const idx = e.sets.findIndex((s) => s.id === setId)
        if (idx < 0) return e
        return {
          ...e,
          sets: e.sets.map((s, i) => {
            if (propagateWeight && i >= idx) {
              return { ...s, weight: value as number | null }
            }
            if (s.id === setId) return { ...s, [field]: value }
            return s
          }),
        }
      }),
    )
  }

  function clearGhostForSet(setId: string) {
    touchedSetIdsRef.current.add(setId)
    setGhostSetIds((prev) => {
      if (!prev.has(setId)) return prev
      const next = new Set(prev)
      next.delete(setId)
      return next
    })
  }

  function toggleSetComplete(exId: string, setId: string, effort?: SetEffortPatch) {
    const exBefore = exercises.find((e) => e.id === exId)
    const setBefore = exBefore?.sets.find((s) => s.id === setId)
    const wasCompleted = setBefore?.completed ?? false
    setEffortTarget(null)

    const updated = exercises.map((ex) => {
      if (ex.id !== exId) return ex
      return {
        ...ex,
        sets: ex.sets.map((s) => {
          if (s.id !== setId) return s
          if (s.completed) {
            return {
              ...s,
              completed: false,
              rir: null,
              rirSkipped: false,
              techniqueFlag: undefined,
              painFlag: undefined,
            }
          }
          return { ...s, completed: true, ...effort }
        }),
      }
    })
    const exAfter = updated.find((e) => e.id === exId)
    if (exAfter && exAfter.sets.length > 0 && exAfter.sets.every((s) => s.completed)) {
      setCollapsedExerciseIds((p) => new Set(p).add(exId))
    } else {
      setCollapsedExerciseIds((p) => {
        const next = new Set(p)
        next.delete(exId)
        return next
      })
    }
    if (wasCompleted) {
      setRestEndsAt(null)
      /* Re-opening a set re-arms the movement-complete overview. */
      setAckedSummaryIds((prev) => {
        if (!prev.has(exId)) return prev
        const next = new Set(prev)
        next.delete(exId)
        return next
      })
      setSummaryEditExId((cur) => (cur === exId ? null : cur))
    } else {
      setLastLoggedSetId(setId)
      setRestFlash(false)
      navigator.vibrate?.(12)
      if (restConfig.enabled) {
        const sec = restConfig.seconds
        setRestTotalSec(sec)
        setRestEndsAt(Date.now() + sec * 1000)
      }
    }
    onUpdate(updated)
  }

  function adjustRest(deltaSec: number) {
    if (restEndsAt == null) return
    const nextEnd = Math.max(Date.now() + 1000, restEndsAt + deltaSec * 1000)
    setRestEndsAt(nextEnd)
    setRestTotalSec((total) => Math.max(1, total + (nextEnd - restEndsAt) / 1000))
  }

  async function confirmEnd() {
    if (ending || confirmEndAction == null) return
    setEnding(true)
    try {
      if (confirmEndAction === "discard") await onDiscard()
      else await onFinish()
    } finally {
      setEnding(false)
      setConfirmEndAction(null)
    }
  }

  /** Progressive overload coach: record effort/flags on a logged set. */
  function updateSetEffort(exId: string, setId: string, patch: SetEffortPatch) {
    onUpdate(
      exercisesRef.current.map((ex) => {
        if (ex.id !== exId) return ex
        return {
          ...ex,
          sets: ex.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
        }
      }),
    )
  }

  /**
   * Progressive overload coach: write the next planned set's load and rep
   * target. Weight propagates down to later un-logged sets.
   *
   * `auto` marks a recommendation the coach applied on its own. It may overwrite
   * its own earlier suggestion (that's how a new target reaches the sheet after
   * you log a set) but never a number the user typed. Checking "is this cell
   * empty?" instead — the old rule — meant the very first pre-fill locked the
   * set and every later recommendation was silently dropped.
   */
  function applyRecToNextSet(
    exId: string,
    weight: number | null,
    reps: number | null,
    auto = false,
  ) {
    const ex = exercisesRef.current.find((e) => e.id === exId)
    if (!ex) return
    const idx = ex.sets.findIndex((s) => !s.completed)
    if (idx < 0) return
    const target = ex.sets[idx]
    const writable = (s: ExerciseSet) => !auto || !touchedSetIdsRef.current.has(s.id)
    if (!writable(target)) return
    const nextWeight = weight
    const nextReps = reps
    if (nextWeight == null && nextReps == null) return

    const affectedIds =
      nextWeight != null
        ? ex.sets.slice(idx).filter((s) => !s.completed && writable(s)).map((s) => s.id)
        : [target.id]
    if (auto) {
      /* Coach-written values stay muted until the user edits them. */
      setGhostSetIds((prev) => new Set([...prev, ...affectedIds]))
    } else {
      for (const id of affectedIds) touchedSetIdsRef.current.add(id)
      setGhostSetIds((prev) => {
        const next = new Set(prev)
        for (const id of affectedIds) next.delete(id)
        return next
      })
    }
    const affected = new Set(affectedIds)
    onUpdate(
      exercisesRef.current.map((e) => {
        if (e.id !== exId) return e
        return {
          ...e,
          sets: e.sets.map((s, i) => {
            if (i === idx) {
              return {
                ...s,
                ...(nextWeight != null ? { weight: nextWeight } : {}),
                ...(nextReps != null ? { reps: nextReps } : {}),
              }
            }
            if (nextWeight != null && i > idx && !s.completed && affected.has(s.id)) {
              return { ...s, weight: nextWeight }
            }
            return s
          }),
        }
      }),
    )
  }

  /** Progressive overload coach: append a clearly-optional extra working set. */
  function addOptionalSet(
    exId: string,
    weight: number | null,
    reps: number | null,
  ) {
    onUpdate(
      exercisesRef.current.map((ex) => {
        if (ex.id !== exId) return ex
        const last = ex.sets[ex.sets.length - 1]
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              id: uid(),
              setNumber: ex.sets.length + 1,
              weight: weight ?? last?.weight ?? null,
              reps: reps ?? last?.reps ?? null,
              type: "working" as const,
              completed: false,
              optionalSet: true,
            },
          ],
        }
      }),
    )
  }

  function cycleSetType(exId: string, setId: string) {
    const types: ExerciseSet["type"][] = [
      "working",
      "warmup",
      "dropset",
      "failure",
    ]
    onUpdate(
      exercises.map((ex) => {
        if (ex.id !== exId) return ex
        return {
          ...ex,
          sets: ex.sets.map((s) => {
            if (s.id !== setId) return s
            const i = types.indexOf(s.type)
            return { ...s, type: types[(i + 1) % types.length] }
          }),
        }
      }),
    )
  }

  const loggedVol = completedVolume(exercises)
  const queue = getActiveWorkoutQueue(exercises, skippedExerciseIds)
  const pinnedExercise =
    pinnedExerciseId != null ? exercises.find((e) => e.id === pinnedExerciseId) ?? null : null
  const targetExerciseId = pinnedExercise?.id ?? queue.current?.id ?? null
  const displayedExercise =
    displayedExerciseId != null
      ? exercises.find((e) => e.id === displayedExerciseId) ?? null
      : null
  const machinePickerExercise =
    machinePickerExId != null
      ? exercises.find((e) => e.id === machinePickerExId) ?? null
      : null

  /** Distinct machines this movement has been logged on, newest first. */
  const recentMachinesFor = useMemo(() => {
    return (name: string): string[] => {
      const wanted = name.trim().toLowerCase()
      const out: string[] = []
      const seen = new Set<string>()
      const completed = previousSessions
        .filter((s) => s.status === "completed")
        .sort(
          (a, b) =>
            new Date(b.finishedAt ?? b.startedAt).getTime() -
            new Date(a.finishedAt ?? a.startedAt).getTime(),
        )
      for (const s of completed) {
        for (const ex of normalizeWorkoutSessionExercises<SessionExercise>(s.exercises)) {
          if (ex.name.trim().toLowerCase() !== wanted) continue
          const id = ex.machineId
          if (!id || seen.has(id)) continue
          seen.add(id)
          out.push(id)
        }
      }
      return out
    }
  }, [previousSessions])

  useEffect(() => {
    if (cardTransitionTimerRef.current != null) {
      clearTimeout(cardTransitionTimerRef.current)
      cardTransitionTimerRef.current = null
    }

    /* Hold on a completed movement until its overview is acknowledged â€” never auto-advance. */
    if (displayedExerciseId != null) {
      const displayed =
        exercisesRef.current.find((e) => e.id === displayedExerciseId) ?? null
      if (
        displayed != null &&
        isExerciseComplete(displayed) &&
        !ackedSummaryIds.has(displayedExerciseId)
      ) {
        return
      }
    }

    if (targetExerciseId == null) {
      setDisplayedExerciseId(null)
      setCardPhase("idle")
      return
    }

    if (displayedExerciseId == null) {
      setDisplayedExerciseId(targetExerciseId)
      setCardPhase("in")
      cardTransitionTimerRef.current = setTimeout(() => setCardPhase("idle"), 450)
      return
    }

    if (targetExerciseId === displayedExerciseId) return

    const leaving =
      exercisesRef.current.find((e) => e.id === displayedExerciseId) ?? null
    const leavingComplete = leaving != null && isExerciseComplete(leaving)
    setCardPhase(leavingComplete ? "celebrate" : "out")

    cardTransitionTimerRef.current = setTimeout(() => {
      setDisplayedExerciseId(targetExerciseId)
      setCardPhase("in")
      cardTransitionTimerRef.current = setTimeout(() => setCardPhase("idle"), 450)
    }, leavingComplete ? 520 : 380)
  }, [targetExerciseId, displayedExerciseId, ackedSummaryIds])

  const restRemainingSec =
    restEndsAt == null
      ? null
      : Math.max(0, (restEndsAt - Date.now()) / 1000)
  const restCountdownActive =
    restRemainingSec != null && restRemainingSec > 0
  const restProgress =
    restRemainingSec != null &&
    restCountdownActive &&
    restTotalSec > 0
      ? Math.min(1, Math.max(0, 1 - restRemainingSec / restTotalSec))
      : 0
  const restUrgent = restCountdownActive && restRemainingSec != null && restRemainingSec <= 5

  const targetRir = TRAINING_STYLE_DEFINITIONS[trainingStyle].progressionOverrides?.targetRir ?? 2
  const ex = displayedExercise
  const displayedIndex = ex ? exercises.findIndex((e) => e.id === ex.id) : -1
  const exPrevSets = ex ? prevSetsFor(ex) : undefined
  const exComplete = ex ? isExerciseComplete(ex) : false
  const showMovementSummary =
    ex != null &&
    exComplete &&
    summaryEditExId !== ex.id &&
    !ackedSummaryIds.has(ex.id)
  const logSet = ex && !showMovementSummary ? ex.sets.find((s) => !s.completed) ?? null : null
  const viewingOffQueue =
    pinnedExercise != null && pinnedExercise.id !== queue.current?.id && queue.current != null
  const isDeferred =
    ex != null && queue.skippedPending.length > 0 && queue.skippedPending[0]?.id === ex.id
  const cardAnimClass =
    cardPhase === "out" || cardPhase === "celebrate"
      ? "animate-workout-card-exit"
      : cardPhase === "in"
        ? "animate-workout-card-enter"
        : ""
  const upNextLabel = logSet
    ? `Set ${logSet.setNumber} next`
    : queue.next
      ? `${queue.next.name} next`
      : "Last set done"

  function continueFromSummary(exId: string) {
    setAckedSummaryIds((prevIds) => new Set(prevIds).add(exId))
    setPinnedExerciseId((cur) => (cur === exId ? null : cur))
  }

  function copyPreviousIntoSet(exId: string, setId: string, prevSet: ExerciseSet) {
    touchedSetIdsRef.current.add(setId)
    setGhostSetIds((prev) => {
      if (!prev.has(setId)) return prev
      const next = new Set(prev)
      next.delete(setId)
      return next
    })
    onUpdate(
      exercisesRef.current.map((e) =>
        e.id !== exId
          ? e
          : {
              ...e,
              sets: e.sets.map((s) =>
                s.id === setId
                  ? { ...s, weight: prevSet.weight ?? s.weight, reps: prevSet.reps ?? s.reps }
                  : s,
              ),
            },
      ),
    )
  }

  function tapSetCheck(exId: string, set: ExerciseSet) {
    if (set.completed || (set.type !== "working" && set.type !== "failure")) {
      toggleSetComplete(exId, set.id)
      return
    }
    if (set.weight == null && set.reps == null) return
    setEffortFlags({ technique: false, pain: false })
    setEffortTarget({ exId, setId: set.id })
  }

  function logWithEffort(exId: string, setId: string, rir: number | null) {
    toggleSetComplete(
      exId,
      setId,
      rir == null
        ? { rir: null, rirSkipped: true }
        : {
            rir,
            rirSkipped: false,
            techniqueFlag: effortFlags.technique || undefined,
            painFlag: effortFlags.pain || undefined,
          },
    )
  }

  function openAddExercise() {
    setMenuOpen(false)
    setOverviewOpen(false)
    swapTargetRef.current = null
    setSwapExerciseId(null)
    setShowPicker(true)
  }

  function closeExerciseMenu() {
    setExerciseMenuOpen(false)
    setRemoveArmed(false)
  }

  const setInputClass =
    "h-12 min-h-12 rounded-xl border-white/[0.08] bg-white/[0.035] px-1 text-center text-[17px] font-semibold tabular-nums text-foreground shadow-none focus-visible:border-primary/50 focus-visible:bg-primary/[0.06] focus-visible:ring-primary/20"
  const setInputGhostClass = "border-dashed border-white/[0.12] bg-transparent text-muted-foreground/50"
  const sheetRowClass =
    "flex min-h-14 w-full items-center gap-3.5 border-b border-white/[0.06] py-3 text-left text-[15px] font-medium text-foreground transition-colors last:border-b-0 active:bg-white/[0.03] touch-manipulation"
  const loggedSets = queue.completedSets

  return (
    <>
      <div
        data-active-workout-shell=""
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-workout-heading"
        className="fixed inset-0 z-[120] flex h-[100dvh] min-h-[100svh] w-full flex-col overflow-hidden bg-[#05070a] sm:items-center sm:justify-center sm:bg-background/55 sm:p-4 sm:backdrop-blur-xl"
      >
        <div
          data-active-workout-surface=""
          className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#070a0e] sm:max-h-[min(92dvh,calc(100dvh-2rem))] sm:max-w-lg sm:flex-none sm:rounded-[1.75rem] sm:border sm:border-white/[0.1] sm:shadow-[0_26px_90px_rgba(0,0,0,0.72)]"
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_75%_90%_at_20%_0%,rgba(196,214,50,0.1),transparent_72%)]"
            aria-hidden
          />

          <header
            data-active-workout-header=""
            className="relative shrink-0 px-5 pb-3 pt-[max(0.9rem,calc(env(safe-area-inset-top)+0.35rem))]"
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => exercises.length > 0 && setOverviewOpen(true)}
                className="min-w-0 flex-1 text-left touch-manipulation"
                aria-label="Open exercise overview"
              >
                <span className="flex items-center gap-2">
                  <span className="status-dot scale-90" aria-hidden />
                  <span className="type-hud-micro text-primary/80">Live</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]",
                      trainingStyle === "classic"
                        ? "bg-amber-300/[0.08] text-amber-100/70"
                        : "bg-primary/[0.08] text-primary/75",
                    )}
                  >
                    {TRAINING_STYLE_DEFINITIONS[trainingStyle].shortLabel}
                  </span>
                </span>
                <h2
                  id="active-workout-heading"
                  className="mt-1 truncate font-heading text-[1.3rem] font-semibold leading-tight tracking-tight text-foreground"
                >
                  {session.name?.trim() || "Workout"}
                </h2>
              </button>
              <div className="shrink-0 text-right">
                <p className="font-heading text-[1.75rem] font-bold leading-none tabular-nums text-primary">
                  {formatTimer(elapsed)}
                </p>
                <p className="type-hud-micro mt-1 text-muted-foreground/45">Elapsed</p>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.03] text-foreground/80 transition-[background-color,transform] active:scale-95 touch-manipulation"
                aria-label="Workout options"
                aria-haspopup="dialog"
              >
                <MoreHorizontal className="size-5" aria-hidden />
              </button>
            </div>

            {exercises.length > 0 ? (
              <button
                type="button"
                onClick={() => setOverviewOpen(true)}
                className="mt-4 block w-full text-left touch-manipulation"
                aria-label={`${queue.completedSets} of ${queue.totalSets} sets complete. Open exercise overview`}
              >
                <span className="flex gap-1" aria-hidden>
                  {exercises.map((item) => {
                    const done = item.sets.filter((s) => s.completed).length
                    const pct = item.sets.length > 0 ? (done / item.sets.length) * 100 : 0
                    const shown = item.id === ex?.id
                    return (
                      <span
                        key={item.id}
                        className={cn(
                          "relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08] transition-[transform,background-color] duration-300",
                          shown && "scale-y-[1.35] bg-white/[0.14]",
                        )}
                      >
                        <span
                          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-500 ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    )
                  })}
                </span>
                <span className="mt-2 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground/60">
                  <span>
                    {queue.completedSets}/{queue.totalSets} sets · {queue.completedMovements}/
                    {queue.movementTotal} done
                  </span>
                  <span className="flex items-center gap-1">
                    {formatVolumeLb(loggedVol)} lb
                    <ChevronRight className="size-3.5 opacity-60" aria-hidden />
                  </span>
                </span>
              </button>
            ) : null}
          </header>

          <div
            data-active-workout-content=""
            className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-white/[0.05] px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {actionError ? (
              <p role="alert" className="mb-4 text-center text-xs text-red-400">
                {actionError}
              </p>
            ) : null}
            {exercises.length === 0 ? (
              <div className="flex min-h-full flex-col justify-center gap-5 py-6">
                <div className="text-center">
                  <Dumbbell className="mx-auto size-8 text-primary/60" aria-hidden />
                  <p className="mt-3 font-heading text-xl font-semibold text-foreground">
                    Free-form workout
                  </p>
                  <p className="mx-auto mt-1.5 max-w-[20rem] text-sm leading-relaxed text-muted-foreground/70">
                    {TRAINING_SPLIT_DEFINITIONS[trainingSplit].label} is active. Pick today&apos;s focus and we&apos;ll build it from your familiar movements and the groups that still need volume.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {trainingSplitFocuses(trainingSplit).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={freeFormBusy}
                      onClick={() => void generateFreeFormWorkout(opt.id as WorkoutFocus)}
                      className={cn(
                        "rounded-2xl border px-4 py-5 text-left transition-all touch-manipulation active:scale-[0.98]",
                        freeFormSplit === opt.id && freeFormBusy
                          ? "border-primary/45 bg-primary/15"
                          : "border-white/[0.08] bg-white/[0.025] hover:border-primary/35",
                        freeFormBusy && freeFormSplit !== opt.id && "opacity-45",
                      )}
                    >
                      <p className="text-base font-semibold text-foreground">{opt.label}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground/60">{opt.hint}</p>
                      {freeFormBusy && freeFormSplit === opt.id ? (
                        <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                          <Loader2 className="size-3 animate-spin" aria-hidden />
                          Building
                        </p>
                      ) : null}
                    </button>
                  ))}
                </div>

                {freeFormError ? (
                  <p className="text-center text-[12px] text-destructive" role="alert">
                    {freeFormError}
                  </p>
                ) : null}

                <button
                  type="button"
                  disabled={freeFormBusy}
                  onClick={openAddExercise}
                  className="mx-auto flex h-11 items-center gap-2 px-4 text-[13px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground touch-manipulation"
                >
                  <Plus className="size-4" aria-hidden />
                  Add exercises manually
                </button>
              </div>
            ) : ex ? (
              <div key={ex.id} className={cn("relative", cardAnimClass)}>
                {cardPhase === "celebrate" ? (
                  <div className="pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center" aria-hidden>
                    <div className="animate-workout-complete-pop flex size-20 items-center justify-center rounded-full bg-primary/20 ring-2 ring-primary/40 backdrop-blur-sm">
                      <Check className="size-10 text-primary" />
                    </div>
                  </div>
                ) : null}

                {viewingOffQueue ? (
                  <div className="aw-rise mb-4 flex items-center justify-between gap-3 border-b border-white/[0.06] pb-3 text-[12px]">
                    <span className="text-muted-foreground/65">Viewing out of order</span>
                    <button
                      type="button"
                      onClick={() => setPinnedExerciseId(null)}
                      className="flex min-h-9 items-center gap-1 font-semibold text-primary touch-manipulation"
                    >
                      Back to {queue.current?.name ?? "current"}
                      <ChevronRight className="size-3.5" aria-hidden />
                    </button>
                  </div>
                ) : null}

                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="type-hud-micro text-muted-foreground/55">
                      Exercise {displayedIndex + 1} of {exercises.length}
                      {isDeferred ? <span className="text-amber-400/90"> · back from skip</span> : null}
                    </p>
                    <h3 className="mt-1.5 break-words font-heading text-[1.7rem] font-semibold leading-[1.08] tracking-tight text-foreground">
                      {ex.name}
                    </h3>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {ex.primaryMuscles?.slice(0, 3).map((m) => (
                        <span
                          key={m.code}
                          className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-muted-foreground/75"
                        >
                          {m.name}
                        </span>
                      ))}
                      {supportsMachineSelection(ex) ? (
                        <button
                          type="button"
                          onClick={() => setMachinePickerExId(ex.id)}
                          className={cn(
                            "inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[11px] font-semibold transition-colors touch-manipulation active:scale-[0.98]",
                            ex.machineId
                              ? "bg-white/[0.07] text-foreground/85"
                              : "border border-dashed border-white/15 pl-2 text-muted-foreground/60 hover:border-primary/35 hover:text-primary/85",
                          )}
                          aria-label={
                            ex.machineId
                              ? `Change machine — currently ${machineLabel(ex.machineId, ex.machineName) ?? "selected"}`
                              : `Choose a machine for ${ex.name}`
                          }
                        >
                          {ex.machineId ? (
                            <>
                              <MachineBrandMark
                                machineId={ex.machineId}
                                machineName={ex.machineName}
                                size="xs"
                                variant="plate"
                              />
                              <span className="truncate">{machineLabel(ex.machineId, ex.machineName)}</span>
                            </>
                          ) : (
                            <>
                              <Plus className="size-3" aria-hidden />
                              Machine
                            </>
                          )}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="-mr-2 flex shrink-0 items-center">
                    {queue.canSkip && ex.id === queue.current?.id ? (
                      <button
                        type="button"
                        onClick={() => skipExercise(ex.id)}
                        className="flex size-11 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-amber-400 active:scale-95 active:bg-white/[0.05] touch-manipulation"
                        aria-label={`Skip ${ex.name} for now`}
                      >
                        <SkipForward className="size-[1.15rem]" aria-hidden />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        swapTargetRef.current = ex.id
                        setSwapExerciseId(ex.id)
                        setShowPicker(true)
                      }}
                      className="flex size-11 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-primary active:scale-95 active:bg-white/[0.05] touch-manipulation"
                      aria-label={`Swap ${ex.name} for another exercise`}
                    >
                      <ArrowLeftRight className="size-[1.15rem]" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExerciseMenuOpen(true)}
                      className="flex size-11 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground active:scale-95 active:bg-white/[0.05] touch-manipulation"
                      aria-label={`More options for ${ex.name}`}
                    >
                      <MoreHorizontal className="size-5" aria-hidden />
                    </button>
                  </div>
                </div>

                {showMovementSummary ? (
                  <div className="mt-4">
                    <MovementCompleteOverview
                      exercise={ex}
                      sessions={previousSessions}
                      sessionId={session.id}
                      trainingStyle={trainingStyle}
                      isLastMovement={queue.remaining.length === 0}
                      onContinue={() => continueFromSummary(ex.id)}
                      onEditSets={() => setSummaryEditExId(ex.id)}
                      onAddOptionalSet={(weight, reps) => addOptionalSet(ex.id, weight, reps)}
                    />
                  </div>
                ) : (
                  <>
                    <div
                      className="mt-5 grid grid-cols-[2.75rem_minmax(0,1fr)_5.5rem_4.75rem_3.25rem] gap-1.5 px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/45"
                      aria-hidden
                    >
                      <span className="text-center">Set</span>
                      <span className="pl-1">Last</span>
                      <span className="text-center">lb</span>
                      <span className="text-center">Reps</span>
                      <span />
                    </div>
                    <div className="space-y-1">
                      {ex.sets.map((set) => {
                        const prevSet = exPrevSets?.[set.setNumber - 1]
                        const typeInfo = SET_TYPE_LABELS[set.type]
                        const swipeKey = setSwipeRowKey(ex.id, set.id)
                        const swipeDx = setSwipeVisual?.key === swipeKey ? setSwipeVisual.dx : 0
                        const isActive = logSet?.id === set.id
                        const justLogged = set.completed && lastLoggedSetId === set.id
                        const ghost = ghostSetIds.has(set.id) && !set.completed
                        const rating =
                          !set.completed && effortTarget?.exId === ex.id && effortTarget.setId === set.id
                        const setLabel = set.type === "working" ? set.setNumber : typeInfo.short
                        const loadLabel = `${set.weight ?? "BW"}${set.weight != null ? " lb" : ""} × ${set.reps ?? "—"}`
                        const effort = effortLabel(set)

                        if (rating) {
                          return (
                            <div
                              key={set.id}
                              className="aw-row-swap rounded-2xl bg-[#0c1015] px-2.5 pb-2 pt-2 shadow-[inset_0_0_0_1px_rgba(196,214,50,0.22),0_18px_40px_-24px_rgba(196,214,50,0.35)]"
                              role="group"
                              aria-label={`Rate effort for set ${set.setNumber}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-7 text-center text-[15px] font-bold tabular-nums text-primary">
                                  {setLabel}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[15px] font-semibold tabular-nums text-foreground">
                                    {loadLabel}
                                  </span>
                                  <span className="block text-[11px] text-muted-foreground/60">How hard was that?</span>
                                </span>
                                <button
                                  type="button"
                                  aria-pressed={effortFlags.technique}
                                  onClick={() => setEffortFlags((f) => ({ ...f, technique: !f.technique }))}
                                  className={cn(
                                    "flex h-9 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-colors touch-manipulation",
                                    effortFlags.technique
                                      ? "bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/40"
                                      : "text-muted-foreground/55 ring-1 ring-inset ring-white/[0.08]",
                                  )}
                                >
                                  <AlertTriangle className="size-3.5" aria-hidden />
                                  Form
                                </button>
                                <button
                                  type="button"
                                  aria-pressed={effortFlags.pain}
                                  onClick={() => setEffortFlags((f) => ({ ...f, pain: !f.pain }))}
                                  className={cn(
                                    "flex h-9 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-colors touch-manipulation",
                                    effortFlags.pain
                                      ? "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/40"
                                      : "text-muted-foreground/55 ring-1 ring-inset ring-white/[0.08]",
                                  )}
                                >
                                  <HeartPulse className="size-3.5" aria-hidden />
                                  Pain
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEffortTarget(null)}
                                  className="flex size-9 items-center justify-center rounded-full text-muted-foreground/55 active:bg-white/[0.06] touch-manipulation"
                                  aria-label="Cancel, keep editing this set"
                                >
                                  <X className="size-4" aria-hidden />
                                </button>
                              </div>
                              <div className="mt-2 grid grid-cols-4 gap-1.5">
                                {EFFORT_CHOICES.map((choice, index) => {
                                  const target = choice.rir === targetRir
                                  return (
                                    <button
                                      key={choice.rir}
                                      type="button"
                                      onClick={() => logWithEffort(ex.id, set.id, choice.rir)}
                                      className={cn(
                                        "aw-rise flex h-[3.4rem] flex-col items-center justify-center rounded-xl transition-[transform,background-color] active:scale-95 touch-manipulation",
                                        target
                                          ? glassCtaButtonClass
                                          : "bg-white/[0.035] text-foreground ring-1 ring-inset ring-white/[0.07]",
                                      )}
                                      style={{ "--aw-delay": `${index * 35}ms` } as React.CSSProperties}
                                    >
                                      <span className="text-[14px] font-bold leading-none">{choice.label}</span>
                                      <span
                                        className={cn(
                                          "mt-1 text-[10px] font-medium leading-none",
                                          target ? "text-primary/75" : "text-muted-foreground/55",
                                        )}
                                      >
                                        {target ? "Target" : choice.hint}
                                      </span>
                                    </button>
                                  )
                                })}
                              </div>
                              <button
                                type="button"
                                onClick={() => logWithEffort(ex.id, set.id, null)}
                                className="mt-1 flex h-8 w-full items-center justify-center text-[11px] font-medium text-muted-foreground/45 transition-colors hover:text-foreground touch-manipulation"
                              >
                                Log without rating
                              </button>
                            </div>
                          )
                        }

                        return (
                          <div
                            key={set.id}
                            className="relative select-none overflow-hidden rounded-2xl"
                            onPointerDown={(e) => onSetRowPointerDown(ex, set, e)}
                            onPointerMove={onSetRowPointerMove}
                            onPointerUp={onSetRowPointerEnd}
                            onPointerCancel={onSetRowPointerEnd}
                          >
                            {swipeDx < -16 && ex.sets.length > 1 ? (
                              <div
                                className={cn(
                                  "pointer-events-none absolute inset-y-0 right-0 flex w-24 items-center justify-end rounded-2xl pr-5 transition-colors",
                                  swipeDx < -64 ? "bg-destructive/35" : "bg-destructive/15",
                                )}
                                aria-hidden
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </div>
                            ) : null}
                            {set.completed ? (
                              <div
                                key="logged"
                                className={cn(
                                  "relative flex items-center gap-1.5 rounded-2xl bg-[#0b0f0a] px-1.5 py-1.5",
                                  justLogged && "aw-row-swap aw-set-logged",
                                )}
                                style={{
                                  transform: swipeDx !== 0 ? `translateX(${swipeDx}px)` : undefined,
                                  transition: swipeDx !== 0 ? "none" : "transform 0.2s ease-out",
                                }}
                              >
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center text-[15px] font-bold tabular-nums text-primary">
                                  {setLabel}
                                </span>
                                <span className="flex min-w-0 flex-1 items-center gap-2">
                                  <span className="truncate text-[17px] font-semibold tabular-nums text-foreground">
                                    {loadLabel}
                                  </span>
                                  {effort ? (
                                    <span
                                      className={cn(
                                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                                        set.rir === 0
                                          ? "bg-rose-500/12 text-rose-300"
                                          : "bg-primary/[0.1] text-primary/90",
                                      )}
                                    >
                                      {effort}
                                    </span>
                                  ) : null}
                                  {set.techniqueFlag ? (
                                    <AlertTriangle className="size-3.5 shrink-0 text-amber-400/90" aria-label="Form slipped" />
                                  ) : null}
                                  {set.painFlag ? (
                                    <HeartPulse className="size-3.5 shrink-0 text-rose-400/90" aria-label="Pain" />
                                  ) : null}
                                </span>
                                {prevSet ? (
                                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/40">
                                    last {prevSet.weight ?? "—"}×{prevSet.reps ?? "—"}
                                  </span>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => tapSetCheck(ex.id, set)}
                                  className={cn(
                                    "ml-1 flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/35 bg-gradient-to-b from-primary/20 to-primary/[0.06] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-transform active:scale-90 touch-manipulation",
                                    justLogged && "aw-check-pop",
                                  )}
                                  aria-label={`Undo set ${set.setNumber}`}
                                  aria-pressed
                                >
                                  <Check className="size-5" strokeWidth={2.75} aria-hidden />
                                </button>
                              </div>
                            ) : (
                              <div
                                key="edit"
                                className={cn(
                                  "relative grid grid-cols-[2.75rem_minmax(0,1fr)_5.5rem_4.75rem_3.25rem] items-center gap-1.5 rounded-2xl bg-[#070a0e] px-1.5 py-1.5 transition-[background-color,box-shadow] duration-300",
                                  isActive && "bg-[#0c1015] shadow-[inset_0_0_0_1px_rgba(196,214,50,0.22)]",
                                  isActive && restFlash && "aw-rest-done",
                                )}
                                style={{
                                  transform: swipeDx !== 0 ? `translateX(${swipeDx}px)` : undefined,
                                  transition: swipeDx !== 0 ? "none" : undefined,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => cycleSetType(ex.id, set.id)}
                                  className={cn(
                                    "flex h-11 items-center justify-center rounded-xl text-[15px] font-bold tabular-nums transition-colors active:bg-white/[0.05] touch-manipulation",
                                    typeInfo.color,
                                  )}
                                  aria-label={`Set ${set.setNumber}, ${set.type}. Tap to change type`}
                                >
                                  {setLabel}
                                </button>
                                <button
                                  type="button"
                                  disabled={!prevSet}
                                  onClick={() => prevSet && copyPreviousIntoSet(ex.id, set.id, prevSet)}
                                  className="flex h-11 min-w-0 items-center truncate rounded-xl px-1 text-left text-[13px] tabular-nums text-muted-foreground/55 transition-colors enabled:active:bg-white/[0.05] enabled:active:text-foreground touch-manipulation"
                                  aria-label={
                                    prevSet
                                      ? `Last time ${prevSet.weight ?? "no weight"} by ${prevSet.reps ?? "no"} reps. Tap to copy`
                                      : "No previous set"
                                  }
                                >
                                  {prevSet ? `${prevSet.weight ?? "—"} × ${prevSet.reps ?? "—"}` : "—"}
                                </button>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  inputMode="decimal"
                                  enterKeyHint="next"
                                  aria-label={`Weight for set ${set.setNumber} in pounds`}
                                  className={cn(setInputClass, ghost && setInputGhostClass)}
                                  placeholder="—"
                                  value={set.weight ?? ""}
                                  onFocus={(e) => {
                                    clearGhostForSet(set.id)
                                    e.currentTarget.select()
                                  }}
                                  onChange={(e) =>
                                    updateSet(
                                      ex.id,
                                      set.id,
                                      "weight",
                                      e.target.value ? parseFloat(e.target.value) : null,
                                    )
                                  }
                                />
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  inputMode="numeric"
                                  enterKeyHint="done"
                                  aria-label={`Reps for set ${set.setNumber}`}
                                  className={cn(setInputClass, ghost && setInputGhostClass)}
                                  placeholder="—"
                                  value={set.reps ?? ""}
                                  onFocus={(e) => {
                                    clearGhostForSet(set.id)
                                    e.currentTarget.select()
                                  }}
                                  onChange={(e) =>
                                    updateSet(
                                      ex.id,
                                      set.id,
                                      "reps",
                                      e.target.value ? parseInt(e.target.value) : null,
                                    )
                                  }
                                />
                                <button
                                  type="button"
                                  disabled={set.weight == null && set.reps == null}
                                  onClick={() => tapSetCheck(ex.id, set)}
                                  className={cn(
                                    "mx-auto flex size-11 items-center justify-center rounded-xl border transition-[border-color,color,transform] duration-200 active:scale-90 disabled:opacity-40 touch-manipulation",
                                    isActive
                                      ? "border-primary/40 text-primary/85"
                                      : "border-white/[0.12] text-muted-foreground/35",
                                  )}
                                  aria-label={`Log set ${set.setNumber}`}
                                  aria-pressed={false}
                                >
                                  <Check className="size-5" strokeWidth={2.75} aria-hidden />
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => addSet(ex.id)}
                      className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.1] text-[13px] font-semibold text-muted-foreground/65 transition-colors active:bg-white/[0.03] hover:text-foreground touch-manipulation"
                    >
                      <Plus className="size-4" aria-hidden />
                      Add set
                    </button>
                    {ex.sets.length > 1 ? (
                      <p className="mt-2 text-center text-[11px] text-muted-foreground/35">
                        Swipe a set left to remove it · tap the set number to change its type
                      </p>
                    ) : null}

                    {exComplete && summaryEditExId === ex.id ? (
                      <button
                        type="button"
                        onClick={() => setSummaryEditExId(null)}
                        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-primary/25 text-[13px] font-semibold text-primary touch-manipulation active:scale-[0.99]"
                      >
                        <Check className="size-4" aria-hidden />
                        Done editing — view summary
                      </button>
                    ) : (
                      <ProgressiveOverloadCoach
                        key={ex.id}
                        className="mt-6 rounded-none border-0 border-t border-white/[0.06] bg-none px-0 pb-0 pt-5 shadow-none"
                        inlineEffort
                        exercise={ex}
                        setCount={ex.sets.length}
                        sessions={previousSessions}
                        sessionId={session.id}
                        trainingStyle={trainingStyle}
                        onApplyToNextSet={(weight, reps, onlyEmpty) =>
                          applyRecToNextSet(ex.id, weight, reps, onlyEmpty)
                        }
                        onAddOptionalSet={(weight, reps) => addOptionalSet(ex.id, weight, reps)}
                        onSetEffort={(setId, patch) => updateSetEffort(ex.id, setId, patch)}
                      />
                    )}

                    {queue.next && queue.next.id !== ex.id && !queue.allSetsComplete ? (
                      <button
                        type="button"
                        onClick={() => setOverviewOpen(true)}
                        className="mt-6 flex w-full items-center justify-between gap-3 border-t border-white/[0.06] pt-4 text-left touch-manipulation"
                      >
                        <span className="min-w-0">
                          <span className="type-hud-micro block text-muted-foreground/45">Up next</span>
                          <span className="mt-0.5 block truncate text-[14px] font-medium text-foreground/80">
                            {queue.next.name}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" aria-hidden />
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ) : queue.allSetsComplete ? (
              <div className="flex min-h-full flex-col items-center justify-center py-10 text-center">
                <div className="animate-workout-complete-pop flex size-20 items-center justify-center rounded-full bg-primary/15 ring-2 ring-primary/30">
                  <Check className="size-9 text-primary" aria-hidden />
                </div>
                <p className="mt-5 font-heading text-2xl font-semibold text-foreground">
                  Every set logged
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground/65">
                  {loggedSets} sets · {formatVolumeLb(loggedVol)} lb in {formatTimer(elapsed)}
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmEndAction("finish")}
                  className={cn(
                    glassCtaButtonClass,
                    "mt-7 flex h-14 w-full max-w-[18rem] items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold active:scale-[0.98] touch-manipulation",
                  )}
                >
                  <Flag className="size-4" aria-hidden />
                  Finish workout
                </button>
                <button
                  type="button"
                  onClick={openAddExercise}
                  className="mt-2 flex h-11 items-center gap-2 px-4 text-[13px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground touch-manipulation"
                >
                  <Plus className="size-4" aria-hidden />
                  Add another exercise
                </button>
              </div>
            ) : null}
          </div>

          <div
            data-active-workout-actions=""
            data-open={restCountdownActive || restFlash ? "" : undefined}
            className="aw-rest-dock relative shrink-0 bg-[#070a0e]"
            aria-hidden={!(restCountdownActive || restFlash)}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className="relative h-px bg-white/[0.06]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((restCountdownActive ? restProgress : 1) * 100)}
                aria-label="Rest progress"
              >
                <div
                  className="absolute inset-y-0 left-0 w-full origin-left bg-primary shadow-[0_0_10px_rgba(196,214,50,0.7)] transition-transform duration-300 ease-linear"
                  style={{ transform: `scaleX(${restCountdownActive ? restProgress : 1})` }}
                />
              </div>
              <div className="px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
                <div className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    {restFlash && !restCountdownActive ? (
                      <p className="aw-rest-done font-heading text-[1.55rem] font-bold leading-none text-primary">
                        Go
                      </p>
                    ) : (
                      <p
                        className={cn(
                          "font-heading text-[1.55rem] font-bold leading-none tabular-nums text-foreground",
                          restUrgent && "aw-rest-urgent text-primary",
                        )}
                        role="timer"
                        aria-live="off"
                        aria-label={`${formatRestCountdown(restRemainingSec ?? 0)} rest remaining`}
                      >
                        {formatRestCountdown(restRemainingSec ?? 0)}
                      </p>
                    )}
                    <p className="mt-1 truncate text-[11px] text-muted-foreground/60">
                      {restFlash && !restCountdownActive ? "Rest's up · " : "Resting · "}
                      {upNextLabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    tabIndex={restCountdownActive ? 0 : -1}
                    onClick={() => adjustRest(-15)}
                    className="flex h-10 w-12 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums text-foreground/75 ring-1 ring-inset ring-white/[0.09] active:scale-95 touch-manipulation"
                    aria-label="Shorten rest by 15 seconds"
                  >
                    −15
                  </button>
                  <button
                    type="button"
                    tabIndex={restCountdownActive ? 0 : -1}
                    onClick={() => adjustRest(15)}
                    className="flex h-10 w-12 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums text-foreground/75 ring-1 ring-inset ring-white/[0.09] active:scale-95 touch-manipulation"
                    aria-label="Add 15 seconds of rest"
                  >
                    +15
                  </button>
                  <button
                    type="button"
                    tabIndex={restCountdownActive ? 0 : -1}
                    onClick={() => {
                      setRestEndsAt(null)
                      setRestFlash(false)
                    }}
                    className={cn(
                      "flex h-10 shrink-0 items-center gap-1 px-3.5 text-[13px] font-semibold active:scale-95 touch-manipulation",
                      glassCtaButtonClass,
                      "rounded-full",
                    )}
                    aria-label="Skip rest"
                  >
                    Skip
                    <SkipForward className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <ActiveWorkoutSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Workout">
            <div>
              <button type="button" className={sheetRowClass} onClick={openAddExercise}>
                <Plus className="size-5 text-primary" aria-hidden />
                <span className="flex-1">Add exercise</span>
              </button>
              {exercises.length > 0 ? (
                <button
                  type="button"
                  className={sheetRowClass}
                  onClick={() => {
                    setMenuOpen(false)
                    setOverviewOpen(true)
                  }}
                >
                  <ListOrdered className="size-5 text-muted-foreground/70" aria-hidden />
                  <span className="flex-1">Exercises</span>
                  <span className="text-[13px] tabular-nums text-muted-foreground/55">
                    {queue.completedMovements}/{queue.movementTotal}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                className={sheetRowClass}
                onClick={() => {
                  setMenuOpen(false)
                  setRestSheetOpen(true)
                }}
              >
                <Timer className="size-5 text-muted-foreground/70" aria-hidden />
                <span className="flex-1">Rest timer</span>
                <span className="text-[13px] tabular-nums text-muted-foreground/55">
                  {restConfig.enabled ? formatRestCountdown(restConfig.seconds) : "Off"}
                </span>
              </button>
            </div>
            <div className="mt-5 space-y-2.5 pb-1">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setConfirmEndAction("finish")
                }}
                className={cn(
                  glassCtaButtonClass,
                  "flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold active:scale-[0.98] touch-manipulation",
                )}
              >
                <Flag className="size-4" aria-hidden />
                Finish workout
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setConfirmEndAction("discard")
                }}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold text-red-400/90 active:bg-red-500/10 touch-manipulation"
              >
                <Trash2 className="size-4" aria-hidden />
                Discard workout
              </button>
            </div>
          </ActiveWorkoutSheet>

          <ActiveWorkoutSheet
            open={overviewOpen}
            onClose={() => setOverviewOpen(false)}
            title="Exercises"
            description={`${queue.completedSets} of ${queue.totalSets} sets logged · ${formatVolumeLb(loggedVol)} lb`}
          >
            <ol>
              {exercises.map((item, index) => {
                const done = item.sets.filter((s) => s.completed).length
                const complete = isExerciseComplete(item)
                const shown = item.id === ex?.id
                const skipped = skippedExerciseIds.includes(item.id) && !complete
                return (
                  <li key={item.id} className="border-b border-white/[0.06] last:border-b-0">
                    <button
                      type="button"
                      onClick={() => jumpToExercise(item.id)}
                      className="flex min-h-16 w-full items-center gap-3.5 py-3 text-left transition-colors active:bg-white/[0.03] touch-manipulation"
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular-nums",
                          complete
                            ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/40"
                            : shown
                              ? "ring-2 ring-primary/70 text-primary"
                              : "ring-1 ring-white/[0.14] text-muted-foreground/70",
                        )}
                      >
                        {complete ? <Check className="size-4" strokeWidth={3} aria-hidden /> : index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-foreground">{item.name}</span>
                        <span className="mt-0.5 block text-[12px] tabular-nums text-muted-foreground/55">
                          {done}/{item.sets.length} sets
                          {shown ? <span className="text-primary/85"> · on screen</span> : null}
                          {skipped ? <span className="text-amber-400/85"> · skipped</span> : null}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground/35" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ol>
            <button
              type="button"
              onClick={openAddExercise}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.1] text-[13px] font-semibold text-muted-foreground/70 touch-manipulation"
            >
              <Plus className="size-4" aria-hidden />
              Add exercise
            </button>
            {exercises.length > 0 ? (
              <SessionMuscleLoadWidget
                className="mt-5"
                exercises={exercises}
                currentPrimaryMuscles={ex?.primaryMuscles}
                currentSecondaryMuscles={ex?.secondaryMuscles}
              />
            ) : null}
          </ActiveWorkoutSheet>

          <ActiveWorkoutSheet
            open={restSheetOpen}
            onClose={() => setRestSheetOpen(false)}
            title="Rest timer"
            description="Starts automatically each time you log a set."
          >
            <button
              type="button"
              role="switch"
              aria-checked={restConfig.enabled}
              onClick={() => {
                const next = saveWorkoutRestConfig({ enabled: !restConfig.enabled })
                setRestConfig(next)
                if (!next.enabled) setRestEndsAt(null)
              }}
              className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-white/[0.06] py-3 text-left touch-manipulation"
            >
              <span className="text-[15px] font-medium text-foreground">Auto-start rest</span>
              <span
                className={cn(
                  "relative h-7 w-12 rounded-full transition-colors duration-200",
                  restConfig.enabled ? "bg-primary" : "bg-white/[0.12]",
                )}
                aria-hidden
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left] duration-200",
                    restConfig.enabled ? "left-[1.375rem]" : "left-0.5",
                  )}
                />
              </span>
            </button>
            <div
              className={cn(
                "mt-4 grid grid-cols-3 gap-2 pb-1 transition-opacity",
                !restConfig.enabled && "pointer-events-none opacity-35",
              )}
            >
              {REST_PRESETS.map(({ sec, label }) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setRestConfig(saveWorkoutRestConfig({ seconds: sec }))}
                  className={cn(
                    "h-12 rounded-2xl text-[14px] font-semibold tabular-nums transition-colors active:scale-[0.97] touch-manipulation",
                    restConfig.seconds === sec
                      ? glassCtaButtonClass
                      : "border border-white/[0.09] text-foreground/80",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </ActiveWorkoutSheet>

          <ActiveWorkoutSheet
            open={exerciseMenuOpen && ex != null}
            onClose={closeExerciseMenu}
            title={ex?.name ?? "Exercise"}
          >
            {ex ? (
              <div className="pb-1">
                <button
                  type="button"
                  className={sheetRowClass}
                  onClick={() => {
                    const target = logSet ?? ex.sets[ex.sets.length - 1]
                    closeExerciseMenu()
                    if (target) {
                      setPlateCalcTarget({ exId: ex.id, setId: target.id, weight: target.weight })
                    }
                  }}
                >
                  <Calculator className="size-5 text-muted-foreground/70" aria-hidden />
                  <span className="flex-1">Plate calculator</span>
                  {logSet ? (
                    <span className="text-[13px] text-muted-foreground/55">Set {logSet.setNumber}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={sheetRowClass}
                  onClick={() => {
                    closeExerciseMenu()
                    addSet(ex.id)
                  }}
                >
                  <Plus className="size-5 text-muted-foreground/70" aria-hidden />
                  <span className="flex-1">Add set</span>
                </button>
                <button
                  type="button"
                  className={sheetRowClass}
                  onClick={() => {
                    closeExerciseMenu()
                    swapTargetRef.current = ex.id
                    setSwapExerciseId(ex.id)
                    setShowPicker(true)
                  }}
                >
                  <ArrowLeftRight className="size-5 text-muted-foreground/70" aria-hidden />
                  <span className="flex-1">Swap exercise</span>
                </button>
                {supportsMachineSelection(ex) ? (
                  <button
                    type="button"
                    className={sheetRowClass}
                    onClick={() => {
                      closeExerciseMenu()
                      setMachinePickerExId(ex.id)
                    }}
                  >
                    <Dumbbell className="size-5 text-muted-foreground/70" aria-hidden />
                    <span className="flex-1">Machine</span>
                    <span className="max-w-[45%] truncate text-[13px] text-muted-foreground/55">
                      {machineLabel(ex.machineId, ex.machineName) ?? "None"}
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className={cn(sheetRowClass, "text-red-400", removeArmed && "text-red-300")}
                  onClick={() => {
                    if (!removeArmed) {
                      setRemoveArmed(true)
                      return
                    }
                    closeExerciseMenu()
                    removeExercise(ex.id)
                  }}
                >
                  <Trash2 className="size-5" aria-hidden />
                  <span className="flex-1">{removeArmed ? "Tap again to remove" : "Remove exercise"}</span>
                  {removeArmed && ex.sets.some((s) => s.completed) ? (
                    <span className="text-[12px] text-red-400/70">
                      {ex.sets.filter((s) => s.completed).length} logged sets
                    </span>
                  ) : null}
                </button>
              </div>
            ) : null}
          </ActiveWorkoutSheet>
        </div>
      </div>

      <Dialog
        open={confirmEndAction !== null}
        onOpenChange={(o) => {
          if (!o && !ending) setConfirmEndAction(null)
        }}
      >
        <DialogContent
          showCloseButton={false}
          priority="high"
          className="max-w-sm gap-0 border-white/[0.1] bg-[#0b0f14] p-0"
        >
          <div className="px-5 pb-3 pt-5">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="font-heading text-lg">
                {confirmEndAction === "discard" ? "Discard this workout?" : "Finish workout?"}
              </DialogTitle>
              <DialogDescription>
                {confirmEndAction === "discard"
                  ? loggedSets > 0
                    ? `You'll lose ${loggedSets} logged ${loggedSets === 1 ? "set" : "sets"} and ${formatTimer(elapsed)} of training. This can't be undone.`
                    : "This session will be removed. This can't be undone."
                  : queue.totalSets - queue.completedSets > 0
                    ? `${queue.totalSets - queue.completedSets} planned ${queue.totalSets - queue.completedSets === 1 ? "set is" : "sets are"} still open — they won't count. Save ${loggedSets} logged ${loggedSets === 1 ? "set" : "sets"}?`
                    : `Save ${loggedSets} sets · ${formatVolumeLb(loggedVol)} lb in ${formatTimer(elapsed)}.`}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex gap-2.5 px-5 pb-5 pt-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={ending}
              className="h-12 min-h-12 flex-1 rounded-2xl text-[15px] touch-manipulation"
              onClick={() => setConfirmEndAction(null)}
            >
              {confirmEndAction === "discard" ? "Keep training" : "Not yet"}
            </Button>
            <Button
              type="button"
              variant={confirmEndAction === "discard" ? "destructive" : "glass"}
              size="lg"
              disabled={ending}
              className="h-12 min-h-12 flex-1 gap-2 rounded-2xl text-[15px] font-semibold touch-manipulation"
              onClick={() => void confirmEnd()}
            >
              {ending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : confirmEndAction === "finish" ? (
                <Flag className="size-4 shrink-0" aria-hidden />
              ) : null}
              {confirmEndAction === "discard" ? "Discard" : "Finish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {plateCalcTarget ? (
        <PlateCalculatorDialog
          open
          onOpenChange={(open) => {
            if (!open) setPlateCalcTarget(null)
          }}
          initialWeight={plateCalcTarget.weight}
          onApply={(weightLb) => {
            updateSet(plateCalcTarget.exId, plateCalcTarget.setId, "weight", weightLb)
            clearGhostForSet(plateCalcTarget.setId)
            setPlateCalcTarget(null)
          }}
        />
      ) : null}

      {machinePickerExercise ? (
        <MachinePickerDialog
          open
          onClose={() => setMachinePickerExId(null)}
          exerciseName={machinePickerExercise.name}
          value={{
            machineId: machinePickerExercise.machineId ?? null,
            machineName: machinePickerExercise.machineName ?? null,
          }}
          onSelect={(selection) => setExerciseMachine(machinePickerExercise.id, selection)}
          recentMachineIds={recentMachinesFor(machinePickerExercise.name)}
        />
      ) : null}

      <ExercisePicker
        open={showPicker}
        onClose={() => {
          setShowPicker(false)
          setSwapExerciseId(null)
          setMenuOpen(false)
          /* Let a library rowâ€™s onSelect run in the same gesture before clearing swap target. */
          queueMicrotask(() => {
            swapTargetRef.current = null
          })
        }}
        title={swapExerciseId ? "Swap exercise" : "Add Exercise"}
        description={
          swapExerciseId
            ? "Pick a movement from the library to replace this one"
            : "Search or filter by muscle group, then pick an exercise"
        }
        initialMuscleGroup={
          swapExerciseId
            ? exercises.find((ex) => ex.id === swapExerciseId)?.primaryMuscles?.[0]
                ?.name ?? null
            : null
        }
        recentNames={
          swapExerciseId
            ? (() => {
                const ex = exercises.find((e) => e.id === swapExerciseId)
                if (!ex) return []
                const fromName = ex.originalName || ex.name
                return getRecentSubstitutes({
                  fromName,
                  templateId,
                  templateExerciseId: ex.templateExerciseId,
                }).filter((n) => n.toLowerCase() !== ex.name.toLowerCase())
              })()
            : []
        }
        frequencySessions={previousSessions}
        onSelect={(picked) => {
          const swapId = swapTargetRef.current
          swapTargetRef.current = null
          if (swapId != null) {
            swapExercise(swapId, picked)
          } else {
            addExercise(picked)
          }
          setShowPicker(false)
          setSwapExerciseId(null)
        }}
      />
    </>
  )
}

/** Safari can cache GET /api/workout-sessions and serve a stale list after POST — breaks active workout. */
const noStore: RequestInit = { cache: "no-store" }

function sessionsListUrl(): string {
  return `/api/workout-sessions?_=${Date.now()}`
}

const HUB_START_STORAGE_KEY = "theGRID_hubStartWorkout"

function readHubStartIntent(): string | null {
  if (typeof window === "undefined") return null
  try {
    const fromStorage = sessionStorage.getItem(HUB_START_STORAGE_KEY)?.trim()
    if (fromStorage) return fromStorage
  } catch {
    /* private mode */
  }
  return null
}

function clearHubStartIntent() {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(HUB_START_STORAGE_KEY)
  } catch {
    /* private mode */
  }
}

/**
 * Hub deep-link: `?start=<templateId>` or `?start=free` (plus sessionStorage backup)
 * starts a session once templates load. Suspense-wrapped because it reads search params.
 */
function HubStartFromQuery({
  templatesLoaded,
  templates,
  startingWorkout,
  onStartRoutine,
  onStartFree,
}: {
  templatesLoaded: boolean
  templates: WorkoutTemplate[]
  startingWorkout: boolean
  onStartRoutine: (tmpl: WorkoutTemplate) => void
  onStartFree: () => void
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const handledRef = useRef<string | null>(null)
  const onStartRoutineRef = useRef(onStartRoutine)
  const onStartFreeRef = useRef(onStartFree)
  onStartRoutineRef.current = onStartRoutine
  onStartFreeRef.current = onStartFree

  useEffect(() => {
    if (!templatesLoaded || startingWorkout) return

    const fromQuery = searchParams.get("start")?.trim() || null
    const start = fromQuery || readHubStartIntent()
    if (!start) return
    if (handledRef.current === start) return

    const finish = () => {
      handledRef.current = start
      clearHubStartIntent()
      if (fromQuery) router.replace("/workouts", { scroll: false })
    }

    if (start === "free" || start === "empty") {
      finish()
      onStartFreeRef.current()
      return
    }

    const tmpl = templates.find((t) => t.id === start)
    finish()
    if (tmpl) onStartRoutineRef.current(tmpl)
  }, [
    searchParams,
    templatesLoaded,
    templates,
    startingWorkout,
    router,
  ])

  return null
}

/**
 * Hub deep-link: `?newRoutine=1` or `?editRoutine=<id>` opens the routine editor.
 */
function HubRoutineEditorFromQuery({
  templatesLoaded,
  templates,
  onNew,
  onEdit,
}: {
  templatesLoaded: boolean
  templates: WorkoutTemplate[]
  onNew: () => void
  onEdit: (tmpl: WorkoutTemplate) => void
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const handledRef = useRef<string | null>(null)
  const onNewRef = useRef(onNew)
  const onEditRef = useRef(onEdit)
  onNewRef.current = onNew
  onEditRef.current = onEdit

  useEffect(() => {
    if (!templatesLoaded) return

    const newRoutine = searchParams.get("newRoutine")
    const editId = searchParams.get("editRoutine")?.trim() || null
    const key = newRoutine ? `new:${newRoutine}` : editId ? `edit:${editId}` : null
    if (!key) return
    if (handledRef.current === key) return

    handledRef.current = key
    router.replace("/workouts", { scroll: false })

    if (newRoutine) {
      onNewRef.current()
      return
    }
    if (editId) {
      const tmpl = templates.find((t) => t.id === editId)
      if (tmpl) onEditRef.current(tmpl)
    }
  }, [searchParams, templatesLoaded, templates, router])

  return null
}

/* ──────────────────────────────────────────────────────────
   Main Page — session + routine editor only (hub owns browse)
   ────────────────────────────────────────────────────────── */

export default function WorkoutsPage() {
  return (
    <Suspense fallback={null}>
      <WorkoutsPageInner />
    </Suspense>
  )
}

function WorkoutsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [showRoutineEditor, setShowRoutineEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<WorkoutTemplate | null>(null)
  const [routineEditorKey, setRoutineEditorKey] = useState("new")
  const [routineImportAsNew, setRoutineImportAsNew] = useState(false)
  const templatesRef = useRef<WorkoutTemplate[]>([])
  /** When true, closing the routine editor returns to the hub. */
  const returnToHubAfterEditorRef = useRef(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [startingWorkout, setStartingWorkout] = useState(false)
  /** Template the current active session was started from (for remembering swaps). */
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)
  /** Hub deep-link: wait until templates load before honoring `?start=`. */
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [completion, setCompletion] = useState<{
    sessionName: string
    dateKey: string
    recap: WorkoutRecap
    bodyWeightLb: number | null
  } | null>(null)

  templatesRef.current = templates

  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const today = activeDate
  const trainingStyle = normalizeTrainingStyle(user?.trainingStyle)
  const trainingSplit = normalizeTrainingSplit(user?.trainingSplit)

  useEffect(() => {
    Promise.all([
      apiFetch(sessionsListUrl(), noStore).then((r) => r.json()),
      apiFetch(`/api/workout-templates?_=${Date.now()}`, noStore).then((r) => r.json()),
    ])
      .then(([s, t]) => {
        setSessions(Array.isArray(s) ? s : [])
        setTemplates(Array.isArray(t) ? t : [])
        setTemplatesLoaded(true)
      })
      .catch(() => {
        setSessions([])
        setTemplates([])
        setTemplatesLoaded(true)
      })
  }, [])

  const activeSession = useMemo(() => {
    const norm = (s: WorkoutSession) =>
      String(s.status ?? "").trim().toLowerCase()
    return sessions.find((s) => norm(s) === "active") ?? null
  }, [sessions])

  const trainingPeriod = useMemo(
    () => getTrackingPeriod(activeDate, {
      enabled: user?.workCycleEnabled,
      anchorDate: user?.workCycleAnchorDate,
      length: user?.workCycleLength,
      patternJson: user?.workCyclePatternJson,
      goal: user?.workoutGoalPerCycle,
    }),
    [
      activeDate,
      user?.workCycleEnabled,
      user?.workCycleAnchorDate,
      user?.workCycleLength,
      user?.workCyclePatternJson,
      user?.workoutGoalPerCycle,
    ],
  )
  const weekStart = trainingPeriod.startDate
  const weekEnd = trainingPeriod.endDate

  const completedSessions = useMemo(() => {
    const norm = (s: WorkoutSession) =>
      String(s.status ?? "").trim().toLowerCase()
    return sessions.filter((s) => norm(s) === "completed")
  }, [sessions])

  const pendingStart =
    Boolean(searchParams.get("start")?.trim()) ||
    Boolean(readHubStartIntent()) ||
    Boolean(searchParams.get("newRoutine")) ||
    Boolean(searchParams.get("editRoutine")?.trim())

  // Idle visits (no session, no editor, no hub deep-link) return to hub.
  useEffect(() => {
    if (!templatesLoaded || startingWorkout) return
    if (activeSession || showRoutineEditor || pendingStart || completion) return
    router.replace("/")
  }, [
    templatesLoaded,
    startingWorkout,
    activeSession,
    showRoutineEditor,
    pendingStart,
    completion,
    router,
  ])

  async function startSession(
    name: string,
    templateExercises?: TemplateExercise[],
    routineCoverUrl?: string | null,
    templateId?: string | null,
  ) {
    setStartError(null)
    const exercises: SessionExercise[] = templateExercises
      ? templateExercises.map((te) => {
          const m = migrateTemplateExercise(te)
          const pref =
            getPreferredSubstitute({
              fromName: m.name,
              templateId,
              templateExerciseId: m.id,
            }) ||
            (m.preferredSubstituteName
              ? {
                  toName: m.preferredSubstituteName,
                  recentTo: m.recentSubstitutes ?? [m.preferredSubstituteName],
                }
              : null)
          const useName =
            pref?.toName && pref.toName.toLowerCase() !== m.name.toLowerCase()
              ? pref.toName
              : m.name
          /* No swap: the slot's own machine. Substituted: whatever you last used
             for the replacement movement. */
          const machine =
            useName === m.name
              ? { machineId: m.machineId ?? null, machineName: m.machineName ?? null }
              : machineSelectionFromPick(
                  getRememberedMachine(useName) ?? { machineId: null, machineName: null },
                )
          return {
            id: uid(),
            name: useName,
            notes: m.notes,
            primaryMuscles: m.primaryMuscles,
            machineId: machine.machineId,
            machineName: machine.machineName,
            sets: sessionSetsFromTemplate(m, trainingStyle),
            templateExerciseId: m.id,
            originalName: m.name,
          }
        })
      : []

    setStartingWorkout(true)
    try {
      const res = await apiFetch(sessionsListUrl(), {
        ...noStore,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          date: today,
          exercises,
          coverImageUrl: routineCoverUrl ?? null,
          supersedeActive: true,
        }),
      })

      const rawText = await res.text()
      if (!res.ok) {
        let msg = `Could not start workout (${res.status})`
        try {
          const err = JSON.parse(rawText) as { error?: string }
          if (typeof err?.error === "string") msg = err.error
        } catch {
          if (rawText) msg = rawText.slice(0, 160)
        }
        setStartError(msg)
        return
      }

      let raw: WorkoutSession
      try {
        raw = JSON.parse(rawText) as WorkoutSession
      } catch {
        setStartError("Invalid response from server.")
        return
      }

      const session = normalizeSessionStatus(raw)
      setActiveTemplateId(templateId ?? null)
      setSessions((prev) => [
        session,
        ...prev.filter((s) => s.id !== session.id),
      ])
    } catch (e) {
      setStartError(
        e instanceof Error ? e.message : "Network error — try again.",
      )
    } finally {
      setStartingWorkout(false)
    }
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null)
  /** Debounced PUT not yet sent — flushed when iOS backgrounds or kills the PWA. */
  const pendingSaveRef = useRef<{ id: string; body: string } | null>(null)

  function cancelPendingSave() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const pending = pendingSaveRef.current
    pendingSaveRef.current = null
    return pending
  }

  useEffect(() => {
    const flush = () => {
      const pending = pendingSaveRef.current
      if (!pending) return
      pendingSaveRef.current = null
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      void apiFetch(`/api/workout-sessions/${pending.id}`, {
        ...noStore,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: pending.body,
        /* keepalive requests are capped at 64 KB by the browser. */
        keepalive: pending.body.length < 60_000,
      }).catch(() => {})
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", flush)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", flush)
      flush()
    }
  }, [])

  async function updateActiveSession(
    exercises: SessionExercise[],
    name?: string,
    bodyWeightLb?: number | null,
  ) {
    if (!activeSession) return
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? {
              ...s,
              exercises: exercises as unknown as string,
              ...(name ? { name } : {}),
              ...(bodyWeightLb !== undefined ? { bodyWeightLb } : {}),
            }
          : s,
      ),
    )

    const id = activeSession.id
    const previousBody = pendingSaveRef.current?.id === id ? pendingSaveRef.current.body : null
    const merged = {
      ...(previousBody ? (JSON.parse(previousBody) as Record<string, unknown>) : {}),
      exercises,
      ...(name ? { name } : {}),
      ...(bodyWeightLb !== undefined ? { bodyWeightLb } : {}),
    }
    pendingSaveRef.current = { id, body: JSON.stringify(merged) }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      saveTimer.current = null
      const pending = pendingSaveRef.current
      if (!pending) return
      pendingSaveRef.current = null
      await apiFetch(`/api/workout-sessions/${pending.id}`, {
        ...noStore,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: pending.body,
      }).catch(() => {
        if (!pendingSaveRef.current) pendingSaveRef.current = pending
      })
    }, 800)
  }

  async function finishActiveSession() {
    if (!activeSession) return
    setStartError(null)
    const unsaved = cancelPendingSave()
    const rearmSave = () => {
      if (unsaved && !pendingSaveRef.current) pendingSaveRef.current = unsaved
    }
    const startMs = new Date(activeSession.startedAt).getTime()
    const duration = Math.round((Date.now() - startMs) / 60000)

    const sess = sessions.find((s) => s.id === activeSession.id)
    const exercisesPayload = normalizeWorkoutSessionExercises<SessionExercise>(
      sess?.exercises ?? activeSession.exercises,
    )

    let res: Response
    try {
      res = await apiFetch(`/api/workout-sessions/${activeSession.id}`, {
        ...noStore,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          finishedAt: new Date().toISOString(),
          duration,
          exercises: exercisesPayload,
          bodyWeightLb: sess?.bodyWeightLb ?? null,
        }),
      })
    } catch {
      rearmSave()
      setStartError("Could not finish the workout. Check your connection and try again.")
      return
    }
    if (!res.ok) {
      rearmSave()
      const result = (await res.json().catch(() => ({}))) as { error?: string }
      setStartError(result.error || "Could not finish the workout. Try again.")
      return
    }
    if (res.ok) {
      const updated = (await res.json()) as WorkoutSession
      clearActiveWorkoutUiState(activeSession.id)
      const previous = completedSessions
        .filter((s) => s.id !== activeSession.id)
        .map((s) => ({
          exercises: normalizeWorkoutSessionExercises<SessionExercise>(s.exercises),
        }))
      setCompletion({
        sessionName: activeSession.name?.trim() || "Workout",
        dateKey: String(updated.date ?? activeSession.date).slice(0, 10),
        recap: buildWorkoutRecap({ exercises: exercisesPayload, previous, durationMin: duration }),
        bodyWeightLb: sess?.bodyWeightLb ?? null,
      })
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSession.id ? updated : s)),
      )
      try {
        const styleOverride = progressionOverridesForStyle(trainingStyle)
        const styleOverrides = styleOverride
          ? new Map(
              exercisesPayload.map((exercise) => [
                normalizeExerciseKey(exercise.name),
                styleOverride,
              ]),
            )
          : undefined
        const summary = summarizeWorkoutProgression(
          updated,
          completedSessions,
          styleOverrides,
        )
        await apiFetch("/api/workout-progression", {
          ...noStore,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: updated.id, summary }),
        })
      } catch {
        /* Summary is best-effort; never block finishing the workout. */
      }
      setActiveTemplateId(null)
      window.dispatchEvent(new CustomEvent("grid:log-saved"))
    }
  }

  async function discardActiveSession() {
    if (!activeSession) return
    setStartError(null)
    const unsaved = cancelPendingSave()
    let res: Response
    try {
      res = await apiFetch(`/api/workout-sessions/${activeSession.id}`, {
        ...noStore,
        method: "DELETE",
      })
    } catch {
      if (unsaved && !pendingSaveRef.current) pendingSaveRef.current = unsaved
      setStartError("Could not discard the workout. Check your connection and try again.")
      return
    }
    if (!res.ok) {
      if (unsaved && !pendingSaveRef.current) pendingSaveRef.current = unsaved
      const result = (await res.json().catch(() => ({}))) as { error?: string }
      setStartError(result.error || "Could not discard the workout. Try again.")
      return
    }
    if (res.ok) {
      clearActiveWorkoutUiState(activeSession.id)
      setSessions((prev) => prev.filter((s) => s.id !== activeSession.id))
      setActiveTemplateId(null)
      router.push("/")
    }
  }

  async function rememberTemplateSubstitution(input: {
    templateExerciseId?: string
    fromName: string
    toName: string
  }) {
    if (!activeTemplateId || !input.templateExerciseId) return
    const tmpl = templatesRef.current.find((t) => t.id === activeTemplateId)
    if (!tmpl) return
    const exs = parseExercises<TemplateExercise>(tmpl.exercises).map((raw) => {
      const m = migrateTemplateExercise(raw)
      if (m.id !== input.templateExerciseId) return templateExerciseToPersist(m)
      const recent = [
        input.toName,
        ...(m.recentSubstitutes ?? []).filter(
          (n) => n.toLowerCase() !== input.toName.toLowerCase(),
        ),
      ].slice(0, 6)
      return templateExerciseToPersist({
        ...m,
        preferredSubstituteName: input.toName,
        recentSubstitutes: recent,
      })
    })
    await saveTemplate(
      tmpl.name,
      exs,
      tmpl.id,
      tmpl.coverImageUrl ?? null,
      parseTemplateTags(tmpl.tags),
    )
  }

  async function saveTemplate(
    name: string,
    exercises: TemplateExercise[],
    id?: string,
    coverImageUrl?: string | null,
    tags: string[] = [],
  ): Promise<boolean> {
    const tagList = Array.isArray(tags) ? [...tags] : []
    const payload = id
      ? {
          id,
          name,
          exercises,
          coverImageUrl: coverImageUrl ?? null,
          tags: tagList,
        }
      : {
          name,
          exercises,
          coverImageUrl: coverImageUrl ?? null,
          tags: tagList,
        }
    try {
      const res = await apiFetch("/api/workout-templates", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const raw = await res.text()
      if (!res.ok) {
        console.error("[saveTemplate]", res.status, raw.slice(0, 500))
        return false
      }
      let row: WorkoutTemplate
      try {
        row = JSON.parse(raw) as WorkoutTemplate
      } catch {
        console.error("[saveTemplate] Invalid JSON from API", raw.slice(0, 200))
        return false
      }
      if (id) {
        setTemplates((prev) => prev.map((t) => (t.id === id ? row : t)))
      } else {
        setTemplates((prev) => [...prev, row])
      }
      return true
    } catch (e) {
      console.error("[saveTemplate]", e)
      return false
    }
  }

  function openNewRoutineEditor() {
    setRoutineEditorKey("new")
    setRoutineImportAsNew(false)
    setEditingTemplate(null)
    setShowRoutineEditor(true)
  }

  function openEditRoutineEditor(tmpl: WorkoutTemplate) {
    setRoutineEditorKey(tmpl.id)
    setRoutineImportAsNew(false)
    setEditingTemplate(tmpl)
    setShowRoutineEditor(true)
  }

  function closeRoutineEditor() {
    setShowRoutineEditor(false)
    setEditingTemplate(null)
    setRoutineEditorKey("new")
    setRoutineImportAsNew(false)
    if (returnToHubAfterEditorRef.current) {
      returnToHubAfterEditorRef.current = false
      router.push("/")
    }
  }

  return (
    <>
      {completion ? (
        <WorkoutCompleteScreen
          sessionName={completion.sessionName}
          dateKey={completion.dateKey}
          recap={completion.recap}
          bodyWeightLb={completion.bodyWeightLb}
          onDone={() => router.push("/")}
          onOpenJournal={() => router.push("/journal")}
        />
      ) : activeSession ? (
        <ActiveWorkout
          session={activeSession}
          onUpdate={(ex, name, bw) => void updateActiveSession(ex, name, bw)}
          onFinish={finishActiveSession}
          onDiscard={discardActiveSession}
          actionError={startError}
          previousSessions={completedSessions}
          templateId={activeTemplateId}
          onRememberSubstitution={(input) => {
            void rememberTemplateSubstitution(input)
          }}
          weekStart={weekStart}
          weekEnd={weekEnd}
          trainingStyle={trainingStyle}
          trainingSplit={trainingSplit}
        />
      ) : startError ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4">
          <p className="text-center text-sm text-destructive" role="alert">
            {startError}
          </p>
          <Button type="button" variant="outline" onClick={() => router.push("/")}>
            Back to hub
          </Button>
        </div>
      ) : startingWorkout || (!templatesLoaded && pendingStart) ? (
        <div className="flex min-h-[40vh] items-center justify-center px-4">
          <p className="text-sm text-muted-foreground">Starting workout…</p>
        </div>
      ) : null}

      <Suspense fallback={null}>
        <HubStartFromQuery
          templatesLoaded={templatesLoaded}
          templates={templates}
          startingWorkout={startingWorkout}
          onStartFree={() => {
            void startSession("Workout")
          }}
          onStartRoutine={(tmpl) => {
            const exs = parseExercises<TemplateExercise>(tmpl.exercises)
            void startSession(
              tmpl.name,
              exs,
              tmpl.coverImageUrl?.trim() ?? null,
              tmpl.id,
            )
          }}
        />
        <HubRoutineEditorFromQuery
          templatesLoaded={templatesLoaded}
          templates={templates}
          onNew={() => {
            returnToHubAfterEditorRef.current = true
            openNewRoutineEditor()
          }}
          onEdit={(tmpl) => {
            returnToHubAfterEditorRef.current = true
            openEditRoutineEditor(tmpl)
          }}
        />
      </Suspense>

      <RoutineEditor
        open={showRoutineEditor}
        onClose={closeRoutineEditor}
        initial={editingTemplate}
        hydrationKey={routineEditorKey}
        importAsNew={routineImportAsNew}
        onSave={saveTemplate}
      />
    </>
  )
}
