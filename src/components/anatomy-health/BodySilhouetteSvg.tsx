"use client"

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { BodyView } from "@/lib/anatomy-health/model"
import {
  bodyHighlighterViewBox,
  bodySegmentsForView,
  parseBodyHighlighterViewBox,
} from "@/lib/anatomy-health/body-highlighter"
import type { AnatomyHealthState } from "@/lib/anatomy-health/model"
import { formatBodySegmentTitle } from "@/lib/anatomy-health/segment-labels"
import { domsScoreToSeverity } from "@/lib/anatomy-health/severity"
import { weeklySetsToLoadStyle } from "@/lib/anatomy-health/load-colors"
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
  /** Per-segment heat values; for `load` variant these are weekly set counts. */
  domsScores?: Record<string, number> | null
  /** Heat map palette: DOMS yellow (default) or training load green. */
  segmentHeatVariant?: "doms" | "load"
  /** Per-segment active injury severity; rendered as red. Overrides DOMS on the same segment. */
  injurySegmentSeverity?: Record<string, SeverityLevel> | null
  /** Highlight segment keys (e.g. selected in DOMS picker). */
  domsHighlightKeys?: string[] | null
  /** When false, segments are display-only (no click, hover, or keyboard focus). */
  interactive?: boolean
  /** Grow to fill the parent box (e.g. fullscreen DOMS picker); skips default max-height cap. */
  fillParent?: boolean
  /** Leader lines + labels; segment keys must match `view` (e.g. from `buildInjuryCalloutsForView`). */
  injuryCallouts?: { injuryId: string; segmentKey: string; label: string }[] | null
}

/** Injury tag chip beside leader line (SVG user units). */
const CALLOUT_TAG_FS = 30
const CALLOUT_TAG_PAD_X = 12
const CALLOUT_TAG_PAD_Y = 7
/** Gap below the horizontal connector before the tag rect (tag top anchors under line end). */
const CALLOUT_TAG_LINE_GAP = 6

/** Hinge / line terminal sits this far inside the viewBox edge (user units). */
const CALLOUT_HINGE_EDGE_PAD = 2
/** Min inset when clamping tag rect to the viewBox (avoids stroke clip). */
const CALLOUT_VIEW_EDGE_CLAMP = 2
/**
 * Elbow along (cx → hingeEnd): lower = elbow nearer the body = longer horizontal stub.
 */
const CALLOUT_ELBOW_FRACTION = 0.22

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

const SVG_NS = "http://www.w3.org/2000/svg"

function breakLongWordForTag(
  measureEl: SVGTextElement,
  word: string,
  maxLineWidth: number
): string[] {
  const out: string[] = []
  let chunk = ""
  for (let i = 0; i < word.length; i++) {
    const ch = word[i]!
    const next = chunk + ch
    measureEl.textContent = next
    const len = measureEl.getComputedTextLength()
    if (len <= maxLineWidth || chunk === "") {
      chunk = next
    } else {
      out.push(chunk)
      chunk = ch
    }
  }
  if (chunk) out.push(chunk)
  return out
}

/** Word-wrap + measure using the same SVG font metrics as the visible tag. */
function measureInjuryTagWrap(
  svg: SVGSVGElement,
  label: string,
  maxLineWidth: number
): { lines: string[]; textWidth: number; lineHeight: number } {
  const display = label.toUpperCase()
  const lineHeight = CALLOUT_TAG_FS * 1.2
  const measureEl = document.createElementNS(SVG_NS, "text")
  measureEl.setAttribute("class", "anatomy-injury-callout__tag-text")
  measureEl.setAttribute("font-size", String(CALLOUT_TAG_FS))
  measureEl.setAttribute("visibility", "hidden")
  measureEl.setAttribute("aria-hidden", "true")
  svg.appendChild(measureEl)

  const widthOf = (s: string) => {
    measureEl.textContent = s
    return measureEl.getComputedTextLength()
  }

  const words = display.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ""

  try {
    if (words.length === 0) {
      measureEl.textContent = "—"
      return { lines: ["—"], textWidth: measureEl.getComputedTextLength(), lineHeight }
    }
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w
      if (widthOf(trial) <= maxLineWidth) {
        cur = trial
      } else {
        if (cur) {
          lines.push(cur)
          cur = ""
        }
        if (widthOf(w) <= maxLineWidth) {
          cur = w
        } else {
          lines.push(...breakLongWordForTag(measureEl, w, maxLineWidth))
        }
      }
    }
    if (cur) lines.push(cur)

    let textWidth = 0
    for (const line of lines) {
      textWidth = Math.max(textWidth, widthOf(line))
    }
    const minW = CALLOUT_TAG_FS * 2
    textWidth = Math.max(minW, textWidth)
    return { lines, textWidth, lineHeight }
  } finally {
    svg.removeChild(measureEl)
  }
}

/** Leader: body dot → elbow on row → horizontal to margin (tag sits below this segment). */
function injuryLeaderPath(c: { cx: number; cy: number; elbowX: number; labelY: number; hingeEndX: number }): string {
  return `M ${c.cx} ${c.cy} L ${c.elbowX} ${c.labelY} L ${c.hingeEndX} ${c.labelY}`
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
  segmentHeatVariant = "doms",
  injurySegmentSeverity = null,
  domsHighlightKeys = null,
  fillParent = false,
  interactive = true,
  injuryCallouts = null,
}: BodySilhouetteSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null)
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
    /** Inner margin X where the horizontal leader ends. */
    hingeEndX: number
    labelY: number
    elbowX: number
    placeRight: boolean
    tagX: number
    tagY: number
    tagW: number
    tagH: number
    lines: string[]
    lineHeight: number
    firstBaselineY: number
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

      type Raw = {
        injuryId: string
        segmentKey: string
        label: string
        cx: number
        cy: number
        hingeEndX: number
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
        const hingeEndX = placeRight
          ? minX + width - CALLOUT_HINGE_EDGE_PAD
          : minX + CALLOUT_HINGE_EDGE_PAD
        const shortLabel = c.label.length > 52 ? `${c.label.slice(0, 49)}…` : c.label
        raw.push({
          injuryId: c.injuryId,
          segmentKey: c.segmentKey,
          label: shortLabel,
          cx,
          cy,
          hingeEndX,
          labelY: cy,
          placeRight,
        })
      }

      raw.sort((a, b) => a.cy - b.cy)

      const maxLineInnerW = Math.max(CALLOUT_TAG_FS * 4, Math.floor(width * 0.42))
      const wrapped = raw.map((r) => ({
        r,
        ...measureInjuryTagWrap(svg, r.label, maxLineInnerW),
      }))
      const tagHeights = wrapped.map(
        ({ lines, lineHeight }) => lineHeight * lines.length + CALLOUT_TAG_PAD_Y * 2
      )
      const maxTagH = Math.max(CALLOUT_TAG_FS * 1.35 + CALLOUT_TAG_PAD_Y * 2, ...tagHeights)
      const stackGap = Math.max(30, Math.ceil(maxTagH + CALLOUT_TAG_LINE_GAP + 14))

      for (let i = 1; i < raw.length; i++) {
        if (raw[i].labelY - raw[i - 1].labelY < stackGap) {
          raw[i].labelY = raw[i - 1].labelY + stackGap
        }
      }
      for (const r of raw) {
        r.labelY = Math.max(minY + 26, Math.min(vbMaxY - 26, r.labelY))
      }

      if (!cancelled) {
        setCalloutLayout(
          wrapped.map(({ r, lines, textWidth, lineHeight }) => {
            const elbowX = r.cx + (r.hingeEndX - r.cx) * CALLOUT_ELBOW_FRACTION
            const innerTextH = lineHeight * lines.length
            const tagW = textWidth + CALLOUT_TAG_PAD_X * 2
            const tagH = innerTextH + CALLOUT_TAG_PAD_Y * 2
            /* Margin-side edge of tag flush with horizontal line end (hingeEndX). */
            let tagX = r.placeRight ? r.hingeEndX - tagW : r.hingeEndX
            tagX = Math.max(
              minX + CALLOUT_VIEW_EDGE_CLAMP,
              Math.min(tagX, minX + width - tagW - CALLOUT_VIEW_EDGE_CLAMP)
            )
            const tagY = r.labelY + CALLOUT_TAG_LINE_GAP
            const maxTagY = vbMaxY - tagH - 6
            const tagYClamped = Math.min(tagY, maxTagY)

            const innerBoxH = tagH - 2 * CALLOUT_TAG_PAD_Y
            const leadingSlack = Math.max(0, (innerBoxH - innerTextH) / 2)
            const firstBaselineY =
              tagYClamped + CALLOUT_TAG_PAD_Y + leadingSlack + CALLOUT_TAG_FS * 0.88

            return {
              injuryId: r.injuryId,
              segmentKey: r.segmentKey,
              label: r.label,
              cx: r.cx,
              cy: r.cy,
              hingeEndX: r.hingeEndX,
              labelY: r.labelY,
              elbowX,
              placeRight: r.placeRight,
              tagX,
              tagY: tagYClamped,
              tagW,
              tagH,
              lines,
              lineHeight,
              firstBaselineY,
            }
          })
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
        "anatomy-svg anatomy-svg-premium w-full select-none",
        fillParent ? "h-full max-h-full max-w-full" : "h-auto max-h-[min(60vh,480px)]",
        className
      )}
      viewBox={vb}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={
        interactive
          ? `Body diagram, ${view} view. Select a muscle or joint area for details.`
          : `Body diagram, ${view} view, training load.`
      }
    >
      <g className="anatomy-segment-gaps" aria-hidden>
        {segments.flatMap((seg) =>
          seg.paths.map((p) => (
            <path key={`gap-${p.key}`} d={p.d} className="anatomy-region-separator" />
          )),
        )}
      </g>
      {segments.map((seg) => {
        const region = state.regions[seg.regionId]
        const selected = selectedSegmentKey === seg.interactionKey
        const hovered = hoveredSegmentKey === seg.interactionKey
        const injurySev = injurySegmentSeverity?.[seg.interactionKey]
        const domsN = domsScores?.[seg.interactionKey]
        const loadStyle =
          segmentHeatVariant === "load" && domsN != null && domsN >= 0.5
            ? weeklySetsToLoadStyle(domsN)
            : null
        const heatFill = segmentHeatVariant === "load" ? "load" : "doms"
        const anatomyFill: "base" | "doms" | "load" | "injury" = injurySev
          ? "injury"
          : loadStyle
            ? "load"
            : domsN != null && segmentHeatVariant !== "load"
              ? heatFill
              : "base"
        const pathSeverity: SeverityLevel =
          injurySev ??
          (domsN != null && segmentHeatVariant !== "load" ? domsScoreToSeverity(domsN) : "none")
        const highlight = domsHighlightKeys?.includes(seg.interactionKey) ?? false
        const pieceTitle = formatBodySegmentTitle(seg.slug, seg.side)
        const aria = `${pieceTitle}. Parent sector ${region.label}. ${region.injuries.length} active condition(s). Severity ${region.severity}.`

        return (
          <g
            key={seg.interactionKey}
            id={`anatomy-segment-${seg.interactionKey.replace(/:/g, "-")}`}
            tabIndex={interactive ? 0 : undefined}
            role={interactive ? "button" : "presentation"}
            className={cn("anatomy-region-group outline-none", highlight && "anatomy-doms-highlight")}
            aria-label={interactive ? aria : undefined}
            aria-hidden={interactive ? undefined : true}
            aria-pressed={interactive ? selected : undefined}
            data-selected={selected ? "true" : "false"}
            data-hover={interactive && hovered ? "true" : "false"}
            onMouseEnter={interactive ? () => onHoverSegment(seg.interactionKey) : undefined}
            onMouseLeave={interactive ? () => onHoverSegment(null) : undefined}
            onFocus={interactive ? () => onHoverSegment(seg.interactionKey) : undefined}
            onBlur={interactive ? () => onHoverSegment(null) : undefined}
            onClick={interactive ? () => handleSelect(seg.interactionKey) : undefined}
            onKeyDown={
              interactive
                ? (e) => segmentKeyHandler(e, seg.interactionKey, handleSelect)
                : undefined
            }
          >
            {seg.paths.map((p) => (
              <path
                key={p.key}
                d={p.d}
                className={cn("anatomy-region-path", loadStyle?.glow && "anatomy-load-glow")}
                data-anatomy-fill={anatomyFill}
                data-severity={pathSeverity}
                data-load-tier={loadStyle?.tier}
                style={
                  loadStyle
                    ? { fill: loadStyle.fill, stroke: loadStyle.stroke }
                    : undefined
                }
              />
            ))}
          </g>
        )
      })}
      {calloutLayout.length > 0 ? (
        <g className="anatomy-injury-callout-layer pointer-events-none" aria-hidden>
          {calloutLayout.map((c) => (
            <g key={c.injuryId} className="anatomy-injury-callout">
              <path
                fill="none"
                className="anatomy-injury-callout__line"
                d={injuryLeaderPath({
                  cx: c.cx,
                  cy: c.cy,
                  elbowX: c.elbowX,
                  labelY: c.labelY,
                  hingeEndX: c.hingeEndX,
                })}
              />
              <rect
                x={c.tagX}
                y={c.tagY}
                width={c.tagW}
                height={c.tagH}
                rx={5}
                ry={5}
                className="anatomy-injury-callout__tag-bg"
              />
              <text
                x={c.tagX + c.tagW / 2}
                y={c.firstBaselineY}
                fontSize={CALLOUT_TAG_FS}
                textAnchor="middle"
                className="anatomy-injury-callout__tag-text"
              >
                {c.lines.map((line, i) => (
                  <tspan key={i} x={c.tagX + c.tagW / 2} dy={i === 0 ? 0 : c.lineHeight}>
                    {line}
                  </tspan>
                ))}
              </text>
              <circle cx={c.cx} cy={c.cy} r={7} className="anatomy-injury-callout__dot" />
            </g>
          ))}
        </g>
      ) : null}
    </svg>
  )
}
