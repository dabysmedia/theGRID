"use client"

import { useCallback, useMemo } from "react"
import type { BodyView } from "@/lib/anatomy-health/model"
import { bodyHighlighterViewBox, bodySegmentsForView } from "@/lib/anatomy-health/body-highlighter"
import type { AnatomyHealthState } from "@/lib/anatomy-health/model"
import { formatBodySegmentTitle } from "@/lib/anatomy-health/segment-labels"
import { domsScoreToSeverity } from "@/lib/anatomy-health/severity"
import type { SeverityLevel } from "@/lib/anatomy-health/model"
import { cn } from "@/lib/utils"

export interface BodySilhouetteSvgProps {
  view: BodyView
  state: AnatomyHealthState
  selectedSegmentKey: string | null
  hoveredSegmentKey: string | null
  onSelectSegment: (interactionKey: string) => void
  onHoverSegment: (interactionKey: string | null) => void
  className?: string
  /** Optional: announce layer stack for future organ/skeleton overlays */
  layer?: "base" | "overlay"
  /** Per-segment DOMS scores (1–10); rendered as yellow on the diagram. */
  domsScores?: Record<string, number> | null
  /** Per-segment active injury severity; rendered as red. Overrides DOMS on the same segment. */
  injurySegmentSeverity?: Record<string, SeverityLevel> | null
  /** Highlight segment keys (e.g. selected in DOMS picker). */
  domsHighlightKeys?: string[] | null
  /** Grow to fill the parent box (e.g. fullscreen DOMS picker); skips default max-height cap. */
  fillParent?: boolean
}

function segmentKeyHandler(
  e: React.KeyboardEvent,
  key: string,
  onSelect: (k: string) => void
) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault()
    onSelect(key)
  }
}

export function BodySilhouetteSvg({
  view,
  state,
  selectedSegmentKey,
  hoveredSegmentKey,
  onSelectSegment,
  onHoverSegment,
  className,
  layer = "base",
  domsScores = null,
  injurySegmentSeverity = null,
  domsHighlightKeys = null,
  fillParent = false,
}: BodySilhouetteSvgProps) {
  const vb = bodyHighlighterViewBox(view)

  const segments = useMemo(() => bodySegmentsForView(view), [view])

  const handleSelect = useCallback(
    (key: string) => {
      onSelectSegment(key)
    },
    [onSelectSegment]
  )

  if (layer !== "base") {
    return null
  }

  return (
    <svg
      className={cn(
        "anatomy-svg w-full select-none",
        fillParent ? "h-full max-h-full max-w-full" : "h-auto max-h-[min(60vh,480px)]",
        className
      )}
      viewBox={vb}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Body diagram, ${view} view. Select a muscle or joint area for details.`}
    >
      {segments.map((seg) => {
        const region = state.regions[seg.regionId]
        const selected = selectedSegmentKey === seg.interactionKey
        const hovered = hoveredSegmentKey === seg.interactionKey
        const injurySev = injurySegmentSeverity?.[seg.interactionKey]
        const domsN = domsScores?.[seg.interactionKey]
        const anatomyFill: "base" | "doms" | "injury" = injurySev
          ? "injury"
          : domsN != null
            ? "doms"
            : "base"
        const pathSeverity: SeverityLevel =
          injurySev ?? (domsN != null ? domsScoreToSeverity(domsN) : "none")
        const highlight = domsHighlightKeys?.includes(seg.interactionKey) ?? false
        const pieceTitle = formatBodySegmentTitle(seg.slug, seg.side)
        const aria = `${pieceTitle}. Parent sector ${region.label}. ${region.injuries.length} active condition(s). Severity ${region.severity}.`

        return (
          <g
            key={seg.interactionKey}
            id={`anatomy-segment-${seg.interactionKey.replace(/:/g, "-")}`}
            tabIndex={0}
            role="button"
            className={cn("anatomy-region-group outline-none", highlight && "anatomy-doms-highlight")}
            aria-label={aria}
            aria-pressed={selected}
            data-selected={selected ? "true" : "false"}
            data-hover={hovered ? "true" : "false"}
            onMouseEnter={() => onHoverSegment(seg.interactionKey)}
            onMouseLeave={() => onHoverSegment(null)}
            onFocus={() => onHoverSegment(seg.interactionKey)}
            onBlur={() => onHoverSegment(null)}
            onClick={() => handleSelect(seg.interactionKey)}
            onKeyDown={(e) => segmentKeyHandler(e, seg.interactionKey, handleSelect)}
          >
            {seg.paths.map((p) => (
              <path
                key={p.key}
                d={p.d}
                className="anatomy-region-path stroke-[1px] sm:stroke-[1.25px]"
                data-anatomy-fill={anatomyFill}
                data-severity={pathSeverity}
              />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
