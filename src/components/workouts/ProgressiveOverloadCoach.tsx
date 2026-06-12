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
  RIR_CHOICES,
  calculateNextSetRecommendation,
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
  onApplyToNextSet,
  onAddOptionalSet,
  onSetEffort,
}: {
  exercise: PoExercise
  sessions: PoSession[]
  sessionId: string
  onApplyToNextSet: (weight: number | null, reps: number | null) => void
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

  /* Audit "shown" once per movement per session (after data settles). */
  useEffect(() => {
    if (disabled || pendingEffortSet != null) return
    const key = `${sessionId}:${exercise.id}`
    if (shownKeyRef.current === key) return
    shownKeyRef.current = key
    postRecommendationEvent(rec, sessionId, exercise.name, "shown")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- audit once per movement
  }, [disabled, pendingEffortSet, sessionId, exercise.id])

  if (disabled || dismissed) return null

  const scale = prefs.effortScale

  /* ── Effort (RIR/RPE) prompt takes over the card right after a set ── */
  if (pendingEffortSet != null) {
    const setNo = pendingEffortSet.setNumber
    const record = (rir: number | null, skipped: boolean) => {
      onSetEffort(pendingEffortSet.id, {
        rir,
        rirSkipped: skipped,
        techniqueFlag: effortFlags.technique || undefined,
        painFlag: effortFlags.pain || undefined,
      })
      setEffortFlags({ technique: false, pain: false })
    }
    return (
      <section
        aria-label={`Effort rating for set ${setNo}`}
        className="glass-subtle shrink-0 rounded-xl border border-primary/20 px-2.5 py-2 mt-1.5"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] font-semibold text-foreground">
            How hard was set {setNo}?
            <span className="ml-1.5 font-normal text-muted-foreground/60">
              {scale === "rir" ? "reps left in the tank" : "RPE"}
            </span>
          </p>
          <button
            type="button"
            className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 transition-colors hover:bg-glass-highlight/30 hover:text-foreground touch-manipulation"
            onClick={() => record(null, true)}
          >
            Skip
          </button>
        </div>
        <div className="mt-1.5 grid grid-cols-6 gap-1.5">
          {RIR_CHOICES.map((c) => {
            const label = scale === "rir" ? c.label : c.rir === 5 ? "≤5" : String(rirToRpe(c.rir))
            return (
              <button
                key={c.rir}
                type="button"
                onClick={() => record(c.rir, false)}
                aria-label={`${scale === "rir" ? `${c.label} reps in reserve` : `RPE ${label}`}${c.hint ? ` — ${c.hint}` : ""}`}
                className={cn(
                  "glass-subtle flex min-h-11 flex-col items-center justify-center rounded-lg text-sm font-bold tabular-nums transition-colors touch-manipulation active:scale-[0.95] hover:border-primary/35 hover:bg-glass-highlight/25",
                  c.rir === 2 && "border-primary/30 text-primary",
                )}
              >
                {label}
                {c.hint ? (
                  <span className="text-[8px] font-medium leading-none text-muted-foreground/55">
                    {c.hint}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={effortFlags.technique}
            onClick={() => setEffortFlags((f) => ({ ...f, technique: !f.technique }))}
            className={cn(
              "flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-[10px] font-semibold transition-colors touch-manipulation",
              effortFlags.technique
                ? "border border-amber-500/45 bg-amber-500/15 text-amber-400"
                : "glass-subtle text-muted-foreground/60 hover:text-foreground",
            )}
          >
            <AlertTriangle className="size-3 shrink-0" aria-hidden />
            Technique broke down
          </button>
          <button
            type="button"
            aria-pressed={effortFlags.pain}
            onClick={() => setEffortFlags((f) => ({ ...f, pain: !f.pain }))}
            className={cn(
              "flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-[10px] font-semibold transition-colors touch-manipulation",
              effortFlags.pain
                ? "border border-rose-500/45 bg-rose-500/15 text-rose-400"
                : "glass-subtle text-muted-foreground/60 hover:text-foreground",
            )}
          >
            <HeartPulse className="size-3 shrink-0" aria-hidden />
            Pain or discomfort
          </button>
        </div>
      </section>
    )
  }

  /* ── Default recommendation card ───────────────── */
  const apply = rec.apply
  const contextLines = [rec.basedOn, rec.sourceLabel ?? rec.goal].filter(
    (l): l is string => !!l,
  )

  return (
    <>
      <section
        aria-label="Progressive overload coach"
        className="glass-subtle shrink-0 rounded-xl border border-glass-border/35 px-2.5 py-2 mt-1.5"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <TrendingUp className="size-3 shrink-0 text-primary/80" aria-hidden />
            <h4 className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Progressive overload
            </h4>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                STATUS_BADGE_CLASSES[rec.status],
              )}
            >
              {COACH_STATUS_LABELS[rec.status]}
            </span>
            <button
              type="button"
              aria-label="Dismiss recommendations for this movement"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground/45 transition-colors hover:bg-glass-highlight/30 hover:text-foreground touch-manipulation"
              onClick={() => {
                setDismissed(true)
                postRecommendationEvent(rec, sessionId, exercise.name, "dismissed")
              }}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="mt-1 flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-[0.15em] text-muted-foreground/55">
              Next target
            </p>
            <p className="truncate font-heading text-lg font-bold leading-tight text-foreground">
              {rec.headline}
            </p>
            <p className="truncate text-[11px] text-muted-foreground/70">
              {scale === "rpe"
                ? rec.detail.replace(
                    `${rec.targetRir} RIR`,
                    `RPE ${rirToRpe(rec.targetRir)}`,
                  )
                : rec.detail}
            </p>
          </div>
          {rec.delta ? (
            <span className="shrink-0 rounded-lg border border-primary/25 bg-primary/10 px-2 py-1 text-[11px] font-bold tabular-nums text-primary">
              {rec.delta}
            </span>
          ) : null}
        </div>

        {contextLines.length > 0 ? (
          <div className="mt-1 space-y-0.5">
            {contextLines.slice(0, 2).map((line, i) => (
              <p key={i} className="truncate text-[10px] leading-snug text-muted-foreground/55">
                {line}
              </p>
            ))}
          </div>
        ) : null}

        <div className="mt-1.5 flex items-center gap-1.5">
          {apply ? (
            <Button
              type="button"
              variant="glass"
              size="sm"
              className="h-9 min-h-9 min-w-0 flex-1 truncate px-2 text-[11px] font-semibold press-scale touch-manipulation"
              onClick={() => {
                if (apply.addSet) onAddOptionalSet(apply.weight, apply.reps)
                else onApplyToNextSet(apply.weight, apply.reps)
                postRecommendationEvent(rec, sessionId, exercise.name, "applied")
              }}
            >
              {apply.label}
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => setWhyOpen(true)}
            className="glass-subtle flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-muted-foreground/70 transition-colors hover:text-foreground touch-manipulation"
            aria-label="Why this recommendation?"
          >
            <HelpCircle className="size-3.5" aria-hidden />
            Why?
          </button>
        </div>
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
    </>
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
                        onPrefsChange(saveExerciseOverride(exercise.name, { targetRir: rir }))
                      }
                      className={cn(
                        "min-h-9 rounded-lg px-3 text-[11px] font-semibold transition-colors touch-manipulation",
                        active
                          ? "glass-panel-accent text-primary ring-1 ring-primary/35 [--panel-accent:var(--primary)]"
                          : "glass-subtle text-muted-foreground/75 hover:text-foreground",
                      )}
                    >
                      {prefs.effortScale === "rpe" ? `RPE ${rirToRpe(rir)}` : `${rir} RIR`}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onPrefsChange(
                      saveProgressionPrefs({
                        effortScale: prefs.effortScale === "rir" ? "rpe" : "rir",
                      }),
                    )
                  }
                  className="glass-subtle min-h-9 flex-1 rounded-lg px-3 text-[11px] font-semibold text-muted-foreground/75 transition-colors hover:text-foreground touch-manipulation"
                >
                  Effort scale: {prefs.effortScale.toUpperCase()}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onPrefsChange(
                      saveExerciseOverride(exercise.name, {
                        disabled: !(override?.disabled ?? false),
                      }),
                    )
                  }
                  className={cn(
                    "min-h-9 flex-1 rounded-lg px-3 text-[11px] font-semibold transition-colors touch-manipulation",
                    override?.disabled
                      ? "border border-rose-500/40 bg-rose-500/10 text-rose-400"
                      : "glass-subtle text-muted-foreground/75 hover:text-foreground",
                  )}
                >
                  {override?.disabled ? "Coach off for this movement" : "Turn off for this movement"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
