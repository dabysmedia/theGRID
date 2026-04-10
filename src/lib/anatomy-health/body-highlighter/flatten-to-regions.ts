import type { BodyRegionId, BodyView } from "../model"
import { BODY_REGION_IDS } from "../model"
import type { BodyPart } from "./types"
import { slugToBodyRegion } from "./slug-to-region"
import { bodyFront } from "./assets/bodyFront"
import { bodyBack } from "./assets/bodyBack"

export interface RegionPathSegment {
  d: string
  key: string
}

function emptyRegions(): Record<BodyRegionId, RegionPathSegment[]> {
  return BODY_REGION_IDS.reduce(
    (acc, id) => {
      acc[id] = []
      return acc
    },
    {} as Record<BodyRegionId, RegionPathSegment[]>
  )
}

export function bodyPartsForView(view: BodyView): BodyPart[] {
  return view === "front" ? bodyFront : bodyBack
}

/** Group SVG path segments by THEGRID body region for hit-testing and styling. */
export function pathsByBodyRegion(view: BodyView): Record<BodyRegionId, RegionPathSegment[]> {
  const out = emptyRegions()
  const parts = bodyPartsForView(view)

  for (const part of parts) {
    const slug = part.slug
    if (!slug) continue
    const { common = [], left = [], right = [] } = part.path ?? {}

    common.forEach((d, i) => {
      const region = slugToBodyRegion(slug, "common", view)
      out[region].push({ d, key: `${view}-${slug}-c-${i}` })
    })
    left.forEach((d, i) => {
      const region = slugToBodyRegion(slug, "left", view)
      out[region].push({ d, key: `${view}-${slug}-l-${i}` })
    })
    right.forEach((d, i) => {
      const region = slugToBodyRegion(slug, "right", view)
      out[region].push({ d, key: `${view}-${slug}-r-${i}` })
    })
  }

  return out
}
