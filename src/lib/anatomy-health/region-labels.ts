import type { BodyRegionId } from "./model"

export const DEFAULT_REGION_LABELS: Record<BodyRegionId, string> = {
  head: "Cephalic / cervical",
  chest: "Thorax",
  abdomen: "Abdomen / core",
  leftArm: "Left upper limb",
  rightArm: "Right upper limb",
  leftLeg: "Left lower limb",
  rightLeg: "Right lower limb",
}
