import type { BodyView } from "./model"

export type BodySegmentSide = "common" | "left" | "right"

/** Stable key for selection / hover within the current diagram view. */
export function bodySegmentKey(
  view: BodyView,
  slug: string,
  side: BodySegmentSide
): string {
  return `${view}:${slug}:${side}`
}

export function parseBodySegmentKey(
  key: string
): { view: BodyView; slug: string; side: BodySegmentSide } | null {
  const parts = key.split(":")
  if (parts.length !== 3) return null
  const [v, slug, side] = parts
  if (v !== "front" && v !== "back") return null
  if (side !== "common" && side !== "left" && side !== "right") return null
  return { view: v, slug, side: side as BodySegmentSide }
}

const SLUG_LABEL: Record<string, string> = {
  head: "Head",
  hair: "Hair",
  neck: "Neck",
  trapezius: "Trapezius",
  chest: "Chest",
  deltoids: "Deltoids",
  biceps: "Biceps",
  triceps: "Triceps",
  forearm: "Forearm",
  hands: "Hands",
  obliques: "Obliques",
  abs: "Abdominals",
  adductors: "Adductors",
  quadriceps: "Quadriceps",
  knees: "Knees",
  tibialis: "Tibialis anterior",
  calves: "Calves",
  ankles: "Ankles",
  feet: "Feet",
  "upper-back": "Upper back",
  "lower-back": "Lower back",
  gluteal: "Glutes",
  hamstring: "Hamstrings",
}

export function formatBodySegmentTitle(slug: string, side: BodySegmentSide): string {
  const base = SLUG_LABEL[slug] ?? slug.replace(/-/g, " ")
  if (side === "common") return base
  if (side === "left") return `Left ${base.toLowerCase()}`
  return `Right ${base.toLowerCase()}`
}
