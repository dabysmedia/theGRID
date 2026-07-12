"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, HeartPulse, HelpCircle, TrendingUp, X } from "lucide-react"
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
  RIR_CHOICES,
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
  setCount = exercise.sets.length,
  className,
  onApplyToNextSet,
  onAddOptionalSet,
  onSetEffort,
}: {
  exercise: PoExercise
  sessions: PoSession[]
  sessionId: string
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
  const [dismissed, setDismissed] = useState(false)
  const [effortFlags, setEffortFlags] = useState<{ technique: boolean; pain: boolean }>({
    technique: false,
    pain: false,
  })
  const shownKeyRef = useRef<string | null>(null)
  const autoAppliedKeyRef = useRef<string | null>(null)

  const overrides = prefs.exercises[normalizeExerciseKey(exercise.name)]
  const disabled = !prefs.coachEnabled || overrides?.disabled === true

  const rec = useMemo(
    () =>
      calculateNextSetRecommendation({
        exercise,
        sessions,
        overrides,
        excludeSessionId: sessionId,
      }),
    [exercise, sessions, overrides, sessionId],
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
    if (disabled || dismissed || pendingEffortSet != null) return
    const apply = rec.apply
    if (!apply || apply.addSet) return
    if (apply.weight == null && apply.reps == null) return
    const key = `${sessionId}:${exercise.id}:${apply.weight ?? "x"}:${apply.reps ?? "x"}:${rec.action}`
    if (autoAppliedKeyRef.current === key) return
    autoAppliedKeyRef.current = key
    onApplyToNextSet(apply.weight, apply.reps, true)
    postRecommendationEvent(rec, sessionId, exercise.name, "applied")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once per recommendation fingerprint
  }, [disabled, dismissed, pendingEffortSet, rec.action, rec.apply?.weight, rec.apply?.reps, sessionId, exercise.id])

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

  const recordEffort = (rir: number | null, skipped: boolean) => {
    if (pendingEffortSet == null) return
    onSetEffort(pendingEffortSet.id, {
      rir,
      rirSkipped: skipped,
      techniqueFlag: effortFlags.technique || undefined,
      painFlag: effortFlags.pain || undefined,
    })
    setEffortFlags({ technique: false, pain: false })
  }

  const effortDialog = pendingEffortSet ? (
    <EffortRatingDialog
      set={pendingEffortSet}
      scale={scale}
      targetRir={rec.targetRir}
      flags={effortFlags}
      onFlagsChange={setEffortFlags}
      onRecord={recordEffort}
    />
  ) : null

  /* Effort is useful training data even when recommendation cards are hidden. */
  if (disabled || dismissed) return effortDialog

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
        className={cn("space-y-2 border-t border-glass-border/20 pt-3", className)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <TrendingUp className="size-3.5 shrink-0 text-primary/80" aria-hidden />
            <h4 className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/65">
              Progress & next step
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
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setWhyOpen(true)}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-glass-highlight/25 hover:text-foreground touch-manipulation"
              aria-label="Why this recommendation?"
            >
              <HelpCircle className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Dismiss recommendations for this movement"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-glass-highlight/25 hover:text-foreground touch-manipulation"
              onClick={() => {
                setDismissed(true)
                postRecommendationEvent(rec, sessionId, exercise.name, "dismissed")
              }}
            >
              <X className="size-3.5" aria-hidden />
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
            <span className="mb-0.5 shrink-0 rounded-lg bg-primary/12 px-2.5 py-1 text-xs font-bold tabular-nums text-primary">
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
          <p className="rounded-lg bg-primary/[0.08] px-2 py-1.5 text-[10px] font-medium text-primary/85">
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
        prefs={prefs}
        onPrefsChange={setPrefs}
      />
      {effortDialog}
    </>
  )
}

function EffortRatingDialog({
  set,
  scale,
  targetRir,
  flags,
  onFlagsChange,
  onRecord,
}: {
  set: PoSet
  scale: ProgressionPrefs["effortScale"]
  targetRir: number
  flags: { technique: boolean; pain: boolean }
  onFlagsChange: (flags: { technique: boolean; pain: boolean }) => void
  onRecord: (rir: number | null, skipped: boolean) => void
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
            {scale === "rpe"
              ? "Choose RPE 5–10. RPE 10 means no reps left."
              : "Choose reps in reserve. 0 means no reps left."}
          </DialogDescription>
        </div>

        <div className="grid grid-cols-3 gap-2 px-4">
          {[...RIR_CHOICES].reverse().map((choice) => {
            const label =
              scale === "rpe"
                ? choice.rir === 5
                  ? "5"
                  : String(rirToRpe(choice.rir))
                : choice.label
            const selectedTarget = choice.rir === targetRir
            const plainHint =
              choice.rir === 0
                ? "Max effort"
                : choice.rir === 2
                  ? "Target effort"
                  : choice.rir === 5
                    ? "Easy"
                    : `${choice.rir} rep${choice.rir === 1 ? "" : "s"} left`
            return (
              <button
                key={choice.rir}
                type="button"
                onClick={() => onRecord(choice.rir, false)}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center rounded-xl border px-2 font-bold tabular-nums transition-all touch-manipulation active:scale-[0.96]",
                  selectedTarget
                    ? "border-primary/55 bg-primary/15 text-primary ring-1 ring-primary/30"
                    : "border-glass-border/35 bg-glass-highlight/[0.07] text-foreground hover:border-primary/35",
                )}
              >
                <span className="text-lg leading-none">
                  {scale === "rpe" ? `RPE ${label}` : `${label} RIR`}
                </span>
                <span className="mt-1 text-[9px] font-medium text-muted-foreground/70">
                  {plainHint}
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

        <button
          type="button"
          className="mx-4 my-3 min-h-10 text-xs font-semibold text-muted-foreground/60 touch-manipulation"
          onClick={() => onRecord(null, true)}
        >
          Skip effort rating
        </button>
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
  onPrefsChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  rec: CoachRecommendation
  exercise: PoExercise
  sessions: PoSession[]
  sessionId: string
  prefs: ProgressionPrefs
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
          <div className="space-y-1 px-4 pb-2 pt-4 pr-12">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle>Why this recommendation?</DialogTitle>
              <DialogDescription>
                {exercise.name} · confidence {rec.confidence}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-3 px-4 pb-4">
            <div className="flex flex-wrap gap-1.5">
              <span
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                  STATUS_BADGE_CLASSES[rec.status],
                )}
              >
                {COACH_STATUS_LABELS[rec.status]}
              </span>
              <span className="rounded-md border border-glass-border/40 bg-glass-highlight/15 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-muted-foreground/70">
                {rec.repMin}–{rec.repMax} · {rec.targetRir} RIR
              </span>
            </div>

            {rec.reasonCodes.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {rec.reasonCodes.slice(0, 4).map((code) => (
                  <span
                    key={code}
                    className="rounded-md bg-muted/30 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/75"
                  >
                    {REASON_CODE_LABELS[code] ?? code}
                  </span>
                ))}
              </div>
            ) : null}

            <ul className="space-y-1.5">
              {rec.explanation.map((line, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
                >
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/60" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>

            {history.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Sessions considered
                  {rec.sourceExerciseKey ? ` (${rec.sourceExerciseKey})` : ""}
                </p>
                <div className="glass-subtle divide-y divide-glass-border/20 rounded-lg">
                  {history.map((exp) => (
                    <div
                      key={exp.sessionId}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] tabular-nums"
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
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60">
                No usable history yet — recommendations sharpen after the first logged
                session.
              </p>
            )}

            {/* Per-movement settings */}
            <div className="space-y-2 border-t border-glass-border/25 pt-3">
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
                {[1, 2, 3].map((rir) => {
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
                      {rir} RIR
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
