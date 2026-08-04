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
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { format } from "date-fns"
import { apiFetch } from "@/lib/api-fetch"
import { addDaysYmd, stepsDayKey } from "@/lib/steps-day"
import { cn, parseLocalDate } from "@/lib/utils"
import { getTrackingPeriod } from "@/lib/work-cycle"
import { utcCalendarDayKeyFromIso } from "@/lib/dateStorage"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

function exerciseCount(raw: string): number {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

function compactWorkoutLabel(name: string): string {
  const normalized = name.trim()
  const lower = normalized.toLowerCase()
  const known = [
    ["full body", "Full body"],
    ["upper", "Upper"],
    ["lower", "Lower"],
    ["push", "Push"],
    ["pull", "Pull"],
    ["legs", "Legs"],
    ["leg", "Legs"],
    ["rest", "Rest"],
    ["mobility", "Mobility"],
    ["cardio", "Cardio"],
    ["run", "Run"],
  ] as const
  const match = known.find(([needle]) => lower.includes(needle))
  if (match) return match[1]
  if (normalized.length <= 10) return normalized
  return `${normalized.slice(0, 9).trimEnd()}…`
}

function workoutTagTone(name: string): string {
  const lower = name.toLowerCase()
  if (/lower|leg|squat|deadlift/.test(lower)) return "bg-orange-400/10 text-orange-200/80"
  if (/upper|push|pull|chest|back/.test(lower)) return "bg-sky-400/10 text-sky-200/80"
  if (/rest|mobility|recovery/.test(lower)) return "bg-violet-400/10 text-violet-200/75"
  if (/cardio|run|conditioning/.test(lower)) return "bg-rose-400/10 text-rose-200/75"
  return "bg-primary/10 text-primary/85"
}

export function WorkoutPlannerProvider({ children }: { children: ReactNode }) {
  const { activeDate, setActiveDate } = useActiveDate()
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(activeDate)
  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [completedCount, setCompletedCount] = useState(0)
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [customName, setCustomName] = useState("")
  const [error, setError] = useState("")
  const [motionOrigin, setMotionOrigin] = useState<DialogMotionOrigin>()

  const rotation = useMemo(
    () =>
      getTrackingPeriod(selectedDate, {
        enabled: true,
        anchorDate: user?.workCycleAnchorDate,
        length: 8,
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
      const nextDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : activeDate
      setMotionOrigin(getDialogMotionOrigin(origin ?? null))
      setSelectedDate(nextDate)
      setCustomName("")
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
      const next = addDaysYmd(rotation.startDate, direction * 8)
      selectDate(next)
    },
    [rotation.startDate, selectDate],
  )

  const schedule = useCallback(
    async (input: { templateId?: string; name?: string; busyKey: string }) => {
      setSavingKey(input.busyKey)
      setError("")
      try {
        const response = await apiFetch("/api/workout-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: selectedDate,
            ...(input.templateId ? { templateId: input.templateId } : {}),
            ...(input.name ? { name: input.name } : {}),
          }),
        })
        const data = (await response.json().catch(() => ({}))) as WorkoutPlan & { error?: string }
        if (!response.ok) throw new Error(data.error ?? "Could not schedule workout.")
        setPlans((current) => [...current, data])
        setCustomName("")
        window.dispatchEvent(new CustomEvent("grid:log-saved"))
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Could not schedule workout.")
      } finally {
        setSavingKey(null)
      }
    },
    [selectedDate],
  )

  const removePlan = useCallback(async (plan: WorkoutPlan) => {
    setSavingKey(plan.id)
    setError("")
    try {
      const response = await apiFetch(`/api/workout-plans?id=${encodeURIComponent(plan.id)}`, {
        method: "DELETE",
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(data.error ?? "Could not remove workout.")
      setPlans((current) => current.filter((item) => item.id !== plan.id))
      window.dispatchEvent(new CustomEvent("grid:log-saved"))
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove workout.")
    } finally {
      setSavingKey(null)
    }
  }, [])

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
  const isPast = selectedDate < stepsDayKey()
  const selectedLabel = format(parseLocalDate(selectedDate), "EEEE, MMMM d")
  const plannedCount = plans.length
  const target = user?.workoutGoalPerCycle ?? 3
  const value = useMemo(() => ({ openPlanner }), [openPlanner])

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
                Schedule training around your repeating eight-day rotation.
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
                    <div data-dialog-planner-heading="" className="min-w-0">
                      <h2 id="rotation-heading" className="text-sm font-semibold text-foreground">
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
                        onClick={() => selectDate(stepsDayKey())}
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

                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8" role="group" aria-label="Choose a workout date">
                    {rotation.dates.map((date, index) => {
                      const datePlans = plansByDate.get(date) ?? []
                      const chosen = date === selectedDate
                      const past = date < stepsDayKey()
                      const dateObject = parseLocalDate(date)
                      return (
                        <button
                          key={date}
                          data-dialog-rotation-day=""
                          type="button"
                          onClick={() => selectDate(date)}
                          aria-pressed={chosen}
                          aria-label={`${format(dateObject, "EEEE, MMMM d")}, ${rotation.labels[index]}${datePlans.length ? `, ${datePlans.map((plan) => plan.name).join(", ")} planned` : ""}`}
                          style={{ "--rotation-day-delay": `${340 + index * 72}ms` } as CSSProperties}
                          className={cn(
                            "relative min-h-[5.75rem] touch-manipulation rounded-xl border px-1.5 py-2 text-center transition-[background-color,border-color,color,box-shadow,scale] duration-300 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                            chosen
                              ? "scale-[1.015] border-primary/55 bg-primary/13 text-primary shadow-[0_8px_24px_-16px_rgba(196,214,50,0.55)]"
                              : "scale-100 border-border/30 bg-muted/10 text-muted-foreground hover:border-primary/25 hover:bg-primary/[0.05]",
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
                          {datePlans.length > 0 ? (
                            <span
                              data-dialog-day-plan=""
                              className={cn(
                                "mt-1 block w-full truncate rounded px-1 py-0.5 text-[7px] font-bold uppercase tracking-[0.06em]",
                                workoutTagTone(datePlans[0].name),
                              )}
                              title={datePlans.map((plan) => plan.name).join(", ")}
                            >
                              {compactWorkoutLabel(datePlans[0].name)}
                              {datePlans.length > 1 ? ` +${datePlans.length - 1}` : ""}
                            </span>
                          ) : null}
                          {datePlans.length > 1 ? (
                            <span
                              data-dialog-day-plan=""
                              className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground"
                            >
                              {datePlans.length}
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>

                  <div
                    data-dialog-rotation-summary=""
                    className="grid grid-cols-3 gap-2"
                    aria-label="Rotation training summary"
                  >
                    <div
                      data-dialog-rotation-stat="planned"
                      style={{ "--rotation-stat-delay": "840ms" } as CSSProperties}
                      className="rounded-xl border border-border/25 bg-muted/10 px-3 py-2"
                    >
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/55">Planned</span>
                      <span
                        key={`planned-${plannedCount}`}
                        className="planner-summary-value-change mt-0.5 block text-base font-semibold tabular-nums text-foreground"
                      >
                        {plannedCount}
                      </span>
                    </div>
                    <div
                      data-dialog-rotation-stat="complete"
                      style={{ "--rotation-stat-delay": "950ms" } as CSSProperties}
                      className="rounded-xl border border-border/25 bg-muted/10 px-3 py-2"
                    >
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/55">Complete</span>
                      <span
                        key={`complete-${completedCount}`}
                        className="planner-summary-value-change mt-0.5 block text-base font-semibold tabular-nums text-foreground"
                      >
                        {completedCount}
                      </span>
                    </div>
                    <div
                      data-dialog-rotation-stat="target"
                      style={{ "--rotation-stat-delay": "1060ms" } as CSSProperties}
                      className="rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2"
                    >
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/55">Target</span>
                      <span
                        key={`target-${target}-${user.workCycleEnabled ? "cycle" : "week"}`}
                        className="planner-summary-value-change mt-0.5 block text-base font-semibold tabular-nums text-primary"
                      >
                        {target}<span className="text-[10px] font-normal text-muted-foreground/65"> / {user.workCycleEnabled ? "8d" : "wk"}</span>
                      </span>
                    </div>
                  </div>
                </section>

                <section
                  data-dialog-motion-part="content"
                  aria-labelledby="selected-day-heading"
                  className="space-y-3 border-t border-border/20 pt-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div key={selectedDate} className="planner-context-change">
                      <h2 id="selected-day-heading" className="text-sm font-semibold text-foreground">
                        {selectedLabel}
                      </h2>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/65">
                        {rotation.phaseLabel} · cycle day {rotation.dayNumber}
                      </p>
                    </div>
                    {selectedPlans.length > 0 ? (
                      <span className="rounded-full border border-primary/20 bg-primary/[0.07] px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-primary">
                        {selectedPlans.length} planned
                      </span>
                    ) : null}
                  </div>

                  {loading ? (
                    <p className="rounded-xl border border-border/25 bg-muted/10 px-3 py-4 text-center text-xs text-muted-foreground/60">
                      Loading rotation…
                    </p>
                  ) : selectedPlans.length > 0 ? (
                    <div className="space-y-2">
                      {selectedPlans.map((plan) => (
                        <div key={plan.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-primary/15 bg-primary/[0.045] px-3 py-2">
                          <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">{plan.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={savingKey === plan.id}
                            onClick={() => void removePlan(plan)}
                            aria-label={`Remove ${plan.name} from ${selectedLabel}`}
                            className="shrink-0 text-muted-foreground/55 hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-border/35 bg-muted/[0.06] px-3 py-4 text-center text-xs text-muted-foreground/60">
                      No workout planned for this day yet.
                    </p>
                  )}
                </section>

                <section
                  data-dialog-motion-part="controls"
                  aria-labelledby="routine-heading"
                  className="space-y-3 border-t border-border/20 pt-4"
                >
                  <div>
                    <h2 id="routine-heading" className="text-sm font-semibold text-foreground">Add a workout</h2>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/65">
                      {isPast ? "Past days are view-only. Choose today or a future day to schedule." : `Choose a saved routine for ${selectedLabel}.`}
                    </p>
                  </div>

                  {!isPast && templates.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {templates.map((template) => {
                        const busy = savingKey === template.id
                        return (
                          <button
                            key={template.id}
                            type="button"
                            disabled={savingKey != null}
                            onClick={() => void schedule({ templateId: template.id, busyKey: template.id })}
                            className="flex min-h-14 touch-manipulation items-center gap-3 rounded-xl border border-border/30 bg-muted/10 px-3 py-2 text-left transition-[background-color,border-color,scale] active:scale-[0.985] hover:border-primary/30 hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/25 bg-background/30">
                              {template.coverImageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={template.coverImageUrl} alt="" className="size-full object-cover" />
                              ) : (
                                <Dumbbell className="size-4 text-muted-foreground/50" aria-hidden />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground/90">{template.name}</span>
                              <span className="mt-0.5 block text-[10px] text-muted-foreground/55">
                                {exerciseCount(template.exercises)} exercises
                              </span>
                            </span>
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/[0.07] text-primary">
                              {busy ? <span className="text-xs">…</span> : <Plus className="size-3.5" aria-hidden />}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ) : null}

                  {!isPast && templatesLoaded && templates.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/60">No saved routines yet. Add a custom workout below.</p>
                  ) : null}

                  {!isPast ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const name = customName.trim()
                        if (name) void schedule({ name, busyKey: "custom" })
                      }}
                    >
                      <Input
                        value={customName}
                        onChange={(event) => setCustomName(event.target.value)}
                        maxLength={120}
                        placeholder="Or name a custom workout"
                        aria-label="Custom workout name"
                        className="h-11 min-w-0 flex-1"
                      />
                      <Button
                        type="submit"
                        variant="glass"
                        className="h-11 shrink-0 gap-1.5"
                        disabled={!customName.trim() || savingKey != null}
                      >
                        <Plus className="size-4" />
                        Plan
                      </Button>
                    </form>
                  ) : null}
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
