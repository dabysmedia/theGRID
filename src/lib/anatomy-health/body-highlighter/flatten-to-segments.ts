import type { BodyRegionId, BodyView } from "../model"
import type { BodySegmentSide } from "../segment-labels"
import { bodySegmentKey } from "../segment-labels"
import type { BodyPart } from "./types"
import { slugToBodyRegion } from "./slug-to-region"
import { bodyPartsForView } from "./flatten-to-regions"

export interface SegmentPathPiece {
  d: string
  key: string
}

export interface BodySegmentDrawable {
  interactionKey: string
  slug: string
  side: BodySegmentSide
  regionId: BodyRegionId
  paths: SegmentPathPiece[]
}

function pushPath(
  segments: Map<string, BodySegmentDrawable>,
  view: BodyView,
  slug: string,
  side: BodySegmentSide,
  d: string
): void {
  const interactionKey = bodySegmentKey(view, slug, side)
  let seg = segments.get(interactionKey)
  if (!seg) {
    seg = {
      interactionKey,
      slug,
      side,
      regionId: slugToBodyRegion(slug, side, view),
      paths: [],
    }
    segments.set(interactionKey, seg)
  }
  seg.paths.push({ d, key: `${interactionKey}-p${seg.paths.length}` })
}

function ingestPart(view: BodyView, part: BodyPart, segments: Map<string, BodySegmentDrawable>) {
  const slug = part.slug
  if (!slug) return
  const { common = [], left = [], right = [] } = part.path ?? {}
  common.forEach((d) => pushPath(segments, view, slug, "common", d))
  left.forEach((d) => pushPath(segments, view, slug, "left", d))
  right.forEach((d) => pushPath(segments, view, slug, "right", d))
}

/**
 * One interactive segment per library slug + side (e.g. left knee, right calf).
 * Order follows asset order in bodyFront / bodyBack.
 */
export function bodySegmentsForView(view: BodyView): BodySegmentDrawable[] {
  const segments = new Map<string, BodySegmentDrawable>()
  for (const part of bodyPartsForView(view)) {
    ingestPart(view, part, segments)
  }
  return [...segments.values()]
}
