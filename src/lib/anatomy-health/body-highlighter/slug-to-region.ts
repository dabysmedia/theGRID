import type { BodyRegionId, BodyView } from "../model"

type PartSide = "left" | "right" | "common"

/**
 * Maps highlighter muscle / segment slugs into THEGRID's coarse BodyRegionId zones.
 */
export function slugToBodyRegion(slug: string, side: PartSide, view: BodyView): BodyRegionId {
  if (slug === "head" || slug === "hair") return "head"
  if (slug === "neck") return "head"

  if (view === "front") {
    if (slug === "chest" || slug === "trapezius") return "chest"
    if (slug === "deltoids") {
      if (side === "left") return "leftArm"
      if (side === "right") return "rightArm"
      return "chest"
    }
    if (slug === "abs" || slug === "obliques" || slug === "adductors") return "abdomen"
    if (slug === "biceps" || slug === "triceps" || slug === "forearm" || slug === "hands") {
      if (side === "left") return "leftArm"
      if (side === "right") return "rightArm"
      return "chest"
    }
    if (
      slug === "quadriceps" ||
      slug === "knees" ||
      slug === "tibialis" ||
      slug === "calves" ||
      slug === "ankles" ||
      slug === "feet"
    ) {
      if (side === "left") return "leftLeg"
      if (side === "right") return "rightLeg"
      return "leftLeg"
    }
    return "chest"
  }

  // back
  if (slug === "trapezius" || slug === "upper-back") return "chest"
  if (slug === "lower-back" || slug === "gluteal" || slug === "adductors") return "abdomen"
  if (slug === "deltoids" || slug === "triceps" || slug === "forearm" || slug === "hands") {
    if (side === "left") return "leftArm"
    if (side === "right") return "rightArm"
    return "chest"
  }
  if (slug === "hamstring" || slug === "calves" || slug === "ankles" || slug === "feet") {
    if (side === "left") return "leftLeg"
    if (side === "right") return "rightLeg"
    return "leftLeg"
  }
  return "chest"
}
