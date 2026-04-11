"use client"

import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { BodyView } from "@/lib/anatomy-health/model"
import {
  bodyHighlighterViewBox,
  bodySegmentsForView,
  parseBodyHighlighterViewBox,
} from "@/lib/anatomy-health/body-highlighter"
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
  /** Leader lines + labels; segment keys must match `view` (e.g. from `buildInjuryCalloutsForView`). */
  injuryCallouts?: { injuryId: string; segmentKey: string; label: string }[] | null
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
  injuryCallouts = null,
}: BodySilhouetteSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const labelGradientId = `anatomy-callout-label-${useId().replace(/:/g, "")}`
  const vb = bodyHighlighterViewBox(view)

  const segments = useMemo(() => bodySegmentsForView(view), [view])

  const calloutsKey = useMemo(
    () =>
      injuryCallouts?.length
        ? injuryCallouts.map((c) => `${c.injuryId}:${c.segmentKey}:${c.label}`).join("|")
        : "",
    [injuryCallouts]
  )

  type CalloutLayout = {
    injuryId: string
    segmentKey: string
    label: string
    cx: number
    cy: number
    labelX: number
    labelY: number
    elbowX: number
    placeRight: boolean
  }

  const [calloutLayout, setCalloutLayout] = useState<CalloutLayout[]>([])

  useLayoutEffect(() => {
    let cancelled = false
    const frame = requestAnimationFrame(() => {
      if (cancelled) return
      const svg = svgRef.current
      if (!svg || !injuryCallouts?.length) {
        setCalloutLayout([])
        return
      }

      const { minX, minY, width, height } = parseBodyHighlighterViewBox(view)
      const midX = minX + width / 2
      const vbMaxY = minY + height
      const pad = 18

      type Raw = {
        injuryId: string
        segmentKey: string
        label: string
        cx: number
        cy: number
        labelX: number
        labelY: number
        placeRight: boolean
      }

      const raw: Raw[] = []
      for (const c of injuryCallouts) {
        const id = `anatomy-segment-${c.segmentKey.replace(/:/g, "-")}`
        let g: Element | null = null
        try {
          g = svg.querySelector(`#${CSS.escape(id)}`)
        } catch {
          g = svg.getElementById(id)
        }
        if (!g || !(g instanceof SVGGElement)) continue
        let bbox: DOMRect
        try {
          bbox = g.getBBox()
        } catch {
          continue
        }
        if (bbox.width <= 0 && bbox.height <= 0) continue
        const cx = bbox.x + bbox.width / 2
        const cy = bbox.y + bbox.height / 2
        const placeRight = cx >= midX
        const labelX = placeRight ? minX + width - pad : minX + pad
        const shortLabel = c.label.length > 52 ? `${c.label.slice(0, 49)}…` : c.label
        raw.push({
        injuryId: c.injuryId,
        segmentKey: c.segmentKey,
        label: shortLabel,
        cx,
        cy,
        labelX,
        labelY: cy,
        placeRight,
      })
      }

      raw.sort((a, b) => a.cy - b.cy)
      const minGap = 28
      for (let i = 1; i < raw.length; i++) {
        if (raw[i].labelY - raw[i - 1].labelY < minGap) {
          raw[i].labelY = raw[i - 1].labelY + minGap
        }
      }
      for (const r of raw) {
        r.labelY = Math.max(minY + 26, Math.min(vbMaxY - 26, r.labelY))
      }

      if (!cancelled) {
        setCalloutLayout(
          raw.map((r) => ({
            ...r,
            elbowX: r.cx + (r.labelX - r.cx) * 0.52,
          }))
        )
      }
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [injuryCallouts, view, calloutsKey])

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
      ref={svgRef}
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
      {calloutLayout.length > 0 ? (
        <g className="anatomy-injury-callout-layer pointer-events-none" aria-hidden>
          <defs>
            <linearGradient
              id={labelGradientId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
              gradientUnits="objectBoundingBox"
            >
              <stop offset="0%" stopColor="oklch(0.97 0.025 95)" />
              <stop offset="50%" stopColor="oklch(0.9 0.06 82)" />
              <stop offset="100%" stopColor="oklch(0.78 0.1 72)" />
            </linearGradient>
          </defs>
          {calloutLayout.map((c) => (
            <g key={c.injuryId} className="anatomy-injury-callout">
              {/* Outer stub along labelY to elbow, then to the dot. Text sits on that corner (inner end of the horizontal run). */}
              <path
                d={`M ${c.labelX} ${c.labelY} L ${c.elbowX} ${c.labelY} L ${c.cx} ${c.cy}`}
                fill="none"
                className="anatomy-injury-callout__line"
              />
              <text
                x={c.elbowX}
                y={c.labelY}
                textAnchor={c.placeRight ? "start" : "end"}
                dominantBaseline="middle"
                fill={`url(#${labelGradientId})`}
                className="anatomy-injury-callout__text"
              >
                {c.label}
              </text>
              <circle cx={c.cx} cy={c.cy} r={6.5} className="anatomy-injury-callout__dot" />
            </g>
          ))}
        </g>
      ) : null}
    </svg>
  )
}
