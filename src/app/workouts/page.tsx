"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import {
  Check,
  ChevronDown,
  Clock,
  Copy,
  Dumbbell,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { format, subDays } from "date-fns"
import { PageHeader } from "@/components/PageHeader"
import { PageStatTile } from "@/components/PageStatTile"
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
import { cn, formatDate, parseLocalDate } from "@/lib/utils"

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

interface SessionExercise {
  id: string
  name: string
  notes: string
  sets: ExerciseSet[]
}

interface TemplateExercise {
  id: string
  name: string
  targetSets: number
  targetReps: string
  notes: string
}

interface WorkoutTemplate {
  id: string
  name: string
  exercises: string | TemplateExercise[]
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
}

function parseExercises<T>(raw: string | T[]): T[] {
  if (Array.isArray(raw)) return raw
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
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
   Exercise Library
   ────────────────────────────────────────────────────────── */

interface LibraryExercise {
  name: string
  muscle: string
}

const EXERCISE_LIBRARY: LibraryExercise[] = [
  { name: "Bench Press", muscle: "Chest" },
  { name: "Incline Bench Press", muscle: "Chest" },
  { name: "Decline Bench Press", muscle: "Chest" },
  { name: "Dumbbell Bench Press", muscle: "Chest" },
  { name: "Incline Dumbbell Press", muscle: "Chest" },
  { name: "Dumbbell Flyes", muscle: "Chest" },
  { name: "Cable Crossover", muscle: "Chest" },
  { name: "Push-ups", muscle: "Chest" },
  { name: "Chest Dips", muscle: "Chest" },
  { name: "Pec Deck", muscle: "Chest" },

  { name: "Deadlift", muscle: "Back" },
  { name: "Sumo Deadlift", muscle: "Back" },
  { name: "Barbell Row", muscle: "Back" },
  { name: "Dumbbell Row", muscle: "Back" },
  { name: "Pull-ups", muscle: "Back" },
  { name: "Chin-ups", muscle: "Back" },
  { name: "Lat Pulldown", muscle: "Back" },
  { name: "Seated Cable Row", muscle: "Back" },
  { name: "T-Bar Row", muscle: "Back" },
  { name: "Pendlay Row", muscle: "Back" },

  { name: "Overhead Press", muscle: "Shoulders" },
  { name: "Dumbbell Shoulder Press", muscle: "Shoulders" },
  { name: "Arnold Press", muscle: "Shoulders" },
  { name: "Lateral Raises", muscle: "Shoulders" },
  { name: "Front Raises", muscle: "Shoulders" },
  { name: "Face Pulls", muscle: "Shoulders" },
  { name: "Rear Delt Flyes", muscle: "Shoulders" },
  { name: "Upright Row", muscle: "Shoulders" },
  { name: "Shrugs", muscle: "Shoulders" },

  { name: "Squat", muscle: "Legs" },
  { name: "Front Squat", muscle: "Legs" },
  { name: "Leg Press", muscle: "Legs" },
  { name: "Romanian Deadlift", muscle: "Legs" },
  { name: "Leg Curl", muscle: "Legs" },
  { name: "Leg Extension", muscle: "Legs" },
  { name: "Bulgarian Split Squat", muscle: "Legs" },
  { name: "Lunges", muscle: "Legs" },
  { name: "Hip Thrust", muscle: "Legs" },
  { name: "Hack Squat", muscle: "Legs" },
  { name: "Calf Raises", muscle: "Legs" },
  { name: "Goblet Squat", muscle: "Legs" },

  { name: "Barbell Curl", muscle: "Arms" },
  { name: "Dumbbell Curl", muscle: "Arms" },
  { name: "Hammer Curl", muscle: "Arms" },
  { name: "Preacher Curl", muscle: "Arms" },
  { name: "Concentration Curl", muscle: "Arms" },
  { name: "Tricep Pushdown", muscle: "Arms" },
  { name: "Skull Crushers", muscle: "Arms" },
  { name: "Overhead Tricep Extension", muscle: "Arms" },
  { name: "Close-Grip Bench Press", muscle: "Arms" },
  { name: "Dips", muscle: "Arms" },

  { name: "Plank", muscle: "Core" },
  { name: "Hanging Leg Raise", muscle: "Core" },
  { name: "Cable Crunch", muscle: "Core" },
  { name: "Ab Wheel Rollout", muscle: "Core" },
  { name: "Russian Twist", muscle: "Core" },
  { name: "Bicycle Crunch", muscle: "Core" },
  { name: "Dead Bug", muscle: "Core" },

  { name: "Running", muscle: "Cardio" },
  { name: "Cycling", muscle: "Cardio" },
  { name: "Rowing Machine", muscle: "Cardio" },
  { name: "Jump Rope", muscle: "Cardio" },
  { name: "Stair Climber", muscle: "Cardio" },
  { name: "Elliptical", muscle: "Cardio" },
  { name: "Battle Ropes", muscle: "Cardio" },
]

const MUSCLE_GROUPS = [
  "All",
  "Chest",
  "Back",
  "Shoulders",
  "Legs",
  "Arms",
  "Core",
  "Cardio",
] as const

/* ──────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────── */

function normalizeDateKey(d: string): string {
  return d.split("T")[0]
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

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
}: {
  open: boolean
  onClose: () => void
  onSelect: (name: string) => void
}) {
  const [search, setSearch] = useState("")
  const [muscleFilter, setMuscleFilter] = useState<string>("All")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setSearch("")
      setMuscleFilter("All")
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const results = useMemo(() => {
    const q = search.toLowerCase().trim()
    return EXERCISE_LIBRARY.filter((e) => {
      if (muscleFilter !== "All" && e.muscle !== muscleFilter) return false
      if (q && !e.name.toLowerCase().includes(q) && !e.muscle.toLowerCase().includes(q))
        return false
      return true
    })
  }, [search, muscleFilter])

  const grouped = useMemo(() => {
    const m = new Map<string, LibraryExercise[]>()
    for (const e of results) {
      if (!m.has(e.muscle)) m.set(e.muscle, [])
      m.get(e.muscle)!.push(e)
    }
    return m
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
            <DialogTitle>Add Exercise</DialogTitle>
            <DialogDescription className="sr-only">
              Search or filter by muscle group, then pick an exercise
            </DialogDescription>
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

          <div className="flex flex-wrap gap-1.5">
            {MUSCLE_GROUPS.map((mg) => (
              <button
                key={mg}
                type="button"
                onClick={() => setMuscleFilter(mg)}
                className={cn(
                  "rounded-lg px-2.5 py-2 text-[10px] font-medium uppercase tracking-wider transition-colors touch-manipulation sm:py-1.5",
                  muscleFilter === mg
                    ? "bg-[#a855f7]/20 text-[#a855f7] ring-1 ring-[#a855f7]/35"
                    : "bg-muted/25 text-muted-foreground/70 hover:bg-muted/40 active:bg-muted/50",
                )}
              >
                {mg}
              </button>
            ))}
          </div>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
            "scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:size-0",
          )}
        >
          {results.length === 0 && search.trim() && (
            <div className="py-6 text-center">
              <p className="mb-3 text-sm text-muted-foreground/70">
                No matches for &ldquo;{search}&rdquo;
              </p>
              <Button
                size="sm"
                variant="outline"
                className="touch-manipulation"
                onClick={() => {
                  onSelect(search.trim())
                  onClose()
                }}
              >
                <Plus className="mr-1 size-3.5" />
                Add &ldquo;{search.trim()}&rdquo; as custom
              </Button>
            </div>
          )}

          {Array.from(grouped.entries()).map(([muscle, exercises]) => (
            <div key={muscle}>
              <p className="mb-1.5 px-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/50">
                {muscle}
              </p>
              {exercises.map((ex) => (
                <button
                  key={ex.name}
                  type="button"
                  onClick={() => {
                    onSelect(ex.name)
                    onClose()
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted/25 active:bg-muted/35 sm:py-2.5 touch-manipulation"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#a855f7]/10 sm:size-8">
                    <Dumbbell className="size-4 text-[#a855f7] sm:size-3.5" />
                  </div>
                  <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{ex.name}</span>
                </button>
              ))}
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
  onSave: (name: string, exercises: TemplateExercise[], id?: string) => void
}) {
  const [name, setName] = useState("")
  const [exercises, setExercises] = useState<TemplateExercise[]>([])
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "")
      setExercises(initial ? parseExercises<TemplateExercise>(initial.exercises) : [])
    }
  }, [open, initial])

  function addExercise(exName: string) {
    setExercises((prev) => [
      ...prev,
      {
        id: uid(),
        name: exName,
        targetSets: 3,
        targetReps: "10",
        notes: "",
      },
    ])
  }

  function removeExercise(id: string) {
    setExercises((prev) => prev.filter((e) => e.id !== id))
  }

  function updateExercise(id: string, field: string, value: string | number) {
    setExercises((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    )
  }

  return (
    <>
      <Dialog open={open && !showPicker} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{initial ? "Edit Routine" : "New Routine"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              placeholder="Routine name (e.g. Push Day)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />

            <div className="space-y-2">
              {exercises.map((ex, i) => (
                <div
                  key={ex.id}
                  className="flex items-center gap-2 rounded-xl border border-border/25 bg-muted/10 px-3 py-2"
                >
                  <span className="text-[10px] font-bold text-muted-foreground/40 tabular-nums w-4 shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{ex.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        className="h-7 w-14 px-2 text-xs text-center"
                        type="number"
                        min="1"
                        value={ex.targetSets}
                        onChange={(e) =>
                          updateExercise(ex.id, "targetSets", parseInt(e.target.value) || 1)
                        }
                      />
                      <span className="text-[10px] text-muted-foreground">sets ×</span>
                      <Input
                        className="h-7 w-16 px-2 text-xs text-center"
                        placeholder="8-12"
                        value={ex.targetReps}
                        onChange={(e) =>
                          updateExercise(ex.id, "targetReps", e.target.value)
                        }
                      />
                      <span className="text-[10px] text-muted-foreground">reps</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExercise(ex.id)}
                    className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/30 py-3 text-sm text-muted-foreground/60 hover:bg-muted/15 hover:text-muted-foreground transition-colors touch-manipulation"
              >
                <Plus className="size-4" />
                Add exercise
              </button>
            </div>

            <Button
              variant="glass"
              className="w-full press-scale"
              size="lg"
              disabled={!name.trim() || exercises.length === 0}
              onClick={() => {
                onSave(name.trim(), exercises, initial?.id)
                onClose()
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
        onSelect={addExercise}
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
  onUpdate: (exercises: SessionExercise[], name?: string) => void
  onFinish: () => void
  onDiscard: () => void
  previousSessions: WorkoutSession[]
}) {
  const exercises = parseExercises<SessionExercise>(session.exercises)
  const [showPicker, setShowPicker] = useState(false)
  const [workoutName, setWorkoutName] = useState(session.name)
  const [elapsed, setElapsed] = useState(0)
  const [editingName, setEditingName] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const start = new Date(session.startedAt).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [session.startedAt])

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus()
  }, [editingName])

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

  function addExercise(name: string) {
    const updated: SessionExercise[] = [
      ...exercises,
      {
        id: uid(),
        name,
        notes: "",
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

  function removeExercise(exId: string) {
    onUpdate(exercises.filter((e) => e.id !== exId))
  }

  function addSet(exId: string) {
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
    onUpdate(
      exercises.map((ex) => {
        if (ex.id !== exId) return ex
        const filtered = ex.sets.filter((s) => s.id !== setId)
        return {
          ...ex,
          sets: filtered.map((s, i) => ({ ...s, setNumber: i + 1 })),
        }
      }),
    )
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
    onUpdate(
      exercises.map((ex) => {
        if (ex.id !== exId) return ex
        return {
          ...ex,
          sets: ex.sets.map((s) =>
            s.id === setId ? { ...s, completed: !s.completed } : s,
          ),
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

  const completedSets = totalSetsCompleted(exercises)
  const vol = totalVolume(exercises)

  return (
    <>
      {/* Timer bar */}
      <div className="glass sticky top-0 z-30 rounded-2xl border border-[#a855f7]/20 bg-background/80 px-4 py-3 backdrop-blur-xl animate-fade-up">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#a855f7]/15">
              <Clock className="size-4 text-[#a855f7]" />
            </div>
            <div>
              {editingName ? (
                <Input
                  ref={nameInputRef}
                  className="h-7 text-sm font-semibold px-1.5"
                  value={workoutName}
                  onChange={(e) => setWorkoutName(e.target.value)}
                  onBlur={() => {
                    setEditingName(false)
                    if (workoutName.trim() && workoutName !== session.name) {
                      onUpdate(exercises, workoutName.trim())
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setEditingName(false)
                      if (workoutName.trim() && workoutName !== session.name) {
                        onUpdate(exercises, workoutName.trim())
                      }
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-sm font-semibold hover:text-[#a855f7] transition-colors"
                  onClick={() => setEditingName(true)}
                >
                  {workoutName || "Workout"}
                  <Pencil className="size-3 text-muted-foreground/40" />
                </button>
              )}
              <p className="text-lg font-bold tabular-nums text-[#a855f7] leading-tight">
                {formatTimer(elapsed)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-red-400 border-red-500/25 hover:bg-red-500/10 touch-manipulation"
              onClick={onDiscard}
            >
              Discard
            </Button>
            <Button
              variant="glass"
              size="sm"
              className="h-9 gap-1.5 press-scale touch-manipulation"
              onClick={onFinish}
            >
              <Check className="size-3.5" />
              Finish
            </Button>
          </div>
        </div>

        <div className="flex gap-4 mt-2 pt-2 border-t border-border/15">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
            Exercises <span className="font-bold text-foreground/80">{exercises.length}</span>
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
            Sets <span className="font-bold text-foreground/80">{completedSets}</span>
          </span>
          {vol > 0 && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
              Volume{" "}
              <span className="font-bold text-foreground/80">
                {vol >= 1000 ? `${(vol / 1000).toFixed(1)}k` : vol}
                <span className="text-muted-foreground/40 ml-0.5">kg</span>
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Exercise list */}
      <div className="space-y-3">
        {exercises.map((ex) => {
          const prev = previousByExercise.get(ex.name.toLowerCase())
          return (
            <div
              key={ex.id}
              className="glass rounded-2xl p-4 animate-fade-up"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#a855f7]">
                  {ex.name}
                </h3>
                <button
                  type="button"
                  onClick={() => removeExercise(ex.id)}
                  className="p-1.5 rounded-lg text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              {/* Set header */}
              <div className="grid grid-cols-[2rem_1fr_4.5rem_4.5rem_2.5rem] gap-1.5 mb-1 px-1">
                <span className="text-[9px] font-medium uppercase text-muted-foreground/40 text-center">
                  Set
                </span>
                <span className="text-[9px] font-medium uppercase text-muted-foreground/40">
                  Previous
                </span>
                <span className="text-[9px] font-medium uppercase text-muted-foreground/40 text-center">
                  kg
                </span>
                <span className="text-[9px] font-medium uppercase text-muted-foreground/40 text-center">
                  Reps
                </span>
                <span className="text-[9px] font-medium uppercase text-muted-foreground/40 text-center">
                  ✓
                </span>
              </div>

              {/* Set rows */}
              {ex.sets.map((set) => {
                const prevSet = prev?.[set.setNumber - 1]
                const typeInfo = SET_TYPE_LABELS[set.type]
                return (
                  <div
                    key={set.id}
                    className={cn(
                      "grid grid-cols-[2rem_1fr_4.5rem_4.5rem_2.5rem] gap-1.5 items-center rounded-lg px-1 py-1 transition-colors",
                      set.completed && "bg-[#a855f7]/5",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => cycleSetType(ex.id, set.id)}
                      className={cn(
                        "text-xs font-bold tabular-nums text-center transition-colors",
                        typeInfo.color,
                      )}
                      title={`Type: ${set.type} (tap to change)`}
                    >
                      {set.type === "working"
                        ? set.setNumber
                        : typeInfo.short}
                    </button>

                    <span className="text-[11px] text-muted-foreground/40 tabular-nums truncate">
                      {prevSet
                        ? `${prevSet.weight ?? "–"}×${prevSet.reps ?? "–"}`
                        : "–"}
                    </span>

                    <Input
                      type="number"
                      className={cn(
                        "h-8 text-center text-xs tabular-nums px-1",
                        ghostSetIds.has(set.id) &&
                          "border-muted-foreground/20 bg-muted/10 text-muted-foreground/50",
                      )}
                      placeholder="0"
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
                        "h-8 text-center text-xs tabular-nums px-1",
                        ghostSetIds.has(set.id) &&
                          "border-muted-foreground/20 bg-muted/10 text-muted-foreground/50",
                      )}
                      placeholder="0"
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
                        "flex items-center justify-center size-8 rounded-lg transition-all touch-manipulation",
                        set.completed
                          ? "bg-[#a855f7] text-white shadow-sm shadow-[#a855f7]/30"
                          : "bg-muted/15 text-muted-foreground/30 hover:bg-muted/30",
                      )}
                    >
                      <Check className="size-3.5" />
                    </button>
                  </div>
                )
              })}

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => addSet(ex.id)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/25 py-2 text-[11px] font-medium text-muted-foreground/50 hover:bg-muted/15 hover:text-muted-foreground transition-colors touch-manipulation"
                >
                  <Plus className="size-3" />
                  Add Set
                </button>
                {ex.sets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSet(ex.id, ex.sets[ex.sets.length - 1].id)}
                    className="flex items-center justify-center rounded-lg border border-dashed border-border/25 px-3 py-2 text-[11px] text-muted-foreground/30 hover:text-red-400 hover:border-red-500/25 transition-colors touch-manipulation"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#a855f7]/25 py-5 text-sm font-medium text-[#a855f7]/70 hover:bg-[#a855f7]/5 hover:text-[#a855f7] transition-colors touch-manipulation"
      >
        <Plus className="size-4" />
        Add Exercise
      </button>

      <ExercisePicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={addExercise}
      />
    </>
  )
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

  const { activeDate } = useActiveDate()
  const today = activeDate
  const yesterday = formatDate(subDays(parseLocalDate(activeDate), 1))

  // Fetch data
  useEffect(() => {
    Promise.all([
      fetch("/api/workout-sessions").then((r) => r.json()),
      fetch("/api/workout-templates").then((r) => r.json()),
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

  const activeSession = useMemo(
    () => sessions.find((s) => s.status === "active") ?? null,
    [sessions],
  )

  const weekStart = formatDate(subDays(parseLocalDate(activeDate), 6))
  const weekDayKeys = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        formatDate(subDays(parseLocalDate(activeDate), 6 - i)),
      ),
    [activeDate],
  )

  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status === "completed"),
    [sessions],
  )

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
      return k >= weekStart && k <= today
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
  }, [completedSessions, weekStart, today, byDay, activeDate])

  const historyByDate = useMemo(() => {
    const keys = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a))
    return keys.map((k) => [k, byDay.get(k)!] as const)
  }, [byDay])

  // ── Actions ───────────────────────────

  async function startSession(
    name: string,
    templateExercises?: TemplateExercise[],
  ) {
    const exercises: SessionExercise[] = templateExercises
      ? templateExercises.map((te) => ({
          id: uid(),
          name: te.name,
          notes: te.notes,
          sets: Array.from({ length: te.targetSets }, (_, i) => ({
            id: uid(),
            setNumber: i + 1,
            weight: null,
            reps: null,
            type: "working" as const,
            completed: false,
          })),
        }))
      : []

    const res = await fetch("/api/workout-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, date: today, exercises }),
    })

    if (!res.ok) return

    const session = await res.json()
    setSessions((prev) => [session, ...prev])

    try {
      const sync = await fetch("/api/workout-sessions")
      const list = await sync.json()
      if (Array.isArray(list)) setSessions(list)
    } catch {
      /* keep optimistic update */
    }
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null)

  async function updateActiveSession(
    exercises: SessionExercise[],
    name?: string,
  ) {
    if (!activeSession) return
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? {
              ...s,
              exercises: exercises as unknown as string,
              ...(name ? { name } : {}),
            }
          : s,
      ),
    )

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await fetch(`/api/workout-sessions/${activeSession.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercises,
          ...(name ? { name } : {}),
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

    const res = await fetch(`/api/workout-sessions/${activeSession.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "completed",
        finishedAt: new Date().toISOString(),
        duration,
        exercises: exercisesPayload,
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
    const res = await fetch(`/api/workout-sessions/${activeSession.id}`, {
      method: "DELETE",
    })
    if (res.ok) {
      setSessions((prev) => prev.filter((s) => s.id !== activeSession.id))
    }
  }

  async function deleteSession(id: string) {
    const res = await fetch(`/api/workout-sessions/${id}`, {
      method: "DELETE",
    })
    if (res.ok) setSessions((prev) => prev.filter((s) => s.id !== id))
  }

  async function saveTemplate(
    name: string,
    exercises: TemplateExercise[],
    id?: string,
  ) {
    if (id) {
      const res = await fetch("/api/workout-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, exercises }),
      })
      if (res.ok) {
        const updated = await res.json()
        setTemplates((prev) => prev.map((t) => (t.id === id ? updated : t)))
      }
    } else {
      const res = await fetch("/api/workout-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, exercises }),
      })
      if (res.ok) {
        const created = await res.json()
        setTemplates((prev) => [created, ...prev])
      }
    }
  }

  async function deleteTemplate(id: string) {
    const res = await fetch(`/api/workout-templates?id=${id}`, {
      method: "DELETE",
    })
    if (res.ok) setTemplates((prev) => prev.filter((t) => t.id !== id))
    setTemplateMenuId(null)
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

  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"]

  return (
    <div className="space-y-6">
      <PageHeader title="Workouts" icon={Dumbbell} iconColor="#a855f7" />

      {/* ── Active workout ───────────────────────── */}
      {activeSession && (
        <ActiveWorkout
          session={activeSession}
          onUpdate={updateActiveSession}
          onFinish={finishActiveSession}
          onDiscard={discardActiveSession}
          previousSessions={completedSessions}
        />
      )}

      {/* ── Home view (no active workout) ────────── */}
      {!activeSession && (
        <>
          {/* Stat tiles */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none animate-fade-up">
            <PageStatTile className="flex-1 min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                This Week
              </p>
              <span className="text-lg lg:text-xl font-bold tabular-nums">
                {stats.weekCount}
              </span>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                session{stats.weekCount === 1 ? "" : "s"}
              </p>
            </PageStatTile>
            <PageStatTile className="flex-1 min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Volume
              </p>
              <span className="text-lg lg:text-xl font-bold tabular-nums">
                {stats.weekVolume > 0
                  ? stats.weekVolume >= 1000
                    ? `${(stats.weekVolume / 1000).toFixed(1)}k`
                    : String(stats.weekVolume)
                  : "—"}
              </span>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                kg this week
              </p>
            </PageStatTile>
            <PageStatTile className="flex-1 min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Sets
              </p>
              <span className="text-lg lg:text-xl font-bold tabular-nums">
                {stats.weekSets || "—"}
              </span>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                this week
              </p>
            </PageStatTile>
            <PageStatTile className="flex-1 min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Streak
              </p>
              <span className="text-lg lg:text-xl font-bold tabular-nums">
                {stats.streakDays}
              </span>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                day{stats.streakDays === 1 ? "" : "s"}
              </p>
            </PageStatTile>
          </div>

          {/* Week activity dots */}
          <div className="glass relative overflow-hidden rounded-2xl border border-border/20 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-primary/[0.03] px-5 py-4 shadow-[inset_0_1px_0_0_oklch(1_0_0/10%),0_22px_56px_-20px_oklch(0_0_0/42%)] dark:border-[oklch(1_0_0/9%)] dark:from-glass-highlight/[0.1] dark:to-primary/[0.05] dark:shadow-[inset_0_1px_0_0_oklch(1_0_0/12%),0_28px_72px_-24px_oklch(0_0_0/62%)] animate-fade-up">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-8%,oklch(1_0_0/14%),transparent_58%)] dark:bg-[radial-gradient(ellipse_90%_50%_at_50%_-6%,oklch(1_0_0/10%),transparent_55%)]" aria-hidden />
            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-glass-highlight/45 to-transparent dark:via-white/12" aria-hidden />
            <div className="relative z-10">
              <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70 mb-3">
                This week
              </p>
              <div className="flex items-center justify-between gap-1">
                {weekDayKeys.map((key, i) => {
                  const count = byDay.get(key)?.length ?? 0
                  const isActive = key === today
                  const has = count > 0
                  return (
                    <div key={key} className="flex flex-1 flex-col items-center gap-2">
                      <span
                        className={cn(
                          "text-[10px] font-medium tracking-wider",
                          isActive ? "text-foreground" : "text-muted-foreground/50",
                        )}
                      >
                        {dayLabels[i]}
                      </span>
                      <div
                        className={cn(
                          "flex size-9 items-center justify-center rounded-xl transition-all duration-200 sm:size-10",
                          has && isActive && "bg-[#a855f7] text-white shadow-md shadow-[#a855f7]/30",
                          has && !isActive && "bg-[#a855f7]/20 text-[#c084fc]",
                          !has && isActive && "ring-2 ring-[#a855f7]/40 bg-muted/15 text-muted-foreground/40",
                          !has && !isActive && "bg-muted/10 text-muted-foreground/20",
                        )}
                      >
                        {has ? (
                          <span className="text-xs font-bold tabular-nums">{count}</span>
                        ) : (
                          <span className="text-[9px]">—</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Quick start */}
          <div className="animate-fade-up stagger-2">
            <Button
              type="button"
              variant="glass"
              size="lg"
              onClick={() => void startSession("Workout")}
              className="h-14 w-full gap-2.5 rounded-2xl press-scale text-base font-semibold"
            >
              <Play className="size-5 shrink-0 opacity-95" />
              Start Empty Workout
            </Button>
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
              <div className="glass rounded-2xl p-6 text-center">
                <Copy className="mx-auto size-7 text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground/60">
                  No routines yet
                </p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">
                  Create a routine to start workouts faster
                </p>
              </div>
            )}

            {templates.map((tmpl) => {
              const exs = parseExercises<TemplateExercise>(tmpl.exercises)
              return (
                <div
                  key={tmpl.id}
                  className="glass rounded-2xl p-4 group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">{tmpl.name}</h3>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setTemplateMenuId(
                            templateMenuId === tmpl.id ? null : tmpl.id,
                          )
                        }
                        className="p-1.5 rounded-lg text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/20 transition-colors touch-manipulation"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                      {templateMenuId === tmpl.id && (
                        <div className="absolute right-0 top-full mt-1 z-20 glass rounded-xl border border-border/25 p-1 min-w-[120px] shadow-xl animate-in fade-in slide-in-from-top-1 duration-100">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTemplate(tmpl)
                              setShowRoutineEditor(true)
                              setTemplateMenuId(null)
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted/20 transition-colors"
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTemplate(tmpl.id)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {exs.slice(0, 5).map((ex) => (
                      <span
                        key={ex.id}
                        className="text-[10px] bg-muted/20 rounded-md px-2 py-0.5 text-muted-foreground/60"
                      >
                        {ex.name}
                      </span>
                    ))}
                    {exs.length > 5 && (
                      <span className="text-[10px] text-muted-foreground/40 px-1 py-0.5">
                        +{exs.length - 5} more
                      </span>
                    )}
                  </div>

                  <Button
                    variant="glass"
                    size="sm"
                    className="w-full gap-1.5 press-scale touch-manipulation"
                    onClick={() =>
                      startSession(tmpl.name, exs)
                    }
                  >
                    <Play className="size-3.5" />
                    Start Workout
                  </Button>
                </div>
              )
            })}
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
              <div className="glass rounded-2xl p-8 text-center">
                <Dumbbell className="mx-auto size-8 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No completed workouts yet
                </p>
                <p className="text-[11px] text-muted-foreground/50 mt-1">
                  Start a workout to begin tracking
                </p>
              </div>
            )}

            {historyByDate.map(([dateKey, daySessions]) => {
              const isOpen = expandedDays.has(dateKey)
              const dayVolume = daySessions.reduce((s, sess) => {
                const exs = parseExercises<SessionExercise>(sess.exercises)
                return s + totalVolume(exs)
              }, 0)
              const dayDuration = daySessions.reduce(
                (s, sess) => s + (sess.duration ?? 0),
                0,
              )

              return (
                <div key={dateKey} className="glass rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleDay(dateKey)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left touch-manipulation transition-colors hover:bg-glass-highlight/20"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#a855f7]/10">
                      <span className="text-sm font-bold tabular-nums text-[#a855f7]">
                        {daySessions.length}
                      </span>
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
                            {dayVolume >= 1000
                              ? `${(dayVolume / 1000).toFixed(1)}k kg`
                              : `${dayVolume} kg`}
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
                          const exs = parseExercises<SessionExercise>(
                            sess.exercises,
                          )
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
                                    <p className="truncate text-sm font-semibold">
                                      {sess.name}
                                    </p>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                      {sess.duration != null && (
                                        <span className="text-[10px] tabular-nums text-muted-foreground/50">
                                          {sess.duration} min
                                        </span>
                                      )}
                                      <span className="text-[10px] text-muted-foreground/40">
                                        {exs.length} exercise
                                        {exs.length !== 1 ? "s" : ""}
                                      </span>
                                      {sessVol > 0 && (
                                        <span className="text-[10px] tabular-nums text-muted-foreground/45">
                                          {sessVol >= 1000
                                            ? `${(sessVol / 1000).toFixed(1)}k kg vol`
                                            : `${sessVol} kg vol`}
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
                                      <p className="mb-1.5 text-[11px] font-semibold text-[#a855f7]">
                                        {ex.name}
                                      </p>
                                      {ex.sets.length === 0 ? (
                                        <p className="text-[10px] text-muted-foreground/45">
                                          No sets logged
                                        </p>
                                      ) : (
                                        <>
                                          <div className="grid grid-cols-[2rem_1fr_1fr_1.75rem] gap-x-1.5 gap-y-1 text-[9px] uppercase tracking-wide text-muted-foreground/40">
                                            <span className="text-center">#</span>
                                            <span className="text-center">kg</span>
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
                                              <span className="text-center">
                                                {set.weight ?? "–"}
                                              </span>
                                              <span className="text-center">
                                                {set.reps ?? "–"}
                                              </span>
                                              <span className="text-center text-[9px]">
                                                {set.completed ? (
                                                  <Check className="mx-auto size-3 text-emerald-500/90" />
                                                ) : (
                                                  <span className="text-muted-foreground/25">
                                                    —
                                                  </span>
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
            })}
          </div>
        </>
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
    </div>
  )
}
