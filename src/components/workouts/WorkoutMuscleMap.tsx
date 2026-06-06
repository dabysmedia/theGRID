"use client"

import { createEmptyAnatomyState } from "@/lib/anatomy-health/model"
import { DEFAULT_REGION_LABELS } from "@/lib/anatomy-health/region-labels"
import { BodySilhouetteSvg } from "@/components/anatomy-health/BodySilhouetteSvg"
import { InjuryLegend } from "@/components/anatomy-health/InjuryLegend"
import { cn } from "@/lib/utils"
import "@/components/anatomy-health/anatomy-health.css"

const EMPTY_STATE = createEmptyAnatomyState(DEFAULT_REGION_LABELS)

export interface WorkoutMuscleMapProps {
  segmentScores: Record<string, number> | null
  className?: string
}

function BodyViewPanel({
  view,
  label,
  segmentScores,
}: {
  view: "front" | "back"
  label: string
  segmentScores: Record<string, number> | null
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <p className="mb-1.5 text-center text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="relative flex min-h-[180px] flex-1 items-center justify-center px-1.5 py-2 sm:px-2 sm:py-2.5">
        <BodySilhouetteSvg
          view={view}
          state={EMPTY_STATE}
          selectedSegmentKey={null}
          hoveredSegmentKey={null}
          onSelectSegment={() => {}}
          onHoverSegment={() => {}}
          domsScores={segmentScores}
          segmentHeatVariant="load"
          interactive={false}
          className="max-h-[min(36vh,280px)] max-w-full"
        />
      </div>
    </div>
  )
}

export function WorkoutMuscleMap({ segmentScores, className }: WorkoutMuscleMapProps) {
  return (
    <div className={cn("anatomy-health-root", className)} data-anatomy-static="true">
      <div className="anatomy-figure-chassis relative isolate overflow-hidden rounded-xl border border-border/30">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.22]"
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, var(--anatomy-grid-fine) 0, var(--anatomy-grid-fine) 1px, transparent 1px, transparent 14px)`,
          }}
          aria-hidden
        />
        <div className="relative z-[1] grid grid-cols-2 divide-x divide-border/25 p-3 sm:p-4">
          <BodyViewPanel view="front" label="Front" segmentScores={segmentScores} />
          <BodyViewPanel view="back" label="Back" segmentScores={segmentScores} />
        </div>
        <div className="relative z-[1] border-t border-border/25 px-3 py-2">
          <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Load
          </p>
          <InjuryLegend variant="load" className="gap-x-3 gap-y-1" />
        </div>
      </div>
    </div>
  )
}
