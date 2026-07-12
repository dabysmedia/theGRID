"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, ArrowRight, Check, Pencil, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  COACH_STATUS_LABELS,
  calculateNextSetRecommendation,
  formatLoad,
  rirToRpe,
  summarizeMovementPerformance,
  type MovementSummary,
  type PoExercise,
  type PoSession,
} from "@/lib/workouts/progressive-overload"
import {
  loadProgressionPrefs,
  type ProgressionPrefs,
} from "@/lib/workouts/progression-settings"

const OUTCOME_STYLES: Record<
  MovementSummary["outcome"],
  { label: string; className: string }
> = {
  progressed: { label: "Progressed", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  held: { label: "Held steady", className: "border-glass-border/40 bg-glass-highlight/15 text-muted-foreground" },
  adjust: { label: "Adjust", className: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
}

export function MovementCompleteOverview({
  exercise,
  sessions,
  sessionId,
  isLastMovement,
  onContinue,
  onEditSets,
  onAddOptionalSet,
}: {
  exercise: PoExercise
  sessions: PoSession[]
  sessionId: string
  isLastMovement: boolean
  onContinue: () => void
  onEditSets: () => void
  onAddOptionalSet: (weight: number | null, reps: number | null) => void
}) {
  /* Rendered client-side only (inside the active workout overlay), so reading
     localStorage in the lazy initializer cannot cause a hydration mismatch. */
  const [prefs] = useState<ProgressionPrefs>(() => loadProgressionPrefs())
  const [showDetails, setShowDetails] = useState(false)

  const summary = useMemo(
    () =>
      summarizeMovementPerformance({
        exercise,
        sessions,
        overrides: prefs.exercises[exercise.name.trim().toLowerCase()],
        excludeSessionId: sessionId,
      }),
    [exercise, sessions, prefs, sessionId],
  )

  /* Live engine still offers an optional extra set when every safety gate passes. */
  const optionalSetRec = useMemo(() => {
    const live = calculateNextSetRecommendation({
      exercise,
      sessions,
      overrides: prefs.exercises[exercise.name.trim().toLowerCase()],
      excludeSessionId: sessionId,
    })
    return live.action === "optional_set" ? live : null
  }, [exercise, sessions, prefs, sessionId])

  const next = summary.nextSession
  const outcome = OUTCOME_STYLES[summary.outcome]
  const effortScale = prefs.effortScale
  const medianEffortText =
    summary.medianRir != null
      ? effortScale === "rpe"
        ? `~RPE ${rirToRpe(summary.medianRir)}`
        : `~${summary.medianRir} RIR`
      : null

  const statLine = [
    `${summary.completedSets} set${summary.completedSets === 1 ? "" : "s"}`,
    `${summary.totalReps} total reps`,
    summary.volumeLb > 0 ? `${formatVol(summary.volumeLb)} lb volume` : null,
    medianEffortText,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain py-2">
      <div className="flex flex-col items-center px-1 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/15 ring-2 ring-primary/30">
          <Check className="size-6 text-primary" aria-hidden />
        </div>
        <p className="mt-2 text-base font-semibold text-foreground">Movement complete</p>
        <span
          className={cn(
            "mt-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            outcome.className,
          )}
        >
          {outcome.label}
        </span>
        <p className="mt-2 text-xs text-muted-foreground/80">{statLine}</p>
        {summary.bestSet ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground/60">
            Best set:{" "}
            {summary.bestSet.weight != null && summary.bestSet.weight > 0
              ? `${formatLoad(summary.bestSet.weight)} lb × ${summary.bestSet.reps}`
              : `${summary.bestSet.reps} reps`}
            {summary.est1Rm != null ? ` · est. 1RM ~${summary.est1Rm} lb` : ""}
          </p>
        ) : null}
        {summary.newBest ? (
          <p className="mt-1 text-xs font-semibold text-primary">{summary.newBest.text}</p>
        ) : null}
        {summary.comparison ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground/60">
            Compared with {summary.comparison.dateKey}: {summary.comparison.text}
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-muted-foreground/55">
            First logged exposure — baseline saved for next time.
          </p>
        )}
        {summary.flags.pain || summary.flags.technique ? (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-amber-400">
            <AlertTriangle className="size-3 shrink-0" aria-hidden />
            {summary.flags.pain ? "Pain flagged" : "Technique flagged"} — progression held
            back
          </p>
        ) : null}
      </div>

      <div className="mt-3 shrink-0">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/65">
          Set-by-set progress
        </p>
        <div className="grid gap-1.5">
          {summary.setComparisons.map((set) => (
            <div
              key={set.setNumber}
              className="flex items-center justify-between gap-3 rounded-xl border border-glass-border/25 bg-glass-highlight/[0.06] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">Set {set.setNumber}</p>
                <p className="text-[10px] tabular-nums text-muted-foreground/60">
                  {set.currentWeight != null && set.currentWeight > 0
                    ? `${formatLoad(set.currentWeight)} lb × `
                    : ""}
                  {set.currentReps} reps
                  {set.previousReps != null
                    ? ` · last time ${set.previousWeight != null ? `${formatLoad(set.previousWeight)} lb × ` : ""}${set.previousReps}`
                    : " · first baseline"}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold tabular-nums",
                  set.outcome === "progressed"
                    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-400"
                    : set.outcome === "adjust"
                      ? "border-amber-500/35 bg-amber-500/10 text-amber-400"
                      : "border-glass-border/35 bg-glass-highlight/10 text-muted-foreground",
                )}
              >
                {set.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-subtle mt-3 shrink-0 rounded-xl border border-glass-border/35 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/65">
            Next time
          </p>
          <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
            {COACH_STATUS_LABELS[next.status]}
          </span>
        </div>
        <p className="mt-0.5 text-sm font-semibold text-foreground">
          Do this next time: {next.headline}
        </p>
        <p className="text-[11px] text-muted-foreground/70">
          {effortScale === "rpe"
            ? next.detail.replace(`${next.targetRir} RIR`, `RPE ${rirToRpe(next.targetRir)}`)
            : next.detail}
        </p>
        {next.goal ? (
          <p className="mt-1 text-[10px] text-muted-foreground/65">
            <span className="font-semibold text-muted-foreground/85">Why: </span>
            {next.goal}
          </p>
        ) : null}
        {next.confidence === "low" ? (
          <p className="mt-0.5 text-[10px] font-medium text-amber-400/85">
            Low confidence — based on limited data
          </p>
        ) : null}
      </div>

      {optionalSetRec?.apply ? (
        <button
          type="button"
          onClick={() =>
            onAddOptionalSet(optionalSetRec.apply!.weight, optionalSetRec.apply!.reps)
          }
          className="glass-subtle mt-2 flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/30 px-3 text-xs font-semibold text-primary/90 transition-colors hover:bg-glass-highlight/25 touch-manipulation"
        >
          <Plus className="size-3.5" aria-hidden />
          Optional: add one more set — the last set was easier than planned
        </button>
      ) : null}

      {showDetails ? (
        <div className="glass-subtle mt-2 shrink-0 space-y-1 rounded-xl border border-glass-border/30 px-3 py-2">
          {next.explanation.map((line, i) => (
            <p key={i} className="text-[11px] leading-relaxed text-muted-foreground/70">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex shrink-0 items-stretch gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 min-h-11 shrink-0 gap-1.5 px-3 text-xs touch-manipulation"
          onClick={onEditSets}
        >
          <Pencil className="size-3.5" aria-hidden />
          Edit sets
        </Button>
        <button
          type="button"
          className="glass-subtle min-h-11 shrink-0 rounded-lg px-3 text-xs font-semibold text-muted-foreground/70 transition-colors hover:text-foreground touch-manipulation"
          onClick={() => setShowDetails((v) => !v)}
        >
          {showDetails ? "Hide details" : "View details"}
        </button>
        <Button
          type="button"
          variant="glass"
          size="sm"
          className="h-11 min-h-11 min-w-0 flex-1 gap-1.5 text-xs font-semibold press-scale touch-manipulation"
          onClick={onContinue}
        >
          {isLastMovement ? "Finish movement" : "Continue to next exercise"}
          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

function formatVol(vol: number): string {
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}k`
  return String(Math.round(vol))
}
