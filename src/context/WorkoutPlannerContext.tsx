"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react"
import { format } from "date-fns"
import { apiFetch } from "@/lib/api-fetch"
import { addDaysYmd, localCalendarDayKey, stepsDayKey } from "@/lib/steps-day"
import { resolveWorkoutPlanDayKey } from "@/lib/workouts/planned-workout-match"
import { cn, parseLocalDate } from "@/lib/utils"
import { getTrackingPeriod } from "@/lib/work-cycle"
import { utcCalendarDayKeyFromIso } from "@/lib/dateStorage"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import { Button } from "@/components/ui/button"
import {
  normalizeTrainingSplit,
  TRAINING_SPLIT_DEFINITIONS,
  trainingSplitFocuses,
  type TrainingSplitFocus,
} from "@/lib/workouts/training-split"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  getDialogMotionOrigin,
  type DialogMotionOrigin,
} from "@/components/ui/dialog"

interface WorkoutPlan {
  id: string
  name: string
  date: string
  coverImageUrl?: string | null
}

interface WorkoutTemplate {
  id: string
  name: string
  exercises: string
  coverImageUrl?: string | null
}

interface PlannerResponse {
  plans: WorkoutPlan[]
  completedCount: number
}

interface WorkoutPlannerContextValue {
  openPlanner: (date?: string, origin?: HTMLElement | null) => void
}

const WorkoutPlannerContext = createContext<WorkoutPlannerContextValue | null>(null)

const ROTATION_DAYS = 8
const SESSION_TARGET = 5
const SESSION_MINIMUM = 4

const FOCUS_SHORT: Record<string, string> = {
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  upper: "Upper",
  lower: "Lower",
  full_body: "Full",
  chest: "Chest",
  back: "Back",
  shoulders_arms: "Arms",
}

function sameName(a: string, b: string): boolean {
  return a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase()
}

function quotaCopy(count: number): string {
  if (count >= SESSION_TARGET) return "Target met"
  if (count >= SESSION_MINIMUM) return "Minimum met · one more reaches five"
  if (count === 0) return "Four is the floor, five is the goal"
  const untilMin = SESSION_MINIMUM - count
  return untilMin === 1 ? "1 more to the minimum of four" : `${untilMin} more to the minimum of four`
}

export function WorkoutPlannerProvider({ children }: { children: ReactNode }) {
  const { activeDate, setActiveDate } = useActiveDate()
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  const [calendarToday, setCalendarToday] = useState(() =>
    localCalendarDayKey(new Date()),
  )
  const [selectedDate, setSelectedDate] = useState(activeDate)
  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [completedCount, setCompletedCount] = useState(0)
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [motionOrigin, setMotionOrigin] = useState<DialogMotionOrigin>()

  const rotation = useMemo(
    () =>
      getTrackingPeriod(selectedDate, {
        enabled: true,
        anchorDate: user?.workCycleAnchorDate,
        length: ROTATION_DAYS,
        patternJson: user?.workCyclePatternJson,
        goal: user?.workoutGoalPerCycle,
      }),
    [
      selectedDate,
      user?.workCycleAnchorDate,
      user?.workCyclePatternJson,
      user?.workoutGoalPerCycle,
    ],
  )

  const loadPlans = useCallback(async (from: string, to: string) => {
    setLoading(true)
    setError("")
    try {
      const response = await apiFetch(
        `/api/workout-plans?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&_=${Date.now()}`,
        { cache: "no-store" },
      )
      const data = (await response.json().catch(() => ({}))) as Partial<PlannerResponse> & {
        error?: string
      }
      if (!response.ok) throw new Error(data.error ?? "Could not load workout plans.")
      setPlans(Array.isArray(data.plans) ? data.plans : [])
      setCompletedCount(Number(data.completedCount) || 0)
    } catch (loadError) {
      setPlans([])
      setCompletedCount(0)
      setError(loadError instanceof Error ? loadError.message : "Could not load workout plans.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !user) return
    void loadPlans(rotation.startDate, rotation.endDate)
  }, [open, user, rotation.startDate, rotation.endDate, loadPlans])

  useEffect(() => {
    if (!open || !user || templatesLoaded) return
    void apiFetch(`/api/workout-templates?_=${Date.now()}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => [])
        if (!response.ok) throw new Error("Could not load routines.")
        setTemplates(Array.isArray(data) ? (data as WorkoutTemplate[]) : [])
      })
      .catch(() => setError((value) => value || "Could not load saved routines."))
      .finally(() => setTemplatesLoaded(true))
  }, [open, user, templatesLoaded])

  useEffect(() => {
    setTemplates([])
    setTemplatesLoaded(false)
  }, [user?.id])

  const openPlanner = useCallback(
    (date?: string, origin?: HTMLElement | null) => {
      const now = new Date()
      const today = localCalendarDayKey(now)
      const requestedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : activeDate
      const nextDate = resolveWorkoutPlanDayKey({
        requestedDay: requestedDate,
        trackingDay: stepsDayKey(now),
        calendarDay: today,
      })
      setCalendarToday(today)
      setMotionOrigin(getDialogMotionOrigin(origin ?? null))
      setSelectedDate(nextDate)
      setError("")
      setOpen(true)
    },
    [activeDate],
  )

  const selectDate = useCallback(
    (date: string) => {
      setSelectedDate(date)
      setActiveDate(date)
      setError("")
    },
    [setActiveDate],
  )

  const moveRotation = useCallback(
    (direction: -1 | 1) => {
      const next = addDaysYmd(rotation.startDate, direction * ROTATION_DAYS)
      selectDate(next)
    },
    [rotation.startDate, selectDate],
  )

  const plansByDate = useMemo(() => {
    const grouped = new Map<string, WorkoutPlan[]>()
    for (const plan of plans) {
      const key = utcCalendarDayKeyFromIso(plan.date)
      if (!key) continue
      grouped.set(key, [...(grouped.get(key) ?? []), plan])
    }
    return grouped
  }, [plans])

  const selectedPlans = plansByDate.get(selectedDate) ?? []
  const isPast = selectedDate < calendarToday
  const selectedLabel = format(parseLocalDate(selectedDate), "EEEE, MMMM d")
  const split = normalizeTrainingSplit(user?.trainingSplit)
  const focuses = trainingSplitFocuses(split)
  const splitLabel = TRAINING_SPLIT_DEFINITIONS[split].label
  const scheduledDays = rotation.dates.filter((date) => (plansByDate.get(date)?.length ?? 0) > 0).length
  const value = useMemo(() => ({ openPlanner }), [openPlanner])

  const replaceDay = useCallback(
    async (focus: TrainingSplitFocus | null) => {
      if (selectedDate < calendarToday) return
      setSavingKey(focus?.id ?? "clear")
      setError("")
      const existing = plansByDate.get(selectedDate) ?? []
      const togglingOff =
        focus != null &&
        existing.length === 1 &&
        sameName(existing[0]!.name, focus.label)
      try {
        for (const plan of existing) {
          const response = await apiFetch(`/api/workout-plans?id=${encodeURIComponent(plan.id)}`, {
            method: "DELETE",
          })
          const data = (await response.json().catch(() => ({}))) as { error?: string }
          if (!response.ok) throw new Error(data.error ?? "Could not update this day.")
        }
        let created: WorkoutPlan | null = null
        if (focus && !togglingOff) {
          const named = templates.filter((template) => sameName(template.name, focus.label))
          const response = await apiFetch("/api/workout-plans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: selectedDate,
              name: focus.label,
              ...(named.length === 1 ? { templateId: named[0]!.id } : {}),
            }),
          })
          const data = (await response.json().catch(() => ({}))) as WorkoutPlan & { error?: string }
          if (!response.ok) throw new Error(data.error ?? "Could not schedule workout.")
          created = data
        }
        setPlans((current) => {
          const without = current.filter((plan) => utcCalendarDayKeyFromIso(plan.date) !== selectedDate)
          return created ? [...without, created] : without
        })
        window.dispatchEvent(new CustomEvent("grid:log-saved"))
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Could not schedule workout.")
        void loadPlans(rotation.startDate, rotation.endDate)
      } finally {
        setSavingKey(null)
      }
    },
    [calendarToday, loadPlans, plansByDate, rotation.endDate, rotation.startDate, selectedDate, templates],
  )

  return (
    <WorkoutPlannerContext value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          motionOrigin={motionOrigin}
          motionProfile="planner"
          motionOpen={open}
          className={cn(
            "inset-x-0 bottom-0 top-auto flex max-h-[94dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-b-3xl rounded-t-3xl p-0",
            "sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-3xl",
            "[&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:top-3",
          )}
        >
          <div
            data-dialog-motion-part="header"
            className="shrink-0 border-b border-border/25 bg-gradient-to-b from-primary/[0.08] to-transparent px-4 pb-3 pt-4 pr-12 sm:px-5 sm:pt-5"
          >
            <DialogHeader className="gap-1 text-left">
              <DialogTitle className="flex items-center gap-2 font-heading text-lg tracking-tight">
                <span className="flex size-8 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <CalendarDays className="size-4" aria-hidden />
                </span>
                Workout planner
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground/75">
                Five sessions this rotation. Four is the minimum.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="scrollbar-none min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:size-0 sm:px-5">
            {!user ? (
              <p
                data-dialog-motion-part="content"
                className="rounded-xl border border-border/30 bg-muted/15 p-4 text-sm text-muted-foreground"
              >
                Choose a profile to plan workouts.
              </p>
            ) : (
              <>
                <section
                  data-dialog-planner-rotation=""
                  aria-labelledby="rotation-heading"
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div data-dialog-planner-heading="" className="shrink-0">
                      <h2 id="rotation-heading" className="whitespace-nowrap text-sm font-semibold text-foreground">
                        Eight-day rotation
                      </h2>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground/65">
                        {format(parseLocalDate(rotation.startDate), "MMM d")}–{format(parseLocalDate(rotation.endDate), "MMM d, yyyy")}
                      </p>
                    </div>
                    <div
                      data-dialog-planner-nav=""
                      className="flex shrink-0 items-center gap-1"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="transition-[background-color,color,scale] active:scale-[0.9]"
                        onClick={() => moveRotation(-1)}
                        aria-label="Previous eight-day rotation"
                      >
                        <ChevronLeft />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 px-2 text-[10px] uppercase tracking-wider transition-[background-color,color,scale] active:scale-[0.94]"
                        onClick={() => selectDate(calendarToday)}
                      >
                        <RotateCcw className="size-3" />
                        Today
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="transition-[background-color,color,scale] active:scale-[0.9]"
                        onClick={() => moveRotation(1)}
                        aria-label="Next eight-day rotation"
                      >
                        <ChevronRight />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2" aria-live="polite">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[13px] font-medium tabular-nums text-foreground/90">
                        {scheduledDays} of {SESSION_TARGET}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70">{quotaCopy(scheduledDays)}</p>
                    </div>
                    <div className="flex gap-1.5" aria-hidden>
                      {Array.from({ length: SESSION_TARGET }, (_, index) => (
                        <span
                          key={index}
                          className={cn(
                            "h-1 flex-1 rounded-full",
                            index < scheduledDays ? "bg-primary" : "bg-white/10",
                          )}
                        />
                      ))}
                    </div>
                    {completedCount > 0 ? (
                      <p className="text-[11px] tabular-nums text-muted-foreground/55">
                        {completedCount} completed
                      </p>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8" role="group" aria-label="Choose a workout date">
                    {rotation.dates.map((date, index) => {
                      const datePlans = plansByDate.get(date) ?? []
                      const chosen = date === selectedDate
                      const past = date < calendarToday
                      const dateObject = parseLocalDate(date)
                      const focusMatch = focuses.find((focus) =>
                        datePlans.some((plan) => sameName(plan.name, focus.label)),
                      )
                      const dayLabel = focusMatch
                        ? (FOCUS_SHORT[focusMatch.id] ?? focusMatch.label)
                        : datePlans[0]?.name
                          ? datePlans[0].name.length <= 10
                            ? datePlans[0].name
                            : `${datePlans[0].name.slice(0, 9)}…`
                          : null
                      return (
                        <button
                          key={date}
                          data-dialog-rotation-day=""
                          type="button"
                          onClick={() => selectDate(date)}
                          aria-pressed={chosen}
                          aria-label={`${format(dateObject, "EEEE, MMMM d")}, ${rotation.labels[index]}${dayLabel ? `, ${dayLabel}` : ", open"}`}
                          style={{ "--rotation-day-delay": `${340 + index * 72}ms` } as CSSProperties}
                          className={cn(
                            "relative flex min-h-[5.75rem] touch-manipulation flex-col items-center rounded-xl border px-1.5 py-2 text-center transition-[background-color,border-color,color,scale] duration-300 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                            chosen
                              ? "border-primary/55 bg-primary/13 text-primary"
                              : "border-border/30 bg-muted/10 text-muted-foreground hover:border-primary/25 hover:bg-primary/[0.05]",
                            past && !chosen && "opacity-55",
                          )}
                        >
                          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] opacity-65">
                            {format(dateObject, "EEE")}
                          </span>
                          <span className="mt-1 block text-lg font-semibold tabular-nums leading-none">
                            {format(dateObject, "d")}
                          </span>
                          <span className="mt-1.5 inline-flex rounded-md border border-current/15 bg-current/[0.06] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                            {rotation.labels[index]}
                          </span>
                          {dayLabel ? (
                            <span className="mt-1 block w-full truncate text-[9px] font-bold uppercase tracking-[0.06em] text-primary">
                              {dayLabel}
                            </span>
                          ) : null}
                          {date === calendarToday && !chosen ? (
                            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" aria-hidden />
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section
                  data-dialog-motion-part="content"
                  aria-labelledby="selected-day-heading"
                  className="space-y-3 border-t border-white/[0.06] pt-4"
                >
                  <div key={selectedDate} className="planner-context-change">
                    <h2 id="selected-day-heading" className="text-sm font-semibold text-foreground">
                      {selectedLabel}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/65">
                      {rotation.phaseLabel}
                      {selectedPlans[0] ? ` · ${selectedPlans[0].name}` : " · nothing scheduled"}
                    </p>
                  </div>

                  {loading ? (
                    <p className="text-[12px] text-muted-foreground/55">Loading rotation…</p>
                  ) : isPast ? (
                    <p className="text-[12px] leading-relaxed text-muted-foreground/65">
                      This day has passed.
                    </p>
                  ) : (
                    <div className="space-y-3" data-dialog-motion-part="controls">
                      <div>
                        <h3 id="routine-heading" className="type-hud-subsection">
                          What are you hitting?
                        </h3>
                        <p className="mt-1 text-[11px] text-muted-foreground/60">{splitLabel}</p>
                      </div>
                      <div
                        className={cn(
                          "grid gap-2",
                          focuses.length === 1 ? "grid-cols-1" : "grid-cols-2",
                        )}
                        role="group"
                        aria-labelledby="routine-heading"
                      >
                        {focuses.map((focus, index) => {
                          const active = selectedPlans.some((plan) => sameName(plan.name, focus.label))
                          return (
                            <button
                              key={focus.id}
                              type="button"
                              disabled={savingKey != null}
                              aria-pressed={active}
                              onClick={() => void replaceDay(focus)}
                              className={cn(
                                "min-h-14 touch-manipulation rounded-2xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50",
                                focuses.length > 1 && focuses.length % 2 === 1 && index === focuses.length - 1 && "col-span-2",
                                active
                                  ? "bg-primary/15 text-primary"
                                  : "bg-white/[0.04] text-foreground hover:bg-white/[0.07]",
                              )}
                            >
                              <span className="block text-sm font-semibold">{focus.label}</span>
                              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground/65">
                                {focus.hint}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                      {selectedPlans.length > 0 ? (
                        <button
                          type="button"
                          disabled={savingKey != null}
                          onClick={() => void replaceDay(null)}
                          className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/55 transition-colors hover:text-foreground disabled:opacity-50"
                        >
                          Clear this day
                        </button>
                      ) : null}
                    </div>
                  )}
                </section>

                {error ? (
                  <p
                    data-dialog-motion-part="actions"
                    role="alert"
                    className="rounded-xl border border-destructive/25 bg-destructive/[0.06] px-3 py-2 text-xs text-destructive"
                  >
                    {error}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </WorkoutPlannerContext>
  )
}

export function useWorkoutPlanner(): WorkoutPlannerContextValue {
  const context = useContext(WorkoutPlannerContext)
  if (!context) throw new Error("useWorkoutPlanner must be used within WorkoutPlannerProvider")
  return context
}
