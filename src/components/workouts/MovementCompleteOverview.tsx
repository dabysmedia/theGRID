"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, ArrowRight, Check, Pencil, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  calculateNextSetRecommendation,
  formatLoad,
  getComparableExerciseHistory,
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
import {
  progressionOverridesForStyle,
  TRAINING_STYLE_DEFINITIONS,
  type TrainingStyle,
} from "@/lib/workouts/training-style"

const OUTCOME_STYLES: Record<
  MovementSummary["outcome"],
  { label: string; className: string }
> = {
  progressed: { label: "Progressed", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  held: { label: "Held steady", className: "border-glass-border/40 bg-glass-highlight/15 text-muted-foreground" },
  adjust: { label: "Adjust", className: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
}

function MovementTrendChart({
  points,
  summary,
}: {
  points: Array<{ label: string; value: number }>
  summary: string
}) {
  if (points.length < 2) {
    return (
      <div className="flex h-20 items-center justify-center border-y border-dashed border-glass-border/25 px-3 text-center text-[11px] text-muted-foreground/55">
        {summary}
      </div>
    )
  }

  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const left = 12
  const right = 288
  const top = 18
  const bottom = 66
  const coords = points.map((point, index) => ({
    ...point,
    x: left + (index / Math.max(1, points.length - 1)) * (right - left),
    y: bottom - ((point.value - min) / span) * (bottom - top),
  }))

  return (
    <svg
      viewBox="0 0 300 94"
      className="h-24 w-full overflow-visible text-primary"
      role="img"
      aria-label={summary}
    >
      <title>{summary}</title>
      <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="currentColor" strokeOpacity="0.12" />
      <polyline
        points={coords.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coords.map((point, index) => (
        <g key={`${point.label}-${index}`}>
          <circle cx={point.x} cy={point.y} r="3.5" fill="currentColor" />
          <text
            x={point.x}
            y={Math.max(10, point.y - 7)}
            textAnchor="middle"
            fill="currentColor"
            fontSize="8"
            fontWeight="700"
          >
            {point.value}
          </text>
          <text
            x={point.x}
            y="86"
            textAnchor="middle"
            fill="currentColor"
            fillOpacity="0.48"
            fontSize="8"
          >
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function MovementCompleteOverview({
  exercise,
  sessions,
  sessionId,
  trainingStyle,
  isLastMovement,
  onContinue,
  onEditSets,
  onAddOptionalSet,
}: {
  exercise: PoExercise
  sessions: PoSession[]
  sessionId: string
  trainingStyle: TrainingStyle
  isLastMovement: boolean
  onContinue: () => void
  onEditSets: () => void
  onAddOptionalSet: (weight: number | null, reps: number | null) => void
}) {
  /* Rendered client-side only (inside the active workout overlay), so reading
     localStorage in the lazy initializer cannot cause a hydration mismatch. */
  const [prefs] = useState<ProgressionPrefs>(() => loadProgressionPrefs())
  const [showDetails, setShowDetails] = useState(false)
  const exerciseOverrides = prefs.exercises[exercise.name.trim().toLowerCase()]
  const effectiveOverrides = useMemo(
    () => progressionOverridesForStyle(trainingStyle, exerciseOverrides),
    [trainingStyle, exerciseOverrides],
  )

  const summary = useMemo(
    () =>
      summarizeMovementPerformance({
        exercise,
        sessions,
        overrides: effectiveOverrides,
        excludeSessionId: sessionId,
      }),
    [exercise, sessions, effectiveOverrides, sessionId],
  )

  /* Live engine still offers an optional extra set when every safety gate passes. */
  const optionalSetRec = useMemo(() => {
    const live = calculateNextSetRecommendation({
      exercise,
      sessions,
      overrides: effectiveOverrides,
      excludeSessionId: sessionId,
    })
    return live.action === "optional_set" ? live : null
  }, [exercise, sessions, effectiveOverrides, sessionId])

  const outcome = OUTCOME_STYLES[summary.outcome]
  const effortScale = prefs.effortScale
  const medianEffortText =
    summary.medianRir != null
      ? effortScale === "rpe"
        ? `~RPE ${rirToRpe(summary.medianRir)}`
        : `~${summary.medianRir} RIR`
      : null

  const trend = useMemo(() => {
    const currentUsesLoad = summary.bestSet?.weight != null && summary.bestSet.weight > 0
    const previous = getComparableExerciseHistory(sessions, exercise.name, {
      excludeSessionId: sessionId,
      limit: 5,
    })
      .reverse()
      .map((entry) => ({
        label: entry.dateKey.slice(5).replace("-", "/"),
        value: currentUsesLoad ? entry.topWeight : entry.totalReps,
      }))
      .filter((entry): entry is { label: string; value: number } => entry.value != null)
    const currentValue = currentUsesLoad ? summary.bestSet?.weight : summary.totalReps
    const points = currentValue != null
      ? [...previous, { label: "Current", value: currentValue }].slice(-6)
      : previous.slice(-6)
    const first = points[0]?.value ?? null
    const last = points.at(-1)?.value ?? null
    const difference = first != null && last != null ? last - first : null
    const unit = currentUsesLoad ? "lb" : "reps"
    const metric = currentUsesLoad ? "Top working weight" : "Total reps"
    const direction =
      difference == null || points.length < 2
        ? "sparse"
        : Math.abs(difference) < (currentUsesLoad ? 0.5 : 1)
          ? "flat"
          : difference > 0
            ? "up"
            : "down"
    const summaryText =
      direction === "sparse"
        ? `One logged session is not enough to show a ${metric.toLowerCase()} trend.`
        : direction === "flat"
          ? `${metric} is flat across the last ${points.length} logged sessions.`
          : `${metric} is ${direction === "up" ? "up" : "down"} ${Math.abs(difference!)} ${unit} across the last ${points.length} logged sessions.`

    return { points, metric, unit, direction, summaryText }
  }, [exercise.name, sessionId, sessions, summary.bestSet?.weight, summary.totalReps])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain py-2">
      <section className="border-b border-glass-border/25 px-1 pb-3" aria-labelledby="movement-complete-title">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 ring-2 ring-primary/30">
            <Check className="size-5.5 text-primary" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p id="movement-complete-title" className="text-base font-semibold text-foreground">
              Movement complete
            </p>
            <p className="truncate text-xs text-muted-foreground/65">{exercise.name}</p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
              outcome.className,
            )}
          >
            {outcome.label}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-4 divide-x divide-glass-border/20">
          {[
            { label: "Sets", value: String(summary.completedSets) },
            { label: "Total reps", value: String(summary.totalReps) },
            { label: "Volume", value: summary.volumeLb > 0 ? `${formatVol(summary.volumeLb)} lb` : "—" },
            { label: "Effort", value: medianEffortText ?? "Not rated" },
          ].map((stat) => (
            <div key={stat.label} className="min-w-0 px-1.5 py-1 text-center">
              <p className="text-sm font-semibold tabular-nums text-foreground">{stat.value}</p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">{stat.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[10px]">
          <span className="rounded-md border border-glass-border/30 bg-glass-highlight/10 px-1.5 py-0.5 font-semibold text-muted-foreground/65">
            {TRAINING_STYLE_DEFINITIONS[trainingStyle].label}
          </span>
          {summary.bestSet ? (
            <span className="text-muted-foreground/60">
              Best: {summary.bestSet.weight != null && summary.bestSet.weight > 0
                ? `${formatLoad(summary.bestSet.weight)} lb × ${summary.bestSet.reps}`
                : `${summary.bestSet.reps} reps`}
            </span>
          ) : null}
          {summary.newBest ? (
            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-400">
              {summary.newBest.text}
            </span>
          ) : null}
        </div>
      </section>

      <section className="border-b border-glass-border/25 pb-2" aria-labelledby="movement-trend-title">
        <div className="flex items-end justify-between gap-3 px-1">
          <div>
            <p id="movement-trend-title" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/65">
              Recent trend
            </p>
            <p className="text-xs font-semibold text-foreground/90">{trend.metric}</p>
          </div>
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-wider",
            trend.direction === "up"
              ? "text-emerald-400"
              : trend.direction === "down"
                ? "text-amber-400"
                : "text-muted-foreground/55",
          )}>
            Last {trend.points.length} logged session{trend.points.length === 1 ? "" : "s"}
          </span>
        </div>
        <MovementTrendChart points={trend.points} summary={trend.summaryText} />
        {trend.points.length > 1 ? (
          <p className="px-1 text-[10px] leading-relaxed text-muted-foreground/60">
            {trend.summaryText} Logged results can vary by reps and effort.
          </p>
        ) : null}
      </section>

      {summary.flags.pain || summary.flags.technique ? (
        <p className="flex items-center gap-1.5 border-b border-amber-500/20 px-1 pb-2.5 text-[11px] font-medium text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          {summary.flags.pain ? "Pain was flagged in this movement." : "Technique was flagged in this movement."}
        </p>
      ) : null}

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

      <button
        type="button"
        className="flex min-h-10 w-full items-center justify-between rounded-xl border border-glass-border/25 bg-glass-highlight/[0.04] px-3 text-left text-[11px] font-semibold text-muted-foreground/70 touch-manipulation"
        aria-expanded={showDetails}
        onClick={() => setShowDetails((v) => !v)}
      >
        <span>Set breakdown</span>
        <span className="font-normal tabular-nums text-muted-foreground/45">
          {summary.setComparisons.length} {summary.setComparisons.length === 1 ? "set" : "sets"} · {showDetails ? "Hide" : "View"}
        </span>
      </button>

      {showDetails ? (
        <div className="grid shrink-0 gap-1.5">
          {summary.setComparisons.map((set) => (
            <div key={set.setNumber} className="flex items-center justify-between gap-3 rounded-xl border border-glass-border/25 bg-glass-highlight/[0.04] px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">Set {set.setNumber}</p>
                <p className="text-[10px] tabular-nums text-muted-foreground/60">
                  {set.currentWeight != null && set.currentWeight > 0 ? `${formatLoad(set.currentWeight)} lb × ` : ""}
                  {set.currentReps} reps
                  {set.previousReps != null ? ` · last ${set.previousWeight != null ? `${formatLoad(set.previousWeight)} lb × ` : ""}${set.previousReps}` : " · first baseline"}
                </p>
              </div>
              <span className={cn(
                "shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold tabular-nums",
                set.outcome === "progressed"
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-400"
                  : set.outcome === "adjust"
                    ? "border-amber-500/35 bg-amber-500/10 text-amber-400"
                    : "border-glass-border/35 bg-glass-highlight/10 text-muted-foreground",
              )}>
                {set.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-0.5 flex shrink-0 items-stretch gap-2">
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
