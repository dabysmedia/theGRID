"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import {
  ArrowLeftRight,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Dumbbell,
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  Settings2,
  Timer,
  Trash2,
  X,
} from "lucide-react"
import { addDays, format, startOfWeek, subDays } from "date-fns"
import { PageHeader } from "@/components/PageHeader"
import { PageHeroStrip } from "@/components/PageHeroStrip"
import { HistoryArchivedNote, HistoryEarlierSection } from "@/components/HistoryEarlierSection"
import { partitionHistoryDayGroups } from "@/lib/history-display"
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
import { useFullscreenOverlay } from "@/context/FullscreenOverlayContext"
import {
  DEFAULT_WORKOUT_REST,
  loadWorkoutRestConfig,
  saveWorkoutRestConfig,
  type WorkoutRestConfig,
} from "@/lib/workout-rest-config"
import { cn, formatDate, formatDisplayDate, glassPanelClass, parseLocalDate } from "@/lib/utils"
import { PlateCalculatorDialog } from "@/components/workouts/PlateCalculatorDialog"

/* ──────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────── */

interface ExerciseSet {
  id: string
  setNumber: number
  weight: number | null
  reps: number | null
  type: "working" | "warmup" | "dropset" | "failure"
  completed: boolean
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
  /** Legacy templates only — migrated to `setRows` on load */
  targetSets?: number
  targetReps?: string
}

interface PickedExercise {
  name: string
  primaryMuscles: MuscleTag[]
  secondaryMuscles: MuscleTag[]
  category: string
}

interface ApiExercise {
  id: string
  code: string
  name: string
  description?: string
  primaryMuscles: Array<{ id: string; code: string; color: string; name: string }>
  secondaryMuscles: Array<{ id: string; code: string; color: string; name: string }>
  types: Array<{ id: string; code: string; name: string }>
  categories: Array<{ id: string; code: string; name: string }>
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
  /** Routine cover when started from a template with art (`/uploads/routine-covers/…`). */
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
  const rows = ex.setRows
  if (Array.isArray(rows) && rows.length > 0) {
    return {
      id: ex.id,
      name: ex.name,
      notes: ex.notes ?? "",
      primaryMuscles: ex.primaryMuscles,
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
  const reps = ex.targetReps != null && String(ex.targetReps).trim() ? String(ex.targetReps) : "10"
  return {
    id: ex.id,
    name: ex.name,
    notes: ex.notes ?? "",
    primaryMuscles: ex.primaryMuscles,
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

function sessionSetsFromTemplate(m: TemplateExercise): ExerciseSet[] {
  return m.setRows.map((row, i) => ({
    id: uid(),
    setNumber: i + 1,
    weight: parseTemplateWeightToNumber(row.weight),
    reps: parseTemplateRepsToNumber(row.reps),
    type: "working" as const,
    completed: false,
  }))
}

function applyPrefillFromPrevious(
  list: SessionExercise[],
  prevMap: Map<string, ExerciseSet[]>,
  touched: Set<string>,
): { updated: SessionExercise[]; ghost: Set<string> } {
  const ghost = new Set<string>()
  const updated = list.map((ex) => {
    const prev = prevMap.get(ex.name.toLowerCase())
    if (!prev) return ex
    const newSets = ex.sets.map((set, idx) => {
      if (touched.has(set.id)) return set
      if (set.weight != null || set.reps != null) return set
      const p = prev[idx]
      if (!p || (p.weight == null && p.reps == null)) return set
      ghost.add(set.id)
      return {
        ...set,
        weight: p.weight ?? null,
        reps: p.reps ?? null,
      }
    })
    return { ...ex, sets: newSets }
  })
  return { updated, ghost }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

/* ──────────────────────────────────────────────────────────
   Exercise Library — offline fallback when API is unavailable
   ────────────────────────────────────────────────────────── */

const FALLBACK_MUSCLE_COLORS: Record<string, string> = {
  Chest: "#D62828",
  Back: "#1D4ED8",
  Shoulders: "#F77F00",
  Legs: "#577590",
  Quadriceps: "#577590",
  Hamstrings: "#90BE6D",
  Glutes: "#6D597A",
  Calves: "#4CC9F0",
  Arms: "#FFBE0B",
  Biceps: "#FFBE0B",
  Triceps: "#2DC653",
  Forearms: "#219EBC",
  Core: "#E76F51",
  Abdominals: "#E76F51",
  Obliques: "#00B4D8",
  Trapezius: "#264653",
  Cardio: "#4CC9F0",
}

function makeFallback(name: string, muscle: string, category = "Free weight"): ApiExercise {
  const color = FALLBACK_MUSCLE_COLORS[muscle] ?? "#888888"
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    code: name.toUpperCase().replace(/\s+/g, "_"),
    name,
    primaryMuscles: [{ id: muscle, code: muscle.toUpperCase(), color, name: muscle }],
    secondaryMuscles: [],
    types: [],
    categories: [{ id: category, code: category.toUpperCase().replace(/\s+/g, "_"), name: category }],
  }
}

const FALLBACK_EXERCISES: ApiExercise[] = [
  // Chest
  makeFallback("Bench Press", "Chest"), makeFallback("Incline Bench Press", "Chest"),
  makeFallback("Decline Bench Press", "Chest"), makeFallback("Dumbbell Bench Press", "Chest"),
  makeFallback("Dumbbell Flyes", "Chest"), makeFallback("Cable Crossover", "Chest", "Cable"),
  makeFallback("Push-ups", "Chest", "Body weight"), makeFallback("Chest Dips", "Chest", "Body weight"),
  makeFallback("Pec Deck", "Chest", "Machine"),
  // Back
  makeFallback("Deadlift", "Back"), makeFallback("Barbell Row", "Back"),
  makeFallback("Dumbbell Row", "Back"), makeFallback("Pull-ups", "Back", "Body weight"),
  makeFallback("Chin-ups", "Back", "Body weight"), makeFallback("Lat Pulldown", "Back", "Cable"),
  makeFallback("Seated Cable Row", "Back", "Cable"), makeFallback("T-Bar Row", "Back"),
  // Shoulders
  makeFallback("Overhead Press", "Shoulders"), makeFallback("Dumbbell Shoulder Press", "Shoulders"),
  makeFallback("Arnold Press", "Shoulders"), makeFallback("Lateral Raises", "Shoulders"),
  makeFallback("Front Raises", "Shoulders"), makeFallback("Face Pulls", "Shoulders", "Cable"),
  makeFallback("Rear Delt Flyes", "Shoulders"), makeFallback("Upright Row", "Shoulders"),
  // Legs
  makeFallback("Squat", "Quadriceps"), makeFallback("Front Squat", "Quadriceps"),
  makeFallback("Leg Press", "Quadriceps", "Machine"), makeFallback("Romanian Deadlift", "Hamstrings"),
  makeFallback("Leg Curl", "Hamstrings", "Machine"), makeFallback("Leg Extension", "Quadriceps", "Machine"),
  makeFallback("Bulgarian Split Squat", "Quadriceps"), makeFallback("Lunges", "Quadriceps"),
  makeFallback("Hip Thrust", "Glutes"), makeFallback("Calf Raises", "Calves"),
  // Arms
  makeFallback("Barbell Curl", "Biceps"), makeFallback("Dumbbell Curl", "Biceps"),
  makeFallback("Hammer Curl", "Biceps"), makeFallback("Preacher Curl", "Biceps"),
  makeFallback("Tricep Pushdown", "Triceps", "Cable"), makeFallback("Skull Crushers", "Triceps"),
  makeFallback("Overhead Tricep Extension", "Triceps"), makeFallback("Close-Grip Bench Press", "Triceps"),
  makeFallback("Dips", "Triceps", "Body weight"),
  // Core
  makeFallback("Plank", "Abdominals", "Body weight"), makeFallback("Hanging Leg Raise", "Abdominals", "Body weight"),
  makeFallback("Cable Crunch", "Abdominals", "Cable"), makeFallback("Ab Wheel Rollout", "Abdominals"),
  makeFallback("Russian Twist", "Obliques"), makeFallback("Bicycle Crunch", "Abdominals", "Body weight"),
  // Cardio
  makeFallback("Running", "Cardio", "Body weight"), makeFallback("Cycling", "Cardio"),
  makeFallback("Rowing Machine", "Cardio", "Machine"), makeFallback("Jump Rope", "Cardio", "Body weight"),
]

/** Client-side module-level cache so the picker doesn't re-fetch on every open. */
let exerciseListCache: ApiExercise[] | null = null

/* ──────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────── */

function normalizeDateKey(d: string): string {
  return d.split("T")[0]
}

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

/** Column headers for a Monday-start calendar week (matches `startOfWeek(..., { weekStartsOn: 1 })`). */
const CAL_WEEKDAY_LABELS_MON = ["M", "T", "W", "T", "F", "S", "S"] as const

/** Completed sessions required in the week before the summary shows a check (otherwise a progress ring). */
const WEEK_WORKOUT_CHECK_THRESHOLD = 3

/** Ring fill0–100% from `count / WEEK_WORKOUT_CHECK_THRESHOLD` (capped); check replaces it at threshold+. */
function WeekWorkoutGoalRing({ count }: { count: number }) {
  const stroke = 2.35
  const vb = 24
  const r = (vb - stroke) / 2
  const cx = vb / 2
  const cy = vb / 2
  const circumference = 2 * Math.PI * r
  const pct =
    Math.min(Math.max(count, 0), WEEK_WORKOUT_CHECK_THRESHOLD) /
    WEEK_WORKOUT_CHECK_THRESHOLD
  const dash = circumference * pct
  return (
    <svg
      viewBox={`0 0 ${vb} ${vb}`}
      className="size-[1.35rem] shrink-0 -rotate-90 sm:size-6"
      aria-hidden
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-muted-foreground/25"
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        className="text-emerald-500"
      />
    </svg>
  )
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

function getActiveWorkoutFocus(exercises: SessionExercise[]) {
  const totalSets = totalPlannedSets(exercises)
  const completedSets = totalSetsCompleted(exercises)
  const incompleteIdx = exercises.findIndex((ex) =>
    ex.sets.some((s) => !s.completed),
  )
  const currentIdx =
    incompleteIdx >= 0
      ? incompleteIdx
      : exercises.length > 0
        ? exercises.length - 1
        : -1
  const current = currentIdx >= 0 ? exercises[currentIdx] : null
  const next =
    incompleteIdx >= 0 && incompleteIdx < exercises.length - 1
      ? exercises[incompleteIdx + 1]
      : null
  const currentDone = current?.sets.filter((s) => s.completed).length ?? 0
  const currentTotal = current?.sets.length ?? 0
  const allSetsComplete = totalSets > 0 && completedSets >= totalSets

  return {
    totalSets,
    completedSets,
    current,
    next,
    currentDone,
    currentTotal,
    allSetsComplete,
    onLastExercise: incompleteIdx >= 0 && incompleteIdx === exercises.length - 1,
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

/* ──────────────────────────────────────────────────────────
   Exercise Picker Dialog
   ────────────────────────────────────────────────────────── */

function ExercisePicker({
  open,
  onClose,
  onSelect,
  title = "Add Exercise",
  description = "Search or filter by muscle group, then pick an exercise",
  initialMuscleGroup,
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
}) {
  const [exercises, setExercises] = useState<ApiExercise[]>(exerciseListCache ?? [])
  const [loading, setLoading] = useState(false)
  const [usingFallback, setUsingFallback] = useState(false)
  const [search, setSearch] = useState("")
  const [muscleFilter, setMuscleFilter] = useState<string>("All")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setSearch("")
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

  const results = useMemo(() => {
    const q = search.toLowerCase().trim()
    return exercises.filter((ex) => {
      if (
        muscleFilter !== "All" &&
        !ex.primaryMuscles.some((m) => m.name === muscleFilter)
      )
        return false
      if (q && !ex.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [exercises, search, muscleFilter])

  const grouped = useMemo(() => {
    const map = new Map<string, ApiExercise[]>()
    for (const ex of results) {
      const muscle = ex.primaryMuscles[0]?.name ?? "Other"
      if (!map.has(muscle)) map.set(muscle, [])
      map.get(muscle)!.push(ex)
    }
    return map
  }, [results])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton
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
                  onClick={() => setMuscleFilter(mg)}
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
          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-1 px-2 py-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 animate-pulse"
                >
                  <div className="size-9 rounded-lg bg-muted/20 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-muted/20 rounded w-3/4" />
                    <div className="h-2 bg-muted/15 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && usingFallback && (
            <p className="px-4 pt-2 pb-0 text-[10px] text-amber-400/70 text-center">
              Offline — using built-in list
            </p>
          )}

          {!loading && results.length === 0 && search.trim() && (
            <div className="py-6 px-4 text-center">
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

          {!loading &&
            Array.from(grouped.entries()).map(([muscle, exList]) => (
              <div key={muscle}>
                <p className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/50">
                  {muscle}
                </p>
                {exList.map((ex) => {
                  const swatch = muscleSwatchStyles(ex.primaryMuscles[0]?.color)
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
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
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/25 active:bg-muted/35 sm:py-2.5 touch-manipulation"
                    >
                      <div
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-8"
                        style={{ backgroundColor: swatch.soft }}
                      >
                        <div
                          className="size-2 rounded-full"
                          style={{ backgroundColor: swatch.dot }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{ex.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {ex.primaryMuscles.map((m) => (
                            <span
                              key={m.code}
                              className="text-[9px] font-medium rounded px-1.5 py-0.5"
                              style={{
                                backgroundColor: `${m.color}22`,
                                color: m.color,
                              }}
                            >
                              {m.name}
                            </span>
                          ))}
                          {ex.categories[0]?.name && (
                            <span className="text-[9px] text-muted-foreground/45">
                              · {ex.categories[0].name}
                            </span>
                          )}
                          {ex.secondaryMuscles.length > 0 && (
                            <span className="text-[9px] text-muted-foreground/35">
                              + {ex.secondaryMuscles.map((m) => m.name).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ──────────────────────────────────────────────────────────
   Routine Editor Dialog
   ────────────────────────────────────────────────────────── */

function RoutineEditor({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean
  onClose: () => void
  initial?: WorkoutTemplate | null
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
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)
  const [coverUploading, setCoverUploading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  /** Only re-hydrate from `initial` when the dialog opens or the template id changes — not when `initial` is a new object reference for the same row (that was wiping tag edits). */
  const hydratedTemplateIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) {
      hydratedTemplateIdRef.current = null
      setSaveError(null)
      return
    }
    const templateId = initial?.id ?? "new"
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
  }, [open, initial])

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
        setRows: [
          { id: uid(), reps: "10", weight: "" },
          { id: uid(), reps: "10", weight: "" },
          { id: uid(), reps: "10", weight: "" },
        ],
      },
    ])
  }

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
              <DialogTitle>{initial ? "Edit Routine" : "New Routine"}</DialogTitle>
              <DialogDescription className="sr-only">
                Name your routine and add exercises from the library
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
                  initial?.id,
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
              {initial ? "Save Changes" : "Create Routine"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ExercisePicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(picked) => addExercise(picked)}
      />
    </>
  )
}

/* ──────────────────────────────────────────────────────────
   Active Workout Component
   ────────────────────────────────────────────────────────── */

function ActiveWorkout({
  session,
  onUpdate,
  onFinish,
  onDiscard,
  previousSessions,
}: {
  session: WorkoutSession
  onUpdate: (
    exercises: SessionExercise[],
    name?: string,
    bodyWeightLb?: number | null,
  ) => void
  onFinish: () => void
  onDiscard: () => void
  previousSessions: WorkoutSession[]
}) {
  const { activeDate } = useActiveDate()
  const { setFullscreen } = useFullscreenOverlay()
  const exercises = parseExercises<SessionExercise>(session.exercises)
  const exercisesRef = useRef(exercises)
  exercisesRef.current = exercises
  const [showPicker, setShowPicker] = useState(false)
  const [confirmEndAction, setConfirmEndAction] = useState<
    null | "discard" | "finish"
  >(null)
  const [restConfig, setRestConfig] =
    useState<WorkoutRestConfig>(DEFAULT_WORKOUT_REST)
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  /** Total seconds for the current rest (config at start, +15s bumps this) — drives progress bar. */
  const [restTotalSec, setRestTotalSec] = useState(DEFAULT_WORKOUT_REST.seconds)
  const [, setRestTick] = useState(0)
  const [restSettingsOpen, setRestSettingsOpen] = useState(false)
  /** Survives dialog close racing React state — see swap picker `onClose` / `onSelect`. */
  const swapTargetRef = useRef<string | null>(null)
  const [swapExerciseId, setSwapExerciseId] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [collapsedExerciseIds, setCollapsedExerciseIds] = useState<Set<string>>(
    () => new Set(),
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
      setRestTick((t) => t + 1)
      setRestEndsAt((end) => {
        if (end == null || Date.now() < end) return end
        return null
      })
    }, 250)
    return () => clearInterval(id)
  }, [restEndsAt])

  useEffect(() => {
    const list = parseExercises<SessionExercise>(session.exercises)
    const c = new Set<string>()
    for (const ex of list) {
      if (ex.sets.length > 0 && ex.sets.every((s) => s.completed)) c.add(ex.id)
    }
    setCollapsedExerciseIds(c)
    weighInPrefilledRef.current = false
  }, [session.id])

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

  /** Most recent completed session wins per exercise name (for pre-fill + "Previous" column). */
  const previousByExercise = useMemo(() => {
    const map = new Map<string, ExerciseSet[]>()
    const completed = previousSessions
      .filter((s) => s.status === "completed" && s.id !== session.id)
      .sort((a, b) => {
        const ta = new Date(a.finishedAt ?? a.startedAt).getTime()
        const tb = new Date(b.finishedAt ?? b.startedAt).getTime()
        return tb - ta
      })
    for (const s of completed) {
      const exs = parseExercises<SessionExercise>(s.exercises)
      for (const ex of exs) {
        const key = ex.name.toLowerCase()
        if (!map.has(key)) {
          /* Full set history (not only checkbox-completed) for progressive overload */
          map.set(key, ex.sets)
        }
      }
    }
    return map
  }, [previousSessions, session.id])

  /** Pre-filled from last session — muted until user edits weight/reps. */
  const [ghostSetIds, setGhostSetIds] = useState<Set<string>>(() => new Set())
  const touchedSetIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    touchedSetIdsRef.current = new Set()
    setGhostSetIds(new Set())
  }, [session.id])

  const exerciseCount = exercises.length
  const setCountSig = exercises.reduce((n, ex) => n + ex.sets.length, 0)

  // onUpdate omitted from deps: parent passes a new function each render; session.exercises omitted to avoid re-running on every keystroke.
  useEffect(() => {
    const list = parseExercises<SessionExercise>(session.exercises)
    const { updated, ghost } = applyPrefillFromPrevious(
      list,
      previousByExercise,
      touchedSetIdsRef.current,
    )
    const changed = updated.some((ex, ei) =>
      ex.sets.some(
        (s, si) =>
          s.weight !== list[ei].sets[si].weight ||
          s.reps !== list[ei].sets[si].reps,
      ),
    )
    if (!changed) return
    setGhostSetIds(ghost)
    onUpdate(updated)
  }, [session.id, previousByExercise, exerciseCount, setCountSig])

  function addExercise(picked: PickedExercise) {
    const updated: SessionExercise[] = [
      ...exercises,
      {
        id: uid(),
        name: picked.name,
        notes: "",
        primaryMuscles: picked.primaryMuscles,
        secondaryMuscles: picked.secondaryMuscles,
        category: picked.category,
        sets: [
          {
            id: uid(),
            setNumber: 1,
            weight: null,
            reps: null,
            type: "working",
            completed: false,
          },
        ],
      },
    ]
    onUpdate(updated)
  }

  function swapExercise(exId: string, picked: PickedExercise) {
    const list = exercisesRef.current
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
        sets,
      }
    })
    setCollapsedExerciseIds((p) => {
      const next = new Set(p)
      next.delete(exId)
      return next
    })
    onUpdate(updated)
  }

  function removeExercise(exId: string) {
    setCollapsedExerciseIds((p) => {
      const next = new Set(p)
      next.delete(exId)
      return next
    })
    onUpdate(exercises.filter((e) => e.id !== exId))
  }

  function toggleExerciseCollapsed(exId: string) {
    setCollapsedExerciseIds((p) => {
      const next = new Set(p)
      if (next.has(exId)) next.delete(exId)
      else next.add(exId)
      return next
    })
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
    if (field === "weight" || field === "reps") {
      touchedSetIdsRef.current.add(setId)
      setGhostSetIds((prev) => {
        const next = new Set(prev)
        next.delete(setId)
        return next
      })
    }
    onUpdate(
      exercises.map((ex) => {
        if (ex.id !== exId) return ex
        return {
          ...ex,
          sets: ex.sets.map((s) =>
            s.id === setId ? { ...s, [field]: value } : s,
          ),
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

  function toggleSetComplete(exId: string, setId: string) {
    const exBefore = exercises.find((e) => e.id === exId)
    const setBefore = exBefore?.sets.find((s) => s.id === setId)
    const wasCompleted = setBefore?.completed ?? false

    const updated = exercises.map((ex) => {
      if (ex.id !== exId) return ex
      return {
        ...ex,
        sets: ex.sets.map((s) =>
          s.id === setId ? { ...s, completed: !s.completed } : s,
        ),
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
    } else if (restConfig.enabled) {
      const sec = restConfig.seconds
      setRestTotalSec(sec)
      setRestEndsAt(Date.now() + sec * 1000)
    }
    onUpdate(updated)
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
  const focus = getActiveWorkoutFocus(exercises)
  const sessionProgressPct =
    focus.totalSets > 0
      ? Math.min(100, Math.round((focus.completedSets / focus.totalSets) * 100))
      : 0
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

  const heroCover = session.coverImageUrl?.trim() ?? ""
  const setInputClass =
    "h-11 min-h-11 border-primary/30 bg-glass-highlight/30 px-1.5 text-center text-base tabular-nums backdrop-blur-sm ring-1 ring-inset ring-primary/15 focus-visible:border-primary/50 focus-visible:ring-primary/30 sm:h-9 sm:text-sm"
  const setInputGhostClass =
    "border-primary/15 bg-glass-highlight/15 text-muted-foreground/50 ring-primary/10"

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-workout-heading"
        className="fixed inset-0 z-[120] flex flex-col bg-background/50 backdrop-blur-xl supports-backdrop-filter:backdrop-blur-xl sm:items-center sm:justify-center sm:p-4"
      >
        <div
          className={cn(
            "glass-frost relative flex min-h-0 w-full flex-1 flex-col overflow-hidden sm:max-h-[min(92dvh,calc(100dvh-2rem))] sm:max-w-lg sm:flex-none sm:rounded-2xl",
          )}
        >
          {heroCover ? (
            <>
              {/* Hero band only — top of panel, not full scroll height */}
              <div
                className="pointer-events-none absolute left-0 right-0 top-0 z-0 h-[min(36dvh,15rem)] bg-cover bg-[center_top] bg-no-repeat opacity-[0.22] dark:opacity-[0.28] sm:rounded-t-2xl"
                style={{ backgroundImage: `url(${heroCover})` }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute left-0 right-0 top-0 z-[1] h-[min(36dvh,15rem)] bg-gradient-to-b from-background/90 via-background/40 to-transparent dark:from-background/94 dark:via-background/45 dark:to-transparent sm:rounded-t-2xl"
                aria-hidden
              />
            </>
          ) : null}
          <div
            className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(ellipse_90%_55%_at_50%_-8%,oklch(1_0_0/14%),transparent_58%)] dark:bg-[radial-gradient(ellipse_90%_50%_at_50%_-6%,oklch(1_0_0/10%),transparent_55%)]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-10 top-0 z-[2] h-px bg-gradient-to-r from-transparent via-glass-highlight/45 to-transparent dark:via-white/12"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-36 bg-gradient-to-b from-primary/[0.06] via-transparent to-transparent"
            aria-hidden
          />
          <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="shrink-0 border-b border-glass-border/25 px-4 pb-4 pt-[max(0.875rem,env(safe-area-inset-top))] sm:pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 pr-1">
                <div className="flex items-center gap-2">
                  <div className="status-dot" />
                  <p className="type-hud-eyebrow text-primary/85">In progress</p>
                </div>
                <h2
                  id="active-workout-heading"
                  className="font-heading mt-2 text-xl font-semibold leading-snug text-foreground sm:text-lg"
                >
                  {session.name?.trim() || "Active workout"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground/70">
                  {exercises.length === 0
                    ? "Add exercises to begin"
                    : focus.allSetsComplete
                      ? "All sets complete — finish when ready"
                      : focus.current
                        ? `Working on set ${Math.min(focus.currentDone + 1, focus.currentTotal)} of ${focus.currentTotal}`
                        : `${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <div className="glass-subtle flex shrink-0 flex-col items-end gap-1 rounded-2xl border border-primary/25 bg-primary/10 px-3.5 py-2.5 ring-1 ring-primary/15">
                <span className="type-hud-caption-tight text-muted-foreground/65">
                  Elapsed
                </span>
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-primary/90" aria-hidden />
                  <span className="font-heading text-2xl font-bold tabular-nums leading-none text-primary sm:text-xl">
                    {formatTimer(elapsed)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Session focus — progress + now / next */}
          <div className="shrink-0 border-b border-glass-border/20 px-4 py-3.5">
            <div className={cn(glassPanelClass, "space-y-3 overflow-hidden px-4 py-3.5")}>
              <div>
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="type-hud-label-soft">Session progress</p>
                    {loggedVol > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground/55">
                        {formatVolumeLb(loggedVol)} lb logged from completed sets
                      </p>
                    )}
                  </div>
                  <p className="font-heading text-lg font-bold tabular-nums text-foreground">
                    {focus.totalSets > 0 ? (
                      <>
                        {focus.completedSets}
                        <span className="text-sm font-semibold text-muted-foreground/50">
                          /{focus.totalSets}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </p>
                </div>
                <div
                  className="h-2.5 overflow-hidden rounded-full bg-glass-highlight/15 ring-1 ring-inset ring-glass-border/30"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={sessionProgressPct}
                  aria-label={`${focus.completedSets} of ${focus.totalSets} sets complete`}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                    style={{
                      width: `${sessionProgressPct}%`,
                      boxShadow: sessionProgressPct > 0 ? "0 0 10px oklch(0.82 0.18 110 / 25%)" : undefined,
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div
                  className="glass-subtle min-w-0 overflow-hidden rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5 ring-1 ring-primary/15"
                >
                  <p className="type-hud-caption-tight text-primary/90">Now</p>
                  <p className="mt-1 truncate text-sm font-semibold text-foreground">
                    {focus.current?.name ?? "No exercises yet"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground/65">
                    {focus.allSetsComplete
                      ? "Session complete"
                      : focus.current
                        ? focus.currentDone >= focus.currentTotal
                          ? "Exercise done"
                          : `${focus.currentTotal - focus.currentDone} set${focus.currentTotal - focus.currentDone === 1 ? "" : "s"} left`
                        : "Tap add exercise below"}
                  </p>
                </div>
                <div className="glass-subtle min-w-0 rounded-xl px-3 py-2.5">
                  <p className="type-hud-caption-tight text-muted-foreground/60">Up next</p>
                  <p className="mt-1 truncate text-sm font-semibold text-foreground/90">
                    {focus.allSetsComplete
                      ? "Wrap up & finish"
                      : focus.next?.name ??
                        (focus.onLastExercise && focus.current
                          ? "Last exercise"
                          : exercises.length === 0
                            ? "—"
                            : "—")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground/55">
                    {focus.allSetsComplete
                      ? "Review your log"
                      : focus.next
                        ? `${focus.next.sets.length} set${focus.next.sets.length === 1 ? "" : "s"} planned`
                        : focus.onLastExercise
                          ? "Then you are done"
                          : "Keep logging sets"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Rest timer — starts when a set is checked done; duration persisted locally */}
          <div className="shrink-0 border-b border-glass-border/20 px-4 py-3.5">
            {restCountdownActive && restRemainingSec != null ? (
              <div
                className="glass-subtle overflow-hidden rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3.5 ring-1 ring-primary/15"
                aria-live="polite"
                aria-atomic="true"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="type-hud-label-soft text-primary/85">Rest timer</span>
                  <span className="font-heading text-3xl font-bold tabular-nums tracking-tight text-primary sm:text-2xl">
                    {formatRestCountdown(restRemainingSec)}
                  </span>
                </div>
                <div
                  className="relative h-2.5 min-w-0 overflow-hidden rounded-full bg-glass-highlight/15 shadow-[inset_0_1px_2px_oklch(0_0_0/8%)] ring-1 ring-inset ring-glass-border/30"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(restProgress * 100)}
                  aria-label={`Rest ${formatRestCountdown(restRemainingSec)} remaining`}
                >
                  <div
                    className="will-change-transform absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-primary/40 via-primary to-primary/90 shadow-[0_0_12px_-2px] shadow-primary/35"
                    style={{
                      transform: `scaleX(${restProgress})`,
                      transition: "transform 160ms linear",
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="glass-subtle space-y-3 rounded-2xl px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Timer
                    className="size-4 shrink-0 text-muted-foreground/55"
                    aria-hidden
                  />
                  <span className="type-hud-label-soft">Rest after set</span>
                  <span className="glass-subtle rounded-lg px-2.5 py-1 text-sm tabular-nums font-semibold text-foreground">
                    {formatRestCountdown(restConfig.seconds)}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 min-h-10 touch-manipulation px-4 text-xs font-semibold"
                      onClick={() => {
                        const next = saveWorkoutRestConfig({
                          enabled: !restConfig.enabled,
                        })
                        setRestConfig(next)
                        if (!next.enabled) setRestEndsAt(null)
                      }}
                    >
                      {restConfig.enabled ? "On" : "Off"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-10 min-h-10 min-w-10 touch-manipulation"
                      aria-label={
                        restSettingsOpen
                          ? "Hide rest timer length options"
                          : "Choose rest timer length"
                      }
                      aria-expanded={restSettingsOpen}
                      onClick={() => setRestSettingsOpen((o) => !o)}
                    >
                      <Settings2 className="size-4" />
                    </Button>
                  </div>
                </div>
                {restSettingsOpen && (
                  <div className="flex flex-wrap gap-2">
                    {REST_PRESETS.map(({ sec, label }) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => {
                          const next = saveWorkoutRestConfig({ seconds: sec })
                          setRestConfig(next)
                        }}
                        className={cn(
                          "min-h-11 rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors touch-manipulation",
                          restConfig.seconds === sec
                            ? "glass-panel-accent text-primary ring-1 ring-primary/35 [--panel-accent:var(--primary)]"
                            : "glass-subtle text-muted-foreground/80 hover:bg-glass-highlight/20 active:scale-[0.98]",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Scrollable log */}
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain",
              "scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:size-0",
            )}
          >
            {exercises.length === 0 && (
              <div className="glass-subtle mx-4 my-8 rounded-2xl border border-dashed border-glass-border/35 px-6 py-10 text-center">
                <Dumbbell className="mx-auto size-8 text-muted-foreground/35" aria-hidden />
                <p className="mt-3 text-base font-medium text-foreground/90">
                  No exercises yet
                </p>
                <p className="mt-1 text-sm text-muted-foreground/65">
                  Add a movement below to start logging sets.
                </p>
              </div>
            )}

            <div className="space-y-3 px-4 py-3">
              {exercises.map((ex) => {
                const prev = previousByExercise.get(ex.name.toLowerCase())
                const collapsed = collapsedExerciseIds.has(ex.id)
                const setCount = ex.sets.length
                const doneCount = ex.sets.filter((s) => s.completed).length
                const collapseAnim =
                  "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
                return (
                  <div
                    key={ex.id}
                    className={cn(glassPanelClass, "overflow-hidden p-3.5")}
                  >
                    <div
                      className={cn(collapseAnim, collapsed ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
                    >
                      <div
                        className="min-h-0 overflow-hidden"
                        inert={collapsed ? undefined : true}
                      >
                        <button
                          type="button"
                          className="glass-subtle flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-glass-highlight/25 active:scale-[0.99] touch-manipulation"
                          onClick={() =>
                            setCollapsedExerciseIds((p) => {
                              const next = new Set(p)
                              next.delete(ex.id)
                              return next
                            })
                          }
                        >
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-foreground">
                              {ex.name}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground/60">
                              {doneCount}/{setCount} sets complete · Tap to expand
                            </p>
                          </div>
                          <ChevronRight
                            className="size-5 shrink-0 text-muted-foreground/45"
                            aria-hidden
                          />
                        </button>
                      </div>
                    </div>
                    <div
                      className={cn(collapseAnim, collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]")}
                    >
                      <div
                        className="min-h-0 overflow-hidden"
                        inert={collapsed ? true : undefined}
                      >
                      <div className="flex gap-3 pt-1">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => toggleExerciseCollapsed(ex.id)}
                              className="min-w-0 flex-1 rounded-xl border border-transparent px-2 py-2 -mx-1 text-left transition-colors hover:bg-glass-highlight/20 hover:border-glass-border/25 active:bg-glass-highlight/30 touch-manipulation"
                              aria-expanded={!collapsed}
                            >
                              <h3 className="m-0 text-base font-semibold leading-snug text-foreground break-words sm:text-sm">
                                {ex.name}
                              </h3>
                              {ex.primaryMuscles && ex.primaryMuscles.length > 0 && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  {ex.primaryMuscles.map((m) => (
                                    <span
                                      key={m.code}
                                      className="text-[10px] font-semibold rounded-md px-2 py-0.5"
                                      style={{ backgroundColor: `${m.color}22`, color: m.color }}
                                    >
                                      {m.name}
                                    </span>
                                  ))}
                                  {ex.category && (
                                    <span className="text-[10px] text-muted-foreground/50">
                                      · {ex.category}
                                    </span>
                                  )}
                                </div>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                swapTargetRef.current = ex.id
                                setSwapExerciseId(ex.id)
                                setShowPicker(true)
                              }}
                              className="glass-subtle flex size-12 shrink-0 items-center justify-center rounded-xl text-muted-foreground/55 transition-colors hover:border-primary/30 hover:bg-glass-highlight/30 hover:text-primary active:scale-[0.97] touch-manipulation"
                              aria-label={`Swap ${ex.name} for another exercise`}
                            >
                              <ArrowLeftRight className="size-5 shrink-0" aria-hidden />
                            </button>
                          </div>

                          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.5rem_4.75rem_4.75rem_3.25rem] gap-2 px-0.5 sm:grid-cols-[2rem_1fr_2.25rem_4.5rem_4.5rem_2.75rem] sm:gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/55 text-center">
                            Set
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/55">
                            Prev
                          </span>
                          <span aria-hidden className="min-w-0" />
                          <span className="col-start-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/55 text-center">
                            lb
                          </span>
                          <span className="col-start-5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/55 text-center">
                            Reps
                          </span>
                          <span className="col-start-6 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/55 text-center">
                            Done
                          </span>
                        </div>

                        {ex.sets.map((set) => {
                          const prevSet = prev?.[set.setNumber - 1]
                          const typeInfo = SET_TYPE_LABELS[set.type]
                          const swipeKey = setSwipeRowKey(ex.id, set.id)
                          const swipeDx =
                            setSwipeVisual?.key === swipeKey ? setSwipeVisual.dx : 0
                          return (
                            <div
                              key={set.id}
                              className="relative select-none overflow-hidden rounded-lg"
                              onPointerDown={(e) => onSetRowPointerDown(ex, set, e)}
                              onPointerMove={onSetRowPointerMove}
                              onPointerUp={onSetRowPointerEnd}
                              onPointerCancel={onSetRowPointerEnd}
                            >
                              {swipeDx < -24 && ex.sets.length > 1 ? (
                                <div
                                  className="pointer-events-none absolute inset-y-0.5 right-0.5 z-[1] flex w-9 items-center justify-center rounded-md bg-destructive/18"
                                  aria-hidden
                                >
                                  <X className="size-4 text-destructive" />
                                </div>
                              ) : null}
                              <div
                                className={cn(
                                  "grid grid-cols-[2.75rem_minmax(0,1fr)_2.5rem_4.75rem_4.75rem_3.25rem] gap-2 items-center rounded-xl px-0.5 py-1 transition-colors sm:grid-cols-[2rem_1fr_2.25rem_4.5rem_4.5rem_2.75rem] sm:gap-1.5 sm:py-0.5",
                                  set.completed && "border border-primary/20 bg-primary/10 ring-1 ring-primary/20",
                                )}
                                style={{
                                  transform: swipeDx !== 0 ? `translateX(${swipeDx}px)` : undefined,
                                  transition:
                                    swipeDx !== 0 ? "none" : "transform 0.2s ease-out",
                                }}
                              >
                              <button
                                type="button"
                                onClick={() => cycleSetType(ex.id, set.id)}
                                className={cn(
                                  "flex min-h-11 min-w-11 items-center justify-center rounded-xl text-sm font-bold tabular-nums transition-colors touch-manipulation active:scale-[0.96]",
                                  typeInfo.color,
                                )}
                                title={`Type: ${set.type} (tap to change)`}
                              >
                                {set.type === "working" ? set.setNumber : typeInfo.short}
                              </button>

                              <span className="text-xs text-muted-foreground/55 tabular-nums truncate px-0.5">
                                {prevSet
                                  ? `${prevSet.weight ?? "–"}×${prevSet.reps ?? "–"}`
                                  : "–"}
                              </span>

                              <button
                                type="button"
                                className="glass-subtle flex size-10 min-h-10 min-w-10 items-center justify-center rounded-xl text-muted-foreground/50 transition-colors hover:border-primary/30 hover:bg-glass-highlight/30 hover:text-primary active:scale-[0.96] touch-manipulation sm:size-9 sm:min-h-9 sm:min-w-9"
                                aria-label="Plate calculator"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setPlateCalcTarget({
                                    exId: ex.id,
                                    setId: set.id,
                                    weight: set.weight,
                                  })
                                }}
                              >
                                <Calculator className="size-4 sm:size-3.5" aria-hidden />
                              </button>

                              <Input
                                type="number"
                                className={cn(
                                  setInputClass,
                                  ghostSetIds.has(set.id) && setInputGhostClass,
                                )}
                                placeholder="—"
                                value={set.weight ?? ""}
                                onFocus={() => clearGhostForSet(set.id)}
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
                                className={cn(
                                  setInputClass,
                                  ghostSetIds.has(set.id) && setInputGhostClass,
                                )}
                                placeholder="—"
                                value={set.reps ?? ""}
                                onFocus={() => clearGhostForSet(set.id)}
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
                                onClick={() => toggleSetComplete(ex.id, set.id)}
                                className={cn(
                                  "mx-auto flex size-11 items-center justify-center rounded-xl transition-all touch-manipulation active:scale-[0.94]",
                                  set.completed
                                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                                    : "glass-subtle text-muted-foreground/45 hover:bg-glass-highlight/25",
                                )}
                              >
                                <Check className="size-5" />
                              </button>
                              </div>
                            </div>
                          )
                        })}

                        <div className="flex gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => addSet(ex.id)}
                            className="glass-subtle flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-glass-border/40 py-3 text-sm font-semibold text-muted-foreground/70 transition-colors hover:bg-glass-highlight/20 hover:text-foreground active:scale-[0.99] touch-manipulation"
                          >
                            <Plus className="size-4" />
                            Add set
                          </button>
                          <button
                            type="button"
                            onClick={() => removeExercise(ex.id)}
                            className="glass-subtle flex size-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-glass-border/40 text-muted-foreground/45 transition-colors hover:border-red-500/35 hover:bg-red-500/10 hover:text-red-400 active:scale-[0.97] touch-manipulation"
                            aria-label={`Remove ${ex.name}`}
                          >
                            <Trash2 className="size-5" />
                          </button>
                          </div>
                        </div>
                      </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="px-4 pb-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  swapTargetRef.current = null
                  setSwapExerciseId(null)
                  setShowPicker(true)
                }}
                className="glass-subtle flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/30 py-3.5 text-base font-semibold text-primary/90 transition-colors hover:bg-glass-highlight/25 active:scale-[0.99] touch-manipulation sm:min-h-12 sm:text-sm"
              >
                <Plus className="size-5" />
                Add exercise
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="glass-subtle shrink-0 border-t border-glass-border/25 px-4 py-3.5 pb-[max(1.25rem,calc(0.875rem+env(safe-area-inset-bottom)))]">
            <div className="flex items-stretch gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                className="size-14 min-h-14 min-w-14 shrink-0 touch-manipulation rounded-2xl border-red-500/30 text-red-400 hover:bg-red-500/10 active:scale-[0.97] sm:size-12 sm:min-h-12 sm:min-w-12 sm:rounded-xl"
                aria-label="Discard workout"
                onClick={() => setConfirmEndAction("discard")}
              >
                <X className="size-5" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="glass"
                size="lg"
                className="h-14 min-h-14 min-w-0 flex-1 gap-2.5 rounded-2xl text-base font-semibold press-scale touch-manipulation sm:h-12 sm:min-h-12 sm:rounded-xl sm:text-sm"
                onClick={() => setConfirmEndAction("finish")}
              >
                <Check className="size-5 shrink-0" />
                Finish workout
              </Button>
            </div>
          </div>
          </div>
        </div>
      </div>

      <Dialog
        open={confirmEndAction !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmEndAction(null)
        }}
      >
        <DialogContent
          showCloseButton
          className={cn(
            "glass-frost max-w-sm gap-0 p-0",
            "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3",
          )}
        >
          <div className="space-y-2 px-4 pb-2 pt-4 pr-12">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle>
                {confirmEndAction === "discard"
                  ? "Discard this workout?"
                  : "Finish this workout?"}
              </DialogTitle>
              <DialogDescription>
                {confirmEndAction === "discard"
                  ? "This session will be removed from your log. You can’t undo this."
                  : "Save this session as completed and return to the workouts screen."}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex gap-2.5 border-t border-border/15 px-4 py-4">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 min-h-12 flex-1 touch-manipulation text-base sm:text-sm"
              onClick={() => setConfirmEndAction(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirmEndAction === "discard" ? "destructive" : "glass"}
              size="lg"
              className={cn(
                "h-12 min-h-12 flex-1 touch-manipulation gap-2 text-base sm:text-sm",
                confirmEndAction === "finish" && "press-scale",
              )}
              onClick={() => {
                if (confirmEndAction === "discard") onDiscard()
                else if (confirmEndAction === "finish") onFinish()
                setConfirmEndAction(null)
              }}
            >
              {confirmEndAction === "finish" && (
                <Check className="size-4 shrink-0" aria-hidden />
              )}
              {confirmEndAction === "discard" ? "Discard" : "Finish workout"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PlateCalculatorDialog
        open={plateCalcTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPlateCalcTarget(null)
        }}
        initialWeight={plateCalcTarget?.weight ?? null}
        onApply={(weightLb) => {
          if (plateCalcTarget) {
            updateSet(plateCalcTarget.exId, plateCalcTarget.setId, "weight", weightLb)
            clearGhostForSet(plateCalcTarget.setId)
          }
          setPlateCalcTarget(null)
        }}
      />

      <ExercisePicker
        open={showPicker}
        onClose={() => {
          setShowPicker(false)
          setSwapExerciseId(null)
          /* Let a library row’s onSelect run in the same gesture before clearing swap target. */
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

function reorderRoutineIds(
  ids: readonly string[],
  dragId: string,
  insertBeforeId: string,
): string[] {
  if (dragId === insertBeforeId) return [...ids]
  const without = ids.filter((id) => id !== dragId)
  const at = without.indexOf(insertBeforeId)
  if (at < 0) return [...ids]
  return [...without.slice(0, at), dragId, ...without.slice(at)]
}

function moveRoutineIdToEnd(ids: readonly string[], dragId: string): string[] {
  return [...ids.filter((id) => id !== dragId), dragId]
}

const ROUTINE_REORDER_DROP_END = "__routine_drop_end__"

function hitTestRoutineReorderTarget(clientX: number, clientY: number): string | null {
  const under = document.elementFromPoint(clientX, clientY)
  if (!under) return null
  if (under.closest("[data-routine-drop-end]")) return ROUTINE_REORDER_DROP_END
  const tile = under.closest("[data-routine-tile]") as HTMLElement | null
  return tile?.dataset.routineTile ?? null
}

/** Safari can cache GET /api/workout-sessions and serve a stale list after POST — breaks active workout. */
const noStore: RequestInit = { cache: "no-store" }

function sessionsListUrl(): string {
  return `/api/workout-sessions?_=${Date.now()}`
}

/* ──────────────────────────────────────────────────────────
   Main Page
   ────────────────────────────────────────────────────────── */

export default function WorkoutsPage() {
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set())
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [showRoutineEditor, setShowRoutineEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<WorkoutTemplate | null>(null)
  const [templateMenuId, setTemplateMenuId] = useState<string | null>(null)
  const [routineRearrangeMode, setRoutineRearrangeMode] = useState(false)
  const [routinePointerDrag, setRoutinePointerDrag] = useState<string | null>(null)
  const [routineDragOverId, setRoutineDragOverId] = useState<string | null>(null)
  const templatesRef = useRef<WorkoutTemplate[]>([])
  const routineDragSessionRef = useRef<{
    pointerId: number
    activeId: string
    overId: string | null
  } | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [startingWorkout, setStartingWorkout] = useState(false)

  templatesRef.current = templates

  const { activeDate } = useActiveDate()
  const today = activeDate
  const yesterday = formatDate(subDays(parseLocalDate(activeDate), 1))

  // Fetch data
  useEffect(() => {
    Promise.all([
      apiFetch(sessionsListUrl(), noStore).then((r) => r.json()),
      apiFetch(`/api/workout-templates?_=${Date.now()}`, noStore).then((r) => r.json()),
    ])
      .then(([s, t]) => {
        setSessions(Array.isArray(s) ? s : [])
        setTemplates(Array.isArray(t) ? t : [])
      })
      .catch(() => {
        setSessions([])
        setTemplates([])
      })
  }, [])

  const activeSession = useMemo(() => {
    const norm = (s: WorkoutSession) =>
      String(s.status ?? "").trim().toLowerCase()
    return sessions.find((s) => norm(s) === "active") ?? null
  }, [sessions])

  const { weekStart, weekEnd, weekDayKeys } = useMemo(() => {
    const ref = parseLocalDate(activeDate)
    const start = startOfWeek(ref, { weekStartsOn: 1 })
    const weekStartStr = formatDate(start)
    const weekEndStr = formatDate(addDays(start, 6))
    const keys = Array.from({ length: 7 }, (_, i) =>
      formatDate(addDays(start, i)),
    )
    return {
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      weekDayKeys: keys,
    }
  }, [activeDate])

  const completedSessions = useMemo(() => {
    const norm = (s: WorkoutSession) =>
      String(s.status ?? "").trim().toLowerCase()
    return sessions.filter((s) => norm(s) === "completed")
  }, [sessions])

  const byDay = useMemo(() => {
    const m = new Map<string, WorkoutSession[]>()
    for (const s of completedSessions) {
      const k = normalizeDateKey(s.date)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return m
  }, [completedSessions])

  const stats = useMemo(() => {
    const weekSessions = completedSessions.filter((s) => {
      const k = normalizeDateKey(s.date)
      return k >= weekStart && k <= weekEnd
    })
    const weekCount = weekSessions.length
    const weekVolume = weekSessions.reduce((sum, s) => {
      const exs = parseExercises<SessionExercise>(s.exercises)
      return sum + totalVolume(exs)
    }, 0)
    const weekSets = weekSessions.reduce((sum, s) => {
      const exs = parseExercises<SessionExercise>(s.exercises)
      return sum + totalSetsCompleted(exs)
    }, 0)

    let streakDays = 0
    const ref = parseLocalDate(activeDate)
    for (let i = 0; i < 365; i++) {
      const k = formatDate(subDays(ref, i))
      if (byDay.has(k)) streakDays++
      else break
    }

    return { weekCount, weekVolume, weekSets, streakDays }
  }, [completedSessions, weekStart, weekEnd, byDay, activeDate])

  const historyByDate = useMemo(() => {
    const keys = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a))
    return keys.map((k) => [k, byDay.get(k)!] as const)
  }, [byDay])

  const journalHistoryDisplay = useMemo(
    () => partitionHistoryDayGroups(historyByDate, (tuple) => tuple[0], today),
    [historyByDate, today]
  )

  // ── Actions ───────────────────────────

  async function startSession(
    name: string,
    templateExercises?: TemplateExercise[],
    routineCoverUrl?: string | null,
  ) {
    setStartError(null)
    const exercises: SessionExercise[] = templateExercises
      ? templateExercises.map((te) => {
          const m = migrateTemplateExercise(te)
          return {
            id: uid(),
            name: m.name,
            notes: m.notes,
            primaryMuscles: m.primaryMuscles,
            sets: sessionSetsFromTemplate(m),
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

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await apiFetch(`/api/workout-sessions/${activeSession.id}`, {
        ...noStore,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercises,
          ...(name ? { name } : {}),
          ...(bodyWeightLb !== undefined ? { bodyWeightLb } : {}),
        }),
      })
    }, 800)
  }

  async function finishActiveSession() {
    if (!activeSession) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const startMs = new Date(activeSession.startedAt).getTime()
    const duration = Math.round((Date.now() - startMs) / 60000)

    const sess = sessions.find((s) => s.id === activeSession.id)
    const exercisesPayload = parseExercises<SessionExercise>(
      sess?.exercises ?? activeSession.exercises,
    )

    const res = await apiFetch(`/api/workout-sessions/${activeSession.id}`, {
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
    if (res.ok) {
      const updated = await res.json()
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSession.id ? updated : s)),
      )
    }
  }

  async function discardActiveSession() {
    if (!activeSession) return
    const res = await apiFetch(`/api/workout-sessions/${activeSession.id}`, {
      ...noStore,
      method: "DELETE",
    })
    if (res.ok) {
      setSessions((prev) => prev.filter((s) => s.id !== activeSession.id))
    }
  }

  async function deleteSession(id: string) {
    const res = await apiFetch(`/api/workout-sessions/${id}`, {
      ...noStore,
      method: "DELETE",
    })
    if (res.ok) setSessions((prev) => prev.filter((s) => s.id !== id))
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

  async function deleteTemplate(id: string) {
    const res = await apiFetch(`/api/workout-templates?id=${id}`, {
      method: "DELETE",
    })
    if (res.ok) setTemplates((prev) => prev.filter((t) => t.id !== id))
    setTemplateMenuId(null)
  }

  async function persistRoutineOrder(orderedIds: string[]) {
    setTemplates((prev) => {
      const m = new Map(prev.map((t) => [t.id, t]))
      return orderedIds.map((id) => m.get(id)).filter((t): t is WorkoutTemplate => t != null)
    })
    try {
      const res = await apiFetch("/api/workout-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      })
      if (res.ok) {
        const refreshed = await res.json()
        if (Array.isArray(refreshed)) setTemplates(refreshed)
      } else {
        const r = await apiFetch(`/api/workout-templates?_=${Date.now()}`, noStore)
        if (r.ok) {
          const t = await r.json()
          if (Array.isArray(t)) setTemplates(t)
        }
      }
    } catch {
      const r = await apiFetch(`/api/workout-templates?_=${Date.now()}`, noStore)
      if (r.ok) {
        const t = await r.json()
        if (Array.isArray(t)) setTemplates(t)
      }
    }
  }

  useEffect(() => {
    if (templates.length >= 2) return
    setRoutineRearrangeMode(false)
    routineDragSessionRef.current = null
    setRoutinePointerDrag(null)
    setRoutineDragOverId(null)
  }, [templates.length])

  useEffect(() => {
    if (routineRearrangeMode) return
    routineDragSessionRef.current = null
    setRoutinePointerDrag(null)
    setRoutineDragOverId(null)
  }, [routineRearrangeMode])

  function handleRoutineTilePointerDown(tmplId: string, e: React.PointerEvent<HTMLDivElement>) {
    if (!routineRearrangeMode) return
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    routineDragSessionRef.current = {
      pointerId: e.pointerId,
      activeId: tmplId,
      overId: tmplId,
    }
    setRoutinePointerDrag(tmplId)
    setRoutineDragOverId(tmplId)
    el.setPointerCapture(e.pointerId)
  }

  function handleRoutineTilePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const s = routineDragSessionRef.current
    if (!s || e.pointerId !== s.pointerId) return
    const over = hitTestRoutineReorderTarget(e.clientX, e.clientY)
    if (over !== s.overId) {
      s.overId = over
      setRoutineDragOverId(over)
    }
  }

  function handleRoutineTilePointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const s = routineDragSessionRef.current
    if (!s || e.pointerId !== s.pointerId) return
    const el = e.currentTarget
    if (el.hasPointerCapture(e.pointerId)) {
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    const { activeId, overId } = s
    routineDragSessionRef.current = null
    setRoutinePointerDrag(null)
    setRoutineDragOverId(null)

    if (overId == null || overId === activeId) return
    const ids = templatesRef.current.map((t) => t.id)
    if (overId === ROUTINE_REORDER_DROP_END) {
      void persistRoutineOrder(moveRoutineIdToEnd(ids, activeId))
      return
    }
    void persistRoutineOrder(reorderRoutineIds(ids, activeId, overId))
  }

  function toggleDay(key: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSessionExpand(id: string) {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function sectionDateLabel(dateKey: string): string {
    if (dateKey === today) return "Today"
    if (dateKey === yesterday) return "Yesterday"
    return format(new Date(dateKey + "T12:00:00"), "EEEE, MMM d")
  }

  function WorkoutJournalDayCard({
    dateKey,
    daySessions,
    alwaysExpanded,
  }: {
    dateKey: string
    daySessions: WorkoutSession[]
    alwaysExpanded: boolean
  }) {
    const isOpen = alwaysExpanded || expandedDays.has(dateKey)
    const dayVolume = daySessions.reduce((s, sess) => {
      const exs = parseExercises<SessionExercise>(sess.exercises)
      return s + totalVolume(exs)
    }, 0)
    const dayDuration = daySessions.reduce((s, sess) => s + (sess.duration ?? 0), 0)

    return (
      <div className="glass-panel overflow-hidden">
        <button
          type="button"
          onClick={() => {
            if (!alwaysExpanded) toggleDay(dateKey)
          }}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left touch-manipulation transition-colors hover:bg-glass-highlight/20"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <span className="text-sm font-bold tabular-nums text-primary">{daySessions.length}</span>
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {sectionDateLabel(dateKey)}
            </span>
            <div className="flex items-center gap-3 mt-0.5">
              {dayDuration > 0 && (
                <span className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground/50">
                  <Clock className="size-2.5" />
                  {dayDuration} min
                </span>
              )}
              {dayVolume > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground/50">
                  {dayVolume >= 1000 ? `${(dayVolume / 1000).toFixed(1)}k lb` : `${dayVolume} lb`}
                </span>
              )}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground/40 transition-transform duration-200",
              isOpen && "rotate-180",
            )}
          />
        </button>

        {isOpen && (
          <div className="border-t border-border/20 px-3 pb-3 pt-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
            {[...daySessions]
              .sort(
                (a, b) =>
                  new Date(b.finishedAt ?? b.startedAt).getTime() -
                  new Date(a.finishedAt ?? a.startedAt).getTime(),
              )
              .map((sess) => {
                const exs = parseExercises<SessionExercise>(sess.exercises)
                const sessVol = totalVolume(exs)
                const sessExpanded = expandedSessionIds.has(sess.id)
                return (
                  <div
                    key={sess.id}
                    className="rounded-xl border border-border/15 bg-muted/[0.06] overflow-hidden"
                  >
                    <div className="flex items-stretch gap-1">
                      <button
                        type="button"
                        onClick={() => toggleSessionExpand(sess.id)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 text-left touch-manipulation transition-colors hover:bg-glass-highlight/15"
                      >
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground/45 transition-transform duration-200",
                            sessExpanded && "rotate-180",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{sess.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            {sess.duration != null && (
                              <span className="text-[10px] tabular-nums text-muted-foreground/50">
                                {sess.duration} min
                              </span>
                            )}
                            {sess.bodyWeightLb != null && Number.isFinite(sess.bodyWeightLb) && (
                              <span className="text-[10px] tabular-nums text-muted-foreground/50">
                                BW {sess.bodyWeightLb} lb
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground/40">
                              {exs.length} exercise{exs.length !== 1 ? "s" : ""}
                            </span>
                            {sessVol > 0 && (
                              <span className="text-[10px] tabular-nums text-muted-foreground/45">
                                {sessVol >= 1000
                                  ? `${(sessVol / 1000).toFixed(1)}k lb vol`
                                  : `${sessVol} lb vol`}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteSession(sess.id)
                        }}
                        className="history-row-delete shrink-0 self-center mr-2"
                        aria-label="Delete session"
                      >
                        <Trash2 />
                      </button>
                    </div>

                    {sessExpanded && (
                      <div className="border-t border-border/15 px-2.5 pb-2.5 pt-1 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                        {exs.map((ex) => (
                          <div
                            key={ex.id}
                            className="rounded-lg border border-border/12 bg-background/30 px-2.5 py-2"
                          >
                            <p className="mb-1.5 text-[11px] font-semibold text-primary">{ex.name}</p>
                            {ex.sets.length === 0 ? (
                              <p className="text-[10px] text-muted-foreground/45">No sets logged</p>
                            ) : (
                              <>
                                <div className="grid grid-cols-[2rem_1fr_1fr_1.75rem] gap-x-1.5 gap-y-1 text-[9px] uppercase tracking-wide text-muted-foreground/40">
                                  <span className="text-center">#</span>
                                  <span className="text-center">lb</span>
                                  <span className="text-center">reps</span>
                                  <span className="text-center" title="Logged">
                                    ✓
                                  </span>
                                </div>
                                {ex.sets.map((set) => (
                                  <div
                                    key={set.id}
                                    className={cn(
                                      "grid grid-cols-[2rem_1fr_1fr_1.75rem] items-center gap-x-1.5 gap-y-0.5 rounded-md py-1 text-[10px] tabular-nums",
                                      set.completed
                                        ? "text-muted-foreground/80"
                                        : "text-muted-foreground/45",
                                    )}
                                  >
                                    <span className="text-center font-medium text-muted-foreground/50">
                                      {set.setNumber}
                                    </span>
                                    <span className="text-center">{set.weight ?? "–"}</span>
                                    <span className="text-center">{set.reps ?? "–"}</span>
                                    <span className="text-center text-[9px]">
                                      {set.completed ? (
                                        <Check className="mx-auto size-3 text-emerald-500/90" />
                                      ) : (
                                        <span className="text-muted-foreground/25">—</span>
                                      )}
                                    </span>
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {activeSession ? (
        <ActiveWorkout
          session={activeSession}
          onUpdate={(ex, name, bw) => void updateActiveSession(ex, name, bw)}
          onFinish={finishActiveSession}
          onDiscard={discardActiveSession}
          previousSessions={completedSessions}
        />
      ) : (
        <div className="space-y-6">
          <PageHeader title="Workouts" />

          <PageHeroStrip
            color="#c4d632"
            icon={Dumbbell}
            eyebrow={`This week · ${formatDisplayDate(parseLocalDate(activeDate))}`}
            value={
              stats.weekVolume > 0
                ? stats.weekVolume >= 1000
                  ? `${(stats.weekVolume / 1000).toFixed(1)}k`
                  : String(stats.weekVolume)
                : "—"
            }
            unit="lb volume"
            metrics={[
              { label: "Sessions", value: String(stats.weekCount), sub: "this week" },
              { label: "Sets", value: stats.weekSets ? String(stats.weekSets) : "—", sub: "completed" },
              {
                label: "Streak",
                value: String(stats.streakDays),
                sub: `day${stats.streakDays === 1 ? "" : "s"}`,
              },
            ]}
          />

          {/* Week activity dots */}
          <div className="glass-panel bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-primary/[0.03] px-5 py-4 animate-fade-up dark:from-glass-highlight/[0.1] dark:to-primary/[0.05]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-8%,oklch(1_0_0/14%),transparent_58%)] dark:bg-[radial-gradient(ellipse_90%_50%_at_50%_-6%,oklch(1_0_0/10%),transparent_55%)]" aria-hidden />
            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-glass-highlight/45 to-transparent dark:via-white/12" aria-hidden />
            <div className="relative z-10">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="sr-only">
                  {stats.weekCount >= WEEK_WORKOUT_CHECK_THRESHOLD
                    ? `${stats.weekCount} completed workout${stats.weekCount === 1 ? "" : "s"} this week, weekly goal met (${WEEK_WORKOUT_CHECK_THRESHOLD}+ workouts)`
                    : `${stats.weekCount} of ${WEEK_WORKOUT_CHECK_THRESHOLD} weekly workouts completed`}
                </span>
                {stats.weekCount >= WEEK_WORKOUT_CHECK_THRESHOLD ? (
                  <Check
                    className="size-[1.35rem] shrink-0 text-emerald-500 sm:size-6"
                    strokeWidth={2.75}
                    aria-hidden
                  />
                ) : (
                  <WeekWorkoutGoalRing count={stats.weekCount} />
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
                    This week
                  </p>
                  <p className="text-[10px] text-muted-foreground/60">
                    {stats.weekCount >= WEEK_WORKOUT_CHECK_THRESHOLD
                      ? "Goal met"
                      : stats.weekCount === 0
                        ? "Not yet"
                        : `${stats.weekCount}/${WEEK_WORKOUT_CHECK_THRESHOLD} workouts`}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-1">
                {weekDayKeys.map((key, i) => {
                  const count = byDay.get(key)?.length ?? 0
                  const isActive = key === today
                  const has = count > 0
                  const dayDate = parseLocalDate(key)
                  const dayOfMonth = dayDate.getDate()
                  const weekdayLong = format(dayDate, "EEEE")
                  return (
                    <div key={key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <span
                        className={cn(
                          "whitespace-nowrap text-[10px] font-semibold tracking-wider sm:text-[11px]",
                          isActive ? "text-foreground" : "text-muted-foreground/50",
                        )}
                      >
                        {CAL_WEEKDAY_LABELS_MON[i]}
                      </span>
                      <div
                        role="img"
                        aria-label={
                          count > 0
                            ? `${weekdayLong} ${dayOfMonth}, ${count} workout${count === 1 ? "" : "s"}`
                            : `${weekdayLong} ${dayOfMonth}, no workouts`
                        }
                        className={cn(
                          "flex size-9 items-center justify-center rounded-xl transition-all duration-200 sm:size-10",
                          has && isActive && "bg-primary text-primary-foreground shadow-md shadow-primary/30",
                          has && !isActive && "bg-primary/20 text-primary",
                          !has && isActive && "ring-2 ring-primary/40 bg-muted/15 text-muted-foreground/40",
                          !has && !isActive && "bg-muted/10 text-muted-foreground/20",
                        )}
                      >
                        <span className="text-xs font-bold tabular-nums">{dayOfMonth}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Quick start */}
          <div className="animate-fade-up stagger-2 space-y-2">
            <Button
              type="button"
              variant="glass"
              size="sm"
              disabled={startingWorkout}
              onClick={() => void startSession("Workout")}
              className="h-8 w-full shrink-0 gap-1 px-2 text-[11px] press-scale touch-manipulation sm:h-9 sm:text-xs"
            >
              <Play className="size-3 shrink-0" />
              {startingWorkout ? "Starting…" : "Start Empty Workout"}
            </Button>
            {startError && (
              <p className="text-center text-xs text-destructive px-1" role="alert">
                {startError}
              </p>
            )}
          </div>

          {/* ── My Routines ──────────────────────── */}
          <div className="animate-fade-up stagger-3 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">
                My Routines
              </h2>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs touch-manipulation"
                onClick={() => {
                  setEditingTemplate(null)
                  setShowRoutineEditor(true)
                }}
              >
                <Plus className="size-3" />
                New
              </Button>
            </div>

            {templates.length === 0 && (
              <div className="glass-panel p-6 text-center">
                <Copy className="mx-auto size-7 text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground/60">
                  No routines yet
                </p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">
                  Create a routine to start workouts faster
                </p>
              </div>
            )}

            {templates.length > 0 && (
              <>
              {routineRearrangeMode ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/8 px-3 py-2.5">
                  <p className="min-w-0 text-xs font-medium text-muted-foreground">
                    Drag tiles to reorder. Drop on the strip below to move to the end.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 touch-manipulation text-xs"
                    onClick={() => setRoutineRearrangeMode(false)}
                  >
                    Done
                  </Button>
                </div>
              ) : null}
              <div
                className={cn(
                  "grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 sm:gap-3.5",
                  routineRearrangeMode && "touch-none select-none",
                )}
              >
                {templates.map((tmpl) => {
                  const exs = parseExercises<TemplateExercise>(tmpl.exercises)
                  const tmplTags = parseTemplateTags(tmpl.tags)
                  const cover = tmpl.coverImageUrl?.trim()
                  const preview =
                    exs.length === 0
                      ? "No exercises"
                      : exs.length <= 2
                        ? exs.map((e) => e.name).join(" · ")
                        : `${exs[0].name} · ${exs[1].name} +${exs.length - 2}`
                  const isDragSource = routinePointerDrag === tmpl.id
                  const isDropTarget =
                    routinePointerDrag != null &&
                    routineDragOverId === tmpl.id &&
                    routinePointerDrag !== tmpl.id
                  return (
                    <div
                      key={tmpl.id}
                      data-routine-tile={tmpl.id}
                      onPointerDown={(e) => handleRoutineTilePointerDown(tmpl.id, e)}
                      onPointerMove={handleRoutineTilePointerMove}
                      onPointerUp={handleRoutineTilePointerEnd}
                      onPointerCancel={handleRoutineTilePointerEnd}
                      className={cn(
                        "glass group flex h-full min-h-0 flex-col overflow-hidden rounded-2xl transition-[opacity,transform,box-shadow]",
                        routineRearrangeMode && "cursor-grab active:cursor-grabbing",
                        isDragSource && "pointer-events-none opacity-50 scale-[0.98] z-30 shadow-lg",
                        isDropTarget && "ring-2 ring-primary/55 ring-offset-2 ring-offset-background",
                      )}
                    >
                      <div className="relative aspect-square w-full shrink-0 border-b border-border/10 bg-muted/20">
                        {cover ? (
                          <img
                            src={cover}
                            alt=""
                            className="absolute inset-0 size-full object-cover pointer-events-none"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center bg-gradient-to-br from-muted/30 to-muted/10 pointer-events-none">
                            <Dumbbell className="size-[clamp(2rem,32%,2.75rem)] text-muted-foreground/15" />
                          </div>
                        )}
                        <div
                          className={cn(
                            "absolute left-1.5 top-1.5 z-20 sm:left-2 sm:top-2",
                            routineRearrangeMode && "pointer-events-none opacity-0",
                          )}
                        >
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setTemplateMenuId(
                                  templateMenuId === tmpl.id ? null : tmpl.id,
                                )
                              }
                              className="rounded-lg border border-border/25 bg-background/80 p-1.5 text-muted-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-background hover:text-foreground touch-manipulation dark:border-white/10 dark:bg-background/55"
                              aria-label="Routine options"
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                            {templateMenuId === tmpl.id && (
                              <div className="absolute left-0 top-full z-30 mt-1 min-w-[148px] rounded-xl border border-border/25 bg-popover p-1 shadow-xl animate-in fade-in slide-in-from-top-1 duration-100">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTemplate(tmpl)
                                    setShowRoutineEditor(true)
                                    setTemplateMenuId(null)
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-muted/20 transition-colors"
                                >
                                  <Pencil className="size-3.5" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={templates.length < 2}
                                  title={
                                    templates.length < 2
                                      ? "Add another routine to reorder"
                                      : undefined
                                  }
                                  onClick={() => {
                                    setRoutineRearrangeMode(true)
                                    setTemplateMenuId(null)
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-muted/20 transition-colors disabled:pointer-events-none disabled:opacity-40"
                                >
                                  <ArrowLeftRight className="size-3.5" />
                                  Rearrange tile
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteTemplate(tmpl.id)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                  <Trash2 className="size-3.5" />
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex min-h-[6.5rem] flex-1 flex-col gap-1.5 p-2.5 pt-2 sm:min-h-[7rem] sm:p-3">
                        <div
                          className={cn(
                            "min-h-0 min-w-0 flex-1 space-y-1",
                            routineRearrangeMode && "pointer-events-none",
                          )}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="line-clamp-2 min-w-0 flex-1 text-left text-sm font-semibold leading-snug text-foreground sm:text-base">
                              {tmpl.name}
                            </h3>
                            {tmplTags.length > 0 ? (
                              <div className="flex max-w-[38%] shrink-0 flex-wrap items-center justify-end gap-1 min-w-0 sm:max-w-[36%]">
                                {tmplTags.map((tg, ti) => (
                                  <span
                                    key={`${tg}-${ti}`}
                                    className="inline-flex min-w-0 max-w-[min(100%,3.75rem)] items-center truncate rounded-md border border-cyan-600/30 bg-cyan-500/18 px-1.5 py-0.5 text-left text-[8px] font-semibold leading-tight tracking-normal text-cyan-950 dark:border-cyan-300/35 dark:bg-cyan-400/18 dark:text-cyan-100 sm:max-w-[4.25rem] sm:px-2 sm:py-1 sm:text-[9px]"
                                  >
                                    {tg}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <p
                            className="line-clamp-2 text-[9px] leading-relaxed text-muted-foreground/55 sm:text-[10px]"
                            title={exs.map((e) => e.name).join(", ")}
                          >
                            {preview}
                          </p>
                        </div>
                        <Button
                          variant="glass"
                          size="sm"
                          disabled={routineRearrangeMode || startingWorkout}
                          className={cn(
                            "mt-auto h-8 w-full shrink-0 gap-1 px-2 text-[11px] press-scale touch-manipulation sm:h-9 sm:text-xs",
                            routineRearrangeMode && "pointer-events-none",
                          )}
                          onClick={() =>
                            startSession(tmpl.name, exs, tmpl.coverImageUrl?.trim() ?? null)
                          }
                        >
                          <Play className="size-3 shrink-0" />
                          Start
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
              {routineRearrangeMode && routinePointerDrag && templates.length > 1 ? (
                <div
                  data-routine-drop-end
                  className={cn(
                    "mt-2 rounded-xl border border-dashed px-3 py-3 text-center text-xs transition-colors pointer-events-auto",
                    routineDragOverId === ROUTINE_REORDER_DROP_END
                      ? "border-primary/60 bg-primary/15 text-foreground"
                      : "border-primary/35 bg-primary/5 text-muted-foreground",
                  )}
                >
                  Drop here to move to end
                </div>
              ) : null}
              </>
            )}
          </div>

          {/* ── Journal ──────────────────────────── */}
          <div className="animate-fade-up stagger-3 space-y-2">
            <div className="flex items-center gap-2 px-1 mb-1">
              <div className="hud-divider flex-1" />
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/50 shrink-0">
                Journal
              </span>
              <div className="hud-divider flex-1" />
            </div>

            {completedSessions.length === 0 && (
              <div className="glass-panel p-8 text-center">
                <Dumbbell className="mx-auto size-8 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No completed workouts yet
                </p>
                <p className="text-[11px] text-muted-foreground/50 mt-1">
                  Start a workout to begin tracking
                </p>
              </div>
            )}

            {journalHistoryDisplay.todayGroups.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                  Today
                </p>
                {journalHistoryDisplay.todayGroups.map(([dk, ds]) => (
                  <WorkoutJournalDayCard
                    key={dk}
                    dateKey={dk}
                    daySessions={ds}
                    alwaysExpanded
                  />
                ))}
              </div>
            )}
            {journalHistoryDisplay.earlierGroups.length > 0 && (
              <HistoryEarlierSection dayCount={journalHistoryDisplay.earlierGroups.length}>
                {journalHistoryDisplay.earlierGroups.map(([dk, ds]) => (
                  <WorkoutJournalDayCard
                    key={dk}
                    dateKey={dk}
                    daySessions={ds}
                    alwaysExpanded={false}
                  />
                ))}
              </HistoryEarlierSection>
            )}
            <HistoryArchivedNote archivedDayCount={journalHistoryDisplay.archivedDayCount} />
          </div>
        </div>
      )}

      {/* ── Routine editor dialog ────────────── */}
      <RoutineEditor
        open={showRoutineEditor}
        onClose={() => {
          setShowRoutineEditor(false)
          setEditingTemplate(null)
        }}
        initial={editingTemplate}
        onSave={saveTemplate}
      />
    </>
  )
}
