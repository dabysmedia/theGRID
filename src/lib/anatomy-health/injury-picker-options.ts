import { CONDITIONS, type ConditionDef } from "@/lib/recovery-catalog"
import { parseBodySegmentKey } from "./segment-labels"

const EXCLUDED_IDS = new Set(["doms"])

/**
 * Injury types for a tapped SVG segment: area-specific (catalog `injurySvgSlugs`) plus general injuries.
 */
export function getInjuryPickerOptionsForSegmentKey(interactionKey: string): {
  areaSpecific: ConditionDef[]
  general: ConditionDef[]
} {
  const p = parseBodySegmentKey(interactionKey)
  const slug = p?.slug ?? ""
  const injuries = CONDITIONS.filter((c) => c.kind === "injury" && !EXCLUDED_IDS.has(c.id))
  const areaSpecific = injuries
    .filter((c) => c.injurySvgSlugs?.includes(slug))
    .sort((a, b) => a.name.localeCompare(b.name))
  const general = injuries
    .filter((c) => !c.injurySvgSlugs?.length)
    .sort((a, b) => a.name.localeCompare(b.name))
  return { areaSpecific, general }
}
