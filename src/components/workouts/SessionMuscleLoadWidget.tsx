"use client"

import { useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { createEmptyAnatomyState } from "@/lib/anatomy-health/model"
import { DEFAULT_REGION_LABELS } from "@/lib/anatomy-health/region-labels"
import { BodySilhouetteSvg } from "@/components/anatomy-health/BodySilhouetteSvg"
import { HubCollapse } from "@/components/hub/HubMotion"
import { cn } from "@/lib/utils"
import {
  aggregateLiveMuscleStats,
  formatSetCount,
  formatVolumeLb,
  liveStatsToSegmentScores,
  muscleNamesToSegmentKeys,
  type WorkoutExerciseLike,
  type WorkoutMuscleTag,
} from "@/lib/workouts/muscle-volume"
import "@/components/anatomy-health/anatomy-health.css"

const EMPTY_STATE = createEmptyAnatomyState(DEFAULT_REGION_LABELS)

function muscleKey(name: string): string {
  return name.trim().toLowerCase()
}

function muscleSwatch(hex: string | undefined): string {
  const c = hex?.trim()
  return c && /^#[0-9A-Fa-f]{6}$/.test(c) ? c : "var(--primary)"
}

function namesFromTags(tags: WorkoutMuscleTag[] | undefined): string[] {
  return (tags ?? []).map((m) => m.name).filter((n) => n.trim().length > 0)
}

function MiniBody({
  view,
  segmentScores,
  highlightKeys,
}: {
  view: "front" | "back"
  segmentScores: Record<string, number> | null
  highlightKeys: string[]
}) {
  return (
    <div className="flex h-[4.6rem] w-[2.35rem] items-center justify-center sm:h-[4.85rem] sm:w-[2.5rem]">
      <BodySilhouetteSvg
        view={view}
        state={EMPTY_STATE}
        selectedSegmentKey={null}
        hoveredSegmentKey={null}
        onSelectSegment={() => {}}
        onHoverSegment={() => {}}
        domsScores={segmentScores}
        domsHighlightKeys={highlightKeys}
        segmentHeatVariant="load"
        interactive={false}
        className="max-h-full max-w-full drop-shadow-none"
      />
    </div>
  )
}

export interface SessionMuscleLoadWidgetProps {
  exercises: WorkoutExerciseLike[]
  currentPrimaryMuscles?: WorkoutMuscleTag[]
  currentSecondaryMuscles?: WorkoutMuscleTag[]
  className?: string
}

export function SessionMuscleLoadWidget({
  exercises,
  currentPrimaryMuscles,
  currentSecondaryMuscles,
  className,
}: SessionMuscleLoadWidgetProps) {
  const [expanded, setExpanded] = useState(false)

  const stats = useMemo(() => aggregateLiveMuscleStats(exercises), [exercises])

  const currentNames = useMemo(() => {
    const set = new Set<string>()
    for (const name of [
      ...namesFromTags(currentPrimaryMuscles),
      ...namesFromTags(currentSecondaryMuscles),
    ]) {
      set.add(muscleKey(name))
    }
    return set
  }, [currentPrimaryMuscles, currentSecondaryMuscles])

  const rows = useMemo(() => {
    if (currentNames.size === 0) return stats
    const current = stats.filter((row) => currentNames.has(muscleKey(row.muscle)))
    const rest = stats.filter((row) => !currentNames.has(muscleKey(row.muscle)))
    return [...current, ...rest]
  }, [stats, currentNames])

  const highlightKeys = useMemo(
    () => muscleNamesToSegmentKeys(currentNames),
    [currentNames],
  )

  const segmentScores = useMemo(() => {
    const scores = liveStatsToSegmentScores(stats)
    return Object.keys(scores).length > 0 ? scores : null
  }, [stats])

  const rawCompletedSets = useMemo(
    () =>
      exercises.reduce(
        (sum, ex) =>
          sum +
          ex.sets.filter(
            (set) => set.completed && (set.type ?? "working") !== "warmup",
          ).length,
        0,
      ),
    [exercises],
  )
  const plannedWorking = useMemo(
    () => stats.reduce((sum, row) => Math.max(sum, row.plannedSets), 0),
    [stats],
  )
  const barMax = Math.max(plannedWorking, 1)

  if (rows.length === 0) return null

  const summary =
    rawCompletedSets <= 0
      ? "No working sets completed yet"
      : `${rawCompletedSets} working set${rawCompletedSets === 1 ? "" : "s"} across ${rows.length} muscle${rows.length === 1 ? "" : "s"}`

  return (
    <div
      data-session-muscle-load=""
      className={cn(
        "anatomy-health-root shrink-0 overflow-hidden rounded-[1.25rem] border border-white/[0.07] bg-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        className,
      )}
      data-anatomy-static="true"
    >
      <div className="flex items-stretch gap-1.5 p-1.5">
        <div className="relative flex shrink-0 items-end gap-0 rounded-xl border border-white/[0.05] bg-gradient-to-b from-white/[0.04] to-black/30 px-0.5 pt-3.5 pb-0.5">
          <p className="pointer-events-none absolute inset-x-0 top-1 text-center text-[8px] font-semibold uppercase tracking-[0.16em] text-primary/65">
            Load
          </p>
          <MiniBody
            view="front"
            segmentScores={segmentScores}
            highlightKeys={highlightKeys}
          />
          <MiniBody
            view="back"
            segmentScores={segmentScores}
            highlightKeys={highlightKeys}
          />
        </div>

        <ul
          className="flex min-w-0 flex-1 items-stretch gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label={summary}
        >
          {rows.map((row) => {
            const isCurrent = currentNames.has(muscleKey(row.muscle))
            const ratio =
              row.plannedSets > 0
                ? Math.min(1, row.completedSets / row.plannedSets)
                : row.completedSets > 0
                  ? 1
                  : 0
            const swatch = muscleSwatch(row.color)
            return (
              <li key={row.muscle} className="flex">
                <div
                  className={cn(
                    "flex min-w-[5.1rem] flex-col justify-between rounded-xl border px-2 py-1.5",
                    isCurrent
                      ? "border-primary/35 bg-primary/[0.08] ring-1 ring-primary/25"
                      : "border-white/[0.06] bg-black/20",
                  )}
                >
                  <p className="truncate text-[10px] font-semibold leading-tight text-foreground/88">
                    {row.muscle}
                  </p>
                  <p className="mt-0.5 font-heading text-[15px] font-bold tabular-nums leading-none text-foreground">
                    {formatSetCount(row.completedSets)}
                    <span className="ml-0.5 text-[10px] font-medium text-muted-foreground/55">
                      / {formatSetCount(row.plannedSets)}
                    </span>
                  </p>
                  <div
                    className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-white/[0.08]"
                    aria-hidden
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{
                        width: `${Math.round(ratio * 100)}%`,
                        backgroundColor: swatch,
                        boxShadow: ratio > 0 ? `0 0 8px ${swatch}66` : undefined,
                      }}
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        <button
          type="button"
          className="flex w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-black/20 text-muted-foreground/60 transition-colors hover:bg-white/[0.06] hover:text-foreground touch-manipulation"
          aria-expanded={expanded}
          aria-controls="session-muscle-load-detail"
          aria-label={expanded ? "Hide muscle set details" : "Show muscle set details"}
          onClick={() => setExpanded((open) => !open)}
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-200",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      <HubCollapse open={expanded} durationMs={280}>
        <div
          id="session-muscle-load-detail"
          className="max-h-[30vh] space-y-1.5 overflow-y-auto border-t border-white/[0.06] px-3 py-2.5"
        >
          {rows.map((row) => {
            const isCurrent = currentNames.has(muscleKey(row.muscle))
            const fillPct = Math.min(100, (row.completedSets / barMax) * 100)
            const planPct = Math.min(100, (row.plannedSets / barMax) * 100)
            const swatch = muscleSwatch(row.color)
            return (
              <div key={`detail-${row.muscle}`} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className={cn(
                      "truncate text-[11px] font-semibold",
                      isCurrent ? "text-primary/90" : "text-foreground/85",
                    )}
                  >
                    {row.muscle}
                  </p>
                  <p className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                    {formatSetCount(row.completedSets)} / {formatSetCount(row.plannedSets)}
                    {row.volumeLb > 0 ? ` · ${formatVolumeLb(row.volumeLb)}` : ""}
                  </p>
                </div>
                <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-white/[0.1]"
                    style={{ width: `${planPct}%` }}
                    aria-hidden
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out"
                    style={{
                      width: `${fillPct}%`,
                      backgroundColor: swatch,
                    }}
                    aria-hidden
                  />
                </div>
              </div>
            )
          })}
          <p className="pt-1 text-center text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40">
            Working sets · secondaries at 40%
          </p>
        </div>
      </HubCollapse>
    </div>
  )
}
