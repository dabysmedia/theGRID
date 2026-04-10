/**
 * Narrow injury catalog from selected body segment keys — uses catalog `injurySvgSlugs`.
 */

import type { ConditionDef } from "@/lib/recovery-catalog"
import { CONDITIONS } from "@/lib/recovery-catalog"
import { slugToBodyRegion } from "./body-highlighter"
import type { BodyRegionId } from "./model"
import { parseBodySegmentKey } from "./segment-labels"

const EXCLUDED_IDS = new Set(["doms"])

/**
 * Injury conditions whose `injurySvgSlugs` intersect tapped segment slugs, plus general injuries (no slugs).
 */
export function filterInjuryConditionsBySegmentKeys(segmentKeys: string[]): ConditionDef[] {
  const injuries = CONDITIONS.filter((c) => c.kind === "injury" && !EXCLUDED_IDS.has(c.id))
  if (segmentKeys.length === 0) return injuries

  const slugs = new Set<string>()
  for (const key of segmentKeys) {
    const p = parseBodySegmentKey(key)
    if (p) slugs.add(p.slug)
  }
  if (slugs.size === 0) return injuries

  const matched = injuries.filter((c) => c.injurySvgSlugs?.some((s) => slugs.has(s)))
  if (matched.length === 0) return injuries

  const general = injuries.filter((c) => !c.injurySvgSlugs?.length)
  const merged: ConditionDef[] = []
  const seen = new Set<string>()
  for (const c of [...matched, ...general]) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    merged.push(c)
  }
  return merged
}

/** Most common coarse region among segment keys (for API bodyRegion). */
export function dominantBodyRegionFromSegmentKeys(segmentKeys: string[]): BodyRegionId | null {
  if (segmentKeys.length === 0) return null
  const counts = new Map<BodyRegionId, number>()
  for (const key of segmentKeys) {
    const p = parseBodySegmentKey(key)
    if (!p) continue
    const rid = slugToBodyRegion(p.slug, p.side, p.view)
    counts.set(rid, (counts.get(rid) ?? 0) + 1)
  }
  let best: BodyRegionId | null = null
  let n = 0
  for (const [rid, c] of counts) {
    if (c > n) {
      n = c
      best = rid
    }
  }
  return best
}

/**
 * Coarse region for a new injury logged from one body-map tap. Never null — falls back so the
 * monitor can always tint a region and Active issues can list the row.
 */
export function bodyRegionForNewInjurySite(segmentKey: string): BodyRegionId {
  return dominantBodyRegionFromSegmentKeys([segmentKey]) ?? "chest"
}
