/**
 * Web port of path data from react-native-body-highlighter (MIT).
 * The npm package targets React Native; we vendor SVG `d` strings only for Next.js.
 *
 * @see https://github.com/HichamELBSI/react-native-body-highlighter
 */
export type { BodyPart } from "./types"
export { slugToBodyRegion } from "./slug-to-region"
export { pathsByBodyRegion, bodyPartsForView, type RegionPathSegment } from "./flatten-to-regions"
export {
  bodySegmentsForView,
  type BodySegmentDrawable,
  type SegmentPathPiece,
} from "./flatten-to-segments"

/** Matches SvgMaleWrapper viewBox values from the upstream library. */
export const BODY_HIGHLIGHTER_VIEWBOX_FRONT = "0 0 724 1448"
export const BODY_HIGHLIGHTER_VIEWBOX_BACK = "724 0 724 1448"

export function bodyHighlighterViewBox(view: "front" | "back"): string {
  return view === "front" ? BODY_HIGHLIGHTER_VIEWBOX_FRONT : BODY_HIGHLIGHTER_VIEWBOX_BACK
}
