"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, HeartPulse, HelpCircle, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { apiFetch } from "@/lib/api-fetch"
import { cn } from "@/lib/utils"
import {
  COACH_STATUS_LABELS,
  REASON_CODE_LABELS,
  calculateNextSetRecommendation,
  compareCompletedSets,
  getComparableExerciseHistory,
  normalizeExerciseKey,
  rirToRpe,
  type CoachRecommendation,
  type CoachStatus,
  type PoExercise,
  type PoSession,
  type PoSet,
} from "@/lib/workouts/progressive-overload"
import {
  loadProgressionPrefs,
  saveExerciseOverride,
  saveProgressionPrefs,
  type ProgressionPrefs,
} from "@/lib/workouts/progression-settings"
import {
  progressionOverridesForStyle,
  TRAINING_STYLE_DEFINITIONS,
  type TrainingStyle,
} from "@/lib/workouts/training-style"

export interface SetEffortPatch {
  rir?: number | null
  rirSkipped?: boolean
  techniqueFlag?: boolean
  painFlag?: boolean
}

const STATUS_BADGE_CLASSES: Record<CoachStatus, string> = {
  calibration: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  push: "border-primary/40 bg-primary/12 text-primary",
  hold: "border-glass-border/40 bg-glass-highlight/15 text-muted-foreground",
  "back-off": "border-rose-500/40 bg-rose-500/10 text-rose-400",
  "on-track": "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  "new-best": "border-primary/50 bg-primary/15 text-primary",
}

const REP_RANGE_PRESETS: Array<{ repMin: number; repMax: number; label: string }> = [
  { repMin: 6, repMax: 10, label: "6–10" },
  { repMin: 8, repMax: 12, label: "8–12" },
  { repMin: 10, repMax: 15, label: "10–15" },
]

const EFFORT_CHOICES = [
  { rir: 0, label: "Failure", hint: "No reps left" },
  { rir: 1, label: "RPE 9", hint: "1 rep left" },
  { rir: 2, label: "RPE 8", hint: "2 reps left" },
  { rir: 3, label: "RPE 7", hint: "3 reps left" },
] as const

/** Fire-and-forget audit event; recommendations must never block logging. */
function postRecommendationEvent(
  rec: CoachRecommendation,
  sessionId: string,
  exerciseName: string,
  status: "shown" | "applied" | "dismissed",
) {
  void apiFetch("/api/progression-recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      targetExerciseKey: normalizeExerciseKey(exerciseName),
      sourceExerciseKey: rec.sourceExerciseKey,
      sourceSessionIds: rec.sourceSessionIds,
      recommendationType: rec.kind,
      suggestedLoadLb: rec.loadLb,
      suggestedRepMin: rec.repMin,
      suggestedRepMax: rec.repMax,
      targetRir: rec.targetRir,
      optionalSetCount: rec.action === "optional_set" ? 1 : 0,
      confidence: rec.confidence,
      reasonCodes: rec.reasonCodes,
      explanation: rec.explanation.join(" "),
      status,
    }),
  }).catch(() => {})
}

export function ProgressiveOverloadCoach({
  exercise,
  sessions,
  sessionId,
  trainingStyle,
  setCount = exercise.sets.length,
  className,
  onApplyToNextSet,
  onAddOptionalSet,
  onSetEffort,
}: {
  exercise: PoExercise
  sessions: PoSession[]
  sessionId: string
  trainingStyle: TrainingStyle
  setCount?: number
  className?: string
  onApplyToNextSet: (weight: number | null, reps: number | null, onlyEmpty?: boolean) => void
  onAddOptionalSet: (weight: number | null, reps: number | null) => void
  onSetEffort: (setId: string, patch: SetEffortPatch) => void
}) {
  /* Rendered client-side only (inside the active workout overlay), so reading
     localStorage in the lazy initializer cannot cause a hydration mismatch.
     The caller keys this component by exercise id, so per-movement state
     (flags, dismissal) resets naturally between movements. */
  const [prefs, setPrefs] = useState<ProgressionPrefs>(() => loadProgressionPrefs())
  const [whyOpen, setWhyOpen] = useState(false)
  const [effortFlags, setEffortFlags] = useState<{ technique: boolean; pain: boolean }>({
    technique: false,
    pain: false,
  })
  const shownKeyRef = useRef<string | null>(null)
  const autoAppliedKeyRef = useRef<string | null>(null)

  const overrides = prefs.exercises[normalizeExerciseKey(exercise.name)]
  const effectiveOverrides = useMemo(
    () => progressionOverridesForStyle(trainingStyle, overrides),
    [trainingStyle, overrides],
  )
  const disabled = !prefs.coachEnabled || overrides?.disabled === true

  const rec = useMemo(
    () =>
      calculateNextSetRecommendation({
        exercise,
        sessions,
        overrides: effectiveOverrides,
        excludeSessionId: sessionId,
      }),
    [exercise, sessions, effectiveOverrides, sessionId],
  )

  /** Most recently completed hard set still awaiting an effort rating. */
  const pendingEffortSet = useMemo<PoSet | null>(() => {
    const candidates = exercise.sets.filter(
      (s) =>
        s.completed &&
        (s.type === "working" || s.type === "failure") &&
        typeof s.rir !== "number" &&
        !s.rirSkipped,
    )
    return candidates.length > 0 ? candidates[candidates.length - 1] : null
  }, [exercise.sets])

  /* Auto-plug suggested weight/reps into the next open set — no Accept tap. */
  useEffect(() => {
    if (disabled || pendingEffortSet != null) return
    const apply = rec.apply
    if (!apply || apply.addSet) return
    if (apply.weight == null && apply.reps == null) return
    const key = `${sessionId}:${exercise.id}:${apply.weight ?? "x"}:${apply.reps ?? "x"}:${rec.action}`
    if (autoAppliedKeyRef.current === key) return
    autoAppliedKeyRef.current = key
    onApplyToNextSet(apply.weight, apply.reps, true)
    postRecommendationEvent(rec, sessionId, exercise.name, "applied")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once per recommendation fingerprint
  }, [disabled, pendingEffortSet, rec.action, rec.apply?.weight, rec.apply?.reps, sessionId, exercise.id])

  /* Audit "shown" once per movement per session (after data settles). */
  useEffect(() => {
    if (disabled || pendingEffortSet != null) return
    const key = `${sessionId}:${exercise.id}`
    if (shownKeyRef.current === key) return
    shownKeyRef.current = key
    postRecommendationEvent(rec, sessionId, exercise.name, "shown")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- audit once per movement
  }, [disabled, pendingEffortSet, sessionId, exercise.id])

  const scale = prefs.effortScale

  const recordEffort = (rir: (typeof EFFORT_CHOICES)[number]["rir"]) => {
    if (pendingEffortSet == null) return
    onSetEffort(pendingEffortSet.id, {
      rir,
      rirSkipped: false,
      techniqueFlag: effortFlags.technique || undefined,
      painFlag: effortFlags.pain || undefined,
    })
    setEffortFlags({ technique: false, pain: false })
  }

  const effortDialog = pendingEffortSet ? (
    <EffortRatingDialog
      set={pendingEffortSet}
      targetRir={rec.targetRir}
      trainingStyle={trainingStyle}
      flags={effortFlags}
      onFlagsChange={setEffortFlags}
      onRecord={recordEffort}
    />
  ) : null

  /* Effort is useful training data even when recommendation cards are hidden. */
  if (disabled) return effortDialog

  /* ── Flat recommendation strip (no nested card) ───────────────── */
  const apply = rec.apply
  const contextLine = rec.basedOn || rec.sourceLabel || rec.goal
  const setComparisons = compareCompletedSets({
    exercise,
    sessions,
    excludeSessionId: sessionId,
  })

  return (
    <>
      <section
        aria-label="Progressive overload coach"
        className={cn(
          "relative mt-2 space-y-2 overflow-hidden rounded-2xl border border-white/[0.075] bg-gradient-to-br from-primary/[0.07] via-white/[0.025] to-transparent p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]",
          className,
        )}
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" aria-hidden />
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <TrendingUp className="size-3.5 shrink-0 text-primary/80" aria-hidden />
            <h4 className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              {trainingStyle === "classic" ? "Classic overload" : "Progress & next step"}
            </h4>
            <span
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                STATUS_BADGE_CLASSES[rec.status],
              )}
            >
              {COACH_STATUS_LABELS[rec.status]}
            </span>
          </div>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => setWhyOpen(true)}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-glass-highlight/25 hover:text-foreground touch-manipulation"
              aria-label="Why this recommendation?"
            >
              <HelpCircle className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>

        {setComparisons.length > 0 ? (
          <div aria-label="Progress by set">
            <p className="mb-1 text-[10px] font-medium text-muted-foreground/60">
              Compared with the same set last time
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              {setComparisons.map((comparison) => (
                <div
                  key={comparison.setNumber}
                  className={cn(
                    "min-w-fit rounded-lg border px-2 py-1.5 text-[10px] font-semibold tabular-nums",
                    comparison.outcome === "progressed"
                      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-400"
                      : comparison.outcome === "adjust"
                        ? "border-amber-500/35 bg-amber-500/10 text-amber-400"
                        : "border-glass-border/30 bg-glass-highlight/[0.07] text-muted-foreground/80",
                  )}
                >
                  Set {comparison.setNumber}: {comparison.label}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary/80">
          {rec.kind === "next-set" ? "Do this next" : "Start here today"}
        </p>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "font-heading font-bold leading-none text-foreground",
                setCount <= 3 ? "text-2xl" : "text-xl",
              )}
            >
              {rec.headline}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/65">
              {scale === "rpe"
                ? rec.detail.replace(
                    `${rec.targetRir} RIR`,
                    `RPE ${rirToRpe(rec.targetRir)}`,
                  )
                : rec.detail}
            </p>
          </div>
          {rec.delta ? (
            <span className="mb-0.5 shrink-0 rounded-lg border border-primary/15 bg-primary/10 px-2.5 py-1 text-xs font-bold tabular-nums text-primary">
              {rec.delta}
            </span>
          ) : null}
        </div>

        {contextLine ? (
          <p className="text-[11px] leading-snug text-muted-foreground/65">
            <span className="font-semibold text-muted-foreground/85">Why: </span>
            {contextLine}
          </p>
        ) : null}

        {apply?.addSet ? (
          <Button
            type="button"
            variant="glass"
            size="sm"
            className="h-10 w-full text-xs font-semibold press-scale touch-manipulation"
            onClick={() => {
              onAddOptionalSet(apply.weight, apply.reps)
              postRecommendationEvent(rec, sessionId, exercise.name, "applied")
            }}
          >
            {apply.label}
          </Button>
        ) : apply ? (
          <p className="rounded-lg border border-primary/10 bg-primary/[0.065] px-2 py-1.5 text-[10px] font-medium text-primary/85">
            Ready to log: this target is already filled into your next set.
          </p>
        ) : null}
      </section>

      <CoachWhyDialog
        open={whyOpen}
        onOpenChange={setWhyOpen}
        rec={rec}
        exercise={exercise}
        sessions={sessions}
        sessionId={sessionId}
        trainingStyle={trainingStyle}
        prefs={prefs}
        onPrefsChange={setPrefs}
      />
      {effortDialog}
    </>
  )
}

function EffortRatingDialog({
  set,
  targetRir,
  trainingStyle,
  flags,
  onFlagsChange,
  onRecord,
}: {
  set: PoSet
  targetRir: number
  trainingStyle: TrainingStyle
  flags: { technique: boolean; pain: boolean }
  onFlagsChange: (flags: { technique: boolean; pain: boolean }) => void
  onRecord: (rir: (typeof EFFORT_CHOICES)[number]["rir"]) => void
}) {
  return (
    <Dialog open>
      <DialogContent
        priority="high"
        showCloseButton={false}
        className="glass-frost w-[calc(100vw-1rem)] max-w-sm gap-0 rounded-2xl p-0"
        aria-label={`Rate effort for set ${set.setNumber}`}
      >
        <div className="px-4 pb-3 pt-5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            Set {set.setNumber} logged
          </p>
          <DialogTitle className="mt-1 text-xl">
            How hard was that set?
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            {trainingStyle === "classic"
              ? "RPE 9 is the usual target. Failure is optional—not required—and only while technique stays controlled."
              : "Pick the closest effort. RPE 7 means you had about 3 reps left; Failure means no reps left."}
          </DialogDescription>
        </div>

        <div className="grid grid-cols-2 gap-2 px-4">
          {EFFORT_CHOICES.map((choice) => {
            const selectedTarget = choice.rir === targetRir
            const classicPrimary = trainingStyle === "classic" && choice.rir === 1
            const classicSecondary = trainingStyle === "classic" && choice.rir === 0
            return (
              <button
                key={choice.rir}
                type="button"
                onClick={() => onRecord(choice.rir)}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center rounded-xl border px-2 font-bold tabular-nums transition-all touch-manipulation active:scale-[0.96]",
                  classicPrimary || (trainingStyle !== "classic" && selectedTarget)
                    ? "border-primary/55 bg-primary/15 text-primary ring-1 ring-primary/30"
                    : classicSecondary
                      ? "border-primary/40 bg-transparent text-primary/80"
                    : "border-glass-border/35 bg-glass-highlight/[0.07] text-foreground hover:border-primary/35",
                )}
              >
                <span className="text-lg leading-none">{choice.label}</span>
                <span className="mt-1 text-[9px] font-medium text-muted-foreground/70">
                  {classicPrimary || (trainingStyle !== "classic" && selectedTarget)
                    ? "Target effort"
                    : classicSecondary
                      ? "Optional target"
                      : choice.hint}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex gap-2 px-4">
          <button
            type="button"
            aria-pressed={flags.technique}
            onClick={() => onFlagsChange({ ...flags, technique: !flags.technique })}
            className={cn(
              "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold touch-manipulation",
              flags.technique
                ? "border border-amber-500/45 bg-amber-500/15 text-amber-400"
                : "bg-glass-highlight/[0.07] text-muted-foreground",
            )}
          >
            <AlertTriangle className="size-3.5" aria-hidden />
            Form slipped
          </button>
          <button
            type="button"
            aria-pressed={flags.pain}
            onClick={() => onFlagsChange({ ...flags, pain: !flags.pain })}
            className={cn(
              "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold touch-manipulation",
              flags.pain
                ? "border border-rose-500/45 bg-rose-500/15 text-rose-400"
                : "bg-glass-highlight/[0.07] text-muted-foreground",
            )}
          >
            <HeartPulse className="size-3.5" aria-hidden />
            Pain
          </button>
        </div>

        <div className="h-4" aria-hidden />
      </DialogContent>
    </Dialog>
  )
}

function CoachWhyDialog({
  open,
  onOpenChange,
  rec,
  exercise,
  sessions,
  sessionId,
  prefs,
  trainingStyle,
  onPrefsChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  rec: CoachRecommendation
  exercise: PoExercise
  sessions: PoSession[]
  sessionId: string
  prefs: ProgressionPrefs
  trainingStyle: TrainingStyle
  onPrefsChange: (p: ProgressionPrefs) => void
}) {
  const key = normalizeExerciseKey(exercise.name)
  const override = prefs.exercises[key]

  const history = useMemo(() => {
    const name = rec.sourceExerciseKey || exercise.name
    return getComparableExerciseHistory(sessions, name, {
      excludeSessionId: sessionId,
      limit: 5,
    })
  }, [sessions, exercise.name, rec.sourceExerciseKey, sessionId])

  const plainReasons = rec.reasonCodes
    .map((code) => REASON_CODE_LABELS[code])
    .filter((reason): reason is string => Boolean(reason))
    .slice(0, 2)
  const effortTarget =
    rec.targetRir === 0
      ? `Aim for ${rec.repMin}–${rec.repMax} controlled reps, reaching failure only when you choose.`
      : `Aim for ${rec.repMin}–${rec.repMax} reps with about ${rec.targetRir} ${rec.targetRir === 1 ? "rep" : "reps"} left.`
  const modeContext =
    trainingStyle === "classic"
      ? "Classic favors heavier, near-failure work with two working sets per exercise."
      : "Science-Based balances load, reps, and effort across an adaptive number of sets."
  const recommendationBasis =
    rec.basedOn?.replace(/^Based on:\s*/i, "") ??
    rec.sourceLabel ??
    "No comparable workout history yet; this is a starting target."

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        priority="high"
        className={cn(
          "glass-frost max-w-sm gap-0 p-0",
          "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3",
        )}
      >
        <div className="max-h-[80dvh] overflow-y-auto overscroll-contain">
          <div className="space-y-1 px-4 pb-3 pt-4 pr-12">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle>{COACH_STATUS_LABELS[rec.status]}: {rec.headline}</DialogTitle>
              <DialogDescription>
                {exercise.name} · {TRAINING_STYLE_DEFINITIONS[trainingStyle].label}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-2.5 px-4 pb-4">
            <dl className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025]">
              <div className="border-b border-glass-border/20 px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-primary/75">Why</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-foreground/85">
                  {plainReasons.length > 0 ? plainReasons.join(". ") : rec.explanation[0] ?? "This best matches your current target."}
                </dd>
              </div>
              <div className="border-b border-glass-border/20 px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-primary/75">Effort</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-foreground/85">{effortTarget}</dd>
              </div>
              <div className="px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-primary/75">Based on</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-foreground/85">{recommendationBasis}</dd>
              </div>
            </dl>

            <p className="px-1 text-[10px] leading-relaxed text-muted-foreground/60">{modeContext}</p>

            {history.length > 0 ? (
              <details className="group rounded-xl border border-glass-border/30 bg-white/[0.02]">
                <summary className="cursor-pointer list-none px-3 py-2.5 text-[11px] font-semibold text-muted-foreground/75 touch-manipulation">
                  Recent workout data <span className="font-normal text-muted-foreground/45">({history.length})</span>
                </summary>
                <div className="divide-y divide-glass-border/20 border-t border-glass-border/20">
                  {history.map((exp) => (
                    <div
                      key={exp.sessionId}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] tabular-nums"
                    >
                      <span className="text-muted-foreground/70">{exp.dateKey}</span>
                      <span className="text-foreground/85">
                        {exp.sets
                          .slice(0, 4)
                          .map((s) => `${s.weight ?? "BW"}×${s.reps ?? 0}`)
                          .join(" · ")}
                        {exp.medianRir != null ? ` @ ~${exp.medianRir} RIR` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            {/* Keep movement controls available without crowding the explanation. */}
            <details className="group rounded-xl border border-glass-border/30 bg-white/[0.02]">
              <summary className="cursor-pointer list-none px-3 py-2.5 touch-manipulation">
                <span className="block text-[11px] font-semibold text-muted-foreground/80">
                  Customize recommendation
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground/50">
                  Change this exercise’s rep range, effort target, or coach visibility.
                </span>
              </summary>
              <div className="space-y-2 border-t border-glass-border/20 px-3 pb-3 pt-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Settings for this movement
              </p>
              <div className="flex flex-wrap gap-1.5">
                {REP_RANGE_PRESETS.map((p) => {
                  const active =
                    (override?.repMin ?? rec.repMin) === p.repMin &&
                    (override?.repMax ?? rec.repMax) === p.repMax
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() =>
                        onPrefsChange(
                          saveExerciseOverride(exercise.name, {
                            repMin: p.repMin,
                            repMax: p.repMax,
                          }),
                        )
                      }
                      className={cn(
                        "min-h-9 rounded-lg px-3 text-[11px] font-semibold transition-colors touch-manipulation",
                        active
                          ? "glass-panel-accent text-primary ring-1 ring-primary/35 [--panel-accent:var(--primary)]"
                          : "glass-subtle text-muted-foreground/75 hover:text-foreground",
                      )}
                    >
                      {p.label} reps
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(trainingStyle === "classic" ? [0, 1, 2, 3] : [1, 2, 3]).map((rir) => {
                  const active = (override?.targetRir ?? rec.targetRir) === rir
                  return (
                    <button
                      key={rir}
                      type="button"
                      onClick={() =>
                        onPrefsChange(
                          saveExerciseOverride(exercise.name, { targetRir: rir }),
                        )
                      }
                      className={cn(
                        "min-h-9 rounded-lg px-3 text-[11px] font-semibold transition-colors touch-manipulation",
                        active
                          ? "glass-panel-accent text-primary ring-1 ring-primary/35 [--panel-accent:var(--primary)]"
                          : "glass-subtle text-muted-foreground/75 hover:text-foreground",
                      )}
                    >
                      {rir} RIR{rir === 0 ? " · failure" : ""}
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-1.5">
                {(["rir", "rpe"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onPrefsChange(saveProgressionPrefs({ effortScale: mode }))}
                    className={cn(
                      "min-h-9 flex-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors touch-manipulation",
                      prefs.effortScale === mode
                        ? "glass-panel-accent text-primary ring-1 ring-primary/35 [--panel-accent:var(--primary)]"
                        : "glass-subtle text-muted-foreground/75 hover:text-foreground",
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  onPrefsChange(
                    saveExerciseOverride(exercise.name, {
                      disabled: !(override?.disabled === true),
                    }),
                  )
                }
                className="w-full rounded-lg py-2 text-[11px] font-semibold text-muted-foreground/60 transition-colors hover:text-foreground touch-manipulation"
              >
                {override?.disabled ? "Re-enable coach for this movement" : "Hide coach for this movement"}
              </button>
              </div>
            </details>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
